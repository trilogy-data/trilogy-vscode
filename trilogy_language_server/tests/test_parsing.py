from trilogy_language_server.models import Token, TokenModifier, ConceptInfo
from trilogy_language_server.parsing import (
    tree_to_symbols,
    gen_tree,
    code_lense_tree,
    extract_concept_locations,
    extract_concepts_from_environment,
    find_concept_at_position,
    format_concept_hover,
    resolve_concept_address,
)
from lsprotocol.types import CodeLens, Range, Position, Command
from trilogy.dialect.duckdb import DuckDBDialect
from trilogy.authoring import Environment
from trilogy.parsing.parse_engine import ParseToObjects, PARSER


def test_parse_tree():
    basic = """key omicron int;
	
	SELECT omicron, 1 as test;
	
	"""
    tree = gen_tree(basic)
    parsed = tree_to_symbols(basic, tree)

    expected = Token(
        line=1,
        offset=1,
        text="key",
        tok_type="variable",
        tok_modifiers=[TokenModifier.definition],
    )
    check = parsed[0]
    for attr in expected.__dict__:
        assert getattr(expected, attr) == getattr(check, attr)


def test_code_lense_tree():
    basic = """const omicron <- 1;
	
	SELECT omicron, 1 as test;
	
	"""
    tree = gen_tree(basic)
    dialect = DuckDBDialect()
    comp = code_lense_tree(
        environment=Environment(), text=basic, input=tree, dialect=dialect
    )
    expected_query = """SELECT
    1 as "omicron",
    1 as "test"
"""
    assert comp[0].command.arguments[0] == expected_query
    assert comp[0] == CodeLens(
        range=Range(
            start=Position(line=2, character=1), end=Position(line=2, character=10)
        ),
        command=Command(
            title="Run Query",
            command="trilogy.runQuery",
            arguments=[expected_query],
        ),
        data={"idx": 1},
    ), comp[0]
    assert comp[1].command.arguments[0] == [expected_query]
    assert comp[1].command.command == "trilogy.renderQuery"
    assert comp[1] == CodeLens(
        range=Range(
            start=Position(line=2, character=2), end=Position(line=2, character=10)
        ),
        command=Command(
            title="Render SQL",
            command="trilogy.renderQuery",
            arguments=[[expected_query], str(dialect.__class__)],
        ),
        data={"idx": 1},
    ), str(comp[1].command)


def test_root_datasource_parsing():
    """Test that 'root datasource' syntax parses successfully without warnings"""
    code_with_root_datasource = """key id int;

root datasource test_source(
    id
)
address test_table;

SELECT id;
"""
    # This should parse successfully without raising an exception
    tree = gen_tree(code_with_root_datasource)
    assert tree is not None, "Parse tree should not be None"

    # Verify we can convert to symbols without errors
    parsed = tree_to_symbols(code_with_root_datasource, tree)
    assert len(parsed) > 0, "Should have parsed tokens"


# Tests for hover functionality


def test_extract_concept_locations():
    """Test that concept locations are extracted from parse tree"""
    code = """key user_id int;
property user_id.name string;
select user_id;
"""
    tree = gen_tree(code)
    locations = extract_concept_locations(tree)

    # Should have 3 locations: user_id def, user_id.name def, user_id ref
    assert len(locations) == 3

    # First should be user_id definition
    assert locations[0].concept_address == "local.user_id"
    assert locations[0].is_definition is True
    assert locations[0].start_line == 1

    # Second should be user_id.name definition (definitions always get local prefix)
    assert locations[1].concept_address == "local.user_id.name"
    assert locations[1].is_definition is True

    # Third should be user_id reference in select
    assert locations[2].concept_address == "local.user_id"
    assert locations[2].is_definition is False


def test_extract_concept_locations_with_qualified_refs():
    """Test that qualified references (like b.user_id) are handled correctly"""
    code = """select user_id.name;
"""
    tree = gen_tree(code)
    locations = extract_concept_locations(tree)

    # Qualified reference should not get local. prefix added
    assert len(locations) == 1
    assert locations[0].concept_address == "user_id.name"
    assert locations[0].is_definition is False


def test_extract_concepts_from_environment():
    """Test that concepts are extracted from environment"""
    code = """key user_id int;
property user_id.name string;
metric total_users <- count(user_id);
"""
    env = Environment()
    parser = ParseToObjects(environment=env)
    parser.set_text(code)
    parser.prepare_parse()
    tree = PARSER.parse(code)
    parser.transform(tree)
    parser.run_second_parse_pass()

    concept_info = extract_concepts_from_environment(env)

    # Should have concepts for user_id, name, total_users (plus auto-derived user_id.count)
    # Filter out internal concepts
    user_concepts = {
        k: v for k, v in concept_info.items() if not k.startswith("local._")
    }
    assert len(user_concepts) >= 3

    # Check user_id
    assert "local.user_id" in concept_info
    assert concept_info["local.user_id"].purpose == "key"
    assert concept_info["local.user_id"].datatype == "INTEGER"

    # Check name (stored as local.name, not local.user_id.name)
    assert "local.name" in concept_info
    assert concept_info["local.name"].purpose == "property"


def test_find_concept_at_position():
    """Test finding concept at cursor position"""
    code = """key user_id int;
select user_id;
"""
    tree = gen_tree(code)
    locations = extract_concept_locations(tree)

    # Position on 'user_id' in definition (line 0, col 4 in 0-indexed)
    loc = find_concept_at_position(locations, 0, 4)
    assert loc is not None
    assert loc.concept_address == "local.user_id"
    assert loc.is_definition is True

    # Position on 'user_id' in select (line 1, col 7 in 0-indexed)
    loc = find_concept_at_position(locations, 1, 7)
    assert loc is not None
    assert loc.concept_address == "local.user_id"
    assert loc.is_definition is False

    # Position outside any concept
    loc = find_concept_at_position(locations, 0, 0)
    assert loc is None


def test_resolve_concept_address():
    """Test resolving concept addresses"""
    code = """key user_id int;
property user_id.name string;
"""
    env = Environment()
    parser = ParseToObjects(environment=env)
    parser.set_text(code)
    parser.prepare_parse()
    tree = PARSER.parse(code)
    parser.transform(tree)
    parser.run_second_parse_pass()

    concept_info = extract_concepts_from_environment(env)

    # Direct match
    concept = resolve_concept_address("local.user_id", concept_info)
    assert concept is not None
    assert concept.name == "user_id"

    # Property reference (local.user_id.name -> local.name)
    concept = resolve_concept_address("local.user_id.name", concept_info)
    assert concept is not None
    assert concept.name == "name"
    assert concept.purpose == "property"

    # Qualified reference without namespace (user_id.name -> local.name)
    concept = resolve_concept_address("user_id.name", concept_info)
    assert concept is not None
    assert concept.name == "name"
    assert concept.purpose == "property"


def test_format_concept_hover():
    """Test formatting concept info for hover display"""
    concept = ConceptInfo(
        name="user_id",
        address="local.user_id",
        datatype="INTEGER",
        purpose="key",
        namespace="local",
        line_number=1,
        description=None,
        lineage=None,
        keys=None,
        modifiers=[],
        derivation="root",
        concept_source="manual",
    )

    hover_text = format_concept_hover(concept)

    assert "**key**" in hover_text
    assert "`user_id`" in hover_text
    assert "`INTEGER`" in hover_text
    assert "line 1" in hover_text
    assert "`local.user_id`" in hover_text


def test_format_concept_hover_with_keys():
    """Test formatting hover for property with keys"""
    concept = ConceptInfo(
        name="name",
        address="local.name",
        datatype="STRING",
        purpose="property",
        namespace="local",
        line_number=2,
        description=None,
        lineage=None,
        keys={"local.user_id"},
        modifiers=[],
        derivation="root",
        concept_source="manual",
    )

    hover_text = format_concept_hover(concept)

    assert "**property**" in hover_text
    assert "**Keys:**" in hover_text
    assert "`local.user_id`" in hover_text


def test_format_concept_hover_with_lineage():
    """Test formatting hover for derived concept with lineage"""
    concept = ConceptInfo(
        name="total_users",
        address="local.total_users",
        datatype="INTEGER",
        purpose="metric",
        namespace="local",
        line_number=3,
        description=None,
        lineage="count(ref:local.user_id)",
        keys=None,
        modifiers=[],
        derivation="derived",
        concept_source="manual",
    )

    hover_text = format_concept_hover(concept)

    assert "**metric**" in hover_text
    assert "**Derivation:**" in hover_text
    assert "count" in hover_text
