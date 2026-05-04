"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons
"""

from __future__ import annotations

from typing import Iterable, List

import numpy as np
from google import genai
from google.genai import types


def _normalize(vec: list[float]) -> list[float]:
    a = np.asarray(vec, dtype=np.float32)
    n = np.linalg.norm(a)
    if not np.isfinite(n) or n <= 0:
        return vec
    a = a / n
    return a.astype(np.float32).tolist()


class GeminiEmbedder:
    def __init__(self, *, api_key: str, model: str, output_dimensionality: int):
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._dim = int(output_dimensionality)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        res = self._client.models.embed_content(
            model=self._model,
            contents=texts,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=self._dim,
            ),
        )
        vectors = [e.values for e in res.embeddings]
        # For 768/1536, docs recommend normalizing.
        return [_normalize(v) for v in vectors]

