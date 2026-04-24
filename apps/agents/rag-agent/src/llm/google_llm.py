"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

from typing import Any
from typing import Iterator

from google import genai
from google.genai import types

from llm.base import GenerationConfig, LLMClient, LLMResponse, LLMUsage


class GoogleLLMClient(LLMClient):
    def __init__(self, *, api_key: str, model_identifier: str) -> None:
        self._client = genai.Client(api_key=api_key)
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
        kwargs: dict[str, Any] = {"temperature": cfg.temperature}
        if cfg.top_p is not None:
            kwargs["top_p"] = cfg.top_p
        if cfg.top_k is not None:
            kwargs["top_k"] = cfg.top_k
        if cfg.max_output_tokens is not None:
            kwargs["max_output_tokens"] = cfg.max_output_tokens
        if cfg.response_json:
            kwargs["response_mime_type"] = "application/json"

        res = self._client.models.generate_content(
            model=self._model,
            contents=prompt,
            config=types.GenerateContentConfig(**kwargs),
        )
        usage = LLMUsage()
        meta = getattr(res, "usage_metadata", None)
        if meta:
            usage.input_tokens = getattr(meta, "prompt_token_count", 0) or 0
            usage.output_tokens = getattr(meta, "candidates_token_count", 0) or 0
        return LLMResponse(text=(res.text or "").strip(), usage=usage)

    def stream_generate(
        self,
        prompt: str,
        *,
        config: GenerationConfig | None = None,
    ) -> Iterator[str]:
        cfg = config or GenerationConfig()
        kwargs: dict[str, Any] = {"temperature": cfg.temperature}
        if cfg.top_p is not None:
            kwargs["top_p"] = cfg.top_p
        if cfg.top_k is not None:
            kwargs["top_k"] = cfg.top_k
        if cfg.max_output_tokens is not None:
            kwargs["max_output_tokens"] = cfg.max_output_tokens
        if cfg.response_json:
            kwargs["response_mime_type"] = "application/json"

        stream = self._client.models.generate_content_stream(
            model=self._model,
            contents=prompt,
            config=types.GenerateContentConfig(**kwargs),
        )
        for chunk in stream:
            text = getattr(chunk, "text", None)
            if text:
                yield text
