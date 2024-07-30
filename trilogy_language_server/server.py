import typing as t
from pygls.server import LanguageServer
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
    SemanticTokenModifiers,
    SemanticTokensParams,
    DocumentFormattingParams,
    TEXT_DOCUMENT_FORMATTING,
    TEXT_DOCUMENT_CODE_LENS,
    TEXT_DOCUMENT_CODE_ACTION,
    CodeLensParams,
    CODE_LENS_RESOLVE,
    Command,
    CodeLensResolveRequest,
    Range,
    Position,
    WorkspaceEdit,
    TextDocumentEdit,
    OptionalVersionedTextDocumentIdentifier,
    TextEdit,
    CodeLens
    
)
from functools import reduce
from typing import Dict
from typing import List
from typing import Optional
import enum
from .error_reporting import get_diagnostics
from pydantic import BaseModel, Field
from functools import reduce
import operator
from lark import ParseTree
from trilogy_language_server.models import Token
from trilogy_language_server.models import TokenModifier
from trilogy_language_server.parsing import parse_tree
from trilogy.parsing.render import Renderer
from trilogy.parsing.parse_engine import PARSER, ParseToObjects
from trilogy.core.models import Environment
import re
TokenTypes = ["keyword", "variable", "function", "operator", "parameter", "type"]

ADDITION = re.compile(r"^\s*(\d+)\s*\+\s*(\d+)\s*=(?=\s*$)")

class TrilogyLanguageServer(LanguageServer):
    CONFIGURATION_SECTION = "trilogyLanguageServer"

    def __init__(self):
        super().__init__(name="trilogy-lang-server", version="v0.1")
        self.tokens: Dict[str, List[Token]] = {}

    def _validate(self: "TrilogyLanguageServer", params: DidChangeTextDocumentParams):
        self.show_message_log("Validating document...")
        text_doc = self.workspace.get_document(params.text_document.uri)
        raw_tree, diagnostics = get_diagnostics(text_doc.source)
        self.publish_diagnostics(text_doc.uri, diagnostics)
        if raw_tree:
            self.publish_tokens(text_doc.source, raw_tree, text_doc.uri)

    def publish_tokens(
        self: "TrilogyLanguageServer", original_text: str, raw_tree: ParseTree, uri: str
    ):
        self.tokens[uri] = parse_tree(original_text, raw_tree)


trilogy_server = TrilogyLanguageServer()


@trilogy_server.feature(TEXT_DOCUMENT_FORMATTING)
def format_document(ls: LanguageServer, params: DocumentFormattingParams):
    """Format the entire document"""
    ls.show_message_log("Formatting called @ {}".format(params))

    doc = ls.workspace.get_text_document(params.text_document.uri)
    r = Renderer()
    env = Environment()
    return '\n'.join([r.to_string(v) for v in ParseToObjects(visit_tokens=True, text=doc, environment=env)] )


@trilogy_server.feature(
    TEXT_DOCUMENT_COMPLETION, CompletionOptions(trigger_characters=[","])
)
def completions(ls: TrilogyLanguageServer, params: CompletionParams = None):
    """Returns completion items."""
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
    ls.show_message("Text Document Did Close")


@trilogy_server.feature(TEXT_DOCUMENT_DID_OPEN)
async def did_open(ls: TrilogyLanguageServer, params: DidOpenTextDocumentParams):
    """Text document did open notification."""
    ls.show_message("Text Document Did Open")
    ls._validate(params)


@trilogy_server.feature(
    TEXT_DOCUMENT_SEMANTIC_TOKENS_FULL,
    SemanticTokensLegend(
        token_types=TokenTypes,
        token_modifiers=[m.name for m in TokenModifier],
    ),
)
def semantic_tokens_full(ls: TrilogyLanguageServer, params: SemanticTokensParams):
    """Return the semantic tokens for the entire document"""
    data = []
    tokens = ls.tokens.get(params.text_document.uri, [])
    ls.show_message_log(f"Returning smenatic tokens Tokens: {tokens}")
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
def code_lens(params: CodeLensParams):
    """Return a list of code lens to insert into the given document.

    This method will read the whole document and identify each sum in the document and
    tell the language client to insert a code lens at each location.
    """
    items = []
    document_uri = params.text_document.uri
    document = trilogy_server.workspace.get_text_document(document_uri)

    lines = document.lines
    for idx, line in enumerate(lines):
        match = ADDITION.match(line)
        if match is not None:
            range_ = Range(
                start=Position(line=idx, character=0),
                end=Position(line=idx, character=len(line) - 1),
            )
            left = int(match.group(1))
            right = int(match.group(2))

            code_lens = CodeLens(
                range=range_,
                data={
                    
                },
                command = Command(
				title="Evaluate",
				command="codeLens.evaluateSum",
				arguments=[{'line': range_.start.line, "left": left,
                    "right": right,
                    "uri": document_uri,}],
			)
            )
            items.append(code_lens)

    return items


@trilogy_server.feature(CODE_LENS_RESOLVE)
def code_lens_resolve(ls: LanguageServer, item: CodeLens):
    """Resolve the ``command`` field of the given code lens.

    Using the ``data`` that was attached to the code lens item created in the function
    above, this prepares an invocation of the ``evaluateSum`` command below.
    """
    ls.show_message_log("Resolving code lens: %s", item)

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


@trilogy_server.command("codeLens.evaluateSum")
def evaluate_sum(ls: LanguageServer, args):
    ls.show_message_log("arguments: %s", args)

    arguments = args[0]
    document = ls.workspace.get_text_document(arguments["uri"])
    line = document.lines[arguments["line"]]

    # Compute the edit that will update the document with the result.
    answer = arguments["left"] + arguments["right"]
    edit = TextDocumentEdit(
        text_document=OptionalVersionedTextDocumentIdentifier(
            uri=arguments["uri"], version=document.version
        ),
        edits=[
            TextEdit(
                new_text=f"{line.strip()} {answer}\n",
                range=Range(
                    start=Position(line=arguments["line"], character=0),
                    end=Position(line=arguments["line"] + 1, character=0),
                ),
            )
        ],
    )

    # Apply the edit.
    ls.apply_edit(WorkspaceEdit(document_changes=[edit])) 	