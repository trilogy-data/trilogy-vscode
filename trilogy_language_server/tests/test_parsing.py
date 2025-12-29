from trilogy_language_server.models import Token, TokenModifier
from trilogy_language_server.parsing import tree_to_symbols, gen_tree, code_lense_tree
from lsprotocol.types import CodeLens, Range, Position, Command
from trilogy.dialect.duckdb import DuckDBDialect
from trilogy.authoring import Environment


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
    :omicron as "omicron",
    :test as "test"
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
