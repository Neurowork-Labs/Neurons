"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons

Optional LlamaIndex SQL path (kept separate from custom 3-LLM SQL orchestration).
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from urllib.parse import quote_plus

from agent.sql_verifier import verify_sql_result
from config.settings import Settings
from llm.base import LLMUsage

logger = logging.getLogger(__name__)

MAX_LLAMAINDEX_ATTEMPTS = 2

_SUPPORTED_DIALECTS = frozenset({"mysql"})

_SQLALCHEMY_DRIVERS: dict[str, str] = {
    "mysql": "mysql+pymysql",
    "postgresql": "postgresql+psycopg2",
    "postgres": "postgresql+psycopg2",
}


def _build_connection_uri(
    dialect: str, user: str, password: str, host: str, port: int, database: str,
) -> str:
    driver = _SQLALCHEMY_DRIVERS.get(dialect, _SQLALCHEMY_DRIVERS["mysql"])
    return f"{driver}://{quote_plus(user)}:{quote_plus(password)}@{host}:{port}/{database}"


def _dialect_label(dialect: str) -> str:
    if dialect in ("postgresql", "postgres"):
        return "PostgreSQL"
    return "MySQL"


def _extract_sql_from_llamaindex_response(resp: Any) -> str:
    metadata = getattr(resp, "metadata", None)
    if isinstance(metadata, dict):
        for key in ("sql_query", "sql", "query"):
            val = metadata.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip().rstrip(";")

    text = str(getattr(resp, "response", resp) or "").strip()
    # Last-resort extraction from plain response text.
    m = re.search(r"(?is)\bselect\b.+", text)
    if m:
        return m.group(0).strip().rstrip(";")
    return ""


def _llamaindex_generate_sql(
    settings: Settings,
    *,
    user_message: str,
    schema_detail: str,
    allow: set[str],
    connection_uri: str,
    dialect: str = "mysql",
) -> str:
    provider = str(settings.llamaindex_sql_provider or "").strip().lower()
    label = _dialect_label(dialect)

    try:
        from sqlalchemy import create_engine
        from llama_index.core import SQLDatabase, Settings as LlamaSettings
        from llama_index.core.query_engine import NLSQLTableQueryEngine
    except Exception as e:  # pragma: no cover - import failure is runtime/env-specific
        raise ValueError(
            "LlamaIndex dependencies are not installed. "
            "Install llama-index + sqlalchemy packages."
        ) from e

    try:
        from llama_index.core.embeddings import MockEmbedding
        LlamaSettings.embed_model = MockEmbedding(embed_dim=8)
    except ImportError:
        LlamaSettings.embed_model = None  # type: ignore[assignment]

    llm: Any
    if provider == "openai":
        api_key = str(settings.openai_llm_api_key or "").strip()
        if not api_key:
            raise ValueError("OPENAI_LLM_API_KEY is required for LLAMAINDEX_SQL_PROVIDER=openai.")
        try:
            from llama_index.llms.openai import OpenAI
        except Exception as e:  # pragma: no cover
            raise ValueError("Missing dependency: llama-index-llms-openai.") from e
        llm = OpenAI(model=settings.llamaindex_sql_model, api_key=api_key, temperature=0.0)
    elif provider == "google":
        api_key = str(settings.google_llm_api_key or "").strip()
        if not api_key:
            raise ValueError("GOOGLE_LLM_API_KEY is required for LLAMAINDEX_SQL_PROVIDER=google.")
        try:
            from llama_index.llms.google_genai import GoogleGenAI
        except Exception as e:  # pragma: no cover
            raise ValueError("Missing dependency: llama-index-llms-google-genai.") from e
        llm = GoogleGenAI(model=settings.llamaindex_sql_model, api_key=api_key, temperature=0.0)
    elif provider == "anthropic":
        api_key = str(settings.anthropic_llm_api_key or "").strip()
        if not api_key:
            raise ValueError("ANTHROPIC_LLM_API_KEY is required for LLAMAINDEX_SQL_PROVIDER=anthropic.")
        try:
            from llama_index.llms.anthropic import Anthropic
        except Exception as e:  # pragma: no cover
            raise ValueError("Missing dependency: llama-index-llms-anthropic.") from e
        llm = Anthropic(model=settings.llamaindex_sql_model, api_key=api_key, temperature=0.0)
    elif provider == "openrouter":
        api_key = str(settings.openrouter_llm_api_key or "").strip()
        if not api_key:
            raise ValueError("OPENROUTER_LLM_API_KEY is required for LLAMAINDEX_SQL_PROVIDER=openrouter.")
        try:
            from llama_index.llms.openai_like import OpenAILike
        except Exception as e:  # pragma: no cover
            raise ValueError("Missing dependency: llama-index-llms-openai-like.") from e
        llm = OpenAILike(
            model=settings.llamaindex_sql_model,
            api_key=api_key,
            api_base="https://openrouter.ai/api/v1",
            is_chat_model=True,
            temperature=0.0,
        )
    else:
        raise ValueError(
            "Unsupported LLAMAINDEX_SQL_PROVIDER. Supported: google, openai, anthropic, openrouter."
        )

    engine = create_engine(connection_uri)
    sql_db = SQLDatabase(engine=engine, include_tables=sorted(allow))

    query_engine = NLSQLTableQueryEngine(
        sql_database=sql_db,
        tables=sorted(allow),
        llm=llm,
        synthesize_response=False,
    )

    prompt = f"""Generate exactly one {label} SELECT query.
Use ONLY tables from this allow-list: {", ".join(sorted(allow))}
Schema details:
{schema_detail}

Visitor question:
{user_message}
"""
    resp = query_engine.query(prompt)
    return _extract_sql_from_llamaindex_response(resp)


def run_llamaindex_live_sql(
    settings: Settings,
    *,
    user_message: str,
    schema_detail: str,
    db_label: str,
    live_ctx: dict[str, Any],
    allow: set[str],
    dialect: str = "mysql",
) -> tuple[str, str, LLMUsage]:
    """
    LlamaIndex SQL pipeline for live databases (dialect-aware).
    Returns (db_answer, sql_used, usage).
    Usage is currently zero-filled since provider usage extraction differs by backend.
    """
    if dialect not in _SUPPORTED_DIALECTS:
        raise ValueError(
            f"LlamaIndex SQL pipeline does not yet support dialect '{dialect}'. "
            f"Supported: {', '.join(sorted(_SUPPORTED_DIALECTS))}."
        )

    from agent.mysql_runner import run_select_mysql

    db_answer = ""
    sql_used = ""
    prev_error: str | None = None
    usage = LLMUsage()

    user = str(live_ctx.get("username") or "")
    password = str(live_ctx.get("password") or "")
    host = str(live_ctx.get("host") or "")
    port = int(live_ctx.get("port") or 3306)
    connection_uri = _build_connection_uri(dialect, user, password, host, port, db_label)

    for attempt in range(MAX_LLAMAINDEX_ATTEMPTS):
        sql_used = _llamaindex_generate_sql(
            settings,
            user_message=user_message,
            schema_detail=schema_detail,
            allow=allow,
            connection_uri=connection_uri,
            dialect=dialect,
        )
        if not sql_used:
            logger.warning("DB pipeline source=llamaindex dialect=%s generated empty SQL attempt=%d", dialect, attempt)
            break
        logger.info("DB pipeline source=llamaindex dialect=%s generated_sql=%s attempt=%d", dialect, sql_used, attempt)

        try:
            cols, rows = run_select_mysql(
                host=host,
                port=port,
                user=user,
                password=password,
                database=db_label,
                sql=sql_used,
                allowed_tables=allow,
                ssl_mode=str(live_ctx.get("ssl_mode") or "required"),
                ssl_ca_pem=str(live_ctx.get("ssl_ca_pem") or ""),
                max_rows=200,
            )
            if rows:
                db_answer = json.dumps(
                    {"columns": cols, "rows": rows},
                    ensure_ascii=False,
                    default=str,
                )
            else:
                db_answer = "[Query returned 0 rows]"
        except ValueError as e:
            logger.warning("DB pipeline source=llamaindex dialect=%s exec_error=%s attempt=%d", dialect, e, attempt)
            db_answer = f"[SQL error: {e}]"

        verdict, _ = verify_sql_result(
            settings,
            user_message=user_message,
            schema_detail=schema_detail,
            sql=sql_used,
            query_result=db_answer,
        )
        if verdict.get("verdict") == "pass":
            break

        prev_error = verdict.get("feedback") or verdict.get("reason") or db_answer
        if prev_error:
            user_message = f"{user_message}\n\nPrevious issue: {prev_error}"

    return db_answer, sql_used, usage

