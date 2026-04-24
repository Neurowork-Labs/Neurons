"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _worker_root() -> Path:
    # src/config/settings.py -> worker root
    return Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_worker_root() / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Supabase
    supabase_url: str = Field(alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_documents_storage_bucket: str = Field(alias="SUPABASE_DOCUMENTS_STORAGE_BUCKET")
    supabase_documents_dump_bucket: str = Field(alias="SUPABASE_DOCUMENTS_DUMP_BUCKET")

    # Google / Gemini
    google_llm_api_key: str = Field(alias="GOOGLE_LLM_API_KEY")
    gemini_embedding_model: str = Field(default="gemini-embedding-001", alias="GEMINI_EMBEDDING_MODEL")
    embedding_output_dimensionality: int = Field(default=1536, alias="EMBEDDING_OUTPUT_DIMENSIONALITY")

    # Worker tuning
    poll_interval_seconds: float = Field(default=2.0, alias="POLL_INTERVAL_SECONDS")
    empty_poll_backoff_seconds: float = Field(default=5.0, alias="EMPTY_POLL_BACKOFF_SECONDS")
    max_jobs_per_poll: int = Field(default=10, alias="MAX_JOBS_PER_POLL")
    lease_seconds: int = Field(default=10 * 60, alias="LEASE_SECONDS")
    job_retry_backoff_seconds: int = Field(default=60, alias="JOB_RETRY_BACKOFF_SECONDS")

    # Chunking
    chunk_max_chars: int = Field(default=3500, alias="CHUNK_MAX_CHARS")
    chunk_overlap_chars: int = Field(default=350, alias="CHUNK_OVERLAP_CHARS")
    max_chunks_per_document: int = Field(default=500, alias="MAX_CHUNKS_PER_DOCUMENT")


def get_settings() -> Settings:
    # Ensure .env is loaded for local runs even if pydantic env_file is not used by tooling.
    load_dotenv(dotenv_path=_worker_root() / ".env", override=False)
    return Settings()

