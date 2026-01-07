import pytest
from unittest.mock import Mock
import sys
from pathlib import Path

# TODO: less shenanigans
sys.path.append(str(Path(__file__).parent.parent.parent))

from trilogy_language_server.server import (
    TrilogyLanguageServer,
    trilogy_server,
    format_document,
    completions,
    did_change,
    did_close,
    code_lens,
    code_lens_resolve,
    handle_config,
    hover,
    TokenTypes,
    ADDITION,
    Token,
    TokenModifier,
    get_diagnostics,
)
from trilogy_language_server.models import ConceptInfo, ConceptLocation
from lsprotocol.types import (
    DidChangeTextDocumentParams,
    DidCloseTextDocumentParams,
    TextDocumentIdentifier,
    Position,
    Range,
    CompletionParams,
    CodeLensParams,
    CodeLens,
    DocumentFormattingParams,
    MessageType,
    HoverParams,
)

TEST_TEXT = """select 1-> test;"""


class TestTrilogyLanguageServer:
    """Test cases for the TrilogyLanguageServer class."""

    @pytest.fixture
    def server(self):
        """Create a TrilogyLanguageServer instance for testing."""
        return TrilogyLanguageServer()

    @pytest.fixture
    def mock_text_document(self):
        """Create a mock text document for testing."""
        doc = Mock()
        doc.uri = "file:///test/example.trilogy"
        doc.source = "SELECT * FROM users;"
        doc.lines = ["SELECT * FROM users;"]
        return doc

    @pytest.fixture
    def mock_workspace(self, mock_text_document):
        """Create a mock workspace for testing."""
        workspace = Mock()
        workspace.get_text_document.return_value = mock_text_document
        return workspace

    def test_server_initialization(self, server):
        """Test that the server initializes correctly."""
        assert server.name == "trilogy-lang-server"
        assert server.version == "v0.1"
        assert isinstance(server.tokens, dict)
        assert isinstance(server.code_lens, dict)
        assert isinstance(server.environments, dict)
        assert server.dialect is not None

    def test_server_attributes(self, server):
        """Test server class attributes."""
        assert server.CMD_SHOW_CONFIGURATION_ASYNC == "showConfigurationAsync"
        assert server.CMD_SHOW_CONFIGURATION_CALLBACK == "showConfigurationCallback"
        assert server.CMD_SHOW_CONFIGURATION_THREAD == "showConfigurationThread"
        assert server.CMD_UNREGISTER_COMPLETIONS == "unregisterCompletions"
        assert server.CONFIGURATION_SECTION == "trilogy"

    def test_publish_tokens(self, server):
        """Test the publish_tokens method."""
        # Setup mocks
        raw_tree, diagnostics = get_diagnostics(TEST_TEXT)

        # Execute
        server.publish_tokens(
            "SELECT * FROM users;", raw_tree, "file:///test/example.trilogy"
        )

        # Verify
        assert server.tokens["file:///test/example.trilogy"] == [
            Token(
                line=1,
                offset=8,
                text="*",
                tok_type="variable",
                tok_modifiers=[TokenModifier.definition],
            ),
            Token(
                line=1,
                offset=12,
                text="OM u",
                tok_type="variable",
                tok_modifiers=[TokenModifier.definition],
            ),
        ]

    def test_publish_code_lens_none_path(self, server):
        """Test the publish_code_lens method when to_fs_path returns None."""
        # Setup mocks
        # raw_tree, diagnostics = get_diagnostics(TEST_TEXT)
        raw_tree = []
        # Execute
        server.publish_code_lens(
            "SELECT * FROM users;", raw_tree, "bc:///test/example.trilogy"
        )

        # Verify - method should return early
        assert "bc:///test/example.trilogy" not in server.code_lens


class TestFeatureFunctions:
    """Test cases for the LSP feature functions."""

    @pytest.fixture
    def mock_server(self):
        """Create a mock server for testing feature functions."""
        server = Mock(spec=TrilogyLanguageServer)
        server.workspace = Mock()
        server.window_log_message = Mock()
        server.window_show_message = Mock()
        return server

    @pytest.fixture
    def mock_document(self):
        """Create a mock document."""
        doc = Mock()
        doc.source = "SELECT 1 as test;"
        doc.lines = ["SELECT 1 as test;"]
        return doc

    def test_format_document(self, mock_server, mock_document):
        """Test the format_document function."""
        # Setup mocks
        mock_server.workspace.get_text_document.return_value = mock_document

        params = DocumentFormattingParams(
            text_document=TextDocumentIdentifier(uri="file:///test/example.trilogy"),
            options=Mock(),
        )

        # Execute
        result = format_document(mock_server, params)

        # Verify
        mock_server.window_log_message.assert_called_once()
        mock_server.workspace.get_text_document.assert_called_once_with(
            "file:///test/example.trilogy"
        )
        assert (
            result
            == """SELECT
    1 -> test,
;"""
        )

    def test_completions_with_params(self, mock_server):
        """Test the completions function with parameters."""
        params = CompletionParams(
            text_document=TextDocumentIdentifier(uri="file:///test/example.trilogy"),
            position=Position(line=0, character=10),
        )

        result = completions(mock_server, params)

        mock_server.window_log_message.assert_called_once()
        assert result.is_incomplete is False
        assert len(result.items) == 0

    def test_completions_without_params(self, mock_server):
        """Test the completions function without parameters."""
        result = completions(mock_server, None)

        mock_server.window_log_message.assert_not_called()
        assert result.is_incomplete is False
        assert len(result.items) == 0

    def test_did_change(self, mock_server):
        """Test the did_change function."""
        mock_server._validate = Mock()
        params = DidChangeTextDocumentParams(
            text_document=TextDocumentIdentifier(uri="file:///test/example.trilogy"),
            content_changes=[],
        )

        did_change(mock_server, params)

        mock_server._validate.assert_called_once_with(params)

    def test_did_close(self, mock_server):
        """Test the did_close function."""
        params = DidCloseTextDocumentParams(
            text_document=TextDocumentIdentifier(uri="file:///test/example.trilogy")
        )

        # Should not raise any exceptions
        did_close(mock_server, params)

    # @pytest.mark.asyncio
    # async def test_did_open(self, mock_server):
    #     """Test the did_open async function."""
    #     mock_server._validate = Mock()
    #     params = DidOpenTextDocumentParams(
    #         text_document=TextDocumentItem(
    #             uri="file:///test/example.trilogy",
    #             language_id="trilogy",
    #             version=1,
    #             text="SELECT * FROM users;",
    #         )
    #     )

    #     await did_open(mock_server, params)

    #     mock_server._validate.assert_called_once_with(params)

    def test_code_lens(self, mock_server):
        """Test the code_lens function."""
        mock_lens = Mock()
        mock_server.code_lens = {"file:///test/example.trilogy": [mock_lens]}

        params = CodeLensParams(
            text_document=TextDocumentIdentifier(uri="file:///test/example.trilogy")
        )

        result = code_lens(mock_server, params)

        assert result == [mock_lens]

    def test_code_lens_resolve(self, mock_server):
        """Test the code_lens_resolve function."""
        item = CodeLens(
            range=Range(
                start=Position(line=0, character=0), end=Position(line=0, character=10)
            ),
            data={"left": 5, "right": 3, "uri": "file:///test/example.trilogy"},
        )

        result = code_lens_resolve(mock_server, item)

        mock_server.window_log_message.assert_called_once()
        assert result.command is not None
        assert result.command.title == "Evaluate"
        assert result.command.command == "codeLens.evaluateSum"

    def test_handle_config_success(self, mock_server):
        """Test the handle_config function with successful configuration."""
        config = [{"exampleConfiguration": "test_value"}]

        handle_config(mock_server, config)

        mock_server.window_log_message.assert_called_once()
        args = mock_server.window_log_message.call_args[0][0]
        assert args.type == MessageType.Info
        assert "test_value" in args.message

    def test_hover_with_concept(self, mock_server):
        """Test the hover function with concept information."""
        uri = "file:///test/example.trilogy"

        # Setup concept locations
        mock_server.concept_locations = {
            uri: [
                ConceptLocation(
                    concept_address="local.user_id",
                    start_line=1,
                    start_column=5,
                    end_line=1,
                    end_column=12,
                    is_definition=True,
                )
            ]
        }

        # Setup concept info
        mock_server.concept_info = {
            uri: {
                "local.user_id": ConceptInfo(
                    name="user_id",
                    address="local.user_id",
                    datatype="INTEGER",
                    purpose="key",
                    namespace="local",
                    line_number=1,
                )
            }
        }

        params = HoverParams(
            text_document=TextDocumentIdentifier(uri=uri),
            position=Position(line=0, character=5),  # Position on user_id
        )

        result = hover(mock_server, params)

        assert result is not None
        assert "key" in result.contents.value
        assert "user_id" in result.contents.value
        assert "INTEGER" in result.contents.value

    def test_hover_no_concept_at_position(self, mock_server):
        """Test the hover function when no concept is at cursor position."""
        uri = "file:///test/example.trilogy"

        # Setup empty concept locations
        mock_server.concept_locations = {uri: []}

        params = HoverParams(
            text_document=TextDocumentIdentifier(uri=uri),
            position=Position(line=0, character=0),
        )

        result = hover(mock_server, params)

        assert result is None


class TestModuleConstants:
    """Test cases for module-level constants and variables."""

    def test_token_types(self):
        """Test that TokenTypes contains expected values."""
        expected_types = [
            "keyword",
            "variable",
            "function",
            "operator",
            "parameter",
            "type",
        ]
        assert TokenTypes == expected_types

    def test_addition_regex(self):
        """Test the ADDITION regex pattern."""
        # Test valid patterns
        assert ADDITION.match("  5  +  3  =") is not None
        assert ADDITION.match("10+20=") is not None
        assert ADDITION.match("  1  + 2 =  ") is not None

        # Test invalid patterns
        assert ADDITION.match("5 + 3 = 8") is None  # Has result
        assert ADDITION.match("5 - 3 =") is None  # Wrong operator
        assert ADDITION.match("abc + def =") is None  # Non-numeric

    def test_trilogy_server_instance(self):
        """Test that trilogy_server is properly instantiated."""
        assert isinstance(trilogy_server, TrilogyLanguageServer)


class TestIntegration:
    """Integration tests that test multiple components together."""

    @pytest.fixture
    def server_with_mocks(self):
        """Create a server with necessary mocks for integration tests."""
        server = TrilogyLanguageServer()
        server.workspace = Mock()
        server.window_log_message = Mock()
        server.window_show_message = Mock()
        server.text_document_publish_diagnostics = Mock()
        return server
