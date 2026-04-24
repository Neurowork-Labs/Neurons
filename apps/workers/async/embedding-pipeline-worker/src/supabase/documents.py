"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import logging
from supabase.client import Client


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_document(supabase: Client, *, document_id: str) -> dict[str, Any]:
    log = logging.getLogger("embedding-worker.db")
    res = (
        supabase.table("documents")
        .select(
            "id,project_agent_id,organization_id,file_name,file_type,file_size_bytes,storage_bucket,storage_path,status,is_deleted"
        )
        .eq("id", document_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise ValueError(f"Document not found: {document_id}")
    log.debug("fetch_document ok document_id=%s", document_id)
    return res.data


def mark_document_processing(supabase: Client, *, document_id: str) -> None:
    log = logging.getLogger("embedding-worker.db")
    supabase.table("documents").update(
        {"status": "processing", "error_message": None}
    ).eq("id", document_id).execute()
    log.info("document_status processing document_id=%s", document_id)


def mark_document_ready(supabase: Client, *, document_id: str, chunk_count: int) -> None:
    log = logging.getLogger("embedding-worker.db")
    supabase.table("documents").update(
        {"status": "ready", "chunk_count": int(chunk_count), "processed_at": _utcnow_iso(), "error_message": None}
    ).eq("id", document_id).execute()
    log.info("document_status ready document_id=%s chunk_count=%s", document_id, int(chunk_count))


def mark_document_failed(supabase: Client, *, document_id: str, error: str) -> None:
    log = logging.getLogger("embedding-worker.db")
    supabase.table("documents").update(
        {"status": "failed", "error_message": error[:4000], "processed_at": _utcnow_iso()}
    ).eq("id", document_id).execute()
    log.warning("document_status failed document_id=%s", document_id)


def clear_document_chunks(supabase: Client, *, document_id: str) -> None:
    log = logging.getLogger("embedding-worker.db")
    # Hard-delete chunks (no soft delete)
    supabase.table("document_chunks").delete().eq("document_id", document_id).execute()
    log.info("document_chunks cleared document_id=%s", document_id)


def insert_document_chunks(
    supabase: Client,
    *,
    document_id: str,
    project_agent_id: str,
    chunks: list[dict[str, Any]],
) -> None:
    log = logging.getLogger("embedding-worker.db")
    # chunks rows should already include: chunk_index, content, token_count, embedding, metadata
    if not chunks:
        return

    rows = []
    for ch in chunks:
        rows.append(
            {
                "document_id": document_id,
                "project_agent_id": project_agent_id,
                "chunk_index": int(ch["chunk_index"]),
                "content": str(ch["content"]),
                "token_count": ch.get("token_count"),
                "embedding": ch["embedding"],
                "metadata": ch.get("metadata"),
            }
        )

    # Insert in one batch; if your docs are huge we can chunk inserts later.
    supabase.table("document_chunks").insert(rows).execute()
    log.info("document_chunks inserted document_id=%s rows=%s", document_id, len(rows))

