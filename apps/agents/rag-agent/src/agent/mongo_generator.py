"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons

Dedicated Mongo query generation LLM for live MongoDB connections.
"""

from __future__ import annotations

import json
import logging

from config.settings import Settings
from llm.base import GenerationConfig, LLMClient, LLMUsage
from llm.factory import build_llm_client

logger = logging.getLogger(__name__)

_SYSTEM_INSTRUCTION_MONGO = """\
You are a specialized MongoDB query generator.
Your ONLY job is to translate a visitor's natural-language question into a
single safe MongoDB query spec JSON object.

OUTPUT FORMAT (strict JSON object only):
{
  "operation": "find" | "aggregate",
  "collection": "<collection_name>",
  "filter": { ... },                  // for find
  "projection": { ... },              // optional for find
  "sort": [["field","asc"|"desc"]],   // optional for find
  "limit": 1..50,                     // optional for find (default 50)
  "pipeline": [ ... ]                 // for aggregate
}

RULES:
1. Output MUST be valid JSON with exactly one query spec object.
2. Use ONLY collections and fields provided in schema context.
3. Never use write/update/delete/admin operations.
4. Allowed operations are only "find" and "aggregate".
5. For count-like questions, prefer aggregate with $match + $count.
6. Add a limit <= 50 when returning documents.
7. Do not use JavaScript execution operators like $where.
8. Return {"operation":"", "reason":"..."} only when schema lacks required data.
9. Do NOT output markdown fences or extra commentary.
"""


def _build_mongo_gen_client(settings: Settings) -> LLMClient:
    # Reuse existing SQL generator model/provider configuration for now.
    return build_llm_client(settings.sql_gen_provider, settings.sql_gen_model)


def generate_mongo_query(
    settings: Settings,
    *,
    user_message: str,
    schema_detail: str,
    db_label: str,
    previous_spec: str | None = None,
    previous_error: str | None = None,
) -> tuple[dict, str, LLMUsage]:
    """Return (query_spec_dict, raw_json_text, usage)."""
    client = _build_mongo_gen_client(settings)

    if previous_spec and previous_error:
        user_block = (
            f"Database: {db_label}\n\n"
            f"Schema:\n{schema_detail}\n\n"
            f"Visitor's question:\n{user_message}\n\n"
            f"Previous query spec:\n{previous_spec}\n\n"
            f"Problem with previous spec:\n{previous_error}\n\n"
            "Generate a corrected Mongo query spec."
        )
    else:
        user_block = (
            f"Database: {db_label}\n\n"
            f"Schema:\n{schema_detail}\n\n"
            f"Visitor's question:\n{user_message}"
        )

    prompt = f"{_SYSTEM_INSTRUCTION_MONGO}\n\n{user_block}"
    resp = client.generate(prompt, config=GenerationConfig(temperature=0.15, response_json=True))
    text = resp.text.strip()
    if not text:
        return {}, "", resp.usage
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("mongo_generator: non-JSON response: %s", text[:200])
        return {}, text, resp.usage
    if not isinstance(data, dict):
        return {}, text, resp.usage
    return data, text, resp.usage
