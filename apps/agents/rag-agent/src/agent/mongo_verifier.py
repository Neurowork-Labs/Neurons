"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons

Dedicated MongoDB result verifier for query quality gating.
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
You are a MongoDB result quality-gate for a RAG agent.

You receive:
- Visitor question
- Mongo schema context
- Generated Mongo query spec JSON
- Query result (JSON rows or error text)

Output JSON only:
{
  "verdict": "pass" | "retry",
  "reason": "one-line explanation",
  "feedback": "actionable fix hint (only when retry)"
}

Rules:
1. pass when result is reasonably useful for the question.
2. retry when error, empty irrelevant result, wrong collection, wrong filter,
   missing aggregation, or unsupported operators.
3. feedback must be concrete and actionable.
4. No extra text outside JSON.
"""


def _build_verifier_client(settings: Settings) -> LLMClient:
    # Reuse existing SQL verifier model/provider configuration for now.
    return build_llm_client(settings.sql_verifier_provider, settings.sql_verifier_model)


def verify_mongo_result(
    settings: Settings,
    *,
    user_message: str,
    schema_detail: str,
    query_spec_json: str,
    query_result: str,
) -> tuple[dict[str, Any], LLMUsage]:
    client = _build_verifier_client(settings)
    user_block = (
        f"Visitor's question:\n{user_message}\n\n"
        f"Mongo schema:\n{schema_detail}\n\n"
        f"Generated query spec:\n{query_spec_json}\n\n"
        f"Query result:\n{query_result}"
    )
    prompt = f"{_SYSTEM_INSTRUCTION}\n\n{user_block}"
    resp = client.generate(prompt, config=GenerationConfig(temperature=0.1, response_json=True))
    text = resp.text.strip()
    if not text:
        return {"verdict": "pass", "reason": "verifier returned empty response", "feedback": ""}, resp.usage
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("mongo_verifier: non-JSON response: %s", text[:200])
        return {"verdict": "pass", "reason": "verifier returned non-JSON", "feedback": ""}, resp.usage
    if not isinstance(data, dict):
        logger.warning("mongo_verifier: expected JSON object, got %s: %s", type(data).__name__, text[:200])
        return {"verdict": "pass", "reason": "verifier returned non-object JSON", "feedback": ""}, resp.usage
    verdict = str(data.get("verdict") or "pass").lower()
    if verdict not in ("pass", "retry"):
        verdict = "pass"
    return {
        "verdict": verdict,
        "reason": str(data.get("reason") or ""),
        "feedback": str(data.get("feedback") or ""),
    }, resp.usage
