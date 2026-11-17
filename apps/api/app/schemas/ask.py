from pydantic import BaseModel, Field

from app.schemas.common import Usage


class Citation(BaseModel):
    id: int = Field(ge=1, description="Marker number used in the answer text, e.g. [1]")
    doc_id: str = Field(description="Stable document id (file stem), e.g. 'outage-sla'")
    title: str
    section: str = Field(default="", description="Heading of the cited chunk")
    snippet: str = Field(description="Short excerpt of the cited chunk")
    score: float = Field(ge=0, le=1)


class ChatTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=4000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=10)


class AskResponse(BaseModel):
    """Non-streaming answer (used by evals and as the payload of the final SSE `done` event)."""

    answer: str
    answered: bool = Field(description="False when the KB does not cover the question")
    language: str = Field(description="Detected question language: en | bn | banglish")
    citations: list[Citation]
    usage: Usage
