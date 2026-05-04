"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons

OpenRouter uses an OpenAI-compatible API at https://openrouter.ai/api/v1.
"""

from __future__ import annotations

from llm.base import GenerationConfig, LLMClient, LLMResponse
from llm.openai_llm import OpenAILLMClient

_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class OpenRouterLLMClient(LLMClient):
    def __init__(self, *, api_key: str, model_identifier: str) -> None:
        self._inner = OpenAILLMClient(
            api_key=api_key,
            model_identifier=model_identifier,
            base_url=_OPENROUTER_BASE_URL,
        )

    @property
    def model_identifier(self) -> str:
        return self._inner.model_identifier

    def generate(
        self,
        prompt: str,
        *,
        config: GenerationConfig | None = None,
    ) -> LLMResponse:
        return self._inner.generate(prompt, config=config)
