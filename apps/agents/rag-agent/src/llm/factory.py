"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons

Builds the correct LLMClient for a given provider name.
API key env var convention: {PROVIDER_NAME_UPPERCASE}_LLM_API_KEY
"""

from __future__ import annotations

import logging
import os

from llm.base import LLMClient

logger = logging.getLogger(__name__)

_PROVIDER_ALIASES: dict[str, str] = {
    "google": "google",
    "openai": "openai",
    "anthropic": "anthropic",
    "openrouter": "openrouter",
}


def _resolve_api_key(provider_name: str) -> str:
    env_key = f"{provider_name.upper()}_LLM_API_KEY"
    value = (os.environ.get(env_key) or "").strip()
    if not value:
        raise ValueError(
            f"API key not configured for provider '{provider_name}'. "
            f"Set {env_key} in the RAG agent .env file."
        )
    return value


def build_llm_client(
    provider_name: str,
    model_identifier: str,
) -> LLMClient:
    key = provider_name.strip().lower()
    resolved = _PROVIDER_ALIASES.get(key)
    if resolved is None:
        raise ValueError(
            f"Unsupported LLM provider: '{provider_name}'. "
            f"Supported: {', '.join(sorted(_PROVIDER_ALIASES.keys()))}"
        )

    api_key = _resolve_api_key(resolved)

    if resolved == "google":
        from llm.google_llm import GoogleLLMClient
        return GoogleLLMClient(api_key=api_key, model_identifier=model_identifier)

    if resolved == "openai":
        from llm.openai_llm import OpenAILLMClient
        return OpenAILLMClient(api_key=api_key, model_identifier=model_identifier)

    if resolved == "anthropic":
        from llm.anthropic_llm import AnthropicLLMClient
        return AnthropicLLMClient(api_key=api_key, model_identifier=model_identifier)

    if resolved == "openrouter":
        from llm.openrouter_llm import OpenRouterLLMClient
        return OpenRouterLLMClient(api_key=api_key, model_identifier=model_identifier)

    raise ValueError(f"Unsupported LLM provider: '{provider_name}'")
