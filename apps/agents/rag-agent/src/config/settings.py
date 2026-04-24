"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _rag_root() -> Path:
    return Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_rag_root().parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: str = Field(alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(alias="SUPABASE_SERVICE_ROLE_KEY")

    google_llm_api_key: str = Field(default="", alias="GOOGLE_LLM_API_KEY")
    openai_llm_api_key: str = Field(default="", alias="OPENAI_LLM_API_KEY")
    anthropic_llm_api_key: str = Field(default="", alias="ANTHROPIC_LLM_API_KEY")
    openrouter_llm_api_key: str = Field(default="", alias="OPENROUTER_LLM_API_KEY")

    gemini_embedding_model: str = Field(default="gemini-embedding-001", alias="GEMINI_EMBEDDING_MODEL")
    embedding_output_dimensionality: int = Field(default=1536, alias="EMBEDDING_OUTPUT_DIMENSIONALITY")

    fallback_chat_model: str = Field(default="gemini-2.0-flash", alias="GEMINI_CHAT_MODEL")
    fallback_provider: str = Field(default="google", alias="FALLBACK_LLM_PROVIDER")

    sql_gen_model: str = Field(default="gemini-2.0-flash", alias="SQL_GEN_MODEL")
    sql_gen_provider: str = Field(default="google", alias="SQL_GEN_PROVIDER")

    sql_verifier_model: str = Field(default="gemini-2.0-flash", alias="SQL_VERIFIER_MODEL")
    sql_verifier_provider: str = Field(default="google", alias="SQL_VERIFIER_PROVIDER")

    use_langchain_sql: bool = Field(default=True, alias="USE_LANGCHAIN_SQL")
    langchain_sql_provider: str = Field(default="google", alias="LANGCHAIN_SQL_PROVIDER")
    langchain_sql_model: str = Field(default="gemini-3-pro-preview", alias="LANGCHAIN_SQL_MODEL")

    use_llamaindex_sql: bool = Field(default=False, alias="USE_LLAMAINDEX_SQL")
    llamaindex_sql_provider: str = Field(default="google", alias="LLAMAINDEX_SQL_PROVIDER")
    llamaindex_sql_model: str = Field(default="gemini-2.0-flash", alias="LLAMAINDEX_SQL_MODEL")

    internal_secret: str = Field(default="", alias="RAG_AGENT_INTERNAL_SECRET")
    cors_origins: str = Field(default="", alias="RAG_AGENT_CORS_ORIGINS")

    match_chunk_limit: int = Field(default=8, alias="RAG_MATCH_CHUNK_LIMIT")


def get_settings() -> Settings:
    load_dotenv(dotenv_path=_rag_root().parent / ".env", override=False)
    return Settings()
