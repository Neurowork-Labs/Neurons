"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

from typing import Any

from supabase.client import Client


def insert_embedding_usage_event(
    supabase: Client,
    *,
    organization_id: str,
    project_id: str,
    document_id: str,
    job_id: str,
    worker_model_id: str,
    tokens_input: int,
    cost_usd: float = 0.0,
    metadata: dict[str, Any] | None = None,
) -> None:
    supabase.table("embedding_usage_events").insert(
        {
            "organization_id": organization_id,
            "project_id": project_id,
            "document_id": document_id,
            "job_id": job_id,
            "worker_model_id": worker_model_id,
            "tokens_input": int(tokens_input),
            "cost_usd": float(cost_usd),
            "metadata": metadata,
        }
    ).execute()

