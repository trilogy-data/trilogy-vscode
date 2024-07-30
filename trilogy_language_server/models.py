from pydantic import BaseModel, Field
from typing import List
import enum

class TokenModifier(enum.IntFlag):
    deprecated = enum.auto()
    readonly = enum.auto()
    defaultLibrary = enum.auto()
    definition = enum.auto()
    declaration = enum.auto()



class Token(BaseModel):
    line: int
    offset: int
    text: str

    tok_type: str = ""
    tok_modifiers: List[TokenModifier] = Field(default_factory=list)