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


def _parse_syntax_exception_location(
    error: InvalidSyntaxException,
) -> Tuple[int, int]:
    """Extract line and column from an InvalidSyntaxException message."""
    m = re.search(r"-->\s*(\d+):(\d+)", str(error))
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
