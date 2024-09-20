from trilogy_language_server.models import Token, TokenModifier
from trilogy.parsing.parse_engine import PARSER
from lark import ParseTree, Token as LarkToken
from typing import List, Union
from lsprotocol.types import CodeLens, Range, Position, Command
from trilogy.parsing.parse_engine import ParseToObjects as ParseToObjects
from trilogy.core.models import (
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
    parsed = ParseToObjects(
        visit_tokens=True,
        text=text,
        environment=environment,
    ).transform(input)
    for idx, stmt in enumerate(parsed):
        try:
            x = parse_statement(idx, stmt, dialect, environment=environment)
            if x:
                tokens += x
        except Exception:
            pass
    return tokens
