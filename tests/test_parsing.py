from trilogy_language_server.models import Token
from trilogy.parsing.parse_engine import PARSER
from trilogy_language_server.parsing import parse_tree
from lark import ParseTree, Token as LarkToken
from typing import List





def test_parse_tree():
	basic = '''key omicron int;
	
	SELECT omicron, 1 as test;
	
	'''
	parsed = parse_tree(basic)
	exp_0 = Token(line=1, offset=1, text='key')
	assert parsed[0] == Token(line=1, offset=1, text='keys'), f'{parsed[0]} vs {exp_0}'