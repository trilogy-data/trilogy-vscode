from pydantic import BaseModel, Field
from typing import List, Optional, Set
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


class ConceptInfo(BaseModel):
    """Information about a concept for hover tooltips."""

    name: str
    address: str
    datatype: str
    purpose: str  # KEY, PROPERTY, METRIC, CONSTANT, AUTO
    namespace: str
    line_number: Optional[int] = None
    column: Optional[int] = None
    end_line: Optional[int] = None
    end_column: Optional[int] = None
    description: Optional[str] = None
    lineage: Optional[str] = None  # For derived concepts
    keys: Optional[Set[str]] = None  # For properties, the keys they depend on
    modifiers: List[str] = Field(default_factory=list)
    derivation: Optional[str] = None
    concept_source: Optional[str] = None  # MANUAL, AUTO_DERIVED


class ConceptLocation(BaseModel):
    """Tracks the location of a concept reference in the document."""

    concept_address: str
    start_line: int
    start_column: int
    end_line: int
    end_column: int
    is_definition: bool = False


class DatasourceInfo(BaseModel):
    """Information about a datasource for hover tooltips."""

    name: str
    address: str
    columns: List[str] = Field(default_factory=list)
    grain: List[str] = Field(default_factory=list)
    start_line: int
    start_column: int
    end_line: int
    end_column: int
    is_root: bool = False


class ImportInfo(BaseModel):
    """Information about an import statement for hover tooltips."""

    path: str
    alias: Optional[str] = None
    start_line: int
    start_column: int
    end_line: int
    end_column: int
