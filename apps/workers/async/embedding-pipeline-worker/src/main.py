"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons
"""

from __future__ import annotations

import time
import traceback

import sys
import logging
from pathlib import Path

# Ensure imports like `from src.queue.jobs ...` work when running `python src/main.py`.
# When executed as a script, Python sets sys.path[0] to `.../worker/src`, so we must add the worker root
# (the parent of `src/`) for the top-level `src` package to be importable.
WORKER_ROOT = Path(__file__).resolve().parents[1]
if str(WORKER_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKER_ROOT))

from config.settings import get_settings
from embeddings.gemini import GeminiEmbedder
from extractors.dispatcher import extract_text
from src.queue.jobs import (
    complete_job,
    fail_job,
    list_queued_jobs,
    reap_expired_processing_leases,
    requeue_retryable_failed_jobs,
    try_claim_job,
)
from storage.download import download_document_bytes
from src.supabase.client import get_supabase_client
from src.supabase.documents import (
    clear_document_chunks,
    fetch_document,
    insert_document_chunks,
    mark_document_failed,
    mark_document_processing,
    mark_document_ready,
)
from src.supabase.embedding_usage import insert_embedding_usage_event
from src.supabase.worker_models import get_worker_model_by_identifier
from chunking.simple import chunk_text
from utils.logging import setup_logging
from tokenization.local_tokenizer import count_tokens_for_texts


def _handle_job_failure_safely(
    *,
    log: logging.Logger,
    supabase,
    job_id: str,
    document_id: str,
    claimed: dict,
    err: str,
    traceback_text: str,
    retry_backoff_seconds: int,
) -> None:
    """
    Best-effort failure bookkeeping.
    Any exception here must never crash the worker loop.
    """
    try:
        mark_document_failed(supabase, document_id=document_id, error=f"{err}\n{traceback_text}")
    except Exception:
        log.exception(
            "job_failure_bookkeeping_error step=mark_document_failed job_id=%s document_id=%s",
            job_id,
            document_id,
        )

    try:
        fail_job(
            supabase,
            job_id=job_id,
            error=err,
            attempt_count=int(claimed.get("attempt_count") or 0),
            max_attempts=int(claimed.get("max_attempts") or 5),
            backoff_seconds=retry_backoff_seconds,
        )
    except Exception:
        log.exception("job_failure_bookkeeping_error step=fail_job job_id=%s", job_id)


def main() -> int:
    setup_logging()
    log = logging.getLogger("embedding-worker")

    settings = get_settings()
    supabase = get_supabase_client(settings)
    embedder = GeminiEmbedder(
        api_key=settings.google_llm_api_key,
        model=settings.gemini_embedding_model,
        output_dimensionality=settings.embedding_output_dimensionality,
    )

    log.info(
        "worker_start model=%s dim=%s poll=%ss lease=%ss",
        settings.gemini_embedding_model,
        settings.embedding_output_dimensionality,
        settings.poll_interval_seconds,
        settings.lease_seconds,
    )

    while True:
        try:
            reaped = reap_expired_processing_leases(
                supabase,
                backoff_seconds=settings.job_retry_backoff_seconds,
                limit=settings.max_jobs_per_poll * 5,
            )
            if reaped:
                log.warning("lease_reap_done count=%s", reaped)

            requeued = requeue_retryable_failed_jobs(supabase, limit=settings.max_jobs_per_poll * 5)
            if requeued:
                log.info("retry_requeue_done count=%s", requeued)

            log.debug("poll_start")
            jobs = list_queued_jobs(supabase, limit=settings.max_jobs_per_poll)
        except Exception as e:
            # Never let poll/list failures crash the process.
            log.exception("poll_error error=%s", e)
            time.sleep(settings.empty_poll_backoff_seconds)
            continue

        if not jobs:
            log.debug("poll_empty sleep=%ss", settings.empty_poll_backoff_seconds)
            time.sleep(settings.empty_poll_backoff_seconds)
            continue

        log.info("poll_found count=%s", len(jobs))
        claimed_any = False
        for j in jobs:
            claimed: dict = {}
            try:
                log.info(
                    "job_candidate job_id=%s document_id=%s org_id=%s project_id=%s type=%s attempt=%s/%s",
                    j.id,
                    j.document_id,
                    j.organization_id,
                    j.project_id,
                    j.job_type,
                    j.attempt_count,
                    j.max_attempts,
                )
                claimed = try_claim_job(supabase, job_id=j.id, lease_seconds=settings.lease_seconds)
                if not claimed:
                    log.debug("job_claim_skipped job_id=%s", j.id)
                    continue
                claimed_any = True

                log.info("job_claimed job_id=%s locked_by=%s", j.id, claimed.get("locked_by"))
                doc = fetch_document(supabase, document_id=j.document_id)
                if bool(doc.get("is_deleted")):
                    raise RuntimeError("Document is deleted.")

                mark_document_processing(supabase, document_id=j.document_id)
                log.info(
                    "document_processing_set document_id=%s bucket=%s path=%s file=%s type=%s",
                    j.document_id,
                    doc.get("storage_bucket"),
                    doc.get("storage_path"),
                    doc.get("file_name"),
                    doc.get("file_type"),
                )

                data = download_document_bytes(
                    supabase,
                    bucket=str(doc["storage_bucket"]),
                    path=str(doc["storage_path"]),
                )
                log.info("document_downloaded document_id=%s bytes=%s", j.document_id, len(data))

                text = extract_text(
                    file_name=str(doc.get("file_name") or ""),
                    file_type=str(doc.get("file_type") or ""),
                    data=data,
                )
                if not text.strip():
                    raise RuntimeError("No extractable text found.")
                log.info("text_extracted document_id=%s chars=%s", j.document_id, len(text))

                chunks = chunk_text(
                    text,
                    max_chars=settings.chunk_max_chars,
                    overlap_chars=settings.chunk_overlap_chars,
                    max_chunks=settings.max_chunks_per_document,
                )
                if not chunks:
                    raise RuntimeError("Chunking produced no chunks.")
                log.info("chunking_done document_id=%s chunks=%s", j.document_id, len(chunks))

                # Exact token counting for cost accounting and accurate billing.
                token_counts = count_tokens_for_texts(
                    api_key=settings.google_llm_api_key,
                    model_name=settings.gemini_embedding_model,
                    texts=chunks,
                )
                total_input_tokens = sum(token_counts)
                log.info(
                    "token_counted document_id=%s chunks=%s total_tokens=%s",
                    j.document_id,
                    len(chunks),
                    total_input_tokens,
                )

                # Create embeddings in batches (Gemini API supports lists).
                # Keep batch small to reduce request size.
                batch_size = 32
                vectors: list[list[float]] = []
                for i in range(0, len(chunks), batch_size):
                    log.info(
                        "embedding_batch_start document_id=%s batch=%s/%s batch_size=%s",
                        j.document_id,
                        (i // batch_size) + 1,
                        (len(chunks) + batch_size - 1) // batch_size,
                        len(chunks[i : i + batch_size]),
                    )
                    vectors.extend(embedder.embed_documents(chunks[i : i + batch_size]))

                if len(vectors) != len(chunks):
                    raise RuntimeError("Embedding count mismatch.")
                log.info("embedding_done document_id=%s vectors=%s", j.document_id, len(vectors))

                worker_model = get_worker_model_by_identifier(
                    supabase,
                    model_identifier=settings.gemini_embedding_model,
                )
                if not worker_model.is_active:
                    raise RuntimeError(f"Worker model is inactive: {worker_model.model_identifier}")

                input_cost_per_1m = worker_model.input_cost_per_1m_tokens
                if input_cost_per_1m is None:
                    raise RuntimeError(
                        f"Missing input_cost_per_1m_tokens for worker model: {worker_model.model_identifier}"
                    )
                cost_usd = (float(total_input_tokens) / 1_000_000.0) * float(input_cost_per_1m)

                # Insert embedding usage event for cost/audit.
                insert_embedding_usage_event(
                    supabase,
                    organization_id=j.organization_id,
                    project_id=j.project_id,
                    document_id=j.document_id,
                    job_id=j.id,
                    worker_model_id=worker_model.id,
                    tokens_input=total_input_tokens,
                    cost_usd=cost_usd,
                    metadata={
                        "output_dimensionality": settings.embedding_output_dimensionality,
                        "chunk_count": len(chunks),
                        "embedding_batch_size": batch_size,
                    },
                )
                log.info(
                    "usage_event_inserted document_id=%s job_id=%s tokens=%s cost_usd=%s worker_model_id=%s",
                    j.document_id,
                    j.id,
                    total_input_tokens,
                    round(cost_usd, 6),
                    worker_model.id,
                )

                # Replace existing chunks for idempotency.
                clear_document_chunks(supabase, document_id=j.document_id)
                log.info("chunks_cleared document_id=%s", j.document_id)

                rows = []
                for idx, (content, emb) in enumerate(zip(chunks, vectors)):
                    rows.append(
                        {
                            "chunk_index": idx,
                            "content": content,
                            "token_count": int(token_counts[idx]),
                            "embedding": emb,
                            "metadata": None,
                        }
                    )

                insert_document_chunks(
                    supabase,
                    document_id=j.document_id,
                    project_agent_id=str(doc["project_agent_id"]),
                    chunks=rows,
                )
                log.info("chunks_inserted document_id=%s inserted=%s", j.document_id, len(rows))

                mark_document_ready(supabase, document_id=j.document_id, chunk_count=len(rows))
                complete_job(supabase, job_id=j.id)
                log.info("job_completed job_id=%s document_id=%s", j.id, j.document_id)

            except Exception as e:
                err = f"{type(e).__name__}: {e}"
                tb = traceback.format_exc(limit=10)
                log.exception("job_failed job_id=%s document_id=%s error=%s", j.id, j.document_id, err)
                _handle_job_failure_safely(
                    log=log,
                    supabase=supabase,
                    job_id=j.id,
                    document_id=j.document_id,
                    claimed=claimed,
                    err=err,
                    traceback_text=tb,
                    retry_backoff_seconds=settings.job_retry_backoff_seconds,
                )
                # Keep processing next jobs even after failure.
                continue

        # If we claimed jobs, do a short sleep; otherwise backoff.
        sleep_s = settings.poll_interval_seconds if claimed_any else settings.empty_poll_backoff_seconds
        log.debug("loop_sleep seconds=%s claimed_any=%s", sleep_s, claimed_any)
        time.sleep(sleep_s)


if __name__ == "__main__":
    raise SystemExit(main())