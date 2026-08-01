import logging
import re

from lsprotocol.types import (
    Diagnostic,
    Position,
    Range,
)
from trilogy.core.exceptions import InvalidSyntaxException
from trilogy.parsing.parse_engine_v2 import parse_syntax
from trilogy.parsing.v2.syntax import SyntaxNode

logger = logging.getLogger(__name__)

# Pattern to extract line/column from InvalidSyntaxException messages.
# Example: " --> 1:36\n  |..."
_SYNTAX_ERROR_LOCATION_RE = re.compile(r"-->\s*(\d+):(\d+)")


def _parse_syntax_exception_location(
    error: InvalidSyntaxException,
) -> tuple[int, int]:
    """Extract line and column from an InvalidSyntaxException message."""
    m = _SYNTAX_ERROR_LOCATION_RE.search(str(error))
    if m:
        return int(m.group(1)), int(m.group(2))
    return 1, 1


def get_diagnostics(
    doctext: str,
) -> tuple[SyntaxNode | None, list[Diagnostic]]:
    diagnostics: list[Diagnostic] = []
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
    except (AttributeError, TypeError, ValueError, RuntimeError):
        logger.exception("parser raised exception")
    return parse_tree, diagnostics
