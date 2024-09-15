import typing as t
from pygls.server import LanguageServer
from pygls.uris import to_fs_path
from lsprotocol.types import (
    TEXT_DOCUMENT_COMPLETION,
    CompletionItem,
    CompletionList,
    CompletionParams,
    DidChangeTextDocumentParams,
    DidCloseTextDocumentParams,
    DidOpenTextDocumentParams,
    TEXT_DOCUMENT_DID_CHANGE,
    TEXT_DOCUMENT_DID_CLOSE,
    TEXT_DOCUMENT_DID_OPEN,
    TEXT_DOCUMENT_SEMANTIC_TOKENS_FULL,
    SemanticTokens,
    CompletionOptions,
    SemanticTokensLegend,
    SemanticTokensParams,
    DocumentFormattingParams,
    TEXT_DOCUMENT_FORMATTING,
    TEXT_DOCUMENT_CODE_LENS,
    CodeLensParams,
    CODE_LENS_RESOLVE,
    Command,
    CodeLens,
    ShowMessageParams,
    LogMessageParams,
    MessageType,
)
from functools import reduce
from typing import Dict, List, Optional
from trilogy_language_server.error_reporting import get_diagnostics
import operator
from lark import ParseTree
from trilogy_language_server.models import TokenModifier, Token
from trilogy_language_server.parsing import tree_to_symbols, code_lense_tree
from trilogy.parsing.render import Renderer
from trilogy.parsing.parse_engine import ParseToObjects, PARSER
from trilogy.core.models import Environment
from trilogy.dialect.duckdb import DuckDBDialect
import re

TokenTypes = ["keyword", "variable", "function", "operator", "parameter", "type"]

ADDITION = re.compile(r"^\s*(\d+)\s*\+\s*(\d+)\s*=(?=\s*$)")


class TrilogyLanguageServer(LanguageServer):
    CMD_SHOW_CONFIGURATION_ASYNC = "showConfigurationAsync"
    CMD_SHOW_CONFIGURATION_CALLBACK = "showConfigurationCallback"
    CMD_SHOW_CONFIGURATION_THREAD = "showConfigurationThread"
    CMD_UNREGISTER_COMPLETIONS = "unregisterCompletions"

    CONFIGURATION_SECTION = "trilogy"

    def __init__(self) -> None:
        super().__init__(name="trilogy-lang-server", version="v0.1")
        self.tokens: Dict[str, List[Token]] = {}
        self.code_lens: Dict[str, List[CodeLens]] = {}
        self.environments: Dict[str, Environment] = {}
        self.dialect = DuckDBDialect()

    def _validate(
        self: "TrilogyLanguageServer",
        params: t.Union[DidChangeTextDocumentParams, DidOpenTextDocumentParams],
    ):
        self.show_message_log("Validating document...")
        text_doc = self.workspace.get_document(params.text_document.uri)
        raw_tree, diagnostics = get_diagnostics(text_doc.source)
        self.publish_diagnostics(text_doc.uri, diagnostics)
        if raw_tree:
            self.publish_tokens(text_doc.source, raw_tree, text_doc.uri)
            self.publish_code_lens(text_doc.source, raw_tree, text_doc.uri)

    def publish_tokens(
        self: "TrilogyLanguageServer", original_text: str, raw_tree: ParseTree, uri: str
    ):
        self.tokens[uri] = tree_to_symbols(original_text, raw_tree)

    def publish_code_lens(
        self: "TrilogyLanguageServer", original_text: str, raw_tree: ParseTree, uri: str
    ):
        environment = self.environments.get(uri, None)
        if not environment:
            environment = Environment(working_path=to_fs_path(self.workspace.root_uri))
            self.environments[uri] = environment
        lenses = code_lense_tree(
            environment=environment,
            text=original_text,
            input=raw_tree,
            dialect=self.dialect,
        )
        self.code_lens[uri] = lenses
        if lenses:
            self.show_message(
                f"Found {len(lenses)} queries for path {to_fs_path(self.workspace.root_uri)}"
            )


trilogy_server = TrilogyLanguageServer()


@trilogy_server.feature(TEXT_DOCUMENT_FORMATTING)
def format_document(ls: LanguageServer, params: DocumentFormattingParams):
    """Format the entire document"""
    ls.show_message_log("Formatting called @ {}".format(params))

    doc = ls.workspace.get_text_document(params.text_document.uri)
    r = Renderer()
    env = Environment()
    return "\n".join(
        [
            r.to_string(v)
            for v in ParseToObjects(
                visit_tokens=True, text=doc.source, environment=env
            ).transform(PARSER.parse(doc.source))
        ]
    )


@trilogy_server.feature(
    TEXT_DOCUMENT_COMPLETION, CompletionOptions(trigger_characters=[","])
)
def completions(ls: TrilogyLanguageServer, params: Optional[CompletionParams] = None):
    """Returns completion items."""
    if params is not None:
        ls.show_message_log("completion called @ {}".format(params.position))
    items: t.List[CompletionItem] = []
    return CompletionList(False, items)


@trilogy_server.feature(TEXT_DOCUMENT_DID_CHANGE)
def did_change(ls: TrilogyLanguageServer, params: DidChangeTextDocumentParams):
    """Text document did change notification."""
    # revalidate on every change
    ls._validate(params)


@trilogy_server.feature(TEXT_DOCUMENT_DID_CLOSE)
def did_close(ls: TrilogyLanguageServer, params: DidCloseTextDocumentParams):
    """Text document did close notification."""


@trilogy_server.feature(TEXT_DOCUMENT_DID_OPEN)
async def did_open(ls: TrilogyLanguageServer, params: DidOpenTextDocumentParams):
    """Text document did open notification."""
    ls._validate(params)


@trilogy_server.feature(
    TEXT_DOCUMENT_SEMANTIC_TOKENS_FULL,
    SemanticTokensLegend(
        token_types=TokenTypes,
        token_modifiers=[m.name for m in TokenModifier],  # type: ignore
    ),
)
def semantic_tokens_full(ls: TrilogyLanguageServer, params: SemanticTokensParams):
    """Return the semantic tokens for the entire document"""
    data = []
    tokens = ls.tokens.get(params.text_document.uri, [])
    ls.show_message_log(f"Returning semantic tokens Tokens: {tokens}")
    for token in tokens:
        data.extend(
            [
                token.line,
                token.offset,
                len(token.text),
                0,
                # Tokenindex(token.tok_type),
                reduce(operator.or_, token.tok_modifiers, 0),
            ]
        )

    return SemanticTokens(data=data)


@trilogy_server.feature(TEXT_DOCUMENT_CODE_LENS)
def code_lens(ls: TrilogyLanguageServer, params: CodeLensParams):
    """Return a list of code lens to insert into the given document.

    This method will read the whole document and identify each sum in the document and
    tell the language client to insert a code lens at each location.
    """
    document_uri = params.text_document.uri
    return ls.code_lens.get(document_uri, [])


# @trilogy_server.thread()
# @trilogy_server.command(trilogy_server.CODE_LENS_RESOLVE)
# def count_down_10_seconds_blocking(ls, *args):
#     # Omitted
#     pass


@trilogy_server.feature(CODE_LENS_RESOLVE)
def code_lens_resolve(ls: LanguageServer, item: CodeLens):
    """Resolve the ``command`` field of the given code lens.

    Using the ``data`` that was attached to the code lens item created in the function
    above, this prepares an invocation of the ``evaluateSum`` command below.
    """
    ls.show_message_log("Resolving code lens: %s", item)
    assert item.data is not None
    left = item.data["left"]
    right = item.data["right"]
    uri = item.data["uri"]

    args = dict(
        uri=uri,
        left=left,
        right=right,
        line=item.range.start.line,
    )

    item.command = Command(
        title="Evaluate",
        command="codeLens.evaluateSum",
        arguments=[args],
    )
    return item


def handle_config(ls: TrilogyLanguageServer, config):
    """Handle the configuration sent by the client."""
    try:
        example_config = config[0].get("exampleConfiguration")

        ls.show_message_log(
            ShowMessageParams(
                message=f"trilogy.exampleConfiguration value: {example_config}",
                type=MessageType.Info,
            ),
        )

    except Exception as e:
        ls.show_message_log(
            LogMessageParams(
                message=f"Error ocurred: {e}",
                type=MessageType.Error,
            ),
        )
