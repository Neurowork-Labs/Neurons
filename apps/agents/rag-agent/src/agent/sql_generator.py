"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons

Dedicated SQL generation LLM — system-controlled model that takes the
visitor's plain-text question and the database schema, then produces a
single SELECT query.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from config.settings import Settings
from llm.base import GenerationConfig, LLMClient, LLMUsage
from llm.factory import build_llm_client

logger = logging.getLogger(__name__)

_SYSTEM_INSTRUCTION_MYSQL = """\
You are a specialised SQL generator for MySQL databases.
Your ONLY job is to translate a visitor's natural-language question into a
single, safe SELECT query that answers the question using the schema provided.

RULES:
1. Output MUST be a JSON object: {"sql": "<SELECT …>"}
2. Use ONLY the tables and columns listed in the schema below. Never guess.
   The schema below is sourced from the stored `schema_snapshot` in Neurons;
   table names and column names in SQL MUST match that snapshot exactly.
3. Never emit INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, or any DDL/DML.
4. Always qualify ambiguous column names with the table name.
5. Use backtick quoting for identifiers that are reserved words.
6. Add LIMIT 50 unless the question explicitly asks for all rows or an
   aggregate (COUNT, SUM, AVG …).
7. Prefer LEFT JOIN over INNER JOIN when the question is exploratory.
8. When the question is about "how many", always use COUNT(*).
9. Do NOT require exact keyword matches from the visitor query. Use best-effort
   semantic matching and aim for ~80-90% relevant results when exact matching
   is not possible.
10. For text filters (such as location, project name, category), prefer partial
    matching with LIKE when appropriate so minor spelling variations still
    return useful results.
11. For budget/price expressions, interpret common unit words when present:
    - lakh = 100000
    - crore = 10000000
    - thousand = 1000
12. Return {"sql": "", "reason": "..."} only when the schema truly lacks the
    required tables/columns to answer the question at all.
13. Do NOT output anything except the JSON object — no markdown fences, no
    comments, no explanations outside the JSON.

14. MUST NOT return raw id keys in the SELECT output when the visitor is
    asking for human-readable values (e.g., "name", "title", "label",
    "display", "status", "type", "category", "location").
    - If the schema uses a foreign key like `customer_id`, `project_id`,
      or `agent_id`, JOIN the corresponding table (e.g., `customers`,
      `projects`, `agents`) and SELECT the descriptive column (usually
      named `name` or `title`).
    - If the visitor question is unclear, avoid selecting `id` and instead
      select the best available descriptive column for each entity.
    - Keep the id column only internally for joins/filters; do not surface
      it in the final SELECT column list.
"""

_SYSTEM_INSTRUCTION_SQLITE = """\
You are a specialised SQL generator for SQLite databases.
Your ONLY job is to translate a visitor's natural-language question into a
single, safe SELECT query that answers the question using the schema provided.

RULES:
1. Output MUST be a JSON object: {"sql": "<SELECT …>"}
2. Use ONLY the tables and columns listed in the schema below. Never guess.
   The schema below is sourced from the stored `schema_snapshot` in Neurons;
   table names and column names in SQL MUST match that snapshot exactly.
3. Never emit INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, or any DDL/DML.
4. Always qualify ambiguous column names with the table name.
5. Use double-quoted identifiers for names that contain special characters.
6. Add LIMIT 50 unless the question explicitly asks for all rows or an
   aggregate (COUNT, SUM, AVG …).
7. Prefer LEFT JOIN over INNER JOIN when the question is exploratory.
8. When the question is about "how many", always use COUNT(*).
9. Do NOT require exact keyword matches from the visitor query. Use best-effort
   semantic matching and aim for ~80-90% relevant results when exact matching
   is not possible.
10. For text filters (such as location, project name, category), prefer partial
    matching with LIKE when appropriate so minor spelling variations still
    return useful results.
11. For budget/price expressions, interpret common unit words when present:
    - lakh = 100000
    - crore = 10000000
    - thousand = 1000
12. Return {"sql": "", "reason": "..."} only when the schema truly lacks the
    required tables/columns to answer the question at all.
13. Do NOT output anything except the JSON object — no markdown fences, no
    comments, no explanations outside the JSON.

14. MUST NOT return raw id keys in the SELECT output when the visitor is
    asking for human-readable values (e.g., "name", "title", "label",
    "display", "status", "type", "category", "location").
    - If the schema uses a foreign key like `customer_id`, `project_id`,
      or `agent_id`, JOIN the corresponding table and SELECT the
      descriptive column (usually named `name` or `title`).
    - Keep id columns only for joins/filters; do not surface them in final
      output columns unless explicitly requested.
"""


def _build_sql_gen_client(settings: Settings) -> LLMClient:
    return build_llm_client(settings.sql_gen_provider, settings.sql_gen_model)


def generate_sql(
    settings: Settings,
    *,
    user_message: str,
    schema_detail: str,
    db_label: str,
    dialect: str,
    previous_sql: str | None = None,
    previous_error: str | None = None,
) -> tuple[str, LLMUsage]:
    """Return (sql_string, usage).  sql_string may be empty on failure."""

    client = _build_sql_gen_client(settings)

    system = _SYSTEM_INSTRUCTION_MYSQL if dialect == "mysql" else _SYSTEM_INSTRUCTION_SQLITE

    if previous_sql and previous_error:
        user_block = (
            f"Database: {db_label}\n\n"
            f"Schema:\n{schema_detail}\n\n"
            f"Visitor's question (plain text):\n{user_message}\n\n"
            f"Your previous SQL attempt:\n{previous_sql}\n\n"
            f"Problem with that attempt:\n{previous_error}\n\n"
            "Generate a corrected SQL query."
        )
    else:
        user_block = (
            f"Database: {db_label}\n\n"
            f"Schema:\n{schema_detail}\n\n"
            f"Visitor's question (plain text):\n{user_message}"
        )

    prompt = f"{system}\n\n{user_block}"

    resp = client.generate(
        prompt,
        config=GenerationConfig(temperature=0.15, response_json=True),
    )
    text = resp.text.strip()
    if not text:
        return "", resp.usage

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("sql_generator: non-JSON response: %s", text[:200])
        return "", resp.usage

    sql = str(data.get("sql") or "").strip()
    if not sql:
        reason = data.get("reason", "")
        if reason:
            logger.info("sql_generator: declined — %s", reason)
    return sql, resp.usage
