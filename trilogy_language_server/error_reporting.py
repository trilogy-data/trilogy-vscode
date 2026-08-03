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

# The span used by trilogy's inject_context_maker when building Location lines.
_TRILOGY_ERROR_SPAN = 30


def _flat_pos_to_line_col(doctext: str, pos: int) -> tuple[int, int]:
    """Convert an absolute character position in *doctext* to a
    (1-indexed line, 1-indexed column) pair."""
    prefix = doctext[:pos]
    lines = prefix.split("\n")
    return len(lines), len(lines[-1]) + 1


def _parse_location_line(location_line: str, flat_text: str) -> int:
    """Recover the absolute character position encoded in a trilogy Location line.

    trilogy's ``inject_context_maker`` produces::

        {lcap}{before}{lpad}???{rpad}{after}{rcap}

    where ``lcap`` is ``'...'`` when the left context was truncated
    (i.e. ``pos > _TRILOGY_ERROR_SPAN``).  ``lpad`` is a single space when
    the character just before the error position is not already a space;
    otherwise it is empty.  The returned position is an index into
    ``flat_text`` (the original document with ``\\n`` replaced by spaces).
    """
    q = location_line.find("???")
    if q < 0:
        return 0
    lcap_len = 3 if location_line.startswith("...") else 0
    start = _TRILOGY_ERROR_SPAN if lcap_len == 3 else 0
    before_and_lpad = location_line[lcap_len:q]
    pos = start + len(before_and_lpad)
    # Determine whether a lpad space was inserted: lpad == ' ' when the
    # character at (pos-1) in flat_text is not already a space.  Check that
    # character and subtract 1 if a lpad was present.
    if pos > 0:
        check = min(pos - 1, len(flat_text) - 1)
        if check >= 0 and flat_text[check] != " ":
            pos -= 1
    return pos


def _parse_syntax_exception_location(
    error: InvalidSyntaxException,
    doctext: str,
) -> tuple[int, int]:
    """Extract (1-indexed line, 1-indexed column) from an InvalidSyntaxException.

    Older parser messages embed a ``-->`` marker (e.g. ``--> 1:8``) which is
    parsed directly.  Newer messages (e.g. ``Syntax [202]: ...``) omit that
    marker but always include a ``Location:`` context line from which the
    position can be recovered.
    """
    msg = str(error)
    m = _SYNTAX_ERROR_LOCATION_RE.search(msg)
    if m:
        return int(m.group(1)), int(m.group(2))

    loc_match = re.search(r"Location:\n(.*)", msg)
    if loc_match:
        location_line = loc_match.group(1)
        flat_text = doctext.replace("\n", " ")
        pos = _parse_location_line(location_line, flat_text)
        return _flat_pos_to_line_col(doctext, pos)

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
        line, column = _parse_syntax_exception_location(e, doctext)
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
