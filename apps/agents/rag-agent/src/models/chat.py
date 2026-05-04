"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(description="visitor | agent | system")
    content: str


class ChatRequest(BaseModel):
    model_config = {"populate_by_name": True}

    organization_id: str
    project_id: str
    project_agent_id: str
    user_message: str
    history: list[ChatMessage] = Field(default_factory=list)
    system_instruction: str | None = Field(default=None)
    generation_config: dict | None = Field(default=None, alias="model_config")


class ChatResponse(BaseModel):
    reply: str
    sources: list[dict] = Field(default_factory=list)
    route: dict | None = None
    sql: str | None = None
    suggestions: list[str] = Field(default_factory=list)
    cards: list[dict] = Field(default_factory=list)
    model_name: str | None = None
    tokens_input: int = 0
    tokens_output: int = 0
