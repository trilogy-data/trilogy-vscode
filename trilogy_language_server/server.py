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

TokenTypes = ["keyword", "variable", "function", "operator", "parameter", "type"]


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
        self.show_message_log(f"Tokens: {self.tokens[uri]}")


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
                # TokenTypes.index(token.tok_type),
                reduce(operator.or_, token.tok_modifiers, 0),
            ]
        )

    return SemanticTokens(data=data)
