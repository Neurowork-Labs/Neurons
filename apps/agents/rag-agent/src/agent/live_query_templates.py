"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons

Load and select predefined query templates for live database connections
(`database_connections.query_mode`, `database_connection_query_templates`).
"""

from __future__ import annotations

import logging
import re
from typing import Any

from supabase import Client

from llm.base import LLMClient, LLMUsage

logger = logging.getLogger(__name__)


def _keyword_fallback_index(user_message: str, templates: list[dict[str, Any]]) -> int | None:
    """
    Deterministic fallback when LLM template picker returns no match.
    Scores overlap between question tokens and template metadata/query text.
    """
    tokens = set(re.findall(r"[a-z0-9_]+", str(user_message or "").lower()))
    if not tokens:
        return None

    best_idx: int | None = None
    best_score = 0
    for i, t in enumerate(templates):
        text_parts = [
            str(t.get("name") or ""),
            str(t.get("description") or ""),
            str(t.get("sql_text") or ""),
        ]
        body = t.get("query_body")
        if isinstance(body, dict):
            try:
                text_parts.append(str(body.get("collection") or ""))
                text_parts.append(str(body.get("operation") or ""))
                text_parts.append(str(body.get("pipeline") or ""))
                text_parts.append(str(body.get("filter") or ""))
            except Exception:
                pass

        hay_tokens = set(re.findall(r"[a-z0-9_]+", " ".join(text_parts).lower()))
        score = len(tokens.intersection(hay_tokens))
        if score > best_score:
            best_score = score
            best_idx = i

    # avoid selecting almost-random templates
    if best_score < 2:
        return None
    return best_idx


def load_active_query_templates(supabase: Client, connection_id: str) -> list[dict[str, Any]]:
    """Active, non-deleted templates ordered by priority then creation time."""
    cid = str(connection_id or "").strip()
    if not cid:
        return []
    res = (
        supabase.table("database_connection_query_templates")
        .select("id,name,description,sql_text,query_kind,query_body,parameter_schema,card_config,sort_order")
        .eq("connection_id", cid)
        .eq("is_deleted", False)
        .eq("is_active", True)
        .order("sort_order", desc=False)
        .execute()
    )
    rows = list(res.data or [])
    logger.info("Loaded %d active query template(s) for connection_id=%s", len(rows), cid)
    return rows


def filter_templates_by_dialect(
    templates: list[dict[str, Any]],
    live_dialect: str,
) -> list[dict[str, Any]]:
    """Keep SQL templates for relational live connections; mongo_json for MongoDB."""
    d = str(live_dialect or "mysql").strip().lower()
    out: list[dict[str, Any]] = []
    skipped: list[str] = []
    for t in templates:
        kind = str(t.get("query_kind") or "sql").strip().lower()
        tname = str(t.get("name") or t.get("id") or "?")
        if d == "mongodb":
            if kind == "mongo_json":
                out.append(t)
            else:
                skipped.append(f"{tname}(kind={kind})")
        else:
            if kind != "mongo_json":
                out.append(t)
            else:
                skipped.append(f"{tname}(kind={kind})")
    if skipped:
        logger.info(
            "filter_templates_by_dialect dialect=%s kept=%d skipped=%d skipped_names=%s",
            d, len(out), len(skipped), ", ".join(skipped[:10]),
        )
    return out


def pick_query_template_index(
    llm_client: LLMClient,
    user_message: str,
    templates: list[dict[str, Any]],
) -> tuple[int | None, LLMUsage]:
    """
    LLM chooses the best template by 1-based index, or 0 for no match.
    Returns 0-based index into templates, or None.
    """
    n = len(templates)
    if n == 0:
        return None, LLMUsage()

    block_lines: list[str] = []
    for i, t in enumerate(templates):
        kind = str(t.get("query_kind") or "sql").strip().lower()
        sql_preview = str(t.get("sql_text") or "").strip().replace("\n", " ")
        if len(sql_preview) > 220:
            sql_preview = f"{sql_preview[:220]}..."
        body_preview = ""
        body = t.get("query_body")
        if isinstance(body, dict):
            try:
                body_preview = str(
                    {
                        "collection": body.get("collection"),
                        "operation": body.get("operation"),
                    }
                )
            except Exception:
                body_preview = ""
        block_lines.append(
            f"{i + 1}. "
            f"name={t.get('name', '')!s} | "
            f"description={t.get('description', '')!s} | "
            f"kind={kind} | "
            f"sql={sql_preview} | "
            f"mongo={body_preview}"
        )
    block = "\n".join(block_lines)
    prompt = f"""Choose which predefined read-only database query template best answers the visitor question.

Templates (respond with index 1..{n} to use that template, or 0 if none apply):
{block}

Visitor question:
{user_message}

Respond with JSON only: {{"index": <integer 0 through {n}>}}"""
    data, usage = llm_client.generate_json(prompt)
    try:
        idx = int(data.get("index"))
    except (TypeError, ValueError):
        logger.warning("query_template pick: invalid index payload: %s", data)
        return None, usage
    if idx == 0:
        fallback_idx = _keyword_fallback_index(user_message, templates)
        if fallback_idx is not None:
            logger.info(
                "query_template pick: llm_index=0 fallback_index=%d template_name=%s",
                fallback_idx + 1,
                str(templates[fallback_idx].get("name") or ""),
            )
            return fallback_idx, usage
        logger.info("query_template pick: llm_index=0 no fallback match")
        return None, usage
    if idx < 1 or idx > n:
        logger.warning("query_template pick: index out of range: %s (n=%d)", idx, n)
        return None, usage
    chosen = idx - 1
    logger.info(
        "query_template pick: llm_index=%d template_name=%s",
        idx,
        str(templates[chosen].get("name") or ""),
    )
    return chosen, usage
