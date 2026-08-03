import enum

from pydantic import BaseModel, Field


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
    tok_modifiers: list[TokenModifier] = Field(default_factory=list)


class ConceptInfo(BaseModel):
    """Information about a concept for hover tooltips."""

    name: str
    address: str
    datatype: str
    purpose: str  # KEY, PROPERTY, METRIC, CONSTANT, AUTO
    namespace: str
    line_number: int | None = None
    column: int | None = None
    end_line: int | None = None
    end_column: int | None = None
    description: str | None = None
    lineage: str | None = None  # For derived concepts
    keys: set[str] | None = None  # For properties, the keys they depend on
    modifiers: list[str] = Field(default_factory=list)
    derivation: str | None = None
    concept_source: str | None = None  # MANUAL, AUTO_DERIVED


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
    columns: list[str] = Field(default_factory=list)
    grain: list[str] = Field(default_factory=list)
    start_line: int
    start_column: int
    end_line: int
    end_column: int
    is_root: bool = False


class ImportInfo(BaseModel):
    """Information about an import statement for hover tooltips."""

    path: str
    alias: str | None = None
    start_line: int
    start_column: int
    end_line: int
    end_column: int
