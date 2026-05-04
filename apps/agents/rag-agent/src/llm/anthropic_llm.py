"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons
"""

from __future__ import annotations

from typing import Any

from anthropic import Anthropic

from llm.base import GenerationConfig, LLMClient, LLMResponse, LLMUsage


class AnthropicLLMClient(LLMClient):
    def __init__(self, *, api_key: str, model_identifier: str) -> None:
        self._client = Anthropic(api_key=api_key)
        self._model = model_identifier

    @property
    def model_identifier(self) -> str:
        return self._model

    def generate(
        self,
        prompt: str,
        *,
        config: GenerationConfig | None = None,
    ) -> LLMResponse:
        cfg = config or GenerationConfig()
        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": cfg.temperature,
            "max_tokens": cfg.max_output_tokens or 4096,
        }
        if cfg.top_p is not None:
            kwargs["top_p"] = cfg.top_p
        if cfg.top_k is not None:
            kwargs["top_k"] = cfg.top_k

        res = self._client.messages.create(**kwargs)
        text = ""
        for block in res.content:
            if block.type == "text":
                text += block.text
        usage = LLMUsage()
        if res.usage:
            usage.input_tokens = res.usage.input_tokens or 0
            usage.output_tokens = res.usage.output_tokens or 0
        return LLMResponse(text=text.strip(), usage=usage)
