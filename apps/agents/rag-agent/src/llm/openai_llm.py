"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

from typing import Any

from openai import OpenAI

from llm.base import GenerationConfig, LLMClient, LLMResponse, LLMUsage


class OpenAILLMClient(LLMClient):
    def __init__(self, *, api_key: str, model_identifier: str, base_url: str | None = None) -> None:
        kwargs: dict[str, Any] = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        self._client = OpenAI(**kwargs)
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
        }
        if cfg.top_p is not None:
            kwargs["top_p"] = cfg.top_p
        if cfg.max_output_tokens is not None:
            kwargs["max_tokens"] = cfg.max_output_tokens
        if cfg.response_json:
            kwargs["response_format"] = {"type": "json_object"}

        res = self._client.chat.completions.create(**kwargs)
        text = (res.choices[0].message.content or "") if res.choices else ""
        usage = LLMUsage()
        if res.usage:
            usage.input_tokens = res.usage.prompt_tokens or 0
            usage.output_tokens = res.usage.completion_tokens or 0
        return LLMResponse(text=text.strip(), usage=usage)
