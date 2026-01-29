from trilogy_language_server.models import (
    Token,
    TokenModifier,
    ConceptInfo,
    ConceptLocation,
    DatasourceInfo,
    ImportInfo,
)
from trilogy.parsing.parse_engine import PARSER
from lark import ParseTree, Token as LarkToken
from typing import List, Union, Dict, Optional, Any
from lsprotocol.types import (
    CodeLens,
    Range,
    Position,
    Command,
    DocumentSymbol,
    SymbolKind,
)
from trilogy.parsing.parse_engine import ParseToObjects as ParseToObjects
from trilogy.core.statements.author import (
    SelectStatement,
    MultiSelectStatement,
    PersistStatement,
    Environment,
    RawSQLStatement,
)
from trilogy.dialect.base import BaseDialect
from trilogy.constants import CONFIG

CONFIG.rendering.parameters = False


def extract_subtext(
    text: str, start_line: int, end_line: int, start_col: int, end_col: int
) -> str:
    # Split the text into lines
    lines = text.split("\n")

    # Adjust line indices for 0-based indexing
    start_line -= 1
    end_line -= 1

    # Extract the relevant lines
    sub_lines = lines[start_line : end_line + 1]

    # Extract the columns within those lines
    if len(sub_lines) == 1:
        # If the subtext is within a single line
        sub_lines[0] = sub_lines[0][start_col:end_col]
    else:
        # If the subtext spans multiple lines
        sub_lines[0] = sub_lines[0][start_col:]
        sub_lines[-1] = sub_lines[-1][:end_col]
        for i in range(1, len(sub_lines) - 1):
            sub_lines[i] = sub_lines[i]

    # Join the lines back into a single string
    subtext = "\n".join(sub_lines)
    return subtext


def gen_tokens(text, item: Union[ParseTree, LarkToken]) -> List[Token]:
    tokens = []
    if isinstance(item, LarkToken):
        line = item.line or 0
        end_line = item.end_line or 1
        column = item.column or 1
        end_column = item.end_column or 2
        tokens.append(
            Token(
                line=line,
                offset=column,
                text=extract_subtext(text, line, end_line, column - 1, end_column - 1),
                tok_type="variable",
                tok_modifiers=[TokenModifier.definition],
            )
        )
    else:
        for child in item.children:
            tokens += gen_tokens(text, child)
    return tokens


def tree_to_symbols(text, input: ParseTree) -> List[Token]:
    tokens = []
    for x in input.children:
        tokens += gen_tokens(text, x)
    return tokens


def gen_tree(text: str) -> ParseTree:
    return PARSER.parse(text)


def text_to_symbols(text: str) -> List[Token]:
    parsed: ParseTree = gen_tree(text)
    return tree_to_symbols(text, parsed)


# def gen_code_lens(text, item: ParseTree) -> List[Token]:
#     tokens = []
#     if isinstance(item, LarkToken):
#         tokens.append(
#             CodeLens(
#                 range = Range(
# 					start=Position(line=item.line, character=item.column),
# 					end=Position(line=item.end_line, character=item.end_column)
# 				),
#                 command = Command(
# 				title=f"Run Query",
# 				command="codeLens.runQuery",
# 				arguments=[args],
#     )
#             )
#         )
#     else:
#         for child in item.children:
#             tokens += gen_tokens(text, child)
#     return tokens


def parse_statement(
    idx: int,
    x: Union[PersistStatement, MultiSelectStatement, SelectStatement, RawSQLStatement],
    dialect: BaseDialect,
    environment: Environment,
) -> Union[List[CodeLens], None]:

    if isinstance(x, (PersistStatement, MultiSelectStatement, SelectStatement)):
        processed = dialect.generate_queries(environment, [x])
        sql = dialect.compile_statement(processed[-1])
        if not x.meta:
            return None
        line = x.meta.line_number or 1
        return [
            CodeLens(
                range=Range(
                    start=Position(line=line - 1, character=1),
                    end=Position(line=line - 1, character=10),
                ),
                data={"idx": idx},
                command=Command(
                    title="Run Query",
                    command="trilogy.runQuery",
                    arguments=[sql],
                ),
            ),
            CodeLens(
                range=Range(
                    start=Position(line=line - 1, character=2),
                    end=Position(line=line - 1, character=10),
                ),
                data={"idx": idx},
                command=Command(
                    title="Render SQL",
                    command="trilogy.renderQuery",
                    arguments=[[sql], str(dialect.__class__)],
                ),
            ),
        ]
    elif isinstance(x, RawSQLStatement):
        if not x.meta:
            return None
        line = x.meta.line_number or 1
        return [
            CodeLens(
                range=Range(
                    start=Position(line=line - 1, character=1),
                    end=Position(line=line - 1, character=10),
                ),
                data={"idx": idx},
                command=Command(
                    title="Run Query",
                    command="trilogy.runQuery",
                    arguments=[x.text],
                ),
            )
        ]
    return None


def code_lense_tree(
    environment: Environment, text, input: ParseTree, dialect: BaseDialect
) -> List[CodeLens]:
    tokens = []
    parser = ParseToObjects(environment=environment)
    parser.set_text(text)
    parser.prepare_parse()
    parser.transform(input)
    # this will reset fail on missing
    pass_two = parser.run_second_parse_pass()
    for idx, stmt in enumerate(pass_two):
        try:
            x = parse_statement(idx, stmt, dialect, environment=environment)
            if x:
                tokens += x
        except Exception:
            pass
    return tokens


# Node types that contain concept definitions
CONCEPT_DEFINITION_NODES = {
    "concept_declaration",
    "concept_property_declaration",
    "concept_derivation",
}

# Node types that contain concept references
CONCEPT_REFERENCE_NODES = {
    "concept_lit",
    "concept_assignment",
}


def extract_concept_locations(
    tree: ParseTree, default_namespace: str = "local"
) -> List[ConceptLocation]:
    """
    Extract all concept definition and reference locations from the parse tree.

    Returns a list of ConceptLocation objects that map positions to concept addresses.

    Handles:
    - Local concepts: 'user_id' -> 'local.user_id'
    - Imported concepts: 'b.user_id' -> 'b.user_id' (namespace already in identifier)
    - Property references: 'user_id.name' -> stored as-is for resolution
    """
    locations: List[ConceptLocation] = []

    def walk_tree(
        node: Union[ParseTree, LarkToken],
        in_definition: bool = False,
        parent_data: Optional[str] = None,
    ):
        if isinstance(node, LarkToken):
            # We found a token - check if it's an identifier in a relevant context
            if node.type == "IDENTIFIER" and parent_data in (
                CONCEPT_DEFINITION_NODES
                | CONCEPT_REFERENCE_NODES
                | {"grain_clause", "column_list"}
            ):
                # Determine if this is a definition or reference
                is_def = parent_data in CONCEPT_DEFINITION_NODES

                # Build the concept address
                identifier = str(node)

                # Check if identifier already has a namespace prefix (e.g., 'b.user_id' from import)
                # For definitions, always use default namespace
                # For references, check if it looks like it has a namespace
                parts = identifier.split(".")
                if is_def or len(parts) == 1:
                    # Local definition or simple reference
                    concept_address = f"{default_namespace}.{identifier}"
                else:
                    # Could be imported (b.user_id) or property ref (user_id.name)
                    # Store as-is, resolve_concept_address will handle lookup
                    concept_address = identifier

                locations.append(
                    ConceptLocation(
                        concept_address=concept_address,
                        start_line=node.line or 1,
                        start_column=node.column or 1,
                        end_line=node.end_line or node.line or 1,
                        end_column=node.end_column
                        or (node.column or 1) + len(identifier),
                        is_definition=is_def,
                    )
                )
        else:
            # It's a ParseTree node
            current_data = getattr(node, "data", None)
            is_def_context = current_data in CONCEPT_DEFINITION_NODES

            for child in node.children:
                walk_tree(child, is_def_context, current_data)

    walk_tree(tree)
    return locations


def resolve_concept_address(
    location_address: str, concept_info_map: Dict[str, ConceptInfo]
) -> Optional[ConceptInfo]:
    """
    Resolve a concept address from a location to actual concept info.

    Handles cases where:
    - Direct match: 'local.user_id' or 'b.user_id' (imported)
    - Property reference: 'local.user_id.name' -> 'local.name'
    - Property reference (imported): 'b.user_id.name' -> 'b.name'
    - Auto-derived: 'local.user_id.count'
    - Qualified reference without 'local': 'user_id.name' -> try 'local.name'
    """
    # Try direct match first
    if location_address in concept_info_map:
        return concept_info_map[location_address]

    # Parse the address
    parts = location_address.split(".")
    if len(parts) < 2:
        return None

    # Determine namespace - first part might be namespace or concept name
    # Check if first part matches any known namespace in the concept map
    potential_namespace = parts[0]
    has_known_namespace = any(
        addr.startswith(f"{potential_namespace}.") for addr in concept_info_map
    )

    if has_known_namespace:
        namespace = potential_namespace
        concept_parts = parts[1:]
    else:
        # No known namespace prefix, assume 'local'
        namespace = "local"
        concept_parts = parts

    # Try with namespace prefix
    full_address = f"{namespace}.{'.'.join(concept_parts)}"
    if full_address in concept_info_map:
        return concept_info_map[full_address]

    # For property references (namespace.parent.property -> namespace.property)
    if len(concept_parts) >= 2:
        # Try: namespace.last_part (e.g., local.name from user_id.name)
        simple_address = f"{namespace}.{concept_parts[-1]}"
        if simple_address in concept_info_map:
            return concept_info_map[simple_address]

        # Try compound (auto-derived like user_id.count)
        compound_address = f"{namespace}.{'.'.join(concept_parts)}"
        if compound_address in concept_info_map:
            return concept_info_map[compound_address]

    return None


def extract_concepts_from_environment(
    environment: Environment,
) -> Dict[str, ConceptInfo]:
    """
    Extract concept information from an Environment object.

    Returns a dictionary mapping concept address to ConceptInfo.
    Uses env.user_concepts() to filter out internal concepts.
    """
    concepts: Dict[str, ConceptInfo] = {}

    # Use user_concepts() if available (pytrilogy >= 0.3.156), otherwise filter manually
    if hasattr(environment, "user_concepts"):
        # user_concepts() returns a list of Concept objects
        concept_list = environment.user_concepts()
    else:
        concept_list = [
            c
            for c in environment.concepts.values()
            if c.namespace != "__preql_internal"
        ]

    for concept in concept_list:
        address = concept.address
        # Extract metadata - now includes column positions (pytrilogy >= 0.3.156)
        line_number = None
        column = None
        end_line = None
        end_column = None
        description = None
        concept_source = None

        if hasattr(concept, "metadata") and concept.metadata:
            meta = concept.metadata
            line_number = getattr(meta, "line_number", None)
            column = getattr(meta, "column", None)
            end_line = getattr(meta, "end_line", None)
            end_column = getattr(meta, "end_column", None)
            description = getattr(meta, "description", None)
            if hasattr(meta, "concept_source") and meta.concept_source:
                concept_source = str(meta.concept_source.value)

        # Extract lineage for derived concepts
        lineage_str = None
        if hasattr(concept, "lineage") and concept.lineage:
            lineage_str = str(concept.lineage)

        # Extract keys for properties
        keys_set = None
        if hasattr(concept, "keys") and concept.keys:
            keys_set = concept.keys

        # Extract modifiers
        modifiers_list = []
        if hasattr(concept, "modifiers") and concept.modifiers:
            modifiers_list = [str(m) for m in concept.modifiers]

        # Extract derivation
        derivation_str = None
        if hasattr(concept, "derivation") and concept.derivation:
            derivation_str = (
                str(concept.derivation.value)
                if hasattr(concept.derivation, "value")
                else str(concept.derivation)
            )

        concepts[address] = ConceptInfo(
            name=concept.name,
            address=address,
            datatype=str(concept.datatype),
            purpose=(
                str(concept.purpose.value)
                if hasattr(concept.purpose, "value")
                else str(concept.purpose)
            ),
            namespace=concept.namespace,
            line_number=line_number,
            column=column,
            end_line=end_line,
            end_column=end_column,
            description=description,
            lineage=lineage_str,
            keys=keys_set,
            modifiers=modifiers_list,
            derivation=derivation_str,
            concept_source=concept_source,
        )

    return concepts


def find_concept_at_position(
    locations: List[ConceptLocation],
    line: int,
    column: int,
) -> Optional[ConceptLocation]:
    """
    Find the concept location that contains the given position.

    Line and column are 0-indexed (LSP convention).
    Locations use 1-indexed positions (Lark convention).
    """
    # Convert to 1-indexed for comparison with Lark tokens
    line_1idx = line + 1
    col_1idx = column + 1

    for loc in locations:
        # Check if position is within this location
        if loc.start_line <= line_1idx <= loc.end_line:
            if loc.start_line == loc.end_line:
                # Single line - check column
                if loc.start_column <= col_1idx <= loc.end_column:
                    return loc
            else:
                # Multi-line
                if line_1idx == loc.start_line and col_1idx >= loc.start_column:
                    return loc
                elif line_1idx == loc.end_line and col_1idx <= loc.end_column:
                    return loc
                elif loc.start_line < line_1idx < loc.end_line:
                    return loc

    return None


def format_concept_hover(concept: ConceptInfo, is_definition: bool = False) -> str:
    """
    Format concept information as markdown for hover display.
    """
    lines = []

    # Header with purpose and type
    lines.append(f"**{concept.purpose}** `{concept.name}`: `{concept.datatype}`")
    lines.append("")

    # Description if available
    if concept.description:
        lines.append(concept.description)
        lines.append("")

    # Details section
    details = []

    if concept.namespace and concept.namespace != "local":
        details.append(f"**Namespace:** `{concept.namespace}`")

    if concept.keys:
        keys_str = ", ".join(f"`{k}`" for k in concept.keys)
        details.append(f"**Keys:** {keys_str}")

    if concept.lineage:
        # Clean up lineage display
        lineage_display = concept.lineage
        if len(lineage_display) > 100:
            lineage_display = lineage_display[:97] + "..."
        details.append(f"**Derivation:** `{lineage_display}`")

    if concept.modifiers:
        mods_str = ", ".join(concept.modifiers)
        details.append(f"**Modifiers:** {mods_str}")

    if concept.line_number:
        if is_definition:
            details.append(f"**Defined on line:** {concept.line_number}")
        else:
            details.append(f"**Definition:** line {concept.line_number}")

    if concept.concept_source and concept.concept_source != "manual":
        details.append(f"**Source:** {concept.concept_source}")

    if details:
        lines.extend(details)

    # Full address
    lines.append("")
    lines.append(f"*Full address: `{concept.address}`*")

    return "\n".join(lines)


def get_definition_locations(
    locations: List[ConceptLocation], concept_address: str
) -> List[ConceptLocation]:
    """
    Find all definition locations for a given concept address.
    """
    definitions = []
    for loc in locations:
        if loc.is_definition and loc.concept_address == concept_address:
            definitions.append(loc)
    return definitions


def extract_datasource_info(tree: ParseTree) -> List[DatasourceInfo]:
    """
    Extract datasource information from the parse tree for hover tooltips.
    """
    datasources: List[DatasourceInfo] = []

    def walk_tree(node: Union[ParseTree, LarkToken]):
        if isinstance(node, LarkToken):
            return

        node_data = getattr(node, "data", None)

        if node_data == "datasource":
            # Extract datasource information
            name = ""
            address = ""
            columns = []
            grain = []
            is_root = False
            start_line = 1
            start_column = 1
            end_line = 1
            end_column = 1

            for child in node.children:
                if isinstance(child, LarkToken):
                    if child.type == "IDENTIFIER" and not name:
                        name = str(child)
                        start_line = child.line or 1
                        start_column = child.column or 1
                    elif child.type == "IDENTIFIER":
                        address = str(child)
                        end_line = child.end_line or child.line or 1
                        end_column = child.end_column or 100
                else:
                    # It's a tree node
                    child_data = getattr(child, "data", None)
                    if child_data == "column_list":
                        for col_child in child.children:
                            if (
                                isinstance(col_child, LarkToken)
                                and col_child.type == "IDENTIFIER"
                            ):
                                columns.append(str(col_child))
                    elif child_data == "grain_clause":
                        for grain_child in child.children:
                            if (
                                isinstance(grain_child, LarkToken)
                                and grain_child.type == "IDENTIFIER"
                            ):
                                grain.append(str(grain_child))

            if name:
                datasources.append(
                    DatasourceInfo(
                        name=name,
                        address=address or name,
                        columns=columns,
                        grain=grain,
                        start_line=start_line,
                        start_column=start_column,
                        end_line=end_line,
                        end_column=end_column,
                        is_root=is_root,
                    )
                )
        elif node_data == "root_datasource":
            # Handle root datasource syntax
            name = ""
            address = ""
            columns = []
            grain = []
            start_line = 1
            start_column = 1
            end_line = 1
            end_column = 1

            for child in node.children:
                if isinstance(child, LarkToken):
                    if child.type == "IDENTIFIER" and not name:
                        name = str(child)
                        start_line = child.line or 1
                        start_column = child.column or 1
                    elif child.type == "IDENTIFIER":
                        address = str(child)
                        end_line = child.end_line or child.line or 1
                        end_column = child.end_column or 100
                else:
                    # It's a tree node
                    child_data = getattr(child, "data", None)
                    if child_data == "column_list":
                        for col_child in child.children:
                            if (
                                isinstance(col_child, LarkToken)
                                and col_child.type == "IDENTIFIER"
                            ):
                                columns.append(str(col_child))
                    elif child_data == "grain_clause":
                        for grain_child in child.children:
                            if (
                                isinstance(grain_child, LarkToken)
                                and grain_child.type == "IDENTIFIER"
                            ):
                                grain.append(str(grain_child))

            if name:
                datasources.append(
                    DatasourceInfo(
                        name=name,
                        address=address or name,
                        columns=columns,
                        grain=grain,
                        start_line=start_line,
                        start_column=start_column,
                        end_line=end_line,
                        end_column=end_column,
                        is_root=True,
                    )
                )
        else:
            for child in node.children:
                walk_tree(child)

    walk_tree(tree)
    return datasources


def extract_import_info(tree: ParseTree) -> List[ImportInfo]:
    """
    Extract import information from the parse tree for hover tooltips.
    """
    imports: List[ImportInfo] = []

    def walk_tree(node: Union[ParseTree, LarkToken]):
        if isinstance(node, LarkToken):
            return

        node_data = getattr(node, "data", None)

        if node_data == "import_statement":
            # Extract import information
            path = ""
            alias = None
            start_line = 1
            start_column = 1
            end_line = 1
            end_column = 1

            for child in node.children:
                if isinstance(child, LarkToken):
                    if child.type in ("IDENTIFIER", "DOTTED_NAME", "FILEPATH"):
                        if not path:
                            path = str(child)
                            start_line = child.line or 1
                            start_column = child.column or 1
                            end_line = child.end_line or child.line or 1
                            end_column = child.end_column or 100
                        else:
                            # This is the alias
                            alias = str(child)
                            end_line = child.end_line or child.line or 1
                            end_column = child.end_column or 100

            if path:
                imports.append(
                    ImportInfo(
                        path=path,
                        alias=alias,
                        start_line=start_line,
                        start_column=start_column,
                        end_line=end_line,
                        end_column=end_column,
                    )
                )
        else:
            for child in node.children:
                walk_tree(child)

    walk_tree(tree)
    return imports


def format_datasource_hover(ds: DatasourceInfo) -> str:
    """
    Format datasource information as markdown for hover display.
    """
    lines = []

    if ds.is_root:
        lines.append(f"**root datasource** `{ds.name}`")
    else:
        lines.append(f"**datasource** `{ds.name}`")
    lines.append("")

    lines.append(f"**Address:** `{ds.address}`")

    if ds.columns:
        cols_str = ", ".join(f"`{c}`" for c in ds.columns[:10])
        if len(ds.columns) > 10:
            cols_str += f" ... ({len(ds.columns)} total)"
        lines.append(f"**Columns:** {cols_str}")

    if ds.grain:
        grain_str = ", ".join(f"`{g}`" for g in ds.grain)
        lines.append(f"**Grain:** {grain_str}")

    return "\n".join(lines)


def format_import_hover(imp: ImportInfo) -> str:
    """
    Format import information as markdown for hover display.
    """
    lines = []

    lines.append("**import statement**")
    lines.append("")
    lines.append(f"**Path:** `{imp.path}`")

    if imp.alias:
        lines.append(f"**Alias:** `{imp.alias}`")
        lines.append("")
        lines.append(
            f"*Use `{imp.alias}.concept_name` to reference concepts from this import*"
        )

    return "\n".join(lines)


def get_document_symbols(
    locations: List[ConceptLocation],
    concept_info_map: Dict[str, ConceptInfo],
    datasources: List[DatasourceInfo],
    imports: List[ImportInfo],
) -> List[DocumentSymbol]:
    """
    Generate document symbols for the outline/navigation view.
    """
    symbols: List[DocumentSymbol] = []

    # Add concept definitions
    for loc in locations:
        if not loc.is_definition:
            continue

        concept = resolve_concept_address(loc.concept_address, concept_info_map)
        if not concept:
            continue

        # Determine symbol kind based on purpose
        kind = SymbolKind.Variable
        if concept.purpose == "key":
            kind = SymbolKind.Key
        elif concept.purpose == "property":
            kind = SymbolKind.Property
        elif concept.purpose == "metric":
            kind = SymbolKind.Number
        elif concept.purpose == "constant":
            kind = SymbolKind.Constant

        symbol_range = Range(
            start=Position(line=loc.start_line - 1, character=loc.start_column - 1),
            end=Position(line=loc.end_line - 1, character=loc.end_column - 1),
        )

        symbols.append(
            DocumentSymbol(
                name=concept.name,
                kind=kind,
                range=symbol_range,
                selection_range=symbol_range,
                detail=f"{concept.purpose}: {concept.datatype}",
            )
        )

    # Add datasources
    for ds in datasources:
        symbol_range = Range(
            start=Position(line=ds.start_line - 1, character=ds.start_column - 1),
            end=Position(line=ds.end_line - 1, character=ds.end_column - 1),
        )

        symbols.append(
            DocumentSymbol(
                name=ds.name,
                kind=SymbolKind.Struct,
                range=symbol_range,
                selection_range=symbol_range,
                detail=f"datasource -> {ds.address}",
            )
        )

    # Add imports
    for imp in imports:
        symbol_range = Range(
            start=Position(line=imp.start_line - 1, character=imp.start_column - 1),
            end=Position(line=imp.end_line - 1, character=imp.end_column - 1),
        )

        name = imp.alias if imp.alias else imp.path
        symbols.append(
            DocumentSymbol(
                name=name,
                kind=SymbolKind.Module,
                range=symbol_range,
                selection_range=symbol_range,
                detail=f"import {imp.path}",
            )
        )

    # Sort by line number
    symbols.sort(key=lambda s: s.range.start.line)

    return symbols


# Trilogy built-in functions with signature information for signature help
TRILOGY_FUNCTIONS: dict[str, dict[str, Any]] = {
    "count": {
        "signature": "count(concept) -> int",
        "description": "Count the number of distinct values of a concept.",
        "parameters": [
            {
                "name": "concept",
                "description": "The concept to count distinct values of",
            }
        ],
    },
    "sum": {
        "signature": "sum(concept) -> numeric",
        "description": "Calculate the sum of all values of a concept.",
        "parameters": [
            {"name": "concept", "description": "The numeric concept to sum"}
        ],
    },
    "avg": {
        "signature": "avg(concept) -> float",
        "description": "Calculate the average of all values of a concept.",
        "parameters": [
            {"name": "concept", "description": "The numeric concept to average"}
        ],
    },
    "min": {
        "signature": "min(concept) -> value",
        "description": "Find the minimum value of a concept.",
        "parameters": [
            {"name": "concept", "description": "The concept to find the minimum of"}
        ],
    },
    "max": {
        "signature": "max(concept) -> value",
        "description": "Find the maximum value of a concept.",
        "parameters": [
            {"name": "concept", "description": "The concept to find the maximum of"}
        ],
    },
    "coalesce": {
        "signature": "coalesce(value1, value2, ...) -> value",
        "description": "Return the first non-null value from the arguments.",
        "parameters": [
            {"name": "value1", "description": "First value to check"},
            {"name": "value2", "description": "Second value to check (optional)"},
        ],
    },
    "concat": {
        "signature": "concat(string1, string2, ...) -> string",
        "description": "Concatenate multiple strings together.",
        "parameters": [
            {"name": "string1", "description": "First string"},
            {"name": "string2", "description": "Second string"},
        ],
    },
    "length": {
        "signature": "length(string) -> int",
        "description": "Return the length of a string.",
        "parameters": [{"name": "string", "description": "The string to measure"}],
    },
    "upper": {
        "signature": "upper(string) -> string",
        "description": "Convert a string to uppercase.",
        "parameters": [{"name": "string", "description": "The string to convert"}],
    },
    "lower": {
        "signature": "lower(string) -> string",
        "description": "Convert a string to lowercase.",
        "parameters": [{"name": "string", "description": "The string to convert"}],
    },
    "trim": {
        "signature": "trim(string) -> string",
        "description": "Remove leading and trailing whitespace from a string.",
        "parameters": [{"name": "string", "description": "The string to trim"}],
    },
    "substring": {
        "signature": "substring(string, start, length) -> string",
        "description": "Extract a substring from a string.",
        "parameters": [
            {"name": "string", "description": "The source string"},
            {"name": "start", "description": "Starting position (1-indexed)"},
            {"name": "length", "description": "Number of characters to extract"},
        ],
    },
    "abs": {
        "signature": "abs(value) -> numeric",
        "description": "Return the absolute value of a number.",
        "parameters": [{"name": "value", "description": "The numeric value"}],
    },
    "round": {
        "signature": "round(value, decimals?) -> numeric",
        "description": "Round a number to the specified number of decimal places.",
        "parameters": [
            {"name": "value", "description": "The numeric value to round"},
            {
                "name": "decimals",
                "description": "Number of decimal places (default: 0)",
            },
        ],
    },
    "floor": {
        "signature": "floor(value) -> int",
        "description": "Round a number down to the nearest integer.",
        "parameters": [{"name": "value", "description": "The numeric value"}],
    },
    "ceil": {
        "signature": "ceil(value) -> int",
        "description": "Round a number up to the nearest integer.",
        "parameters": [{"name": "value", "description": "The numeric value"}],
    },
    "date": {
        "signature": "date(year, month, day) -> date",
        "description": "Create a date from year, month, and day components.",
        "parameters": [
            {"name": "year", "description": "The year"},
            {"name": "month", "description": "The month (1-12)"},
            {"name": "day", "description": "The day of the month"},
        ],
    },
    "year": {
        "signature": "year(date) -> int",
        "description": "Extract the year from a date.",
        "parameters": [{"name": "date", "description": "The date to extract from"}],
    },
    "month": {
        "signature": "month(date) -> int",
        "description": "Extract the month from a date.",
        "parameters": [{"name": "date", "description": "The date to extract from"}],
    },
    "day": {
        "signature": "day(date) -> int",
        "description": "Extract the day from a date.",
        "parameters": [{"name": "date", "description": "The date to extract from"}],
    },
    "now": {
        "signature": "now() -> timestamp",
        "description": "Return the current timestamp.",
        "parameters": [],
    },
    "today": {
        "signature": "today() -> date",
        "description": "Return the current date.",
        "parameters": [],
    },
    "cast": {
        "signature": "cast(value, type) -> value",
        "description": "Cast a value to a different data type.",
        "parameters": [
            {"name": "value", "description": "The value to cast"},
            {"name": "type", "description": "The target data type"},
        ],
    },
    "case": {
        "signature": "case(when condition then value, ..., else default) -> value",
        "description": "Conditional expression that returns different values based on conditions.",
        "parameters": [
            {"name": "condition", "description": "Boolean condition to test"},
            {"name": "value", "description": "Value to return if condition is true"},
        ],
    },
    "if": {
        "signature": "if(condition, then_value, else_value) -> value",
        "description": "Return one of two values based on a condition.",
        "parameters": [
            {"name": "condition", "description": "Boolean condition to test"},
            {
                "name": "then_value",
                "description": "Value to return if condition is true",
            },
            {
                "name": "else_value",
                "description": "Value to return if condition is false",
            },
        ],
    },
    "nullif": {
        "signature": "nullif(value1, value2) -> value",
        "description": "Return NULL if value1 equals value2, otherwise return value1.",
        "parameters": [
            {
                "name": "value1",
                "description": "The value to compare and potentially return",
            },
            {"name": "value2", "description": "The value to compare against"},
        ],
    },
    "like": {
        "signature": "like(string, pattern) -> bool",
        "description": "Check if a string matches a pattern (using % and _ wildcards).",
        "parameters": [
            {"name": "string", "description": "The string to match"},
            {"name": "pattern", "description": "The pattern to match against"},
        ],
    },
    "unnest": {
        "signature": "unnest(array) -> values",
        "description": "Expand an array into multiple rows.",
        "parameters": [{"name": "array", "description": "The array to expand"}],
    },
    "array_agg": {
        "signature": "array_agg(value) -> array",
        "description": "Aggregate values into an array.",
        "parameters": [{"name": "value", "description": "The values to aggregate"}],
    },
    "string_agg": {
        "signature": "string_agg(value, separator) -> string",
        "description": "Concatenate values into a string with a separator.",
        "parameters": [
            {"name": "value", "description": "The values to concatenate"},
            {"name": "separator", "description": "The separator between values"},
        ],
    },
}
