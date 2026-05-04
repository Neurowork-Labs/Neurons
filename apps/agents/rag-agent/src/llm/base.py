"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Iterator
from typing import Any


@dataclass
class LLMUsage:
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class LLMResponse:
    text: str = ""
    usage: LLMUsage = field(default_factory=LLMUsage)


@dataclass
class GenerationConfig:
    temperature: float = 0.4
    top_p: float | None = None
    top_k: int | None = None
    max_output_tokens: int | None = None
    response_json: bool = False


class LLMClient(ABC):
    """Provider-agnostic chat completion interface."""

    @abstractmethod
    def generate(
        self,
        prompt: str,
        *,
        config: GenerationConfig | None = None,
    ) -> LLMResponse:
        ...

    def generate_json(self, prompt: str) -> tuple[dict[str, Any], LLMUsage]:
        import json
        resp = self.generate(
            prompt,
            config=GenerationConfig(temperature=0.2, response_json=True),
        )
        text = resp.text.strip()
        if not text:
            return {}, resp.usage
        return json.loads(text), resp.usage

    def stream_generate(
        self,
        prompt: str,
        *,
        config: GenerationConfig | None = None,
    ) -> Iterator[str]:
        """
        Streaming fallback for providers that do not expose token streaming.
        """
        resp = self.generate(prompt, config=config)
        if resp.text:
            yield resp.text
