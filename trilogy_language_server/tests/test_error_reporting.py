"""Tests for error_reporting position extraction logic."""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent))

from trilogy_language_server.error_reporting import (
    _flat_pos_to_line_col,
    _parse_location_line,
    get_diagnostics,
)


class TestFlatPosToLineCol:
    def test_single_line_start(self):
        assert _flat_pos_to_line_col("SELECT 1", 0) == (1, 1)

    def test_single_line_end(self):
        # pos == len(text) is a valid EOF position
        assert _flat_pos_to_line_col("SELECT 1", 8) == (1, 9)

    def test_single_line_mid(self):
        assert _flat_pos_to_line_col("import a", 7) == (1, 8)

    def test_multiline_start_of_second_line(self):
        # pos 9 in "SELECT 1\nSELECT 2" is the 'S' at the start of line 2
        assert _flat_pos_to_line_col("SELECT 1\nSELECT 2", 9) == (2, 1)

    def test_multiline_end_of_second_line(self):
        # pos 16 in "SELECT 1\nSELECT 2" points to the '2' on line 2
        # prefix = "SELECT 1\nSELECT " → (line=2, col=8)
        assert _flat_pos_to_line_col("SELECT 1\nSELECT 2", 16) == (2, 8)


class TestParseLocationLine:
    def test_eof_error(self):
        # "SELECT 1 ??? " → pos 8 in "SELECT 1"
        assert _parse_location_line("SELECT 1 ??? ", "SELECT 1") == 8

    def test_mid_token_error(self):
        # "import ??? a" → pos 7 in "import a"
        assert _parse_location_line("import ??? a", "import a") == 7

    def test_start_of_input(self):
        # " ??? SELEC 1;" → pos 0 in "SELEC 1;"
        assert _parse_location_line(" ??? SELEC 1;", "SELEC 1;") == 0

    def test_no_marker_returns_zero(self):
        assert _parse_location_line("no marker here", "SELECT 1") == 0

    def test_long_input_no_truncation(self):
        # "datasource x (x:x) grain ( ??? ) query" → pos 26
        loc = "datasource x (x:x) grain ( ??? ) query ::: SELECT 1"
        flat = "datasource x (x:x) grain () query ::: SELECT 1"
        assert _parse_location_line(loc, flat) == 26


class TestGetDiagnosticsRange:
    """End-to-end tests that verify the diagnostic range for various error patterns."""

    def test_new_style_missing_semicolon_single_line(self):
        """Syntax [202] error on 'SELECT 1' → range at end of text."""
        _, diagnostics = get_diagnostics("SELECT 1")
        assert len(diagnostics) == 1
        d = diagnostics[0]
        assert d.message.startswith("Syntax [202]")
        assert d.range.start.line == 0
        assert d.range.start.character == 8
        assert d.range.end.character == 9

    def test_new_style_missing_semicolon_auto(self):
        """Syntax [202] error on 'auto x <- 1' → range at end of text."""
        _, diagnostics = get_diagnostics("auto x <- 1")
        assert len(diagnostics) == 1
        d = diagnostics[0]
        assert d.range.start.line == 0
        assert d.range.start.character == 11

    def test_old_style_arrow_format(self):
        """Old-style --> errors are still parsed correctly."""
        _, diagnostics = get_diagnostics("import a")
        assert len(diagnostics) == 1
        d = diagnostics[0]
        assert d.range.start.line == 0
        assert d.range.start.character == 7

    def test_valid_text_no_diagnostics(self):
        _, diagnostics = get_diagnostics("SELECT a;")
        assert diagnostics == []
