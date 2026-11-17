from pydantic import BaseModel, Field


class DocumentSummary(BaseModel):
    doc_id: str
    title: str
    path: str = Field(description="Path relative to the data dir")
    trusted: bool = Field(description="False for untrusted user-generated content (e.g. forum posts)")
    chunks: int = Field(ge=0)


class DocumentDetail(DocumentSummary):
    content: str = Field(description="Full markdown content (for the citation viewer)")


class IndexResult(BaseModel):
    files: int = Field(ge=0)
    chunks: int = Field(ge=0)
    upserted: int = Field(ge=0, description="Chunks new or changed since last run")
    unchanged: int = Field(ge=0)
    deleted: int = Field(ge=0, description="Stale chunks removed")
    duration_ms: float = Field(ge=0)
