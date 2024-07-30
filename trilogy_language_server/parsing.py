from trilogy_language_server.models import Token, TokenModifier
from trilogy.parsing.parse_engine import PARSER
from lark import ParseTree, Token as LarkToken
from typing import List


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


def gen_tokens(text, item: ParseTree) -> List[Token]:
    tokens = []
    if isinstance(item, LarkToken):
        tokens.append(
            Token(
                line=item.line,
                offset=item.column,
                text=extract_subtext(
                    text, item.line, item.end_line, item.column - 1, item.end_column - 1
                ),
                tok_type=item.type,
                tok_modifiers = [TokenModifier.definition]
            )
        )
    else:
        for child in item.children:
            tokens += gen_tokens(text, child)
    return tokens


def parse_tree(text, input: ParseTree)->List[Token]:
    tokens = []
    for x in input.children:
        tokens += gen_tokens(text, x)
    return tokens


def parse_text(text: str)->List[Token]:
    parsed: ParseTree = PARSER.parse(text)
    return parse_tree(parsed)
