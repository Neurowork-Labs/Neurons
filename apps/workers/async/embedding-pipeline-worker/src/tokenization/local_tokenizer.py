"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons
"""

from __future__ import annotations

from __future__ import annotations

from functools import lru_cache
from typing import List

from google import genai
from tenacity import retry, stop_after_attempt, wait_exponential


@lru_cache(maxsize=8)
def _get_client(api_key: str) -> genai.Client:
    # Reuse client across calls; token counting needs the exact embedding tokenizer.
    return genai.Client(api_key=api_key)


@retry(wait=wait_exponential(multiplier=0.5, min=1, max=20), stop=stop_after_attempt(5))
def _count_one(*, api_key: str, model_name: str, text: str) -> int:
    client = _get_client(api_key)
    result = client.models.count_tokens(model=model_name, contents=text)
    if result.total_tokens is None:
        # Defensive: should not happen.
        raise RuntimeError("count_tokens returned no total_tokens")
    return int(result.total_tokens)


def count_tokens_for_texts(*, api_key: str, model_name: str, texts: List[str]) -> List[int]:
    # Exact tokenizer approach:
    # Google provides `models.count_tokens()` for the embedding model, but it only returns
    # `total_tokens` per request. So we count per chunk to get per-chunk token_count exactly.
    return [_count_one(api_key=api_key, model_name=model_name, text=t) for t in texts]

