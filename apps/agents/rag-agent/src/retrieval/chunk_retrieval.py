"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

from typing import Any

from supabase import Client


def vector_literal(vec: list[float]) -> str:
    return "[" + ",".join(str(float(x)) for x in vec) + "]"


def retrieve_similar_chunks(
    supabase: Client,
    *,
    query_embedding: list[float],
    project_agent_id: str,
    limit: int,
) -> list[dict[str, Any]]:
    payload = {
        "query_embedding": vector_literal(query_embedding),
        "p_project_agent_id": project_agent_id,
        "match_count": limit,
    }
    try:
        res = supabase.rpc("match_document_chunks", payload).execute()
        return list(res.data or [])
    except Exception:
        payload["query_embedding"] = query_embedding
        res = supabase.rpc("match_document_chunks", payload).execute()
        return list(res.data or [])
