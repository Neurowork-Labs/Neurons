"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

import socket
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import logging
from supabase.client import Client


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _worker_id() -> str:
    # Good enough unique-ish identifier for logs + locked_by.
    return socket.gethostname()


@dataclass(frozen=True)
class DocumentProcessingJob:
    id: str
    organization_id: str
    project_id: str
    document_id: str
    status: str
    job_type: str
    priority: int
    payload: dict[str, Any] | None
    attempt_count: int
    max_attempts: int
    run_after: Optional[str]


def list_queued_jobs(
    supabase: Client,
    *,
    limit: int,
) -> list[DocumentProcessingJob]:
    log = logging.getLogger("embedding-worker.queue")
    # We intentionally over-fetch and then "claim" via conditional update to avoid duplicate claims.
    # PostgREST doesn't expose SKIP LOCKED; this is optimistic locking.
    now_iso = _utcnow().isoformat()
    res = (
        supabase.table("document_processing_jobs")
        .select(
            "id,organization_id,project_id,document_id,status,job_type,priority,payload,attempt_count,max_attempts,run_after"
        )
        .eq("status", "queued")
        .lte("run_after", now_iso)
        .order("priority", desc=True)
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    rows = res.data or []
    log.debug("list_queued_jobs rows=%s", len(rows))
    jobs: list[DocumentProcessingJob] = []
    for r in rows:
        jobs.append(
            DocumentProcessingJob(
                id=str(r["id"]),
                organization_id=str(r["organization_id"]),
                project_id=str(r["project_id"]),
                document_id=str(r["document_id"]),
                status=str(r.get("status") or ""),
                job_type=str(r.get("job_type") or ""),
                priority=int(r.get("priority") or 0),
                payload=r.get("payload"),
                attempt_count=int(r.get("attempt_count") or 0),
                max_attempts=int(r.get("max_attempts") or 0),
                run_after=r.get("run_after"),
            )
        )
    return jobs


def requeue_retryable_failed_jobs(
    supabase: Client,
    *,
    limit: int = 200,
) -> int:
    """
    Move failed jobs back to queued when their retry time is reached.
    This keeps the claim path simple: worker only claims queued jobs.
    """
    log = logging.getLogger("embedding-worker.queue")
    now_iso = _utcnow().isoformat()

    # Fetch candidate failed jobs that are eligible for retry.
    res = (
        supabase.table("document_processing_jobs")
        .select("id,attempt_count,max_attempts,run_after")
        .eq("status", "failed")
        .not_.is_("run_after", "null")
        .lte("run_after", now_iso)
        .order("run_after", desc=False)
        .limit(limit)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return 0

    requeued = 0
    for r in rows:
        attempt_count = int(r.get("attempt_count") or 0)
        max_attempts = int(r.get("max_attempts") or 0)
        if max_attempts <= 0 or attempt_count >= max_attempts:
            continue
        jid = str(r["id"])
        upd = (
            supabase.table("document_processing_jobs")
            .update({"status": "queued", "lease_expires_at": None, "locked_at": None, "locked_by": None})
            .eq("id", jid)
            .eq("status", "failed")
            .execute()
        )
        if upd.data:
            requeued += 1

    if requeued:
        log.info("requeued_failed_jobs count=%s", requeued)
    return requeued


def reap_expired_processing_leases(
    supabase: Client,
    *,
    backoff_seconds: int,
    limit: int = 200,
) -> int:
    """
    Reclaim jobs stuck in `processing` after lease expiry.

    If a worker crashes mid-job, the job can remain `processing` forever.
    This function:
    - increments attempt_count
    - sets status to `failed` if max_attempts reached
    - otherwise re-queues the job with run_after = now() + backoff
    """
    log = logging.getLogger("embedding-worker.queue")
    now = _utcnow()
    now_iso = now.isoformat()

    res = (
        supabase.table("document_processing_jobs")
        .select("id,attempt_count,max_attempts")
        .eq("status", "processing")
        .not_.is_("lease_expires_at", "null")
        .lte("lease_expires_at", now_iso)
        .order("lease_expires_at", desc=False)
        .limit(limit)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return 0

    reclaimed = 0
    for r in rows:
        jid = str(r["id"])
        attempt_count = int(r.get("attempt_count") or 0)
        max_attempts = int(r.get("max_attempts") or 0)
        next_attempt = attempt_count + 1
        terminal = max_attempts > 0 and next_attempt >= max_attempts

        update = {
            "attempt_count": next_attempt,
            "last_error": "Lease expired while processing (worker crash/timeout).",
            "lease_expires_at": None,
            "locked_at": None,
            "locked_by": None,
        }

        if terminal:
            update.update(
                {
                    "status": "failed",
                    "run_after": None,
                    "completed_at": now_iso,
                }
            )
        else:
            update.update(
                {
                    "status": "queued",
                    "run_after": (now + timedelta(seconds=int(backoff_seconds))).isoformat(),
                }
            )

        upd = supabase.table("document_processing_jobs").update(update).eq("id", jid).eq("status", "processing").execute()
        if upd.data:
            reclaimed += 1

    if reclaimed:
        log.warning("reaped_expired_leases count=%s", reclaimed)
    return reclaimed


def try_claim_job(
    supabase: Client,
    *,
    job_id: str,
    lease_seconds: int,
    worker_id: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    log = logging.getLogger("embedding-worker.queue")
    wid = worker_id or _worker_id()
    now = _utcnow()
    lease_expires_at = now + timedelta(seconds=int(lease_seconds))

    # Conditional update: only claim if still queued.
    # NOTE: supabase-py (postgrest-py) does not support `.select()` chained after `.update()`
    # in some versions. `.update(...).execute()` already returns the updated rows
    # (representation) by default for supabase-py v2.x.
    res = (
        supabase.table("document_processing_jobs")
        .update(
            {
                "status": "processing",
                "locked_at": now.isoformat(),
                "locked_by": wid,
                "lease_expires_at": lease_expires_at.isoformat(),
                "started_at": now.isoformat(),
            }
        )
        .eq("id", job_id)
        .eq("status", "queued")
        .execute()
    )
    rows = res.data or []
    if rows:
        log.info("claimed job_id=%s locked_by=%s lease_expires_at=%s", job_id, wid, lease_expires_at.isoformat())
    return rows[0] if rows else None


def complete_job(
    supabase: Client,
    *,
    job_id: str,
) -> None:
    log = logging.getLogger("embedding-worker.queue")
    now = _utcnow().isoformat()
    supabase.table("document_processing_jobs").update(
        {
            "status": "completed",
            "completed_at": now,
            "lease_expires_at": None,
        }
    ).eq("id", job_id).execute()
    log.info("completed job_id=%s", job_id)


def fail_job(
    supabase: Client,
    *,
    job_id: str,
    error: str,
    attempt_count: int,
    max_attempts: int,
    backoff_seconds: int = 60,
) -> None:
    log = logging.getLogger("embedding-worker.queue")
    now = _utcnow()
    next_run = now + timedelta(seconds=int(backoff_seconds))
    next_attempt = attempt_count + 1
    terminal = next_attempt >= max_attempts

    supabase.table("document_processing_jobs").update(
        {
            # Keep failed status for visibility; a separate requeue pass moves retryable jobs to queued.
            "status": "failed",
            "attempt_count": next_attempt,
            "last_error": error[:4000],
            "run_after": None if terminal else next_run.isoformat(),
            "lease_expires_at": None,
            "completed_at": now.isoformat() if terminal else None,
        }
    ).eq("id", job_id).execute()
    log.warning(
        "failed job_id=%s terminal=%s attempt=%s/%s retry_at=%s",
        job_id,
        terminal,
        next_attempt,
        max_attempts,
        None if terminal else next_run.isoformat(),
    )

