"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons

Dedicated SQL verification / quality-gate LLM — system-controlled model that
inspects the generated SQL, the query result, and the visitor's original
question, then decides whether the answer is acceptable or whether a retry
is needed (with actionable feedback for the SQL generator).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from config.settings import Settings
from llm.base import GenerationConfig, LLMClient, LLMUsage
from llm.factory import build_llm_client

logger = logging.getLogger(__name__)

_SYSTEM_INSTRUCTION = """\
You are an SQL result quality-gate for a RAG agent that answers website
visitor questions from a relational database.

You receive:
- The visitor's original question (plain text).
- The database schema (tables and columns).
- The SQL query that was generated.
- The query result (JSON with columns + rows, an error message, or
  "[Query returned 0 rows]").

YOUR TASK:
Decide whether the query result adequately answers the visitor's question.

OUTPUT — a single JSON object with exactly these fields:
{
  "verdict": "pass" | "retry",
  "reason": "one-line explanation",
  "feedback": "actionable hint for the SQL generator (only when verdict=retry)"
}

RULES:
1. verdict = "pass" when the result rows contain data that can reasonably
   answer the question, even if not perfect.
2. verdict = "retry" when:
   a. The query returned an SQL error.
   b. The query returned 0 rows but the schema suggests data should exist.
   c. The query columns are obviously wrong (e.g. selected IDs instead of
      names, missed a required JOIN, wrong aggregation).
   d. The SQL is syntactically valid but semantically misaligned with the
      question (wrong table, wrong filter, etc.).
   e. The result appears to expose raw identifier columns instead of
      human-readable fields when the visitor is asking for descriptive
      values (e.g., "name", "title", "label", "display", "status",
      "category", "location").
   f. The SQL references table names or column names that are not present in
      the provided schema snapshot context.
3. When verdict = "retry", the "feedback" field MUST contain a concrete,
   actionable correction hint — e.g. "JOIN the `orders` table on
   `customer_id` to get order counts" — NOT generic advice like
   "try again".
4. Do NOT output anything except the JSON object.
5. Be lenient: partial results are "pass" as long as they're relevant.
6. Do NOT enforce strict exact-keyword matching on visitor terms. If the SQL
   result is semantically close and useful (about 80-90% relevant), prefer
   verdict = "pass" instead of "retry".
7. For place names or text fields, minor spelling differences or partial
   matches are acceptable when the returned data is still clearly relevant.

HEURISTIC FOR e:
- If the selected column names include exactly `id` or end with `_id`,
  and the visitor question is asking for a descriptive field (name/title/
  label/display/etc.), set verdict = "retry".
- In verdict="retry", set feedback to instruct replacing those raw IDs
  with JOINs to the relevant lookup/entity tables and selecting their
  descriptive columns (usually named `name` or `title`).
"""


def _build_verifier_client(settings: Settings) -> LLMClient:
    return build_llm_client(settings.sql_verifier_provider, settings.sql_verifier_model)


def verify_sql_result(
    settings: Settings,
    *,
    user_message: str,
    schema_detail: str,
    sql: str,
    query_result: str,
) -> tuple[dict[str, Any], LLMUsage]:
    """Return (verdict_dict, usage).

    verdict_dict has keys: verdict ("pass"|"retry"), reason, feedback.
    """

    client = _build_verifier_client(settings)

    user_block = (
        f"Visitor's question:\n{user_message}\n\n"
        f"Database schema:\n{schema_detail}\n\n"
        f"Generated SQL:\n{sql}\n\n"
        f"Query result:\n{query_result}"
    )

    prompt = f"{_SYSTEM_INSTRUCTION}\n\n{user_block}"

    resp = client.generate(
        prompt,
        config=GenerationConfig(temperature=0.1, response_json=True),
    )
    text = resp.text.strip()
    if not text:
        return {"verdict": "pass", "reason": "verifier returned empty response"}, resp.usage

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("sql_verifier: non-JSON response: %s", text[:200])
        return {"verdict": "pass", "reason": "verifier returned non-JSON"}, resp.usage

    if not isinstance(data, dict):
        logger.warning("sql_verifier: expected JSON object, got %s: %s", type(data).__name__, text[:200])
        return {"verdict": "pass", "reason": "verifier returned non-object JSON"}, resp.usage

    verdict = str(data.get("verdict") or "pass").lower()
    if verdict not in ("pass", "retry"):
        verdict = "pass"

    return {
        "verdict": verdict,
        "reason": str(data.get("reason") or ""),
        "feedback": str(data.get("feedback") or ""),
    }, resp.usage
