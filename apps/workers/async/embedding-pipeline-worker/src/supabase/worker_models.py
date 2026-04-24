"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from supabase.client import Client


@dataclass(frozen=True)
class WorkerModel:
    id: str
    model_identifier: str
    input_cost_per_1m_tokens: float | None
    is_active: bool


_CACHE: dict[str, WorkerModel] = {}


def get_worker_model_by_identifier(
    supabase: Client,
    *,
    model_identifier: str,
) -> WorkerModel:
    cached = _CACHE.get(model_identifier)
    if cached:
        return cached
    res = (
        supabase.table("worker_models")
        .select("id,model_identifier,input_cost_per_1m_tokens,is_active")
        .eq("model_identifier", model_identifier)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise ValueError(f"worker_models not found for model_identifier={model_identifier!r}")

    row = res.data
    model = WorkerModel(
        id=str(row["id"]),
        model_identifier=str(row["model_identifier"]),
        input_cost_per_1m_tokens=(
            float(row["input_cost_per_1m_tokens"]) if row.get("input_cost_per_1m_tokens") is not None else None
        ),
        is_active=bool(row.get("is_active", True)),
    )
    _CACHE[model_identifier] = model
    return model

