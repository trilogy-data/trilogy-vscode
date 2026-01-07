from trilogy_language_server.models import Token, TokenModifier, ConceptInfo, ConceptLocation
from trilogy.parsing.parse_engine import PARSER
from lark import ParseTree, Token as LarkToken
from typing import List, Union, Dict, Optional
from lsprotocol.types import CodeLens, Range, Position, Command
from trilogy.parsing.parse_engine import ParseToObjects as ParseToObjects
from trilogy.core.statements.author import (
    SelectStatement,
    MultiSelectStatement,
    PersistStatement,
    Environment,
    RawSQLStatement,
)
from trilogy.dialect.base import BaseDialect


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
    tree: ParseTree, namespace: str = "local"
) -> List[ConceptLocation]:
    """
    Extract all concept definition and reference locations from the parse tree.

    Returns a list of ConceptLocation objects that map positions to concept addresses.

    Note: For property references like 'user_id.name', we store both the full
    reference form (local.user_id.name) and an alternate_address for looking up
    the actual concept in the environment (local.name).
    """
    locations: List[ConceptLocation] = []

    def walk_tree(node: Union[ParseTree, LarkToken], in_definition: bool = False, parent_data: Optional[str] = None):
        if isinstance(node, LarkToken):
            # We found a token - check if it's an identifier in a relevant context
            if node.type == "IDENTIFIER" and parent_data in (
                CONCEPT_DEFINITION_NODES | CONCEPT_REFERENCE_NODES | {"grain_clause", "column_list"}
            ):
                # Determine if this is a definition or reference
                is_def = parent_data in CONCEPT_DEFINITION_NODES

                # Build the concept address
                identifier = str(node)
                concept_address = f"{namespace}.{identifier}"

                locations.append(
                    ConceptLocation(
                        concept_address=concept_address,
                        start_line=node.line or 1,
                        start_column=node.column or 1,
                        end_line=node.end_line or node.line or 1,
                        end_column=node.end_column or (node.column or 1) + len(identifier),
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
    - Address matches directly (e.g., 'local.user_id')
    - Property reference like 'local.user_id.name' maps to 'local.name'
    - Auto-derived concepts like 'local.user_id.count'
    """
    # Try direct match first
    if location_address in concept_info_map:
        return concept_info_map[location_address]

    # Parse the address
    parts = location_address.split(".")
    if len(parts) < 2:
        return None

    namespace = parts[0]

    # Try looking up just the last part (for properties like user_id.name -> name)
    if len(parts) >= 3:
        # Try: local.name (last part only)
        simple_address = f"{namespace}.{parts[-1]}"
        if simple_address in concept_info_map:
            return concept_info_map[simple_address]

        # Try: local.parent.name (auto-derived like user_id.count)
        compound_address = f"{namespace}.{'.'.join(parts[1:])}"
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
            c for c in environment.concepts.values()
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
            derivation_str = str(concept.derivation.value) if hasattr(concept.derivation, "value") else str(concept.derivation)

        concepts[address] = ConceptInfo(
            name=concept.name,
            address=address,
            datatype=str(concept.datatype),
            purpose=str(concept.purpose.value) if hasattr(concept.purpose, "value") else str(concept.purpose),
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
