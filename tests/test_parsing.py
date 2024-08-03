from trilogy_language_server.models import Token, TokenModifier
from trilogy.parsing.parse_engine import PARSER
from trilogy_language_server.parsing import parse_tree, gen_tree, code_lense_tree
from trilogy import Dialects
from lsprotocol.types import CodeLens, Range, Position, Command, SemanticTokenModifiers
from lark import ParseTree, Token as LarkToken
from typing import List
from trilogy.dialect.duckdb import DuckDBDialect

def test_parse_tree():
    basic = """key omicron int;
	
	SELECT omicron, 1 as test;
	
	"""
    tree = gen_tree(basic)
    parsed = parse_tree(basic, tree)

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
    lenses = code_lense_tree(basic, tree, dialect)
    comp = lenses[0]
    expected_query = """

SELECT
    1 as "omicron",
    1 as "test"


"""
    assert comp.command.arguments[0] == expected_query
    assert comp == CodeLens(
        range=Range(start=Position(line=3, character=1), end=Position(line=3, character=10)),
        command=Command(
            title="Run Query",
            command="codeLens.runQuery",
            arguments=[expected_query],
        ),
        data = {'idx': 1},
    )
