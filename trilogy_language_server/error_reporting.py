from typing import List, Union, Tuple, Any
import logging
from lark import UnexpectedToken, ParseTree
from lsprotocol.types import (
    Diagnostic,
    Position,
    Range,
)

from .grammar import PARSER


def user_repr(error: Union[UnexpectedToken]):
    if isinstance(error, UnexpectedToken):
        expected = ", ".join(error.accepts or error.expected)
        return (
            f"Unexpected token {str(error.token)!r}. Expected one of:\n{{{expected}}}"
        )
    else:
        return str(error)


def get_diagnostics(doctext: str) -> Tuple[Union[ParseTree, None], List[Diagnostic]]:
    diagnostics: List[Diagnostic] = []
    parse_tree = None

    def on_error(e: UnexpectedToken) -> Any:
        diagnostics.append(
            Diagnostic(
                Range(
                    Position(e.line - 1, e.column - 1), Position(e.line - 1, e.column)
                ),
                user_repr(e),
            )
        )
        return True

    try:
        parse_tree = PARSER.parse(doctext, on_error=on_error)  # type: ignore
    except Exception:
        logging.exception("parser raised exception")
    return parse_tree, diagnostics
