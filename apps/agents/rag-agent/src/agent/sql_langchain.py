"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons

Optional LangChain SQL path (kept separate from custom 3-LLM and LlamaIndex pipelines).
Uses LangChain's SQL Database Chain to convert visitor questions into SELECT queries.
Dialect-aware: supports MySQL now; architecture ready for PostgreSQL.
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

MAX_LANGCHAIN_ATTEMPTS = 2

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
    """Human-readable dialect name for LLM prompts."""
    if dialect in ("postgresql", "postgres"):
        return "PostgreSQL"
    return "MySQL"


def _build_langchain_llm(settings: Settings) -> Any:
    provider = str(settings.langchain_sql_provider or "").strip().lower()
    model = str(settings.langchain_sql_model or "").strip()

    if provider == "google":
        api_key = str(settings.google_llm_api_key or "").strip()
        if not api_key:
            raise ValueError("GOOGLE_LLM_API_KEY is required for LANGCHAIN_SQL_PROVIDER=google.")
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError as e:
            raise ValueError("Missing dependency: langchain-google-genai.") from e
        return ChatGoogleGenerativeAI(model=model, google_api_key=api_key, temperature=0.0)

    if provider == "openai":
        api_key = str(settings.openai_llm_api_key or "").strip()
        if not api_key:
            raise ValueError("OPENAI_LLM_API_KEY is required for LANGCHAIN_SQL_PROVIDER=openai.")
        try:
            from langchain_openai import ChatOpenAI
        except ImportError as e:
            raise ValueError("Missing dependency: langchain-openai.") from e
        return ChatOpenAI(model=model, api_key=api_key, temperature=0.0)

    if provider == "anthropic":
        api_key = str(settings.anthropic_llm_api_key or "").strip()
        if not api_key:
            raise ValueError("ANTHROPIC_LLM_API_KEY is required for LANGCHAIN_SQL_PROVIDER=anthropic.")
        try:
            from langchain_anthropic import ChatAnthropic
        except ImportError as e:
            raise ValueError("Missing dependency: langchain-anthropic.") from e
        return ChatAnthropic(model=model, anthropic_api_key=api_key, temperature=0.0)

    if provider == "openrouter":
        api_key = str(settings.openrouter_llm_api_key or "").strip()
        if not api_key:
            raise ValueError("OPENROUTER_LLM_API_KEY is required for LANGCHAIN_SQL_PROVIDER=openrouter.")
        try:
            from langchain_openai import ChatOpenAI
        except ImportError as e:
            raise ValueError("Missing dependency: langchain-openai.") from e
        return ChatOpenAI(
            model=model,
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            temperature=0.0,
        )

    raise ValueError(
        "Unsupported LANGCHAIN_SQL_PROVIDER. Supported: google, openai, anthropic, openrouter."
    )


def _extract_sql_from_text(text: str) -> str:
    text = text.strip()
    fence = re.search(r"```(?:sql)?\s*\n?(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if fence:
        text = fence.group(1).strip()
    m = re.search(r"(?is)\bSELECT\b.+", text)
    if m:
        return m.group(0).strip().rstrip(";")
    return ""


def _langchain_generate_sql(
    settings: Settings,
    *,
    user_message: str,
    schema_detail: str,
    allow: set[str],
    connection_uri: str,
    dialect: str = "mysql",
    previous_sql: str | None = None,
    previous_error: str | None = None,
) -> str:
    try:
        from sqlalchemy import create_engine
        from langchain_community.utilities import SQLDatabase
        from langchain.chains import create_sql_query_chain
    except ImportError as e:
        raise ValueError(
            "LangChain SQL dependencies are not installed. "
            "Install langchain + langchain-community + sqlalchemy."
        ) from e

    label = _dialect_label(dialect)
    llm = _build_langchain_llm(settings)
    engine = create_engine(connection_uri)
    db = SQLDatabase(engine=engine, include_tables=sorted(allow))

    chain = create_sql_query_chain(llm, db)

    if previous_sql and previous_error:
        prompt = (
            f"Given the following {label} database schema:\n{schema_detail}\n\n"
            f"Use ONLY these tables: {', '.join(sorted(allow))}\n\n"
            f"Previous SQL attempt:\n{previous_sql}\n\n"
            f"Problem with that attempt:\n{previous_error}\n\n"
            f"Generate a corrected single {label} SELECT query for:\n{user_message}"
        )
    else:
        prompt = (
            f"Given the following {label} database schema:\n{schema_detail}\n\n"
            f"Use ONLY these tables: {', '.join(sorted(allow))}\n\n"
            f"Generate a single {label} SELECT query for:\n{user_message}"
        )

    result = chain.invoke({"question": prompt})
    raw = str(result or "").strip()
    return _extract_sql_from_text(raw)


def run_langchain_live_sql(
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
    LangChain SQL pipeline for live databases (dialect-aware).
    Returns (db_answer, sql_used, usage).
    """
    if dialect not in _SUPPORTED_DIALECTS:
        raise ValueError(
            f"LangChain SQL pipeline does not yet support dialect '{dialect}'. "
            f"Supported: {', '.join(sorted(_SUPPORTED_DIALECTS))}."
        )

    from agent.mysql_runner import run_select_mysql

    db_answer = ""
    sql_used = ""
    prev_error: str | None = None
    prev_sql: str | None = None
    usage = LLMUsage()

    user = str(live_ctx.get("username") or "")
    password = str(live_ctx.get("password") or "")
    host = str(live_ctx.get("host") or "")
    port = int(live_ctx.get("port") or 3306)
    connection_uri = _build_connection_uri(dialect, user, password, host, port, db_label)

    for attempt in range(MAX_LANGCHAIN_ATTEMPTS):
        sql_used_new = _langchain_generate_sql(
            settings,
            user_message=user_message,
            schema_detail=schema_detail,
            allow=allow,
            connection_uri=connection_uri,
            dialect=dialect,
            previous_sql=prev_sql,
            previous_error=prev_error,
        )
        if not sql_used_new:
            logger.warning("DB pipeline source=langchain dialect=%s generated empty SQL attempt=%d", dialect, attempt)
            break
        sql_used = sql_used_new
        logger.info("DB pipeline source=langchain dialect=%s generated_sql=%s attempt=%d", dialect, sql_used, attempt)

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
            logger.warning("DB pipeline source=langchain dialect=%s exec_error=%s attempt=%d", dialect, e, attempt)
            db_answer = f"[SQL error: {e}]"

        verdict, _ = verify_sql_result(
            settings,
            user_message=user_message,
            schema_detail=schema_detail,
            sql=sql_used,
            query_result=db_answer,
        )
        logger.info(
            "DB pipeline source=langchain dialect=%s verifier attempt=%d verdict=%s reason=%s",
            dialect, attempt, verdict.get("verdict"), verdict.get("reason"),
        )

        if verdict.get("verdict") == "pass":
            break

        prev_sql = sql_used
        prev_error = verdict.get("feedback") or verdict.get("reason") or db_answer

    return db_answer, sql_used, usage
