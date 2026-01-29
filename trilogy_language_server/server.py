import typing as t
from pygls.lsp.server import LanguageServer
from pygls.uris import to_fs_path
from lsprotocol.types import (
    TEXT_DOCUMENT_COMPLETION,
    CompletionItem,
    CompletionList,
    CompletionParams,
    CompletionItemKind,
    InsertTextFormat,
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
    PublishDiagnosticsParams,
    TEXT_DOCUMENT_HOVER,
    Hover,
    HoverParams,
    MarkupContent,
    MarkupKind,
    Range,
    Position,
    TEXT_DOCUMENT_DEFINITION,
    DefinitionParams,
    Location,
    TEXT_DOCUMENT_REFERENCES,
    ReferenceParams,
    TEXT_DOCUMENT_DOCUMENT_SYMBOL,
    DocumentSymbolParams,
    DocumentSymbol,
    SymbolKind,
    TEXT_DOCUMENT_SIGNATURE_HELP,
    SignatureHelpParams,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation,
    SignatureHelpOptions,
    TextEdit,
)
from functools import reduce
from typing import Dict, List, Optional
from trilogy_language_server.error_reporting import get_diagnostics
import operator
from lark import ParseTree
from trilogy_language_server.models import (
    TokenModifier,
    Token,
    ConceptInfo,
    ConceptLocation,
    DatasourceInfo,
    ImportInfo,
)
from trilogy_language_server.parsing import (
    tree_to_symbols,
    code_lense_tree,
    extract_concept_locations,
    extract_concepts_from_environment,
    find_concept_at_position,
    format_concept_hover,
    resolve_concept_address,
    get_definition_locations,
    get_document_symbols,
    extract_datasource_info,
    extract_import_info,
    format_datasource_hover,
    format_import_hover,
    TRILOGY_FUNCTIONS,
)
from trilogy.parsing.render import Renderer
from trilogy.parsing.parse_engine import ParseToObjects, PARSER
from trilogy.authoring import Environment
from trilogy.dialect.duckdb import DuckDBDialect
import re
from pathlib import Path

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
        # Storage for concept hover information
        self.concept_locations: Dict[str, List[ConceptLocation]] = {}
        self.concept_info: Dict[str, Dict[str, ConceptInfo]] = {}
        # Storage for datasource and import information
        self.datasource_info: Dict[str, List[DatasourceInfo]] = {}
        self.import_info: Dict[str, List[ImportInfo]] = {}

    def _validate(
        self: "TrilogyLanguageServer",
        params: t.Union[DidChangeTextDocumentParams, DidOpenTextDocumentParams],
    ):
        self.window_log_message(
            LogMessageParams(type=MessageType.Log, message="Validating document...")
        )
        text_doc = self.workspace.get_text_document(params.text_document.uri)
        raw_tree, diagnostics = get_diagnostics(text_doc.source)
        self.text_document_publish_diagnostics(
            PublishDiagnosticsParams(uri=text_doc.uri, diagnostics=diagnostics)
        )
        if raw_tree:
            self.publish_tokens(text_doc.source, raw_tree, text_doc.uri)
            self.publish_code_lens(text_doc.source, raw_tree, text_doc.uri)
            # Extract concept locations for hover support
            self.publish_concept_locations(raw_tree, text_doc.uri)

    def publish_tokens(
        self: "TrilogyLanguageServer", original_text: str, raw_tree: ParseTree, uri: str
    ):
        self.tokens[uri] = tree_to_symbols(original_text, raw_tree)

    def publish_concept_locations(
        self: "TrilogyLanguageServer", raw_tree: ParseTree, uri: str
    ):
        """Extract and store concept locations from the parse tree."""
        try:
            locations = extract_concept_locations(raw_tree)
            self.concept_locations[uri] = locations
            self.window_log_message(
                LogMessageParams(
                    type=MessageType.Log,
                    message=f"Found {len(locations)} concept locations for hover support",
                )
            )
        except Exception as e:
            self.window_log_message(
                LogMessageParams(
                    type=MessageType.Warning,
                    message=f"Failed to extract concept locations: {e}",
                )
            )
            self.concept_locations[uri] = []

        # Extract datasource information for hover tooltips
        try:
            datasources = extract_datasource_info(raw_tree)
            self.datasource_info[uri] = datasources
            self.window_log_message(
                LogMessageParams(
                    type=MessageType.Log,
                    message=f"Found {len(datasources)} datasources for hover support",
                )
            )
        except Exception as e:
            self.window_log_message(
                LogMessageParams(
                    type=MessageType.Warning,
                    message=f"Failed to extract datasource info: {e}",
                )
            )
            self.datasource_info[uri] = []

        # Extract import information for hover tooltips
        try:
            imports = extract_import_info(raw_tree)
            self.import_info[uri] = imports
            self.window_log_message(
                LogMessageParams(
                    type=MessageType.Log,
                    message=f"Found {len(imports)} imports for hover support",
                )
            )
        except Exception as e:
            self.window_log_message(
                LogMessageParams(
                    type=MessageType.Warning,
                    message=f"Failed to extract import info: {e}",
                )
            )
            self.import_info[uri] = []

    def publish_code_lens(
        self: "TrilogyLanguageServer", original_text: str, raw_tree: ParseTree, uri: str
    ):
        environment = self.environments.get(uri, None)
        fs_path_str = to_fs_path(uri)
        if fs_path_str is None:
            return
        fs_path = Path(fs_path_str)
        env_path = fs_path.parent
        if not environment:
            environment = Environment(working_path=env_path)
            self.environments[uri] = environment
        lenses = code_lense_tree(
            environment=environment,
            text=original_text,
            input=raw_tree,
            dialect=self.dialect,
        )
        self.code_lens[uri] = lenses

        # Extract concept information from the environment for hover support
        try:
            concept_info = extract_concepts_from_environment(environment)
            self.concept_info[uri] = concept_info
            self.window_log_message(
                LogMessageParams(
                    type=MessageType.Log,
                    message=f"Extracted {len(concept_info)} concepts for hover support",
                )
            )
        except Exception as e:
            self.window_log_message(
                LogMessageParams(
                    type=MessageType.Warning,
                    message=f"Failed to extract concept info: {e}",
                )
            )
            self.concept_info[uri] = {}

        if lenses:
            self.window_show_message(
                ShowMessageParams(
                    type=MessageType.Info,
                    message=f"Found {len(lenses)} queries for path {env_path}",
                )
            )


trilogy_server = TrilogyLanguageServer()


@trilogy_server.feature(TEXT_DOCUMENT_FORMATTING)
def format_document(
    ls: LanguageServer, params: DocumentFormattingParams
) -> Optional[List[TextEdit]]:
    """Format the entire document"""
    ls.window_log_message(
        LogMessageParams(type=MessageType.Log, message=f"Formatting called @ {params}")
    )

    doc = ls.workspace.get_text_document(params.text_document.uri)

    # Extract working path from document URI for proper import resolution
    # Imports are relative to the file containing the import statement
    fs_path_str = to_fs_path(params.text_document.uri)
    if fs_path_str:
        working_path = Path(fs_path_str).parent
        env = Environment(working_path=working_path)
    else:
        # For non-file URIs (e.g., untitled:), use default Environment
        env = Environment()

    try:
        r = Renderer()
        parser = ParseToObjects(environment=env)
        parser.set_text(doc.source)
        parser.prepare_parse()
        parser.transform(PARSER.parse(doc.source))
        # this will reset fail on missing
        pass_two = parser.run_second_parse_pass()
        formatted_text = "\n".join([r.to_string(v) for v in pass_two])

        # Calculate the range covering the entire document
        lines = doc.source.split("\n")
        last_line = len(lines) - 1
        last_char = len(lines[last_line]) if lines else 0

        # Return a TextEdit that replaces the entire document
        return [
            TextEdit(
                range=Range(
                    start=Position(line=0, character=0),
                    end=Position(line=last_line, character=last_char),
                ),
                new_text=formatted_text,
            )
        ]
    except Exception as e:
        ls.window_log_message(
            LogMessageParams(
                type=MessageType.Error, message=f"Formatting failed: {e}"
            )
        )
        return None


@trilogy_server.feature(
    TEXT_DOCUMENT_COMPLETION,
    CompletionOptions(trigger_characters=[",", ".", " "]),
)
def completions(ls: TrilogyLanguageServer, params: Optional[CompletionParams] = None):
    """Returns completion items."""
    if params is None:
        return CompletionList(is_incomplete=False, items=[])

    uri = params.text_document.uri
    position = params.position

    ls.window_log_message(
        LogMessageParams(
            type=MessageType.Log, message=f"completion called @ {params.position}"
        )
    )

    items: t.List[CompletionItem] = []

    # Get concept information from the document
    concept_info_map = ls.concept_info.get(uri, {})

    # Add concepts as completion items
    for address, concept in concept_info_map.items():
        # Skip internal concepts
        if concept.namespace == "__preql_internal":
            continue

        # Determine icon based on purpose
        kind = CompletionItemKind.Variable
        if concept.purpose == "key":
            kind = CompletionItemKind.Field
        elif concept.purpose == "property":
            kind = CompletionItemKind.Property
        elif concept.purpose == "metric":
            kind = CompletionItemKind.Value
        elif concept.purpose == "constant":
            kind = CompletionItemKind.Constant

        # Create documentation
        doc_parts = [f"**{concept.purpose}** `{concept.name}`: `{concept.datatype}`"]
        if concept.description:
            doc_parts.append(concept.description)
        if concept.lineage:
            doc_parts.append(f"Derivation: `{concept.lineage[:50]}...`" if len(concept.lineage) > 50 else f"Derivation: `{concept.lineage}`")

        items.append(
            CompletionItem(
                label=concept.name,
                kind=kind,
                detail=f"{concept.purpose}: {concept.datatype}",
                documentation=MarkupContent(
                    kind=MarkupKind.Markdown,
                    value="\n\n".join(doc_parts),
                ),
                insert_text=concept.name,
                sort_text=f"0_{concept.name}",  # Prioritize concepts
            )
        )

    # Add Trilogy keywords
    keywords = [
        "select",
        "key",
        "property",
        "metric",
        "const",
        "datasource",
        "import",
        "as",
        "where",
        "order",
        "by",
        "limit",
        "asc",
        "desc",
        "and",
        "or",
        "not",
        "in",
        "between",
        "like",
        "is",
        "null",
        "true",
        "false",
        "grain",
        "address",
        "auto",
        "persist",
        "into",
        "rowset",
        "merge",
        "show",
    ]

    for keyword in keywords:
        items.append(
            CompletionItem(
                label=keyword,
                kind=CompletionItemKind.Keyword,
                detail="keyword",
                insert_text=keyword,
                sort_text=f"1_{keyword}",  # Keywords after concepts
            )
        )

    # Add Trilogy functions
    for func_name, func_info in TRILOGY_FUNCTIONS.items():
        items.append(
            CompletionItem(
                label=func_name,
                kind=CompletionItemKind.Function,
                detail=func_info["signature"],
                documentation=MarkupContent(
                    kind=MarkupKind.Markdown,
                    value=func_info["description"],
                ),
                insert_text=f"{func_name}($1)",
                insert_text_format=InsertTextFormat.Snippet,
                sort_text=f"2_{func_name}",  # Functions after keywords
            )
        )

    # Add datasource names
    datasources = ls.datasource_info.get(uri, [])
    for ds in datasources:
        items.append(
            CompletionItem(
                label=ds.name,
                kind=CompletionItemKind.Struct,
                detail=f"datasource -> {ds.address}",
                documentation=MarkupContent(
                    kind=MarkupKind.Markdown,
                    value=f"**Datasource:** `{ds.name}`\n\n**Address:** `{ds.address}`",
                ),
                insert_text=ds.name,
                sort_text=f"3_{ds.name}",
            )
        )

    return CompletionList(is_incomplete=False, items=items)


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
    ls.window_log_message(
        LogMessageParams(
            type=MessageType.Log, message=f"Returning semantic tokens Tokens: {tokens}"
        )
    )
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


@trilogy_server.feature(TEXT_DOCUMENT_HOVER)
def hover(ls: TrilogyLanguageServer, params: HoverParams) -> Optional[Hover]:
    """Return hover information for the symbol at the given position."""
    uri = params.text_document.uri
    position = params.position
    line_1idx = position.line + 1
    col_1idx = position.character + 1

    ls.window_log_message(
        LogMessageParams(
            type=MessageType.Log,
            message=f"Hover requested at line {position.line}, col {position.character}",
        )
    )

    # Check if cursor is over a datasource
    datasources = ls.datasource_info.get(uri, [])
    for ds in datasources:
        if ds.start_line <= line_1idx <= ds.end_line:
            if ds.start_line == ds.end_line:
                if ds.start_column <= col_1idx <= ds.end_column:
                    hover_text = format_datasource_hover(ds)
                    return Hover(
                        contents=MarkupContent(kind=MarkupKind.Markdown, value=hover_text),
                        range=Range(
                            start=Position(line=ds.start_line - 1, character=ds.start_column - 1),
                            end=Position(line=ds.end_line - 1, character=ds.end_column - 1),
                        ),
                    )
            else:
                hover_text = format_datasource_hover(ds)
                return Hover(
                    contents=MarkupContent(kind=MarkupKind.Markdown, value=hover_text),
                    range=Range(
                        start=Position(line=ds.start_line - 1, character=ds.start_column - 1),
                        end=Position(line=ds.end_line - 1, character=ds.end_column - 1),
                    ),
                )

    # Check if cursor is over an import
    imports = ls.import_info.get(uri, [])
    for imp in imports:
        if imp.start_line <= line_1idx <= imp.end_line:
            if imp.start_column <= col_1idx <= imp.end_column:
                hover_text = format_import_hover(imp)
                return Hover(
                    contents=MarkupContent(kind=MarkupKind.Markdown, value=hover_text),
                    range=Range(
                        start=Position(line=imp.start_line - 1, character=imp.start_column - 1),
                        end=Position(line=imp.end_line - 1, character=imp.end_column - 1),
                    ),
                )

    # Get concept locations for this document
    locations = ls.concept_locations.get(uri, [])
    if not locations:
        ls.window_log_message(
            LogMessageParams(
                type=MessageType.Log,
                message="No concept locations available for hover",
            )
        )
        return None

    # Find if cursor is over a concept
    location = find_concept_at_position(locations, position.line, position.character)
    if not location:
        return None

    ls.window_log_message(
        LogMessageParams(
            type=MessageType.Log,
            message=f"Found concept location: {location.concept_address}",
        )
    )

    # Get concept information
    concept_info_map = ls.concept_info.get(uri, {})

    # Try to find the concept using the resolver
    concept = resolve_concept_address(location.concept_address, concept_info_map)

    if not concept:
        # Return basic information even if we don't have full concept info
        ls.window_log_message(
            LogMessageParams(
                type=MessageType.Log,
                message=f"Concept info not found for {location.concept_address}, showing basic info",
            )
        )
        hover_text = f"**Concept:** `{location.concept_address}`"
        if location.is_definition:
            hover_text += "\n\n*(definition)*"
        return Hover(
            contents=MarkupContent(kind=MarkupKind.Markdown, value=hover_text),
            range=Range(
                start=Position(
                    line=location.start_line - 1, character=location.start_column - 1
                ),
                end=Position(
                    line=location.end_line - 1, character=location.end_column - 1
                ),
            ),
        )

    # Format the hover content
    hover_text = format_concept_hover(concept, is_definition=location.is_definition)

    return Hover(
        contents=MarkupContent(kind=MarkupKind.Markdown, value=hover_text),
        range=Range(
            start=Position(
                line=location.start_line - 1, character=location.start_column - 1
            ),
            end=Position(line=location.end_line - 1, character=location.end_column - 1),
        ),
    )


@trilogy_server.feature(TEXT_DOCUMENT_DEFINITION)
def definition(
    ls: TrilogyLanguageServer, params: DefinitionParams
) -> Optional[List[Location]]:
    """Return the definition location for the symbol at the given position."""
    uri = params.text_document.uri
    position = params.position

    ls.window_log_message(
        LogMessageParams(
            type=MessageType.Log,
            message=f"Definition requested at line {position.line}, col {position.character}",
        )
    )

    # Get concept locations for this document
    locations = ls.concept_locations.get(uri, [])
    if not locations:
        return None

    # Find if cursor is over a concept
    location = find_concept_at_position(locations, position.line, position.character)
    if not location:
        return None

    # If already on a definition, return None (already at definition)
    if location.is_definition:
        return None

    # Get concept information to find the definition line
    concept_info_map = ls.concept_info.get(uri, {})
    concept = resolve_concept_address(location.concept_address, concept_info_map)

    if concept and concept.line_number:
        # Return the definition location
        return [
            Location(
                uri=uri,
                range=Range(
                    start=Position(
                        line=concept.line_number - 1,
                        character=concept.column - 1 if concept.column else 0,
                    ),
                    end=Position(
                        line=concept.end_line - 1
                        if concept.end_line
                        else concept.line_number - 1,
                        character=concept.end_column - 1 if concept.end_column else 100,
                    ),
                ),
            )
        ]

    # Fall back to finding the definition in concept_locations
    definition_locations = get_definition_locations(locations, location.concept_address)
    if definition_locations:
        return [
            Location(
                uri=uri,
                range=Range(
                    start=Position(
                        line=def_loc.start_line - 1, character=def_loc.start_column - 1
                    ),
                    end=Position(
                        line=def_loc.end_line - 1, character=def_loc.end_column - 1
                    ),
                ),
            )
            for def_loc in definition_locations
        ]

    return None


@trilogy_server.feature(TEXT_DOCUMENT_REFERENCES)
def references(
    ls: TrilogyLanguageServer, params: ReferenceParams
) -> Optional[List[Location]]:
    """Return all references to the symbol at the given position."""
    uri = params.text_document.uri
    position = params.position

    ls.window_log_message(
        LogMessageParams(
            type=MessageType.Log,
            message=f"References requested at line {position.line}, col {position.character}",
        )
    )

    # Get concept locations for this document
    locations = ls.concept_locations.get(uri, [])
    if not locations:
        return None

    # Find if cursor is over a concept
    location = find_concept_at_position(locations, position.line, position.character)
    if not location:
        return None

    # Get concept info to resolve the full address
    concept_info_map = ls.concept_info.get(uri, {})
    concept = resolve_concept_address(location.concept_address, concept_info_map)
    target_address = concept.address if concept else location.concept_address

    # Find all locations that match this concept address
    result_locations = []
    for loc in locations:
        # Resolve the location's address to check for match
        loc_concept = resolve_concept_address(loc.concept_address, concept_info_map)
        loc_address = loc_concept.address if loc_concept else loc.concept_address

        if loc_address == target_address:
            # Include definitions based on params.context.include_declaration
            if loc.is_definition and not params.context.include_declaration:
                continue

            result_locations.append(
                Location(
                    uri=uri,
                    range=Range(
                        start=Position(
                            line=loc.start_line - 1, character=loc.start_column - 1
                        ),
                        end=Position(
                            line=loc.end_line - 1, character=loc.end_column - 1
                        ),
                    ),
                )
            )

    return result_locations if result_locations else None


@trilogy_server.feature(TEXT_DOCUMENT_DOCUMENT_SYMBOL)
def document_symbol(
    ls: TrilogyLanguageServer, params: DocumentSymbolParams
) -> Optional[List[DocumentSymbol]]:
    """Return document symbols for outline/navigation."""
    uri = params.text_document.uri

    ls.window_log_message(
        LogMessageParams(
            type=MessageType.Log,
            message=f"Document symbols requested for {uri}",
        )
    )

    # Get concept locations for this document
    locations = ls.concept_locations.get(uri, [])
    concept_info_map = ls.concept_info.get(uri, {})
    datasources = ls.datasource_info.get(uri, [])
    imports = ls.import_info.get(uri, [])

    return get_document_symbols(locations, concept_info_map, datasources, imports)


@trilogy_server.feature(
    TEXT_DOCUMENT_SIGNATURE_HELP,
    SignatureHelpOptions(trigger_characters=["(", ","]),
)
def signature_help(
    ls: TrilogyLanguageServer, params: SignatureHelpParams
) -> Optional[SignatureHelp]:
    """Return signature help for function calls."""
    uri = params.text_document.uri
    position = params.position

    ls.window_log_message(
        LogMessageParams(
            type=MessageType.Log,
            message=f"Signature help requested at line {position.line}, col {position.character}",
        )
    )

    # Get the document and current line content
    doc = ls.workspace.get_text_document(uri)
    lines = doc.source.split("\n")

    if position.line >= len(lines):
        return None

    line = lines[position.line]
    col = position.character

    # Find the function name by looking backwards from cursor
    # Look for pattern like "function_name("
    text_before_cursor = line[:col]

    # Find the last open parenthesis and extract function name
    paren_depth = 0
    func_start = -1
    for i in range(len(text_before_cursor) - 1, -1, -1):
        char = text_before_cursor[i]
        if char == ")":
            paren_depth += 1
        elif char == "(":
            if paren_depth == 0:
                # Found the opening paren, now find function name
                func_end = i
                func_start = i - 1
                while func_start >= 0 and (
                    text_before_cursor[func_start].isalnum()
                    or text_before_cursor[func_start] == "_"
                ):
                    func_start -= 1
                func_start += 1
                func_name = text_before_cursor[func_start:func_end].strip()

                # Check if this is a known function
                if func_name.lower() in TRILOGY_FUNCTIONS:
                    func_info = TRILOGY_FUNCTIONS[func_name.lower()]

                    # Count commas to determine active parameter
                    text_after_paren = text_before_cursor[func_end + 1 :]
                    active_param = text_after_paren.count(",")

                    return SignatureHelp(
                        signatures=[
                            SignatureInformation(
                                label=func_info["signature"],
                                documentation=MarkupContent(
                                    kind=MarkupKind.Markdown,
                                    value=func_info["description"],
                                ),
                                parameters=[
                                    ParameterInformation(
                                        label=param["name"],
                                        documentation=param.get("description", ""),
                                    )
                                    for param in func_info.get("parameters", [])
                                ],
                            )
                        ],
                        active_signature=0,
                        active_parameter=min(
                            active_param, len(func_info.get("parameters", [])) - 1
                        ),
                    )
                break
            else:
                paren_depth -= 1

    return None


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
    ls.window_log_message(
        LogMessageParams(type=MessageType.Log, message=f"Resolving code lens: {item}")
    )
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

        ls.window_log_message(
            LogMessageParams(
                type=MessageType.Info,
                message=f"trilogy.exampleConfiguration value: {example_config}",
            )
        )

    except Exception as e:
        ls.window_log_message(
            LogMessageParams(type=MessageType.Error, message=f"Error occurred: {e}")
        )
