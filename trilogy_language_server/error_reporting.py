from typing import List, Tuple
import re
import logging
from trilogy.parsing.parse_engine_v2 import parse_syntax
from trilogy.core.exceptions import InvalidSyntaxException
from trilogy.parsing.v2.syntax import SyntaxNode
from lsprotocol.types import (
    Diagnostic,
    Position,
    Range,
)


# Pattern to extract line/column from InvalidSyntaxException messages.
# Example: " --> 1:36\n  |..."
_SYNTAX_ERROR_LOCATION_RE = re.compile(r"-->\s*(\d+):(\d+)")


def _parse_syntax_exception_location(
    error: InvalidSyntaxException,
) -> Tuple[int, int]:
    """Extract line and column from an InvalidSyntaxException message."""
    m = _SYNTAX_ERROR_LOCATION_RE.search(str(error))
    if m:
        return int(m.group(1)), int(m.group(2))
    return 1, 1


def get_diagnostics(
    doctext: str,
) -> Tuple[SyntaxNode | None, List[Diagnostic]]:
    diagnostics: List[Diagnostic] = []
    parse_tree = None

    try:
        doc = parse_syntax(doctext)
        parse_tree = doc.tree
    except InvalidSyntaxException as e:
        line, column = _parse_syntax_exception_location(e)
        diagnostics.append(
            Diagnostic(
                Range(
                    Position(line - 1, column - 1),
                    Position(line - 1, column),
                ),
                str(e),
            )
        )
    except Exception:
        logging.exception("parser raised exception")
    return parse_tree, diagnostics
