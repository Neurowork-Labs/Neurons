"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from typing import Any
from typing import Callable
from urllib.parse import quote as _url_quote

from supabase import Client

from agent.schema_catalog import (
    collection_names_from_snapshot,
    extract_table_names_from_sql_ddl,
    shortlist_tables,
    table_names_from_snapshot,
)
from agent.live_query_templates import (
    filter_templates_by_dialect,
    load_active_query_templates,
    pick_query_template_index,
)
from agent.mongo_generator import generate_mongo_query
from agent.mongo_runner import run_query_mongo
from agent.mongo_verifier import verify_mongo_result
from agent.mysql_runner import run_select_mysql
from agent.sql_generator import generate_sql
from agent.sql_langchain import run_langchain_live_sql
from agent.sql_llamaindex import run_llamaindex_live_sql
from agent.sql_verifier import verify_sql_result
from agent.sqlite_runner import load_tables_into_sqlite, run_select
from config.settings import Settings
from embeddings.gemini_embed import GeminiEmbedder
from llm.base import GenerationConfig, LLMClient, LLMUsage
from llm.factory import build_llm_client
from llm.model_resolver import resolve_model_for_project_agent
from retrieval.chunk_retrieval import retrieve_similar_chunks

logger = logging.getLogger(__name__)


class _TokenCounter:
    """Accumulates token counts across multiple LLM calls."""
    def __init__(self) -> None:
        self.input = 0
        self.output = 0

    def add(self, usage: LLMUsage) -> None:
        self.input += usage.input_tokens
        self.output += usage.output_tokens


def _llm_json(
    client: LLMClient, prompt: str,
    tc: _TokenCounter | None = None,
) -> dict[str, Any]:
    data, usage = client.generate_json(prompt)
    if tc:
        tc.add(usage)
    return data


def _build_cards_from_config(
    card_config: dict[str, Any],
    db_cols: list[str],
    db_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build carousel cards deterministically from card_config mapping."""
    mapping = card_config.get("cardMapping")
    if not isinstance(mapping, dict):
        return []
    title_col = str(mapping.get("titleColumn") or "").strip()
    if not title_col:
        return []
    image_col = str(mapping.get("imageColumn") or "").strip() or None
    public_bucket_url = str(mapping.get("publicBucketUrl") or "").strip()
    detail_cols = mapping.get("detailColumns") or []
    if not isinstance(detail_cols, list):
        detail_cols = []
    max_cards = int(mapping.get("maxCards") or 10)
    if max_cards < 1:
        max_cards = 10

    link_cfg = card_config.get("link")
    cards: list[dict[str, Any]] = []
    for row in db_rows[:max_cards]:
        title_val = row.get(title_col)
        if title_val is None:
            continue
        card: dict[str, Any] = {"title": str(title_val).strip()}
        if image_col and row.get(image_col):
            card["image"] = _build_card_image_url(str(row[image_col]), public_bucket_url)
        details: list[str] = []
        for dc in detail_cols:
            dc_name = str(dc).strip()
            if not dc_name:
                continue
            val = row.get(dc_name)
            if val is not None and str(val).strip():
                label = dc_name.replace("_", " ").strip().title()
                details.append(f"{label}: {val}")
        card["details"] = details[:6]
        if isinstance(link_cfg, dict):
            link = _build_card_link(link_cfg, row)
            if link:
                card["link"] = link
        if card.get("title"):
            cards.append(card)
    return cards


def _build_card_image_url(raw_image: str, public_bucket_url: str) -> str:
    """Build a full image URL from bucket base + row image value when needed."""
    image_value = str(raw_image or "").strip()
    if not image_value:
        return ""
    lowered = image_value.lower()
    # Preserve absolute URLs and data/blob URIs provided by source data.
    if lowered.startswith(("http://", "https://", "//", "data:", "blob:")):
        return image_value
    bucket = str(public_bucket_url or "").strip().rstrip("/")
    if not bucket:
        return image_value
    return f"{bucket}/{image_value.lstrip('/')}"


def _build_card_link(link_cfg: dict[str, Any], row: dict[str, Any]) -> str:
    """Construct a card link URL from base path + path segments + query params."""
    base = str(link_cfg.get("basePath") or "").strip()
    if not base:
        return ""
    parts = [base.rstrip("/")]
    for seg in (link_cfg.get("pathSegments") or []):
        if isinstance(seg, dict):
            col = str(seg.get("column") or "").strip()
            val = row.get(col)
            if val is not None:
                parts.append(str(val).strip())
    url = "/".join(parts)
    qp_list = link_cfg.get("queryParams") or []
    qp_parts: list[str] = []
    for qp in qp_list:
        if isinstance(qp, dict):
            name = str(qp.get("name") or "").strip()
            col = str(qp.get("column") or "").strip()
            val = row.get(col)
            if name and val is not None:
                qp_parts.append(f"{_url_quote(name, safe='')}={_url_quote(str(val), safe='')}")
    if qp_parts:
        url += "?" + "&".join(qp_parts)
    return url


def _filter_excluded_columns_from_db_answer(
    db_answer: str,
    excluded_columns: list[str],
) -> str:
    """Remove excluded columns from a JSON db_answer before passing to LLM."""
    if not excluded_columns or not db_answer:
        return db_answer
    try:
        parsed = json.loads(db_answer)
        cols = parsed.get("columns") or []
        rows = parsed.get("rows") or []
        if not isinstance(cols, list) or not isinstance(rows, list):
            return db_answer
        exclude_set = {str(c).strip().lower() for c in excluded_columns}
        filtered_cols = [c for c in cols if str(c).strip().lower() not in exclude_set]
        filtered_rows = []
        for row in rows:
            if isinstance(row, dict):
                filtered_rows.append(
                    {k: v for k, v in row.items() if str(k).strip().lower() not in exclude_set}
                )
            else:
                filtered_rows.append(row)
        return json.dumps({"columns": filtered_cols, "rows": filtered_rows}, ensure_ascii=False, default=str)
    except Exception:
        return db_answer


def _build_schema_hint(conn, table_names: set[str]) -> str:
    hints: list[str] = []
    for tname in sorted(table_names):
        try:
            cur = conn.execute(f'PRAGMA table_info("{tname}")')
            cols = cur.fetchall()
            col_strs = [f"{row[1]} ({row[2]})" for row in cols]
            hints.append(f"  {tname}: {', '.join(col_strs)}")
        except Exception:
            hints.append(f"  {tname}: (unknown columns)")
    return "\n".join(hints)


def _build_schema_hint_from_snapshot(schema_snapshot: Any, table_names: set[str]) -> str:
    hints: list[str] = []
    if not isinstance(schema_snapshot, dict):
        return ""
    tables = schema_snapshot.get("tables")
    if not isinstance(tables, list):
        return ""
    wanted = {t.lower() for t in table_names}
    for t in tables:
        if not isinstance(t, dict):
            continue
        tname = str(t.get("name") or "").strip()
        if not tname or tname.lower() not in wanted:
            continue
        cols = t.get("columns")
        col_defs: list[str] = []
        if isinstance(cols, list):
            for c in cols:
                if not isinstance(c, dict):
                    continue
                cname = str(c.get("name") or "").strip()
                ctype = str(c.get("dataType") or c.get("data_type") or "").strip()
                if cname:
                    col_defs.append(f"{cname} ({ctype or 'unknown'})")

        # Foreign keys are optional in snapshots. When present, they are stored
        # as `foreignKeys` within each table entry.
        fk_raw = t.get("foreignKeys") or t.get("foreign_keys") or []
        fk_lines: list[str] = []
        if isinstance(fk_raw, list):
            for fk in fk_raw:
                if not isinstance(fk, dict):
                    continue
                col = str(fk.get("column") or "").strip()
                ref_table = str(
                    fk.get("referencedTable")
                    or fk.get("referenced_table")
                    or fk.get("refTable")
                    or ""
                ).strip()
                ref_col = str(
                    fk.get("referencedColumn")
                    or fk.get("referenced_column")
                    or fk.get("refColumn")
                    or ""
                ).strip()
                constraint = str(fk.get("constraintName") or fk.get("constraint_name") or "").strip()
                if col and ref_table and ref_col:
                    extra = f" (constraint: {constraint})" if constraint else ""
                    fk_lines.append(f"{col} -> {ref_table}.{ref_col}{extra}")

        if not col_defs and not fk_lines:
            hints.append(f"  {tname}: (unknown columns)")
            continue

        # Grouped block per table makes it easier for the SQL generator
        # to use the FK edges alongside the columns.
        block: list[str] = []
        block.append(f"  {tname}:")
        block.append(f"    columns: {', '.join(col_defs) if col_defs else '(unknown columns)'}")
        if fk_lines:
            block.append("    foreign keys:")
            for line in fk_lines:
                block.append(f"      - {line}")

        hints.append("\n".join(block))
    return "\n".join(hints)


def _build_mongo_schema_hint_from_snapshot(schema_snapshot: Any, collection_names: set[str]) -> str:
    hints: list[str] = []
    if not isinstance(schema_snapshot, dict):
        return ""
    collections = schema_snapshot.get("collections")
    if not isinstance(collections, list):
        return ""
    wanted = {c.lower() for c in collection_names}
    for c in collections:
        if not isinstance(c, dict):
            continue
        cname = str(c.get("name") or "").strip()
        if not cname or cname.lower() not in wanted:
            continue
        fields = c.get("fields")
        field_defs: list[str] = []
        if isinstance(fields, list):
            for f in fields:
                if not isinstance(f, dict):
                    continue
                path = str(f.get("path") or "").strip()
                types = f.get("types")
                if not path:
                    continue
                if isinstance(types, list):
                    tstr = "|".join(sorted({str(t) for t in types if str(t).strip()}))
                else:
                    tstr = ""
                field_defs.append(f"{path} ({tstr or 'unknown'})")
        if field_defs:
            hints.append(f"  {cname}: {', '.join(field_defs[:80])}")
        else:
            hints.append(f"  {cname}: (unknown fields)")
    return "\n".join(hints)


def _schema_columns_from_snapshot(schema_snapshot: Any, table_names: set[str]) -> dict[str, set[str]]:
    """Return canonical table->columns map from stored schema_snapshot."""
    out: dict[str, set[str]] = {}
    if not isinstance(schema_snapshot, dict):
        return out
    tables = schema_snapshot.get("tables")
    if not isinstance(tables, list):
        return out
    wanted = {t.lower() for t in table_names}
    for t in tables:
        if not isinstance(t, dict):
            continue
        tname = str(t.get("name") or "").strip()
        if not tname or tname.lower() not in wanted:
            continue
        cols = t.get("columns")
        colset: set[str] = set()
        if isinstance(cols, list):
            for c in cols:
                if not isinstance(c, dict):
                    continue
                cname = str(c.get("name") or "").strip()
                if cname:
                    colset.add(cname.lower())
        out[tname.lower()] = colset
    return out


def _validate_sql_qualified_refs_against_snapshot(
    sql: str,
    schema_columns: dict[str, set[str]],
) -> tuple[bool, str]:
    """
    Validate qualified refs like `table.column` against schema_snapshot columns.
    This supplements runner-level table validation with snapshot-backed column checks.
    """
    if not schema_columns:
        return True, ""
    alias_map: dict[str, str] = {}
    for tname in schema_columns.keys():
        alias_map[tname] = tname

    # Capture aliases from FROM/JOIN clauses:
    #   FROM property p
    #   FROM property AS p
    #   JOIN `city` c
    #   JOIN public.city_area AS ca
    alias_matches = re.findall(
        r'(?i)\b(?:from|join)\s+((?:[`"]?[A-Za-z_][A-Za-z0-9_]*[`"]?\.)?[`"]?[A-Za-z_][A-Za-z0-9_]*[`"]?)'
        r'(?:\s+(?:as\s+)?([A-Za-z_][A-Za-z0-9_]*))?',
        sql,
    )
    for raw_table, raw_alias in alias_matches:
        table_token = str(raw_table or "").strip().strip('`"')
        table_name = table_token.split(".")[-1].strip().strip('`"').lower()
        if not table_name:
            continue
        if table_name not in schema_columns:
            continue
        alias_map[table_name] = table_name
        alias = str(raw_alias or "").strip().lower()
        if alias:
            alias_map[alias] = table_name

    refs = re.findall(r'(?<![A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)', sql)
    for tname_raw, cname_raw in refs:
        tname = str(tname_raw).lower()
        cname = str(cname_raw).lower()
        base_table = alias_map.get(tname)
        if base_table is None:
            return False, f"Unknown table reference in SQL: {tname_raw}"
        # Allow wildcard (table.*) when explicitly requested by the model.
        if cname == "*":
            continue
        if cname not in schema_columns[base_table]:
            return False, f"Unknown column reference in SQL: {tname_raw}.{cname_raw}"
    return True, ""


def _extract_sql_placeholders(sql: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for m in re.finditer(r"(^|[^:]):([A-Za-z_][A-Za-z0-9_]*)", str(sql or "")):
        name = str(m.group(2) or "").strip()
        key = name.lower()
        if name and key not in seen:
            seen.add(key)
            found.append(name)
    return found


def _extract_mongo_placeholders(node: Any, out: list[str], seen: set[str]) -> None:
    if isinstance(node, dict):
        for v in node.values():
            _extract_mongo_placeholders(v, out, seen)
        return
    if isinstance(node, list):
        for item in node:
            _extract_mongo_placeholders(item, out, seen)
        return
    if isinstance(node, str):
        for m in re.finditer(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}", node):
            name = str(m.group(1) or "").strip()
            key = name.lower()
            if name and key not in seen:
                seen.add(key)
                out.append(name)


def _extract_template_placeholders(template: dict[str, Any], dialect: str) -> list[str]:
    if dialect == "mongodb":
        out: list[str] = []
        seen: set[str] = set()
        _extract_mongo_placeholders(template.get("query_body"), out, seen)
        return out
    return _extract_sql_placeholders(str(template.get("sql_text") or ""))


def _normalize_param_type(raw: Any) -> str:
    t = str(raw or "").strip().lower()
    allowed = {
        "int2", "int4", "int8", "float4", "float8", "numeric", "json", "jsonb", "text", "varchar",
        "uuid", "date", "time", "timetz", "timestamp", "timestamptz", "bool", "bytes",
    }
    if t in allowed:
        return t
    # backward compatibility with older schema values
    if t == "string":
        return "text"
    if t == "number":
        return "numeric"
    if t == "integer":
        return "int4"
    if t == "boolean":
        return "bool"
    return "text"


def _coerce_param_value(name: str, typ: str, value: Any) -> tuple[bool, Any, str]:
    if value is None:
        return True, None, ""
    t = _normalize_param_type(typ)
    if t in {"int2", "int4", "int8"}:
        try:
            n = int(value)
            return True, n, ""
        except Exception:
            return False, None, f'Parameter "{name}" must be an integer.'
    if t in {"float4", "float8", "numeric"}:
        try:
            n = float(value)
            if not (n == n):  # NaN guard
                raise ValueError("nan")
            return True, n, ""
        except Exception:
            return False, None, f'Parameter "{name}" must be a number.'
    if t == "bool":
        if isinstance(value, bool):
            return True, value, ""
        s = str(value).strip().lower()
        if s in {"true", "1", "yes"}:
            return True, True, ""
        if s in {"false", "0", "no"}:
            return True, False, ""
        return False, None, f'Parameter "{name}" must be true or false.'
    if t in {"json", "jsonb"}:
        if isinstance(value, (dict, list, int, float, bool)) or value is None:
            return True, value, ""
        s = str(value).strip()
        try:
            parsed = json.loads(s)
            return True, parsed, ""
        except Exception:
            return False, None, f'Parameter "{name}" must be valid JSON.'
    # text-like and temporal identifiers: keep as string
    return True, str(value), ""


_PARAM_FOLLOWUP_MARKERS = frozenset({
    "could you please share",
    "could you tell me",
    "could you let me know",
    "please provide",
    "feel free to say",
    "a few more details",
    "to help find the best",
    "to answer this, please provide",
})


def _build_template_description_suggestions(
    templates: list[dict[str, Any]],
    user_message: str,
    max_items: int = 3,
) -> list[str]:
    """Build deterministic suggestions from query template descriptions."""
    tokens = set(re.findall(r"[a-z0-9_]+", str(user_message or "").lower()))
    scored: list[tuple[int, int, str]] = []
    for idx, t in enumerate(templates):
        desc = str(t.get("description") or "").strip()
        if not desc:
            continue
        hay = " ".join([
            str(t.get("name") or ""),
            desc,
            str(t.get("sql_text") or ""),
        ]).lower()
        hay_tokens = set(re.findall(r"[a-z0-9_]+", hay))
        score = len(tokens.intersection(hay_tokens)) if tokens else 0
        suggestion = desc if desc.endswith("?") else f"{desc}?"
        scored.append((score, idx, suggestion))

    if not scored:
        return []

    scored.sort(key=lambda x: (-x[0], x[1]))
    out: list[str] = []
    seen: set[str] = set()
    for _, _, s in scored:
        k = s.strip().lower()
        if not k or k in seen:
            continue
        seen.add(k)
        out.append(s)
        if len(out) >= max(1, int(max_items)):
            break
    return out


def _rewrite_ranked_template_suggestions(
    *,
    llm_client: LLMClient,
    tc: _TokenCounter,
    user_message: str,
    ranked_suggestions: list[str],
    max_items: int = 3,
) -> list[str]:
    """
    Lightly rewrite ranked template-description suggestions for visitor readability.
    Keeps semantic intent and ordering from ranked_suggestions.
    """
    candidates = [str(s).strip() for s in ranked_suggestions if str(s).strip()]
    if not candidates:
        return []

    capped = candidates[: max(1, int(max_items))]
    prompt = f"""You are rewriting suggested follow-up questions for a website visitor.

Given ranked candidate questions, rewrite each to sound natural and visitor-friendly.

Rules:
- Keep the SAME intent as each candidate.
- Keep the SAME order as candidates.
- Return exactly {len(capped)} suggestions.
- Each suggestion must be a question under 80 characters.
- Avoid technical wording and avoid SQL/database terms.

Visitor message:
{user_message}

Ranked candidates:
{json.dumps(capped, ensure_ascii=False)}

Respond with JSON only:
{{"suggestions":["q1","q2","q3"]}}
"""
    try:
        out = _llm_json(llm_client, prompt, tc)
        raw = out.get("suggestions") if isinstance(out, dict) else []
        if not isinstance(raw, list):
            return capped
        rewritten = [str(s).strip() for s in raw if str(s).strip()]
        if len(rewritten) < len(capped):
            return capped
        uniq: list[str] = []
        seen: set[str] = set()
        for s in rewritten:
            q = s if s.endswith("?") else f"{s}?"
            key = q.lower().strip()
            if not key or key in seen:
                continue
            seen.add(key)
            uniq.append(q)
            if len(uniq) >= len(capped):
                break
        if len(uniq) < len(capped):
            return capped
        return uniq
    except Exception:
        return capped


def _count_param_ask_attempts(history: list[dict[str, str]]) -> int:
    """Count how many recent assistant turns were parameter follow-up questions."""
    count = 0
    for h in history[-12:]:
        role = str(h.get("role") or "").strip().lower()
        if role != "assistant":
            continue
        content = str(h.get("content") or "").strip().lower()
        if any(marker in content for marker in _PARAM_FOLLOWUP_MARKERS):
            count += 1
    return count


def _build_conversation_context(
    history: list[dict[str, str]],
    user_message: str,
    max_turns: int = 6,
) -> str:
    """Build a concise conversation context string from recent history.

    Includes the last ``max_turns`` messages so the extraction LLM can see
    parameter values mentioned in earlier turns (e.g. "below 30 lakhs" in
    turn 1 should still be visible when the visitor refines in turn 2).
    """
    lines: list[str] = []
    for h in history[-(max_turns * 2):]:
        role = str(h.get("role") or "").strip()
        content = str(h.get("content") or "").strip()
        if not content:
            continue
        if len(content) > 400:
            content = content[:400] + "..."
        lines.append(f"{role}: {content}")
    lines.append(f"user: {user_message}")
    return "\n".join(lines) if lines else f"user: {user_message}"


def _extract_contact_snapshot(
    history: list[dict[str, str]],
    user_message: str,
) -> dict[str, str]:
    """Extract best-effort visitor contact details from user turns."""
    user_lines: list[str] = []
    for h in history[-20:]:
        role = str(h.get("role") or "").strip().lower()
        content = str(h.get("content") or "").strip()
        if role == "user" and content:
            user_lines.append(content)
    if user_message.strip():
        user_lines.append(user_message.strip())
    text = "\n".join(user_lines)

    email = ""
    phone = ""
    name = ""

    email_matches = re.findall(
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
        text,
    )
    if email_matches:
        email = str(email_matches[-1]).strip()

    phone_matches = re.findall(r"(?:\+?\d[\d\-\s().]{7,}\d)", text)
    for p in reversed(phone_matches):
        digits = re.sub(r"\D", "", p)
        if len(digits) >= 10:
            phone = p.strip()
            break

    name_patterns = [
        r"\bmy name is\s+([A-Za-z][A-Za-z .'-]{1,60})",
        r"\bi am\s+([A-Za-z][A-Za-z .'-]{1,60})",
        r"\bthis is\s+([A-Za-z][A-Za-z .'-]{1,60})",
    ]
    for pat in name_patterns:
        matches = re.findall(pat, text, flags=re.IGNORECASE)
        if matches:
            raw = str(matches[-1]).strip()
            raw = re.split(r"[,.;\n]", raw)[0].strip()
            raw = re.sub(r"\s+", " ", raw)
            parts = [w for w in raw.split(" ") if w]
            if 1 <= len(parts) <= 5 and len(raw) >= 2:
                name = raw
                break

    return {
        "name": name,
        "email": email,
        "phone": phone,
    }


def _resolve_template_parameters(
    *,
    llm_client: LLMClient,
    tc: _TokenCounter,
    user_message: str,
    history: list[dict[str, str]],
    template: dict[str, Any],
    dialect: str,
) -> tuple[dict[str, Any] | None, str | None]:
    placeholders = _extract_template_placeholders(template, dialect)
    if not placeholders:
        return {}, None

    schema_obj = template.get("parameter_schema")
    schema_params = []
    if isinstance(schema_obj, dict):
        raw = schema_obj.get("parameters")
        if isinstance(raw, list):
            for item in raw:
                if isinstance(item, dict):
                    schema_params.append(item)
    by_key: dict[str, dict[str, Any]] = {}
    for p in schema_params:
        pname = str(p.get("name") or "").strip()
        if pname:
            by_key[pname.lower()] = p

    effective: list[dict[str, Any]] = []
    for name in placeholders:
        p = by_key.get(name.lower()) or {}
        effective.append(
            {
                "name": name,
                "type": _normalize_param_type(p.get("type")),
                "required": bool(p.get("required")),
                "nullable": True if p.get("nullable") is None else bool(p.get("nullable")),
                "default": p.get("default", None),
                "enum": p.get("enum", []),
                "description": str(p.get("description") or ""),
            }
        )

    conversation_context = _build_conversation_context(history, user_message)
    defs_json = json.dumps(effective, ensure_ascii=False, default=str)

    extract_prompt = f"""Extract template parameter values from the visitor's full conversation.

Return JSON only with this shape:
{{
  "params": {{
    "<parameter_name>": <value or null>
  }}
}}

Rules:
- Look at the ENTIRE conversation history, not only the latest message.
  Values mentioned in earlier turns are still valid unless the visitor
  explicitly changed or cancelled them.
- Use null ONLY when a value is truly absent from the full conversation.
- Do not invent values that were never mentioned or implied.
- Preserve type intent when obvious (number/bool).

Semantic interpretation:
- "any <X>", "all <X>", "doesn't matter", "no preference" → null
  (the visitor wants no filter on that parameter).
- If the visitor mentions only a maximum (e.g. "below 30 lakhs",
  "under 50000"), set the max parameter to that value.  If there is a
  corresponding min parameter and the visitor did NOT mention a minimum,
  set min to 0 (zero) — not null.
- If the visitor mentions only a minimum (e.g. "above 10 lakhs"),
  set the min parameter to that value and leave max as null.
- Interpret common unit words:
    lakh = 100000, crore = 10000000, thousand = 1000, k = 1000, m/million = 1000000.
- Preserve original numeric values when no unit conversion is needed.

Parameter definitions:
{defs_json}

Conversation:
{conversation_context}
"""
    data = _llm_json(llm_client, extract_prompt, tc)
    raw_params = data.get("params") if isinstance(data, dict) else {}
    if not isinstance(raw_params, dict):
        raw_params = {}

    ask_attempts = _count_param_ask_attempts(history)
    max_ask_attempts = 2

    resolved: dict[str, Any] = {}
    missing_required: list[str] = []
    missing_to_ask: list[dict[str, Any]] = []
    for p in effective:
        name = str(p["name"])
        key = name.lower()
        value = raw_params.get(name)
        if value is None and key in raw_params:
            value = raw_params.get(key)
        has_default = ("default" in p) and (p.get("default") is not None)

        if value is None:
            if has_default:
                value = p.get("default")
            elif key == "limit":
                value = 50
            elif key == "offset":
                value = 0

        if value is None:
            if ask_attempts < max_ask_attempts:
                if p.get("required") and not has_default:
                    missing_to_ask.append(p)
                    resolved[name] = None
                    continue

            if p.get("required"):
                missing_required.append(name)
                resolved[name] = None
                continue
            else:
                resolved[name] = None
                continue

        ok, coerced, err = _coerce_param_value(name, str(p.get("type") or "text"), value)
        if not ok:
            return None, err

        if key == "limit":
            try:
                n = int(coerced)
                coerced = max(1, min(n, 50))
            except Exception:
                coerced = 50
        elif key == "offset":
            try:
                n = int(coerced)
                coerced = max(0, min(n, 10000))
            except Exception:
                coerced = 0

        enum_vals = p.get("enum")
        if isinstance(enum_vals, list) and len(enum_vals) > 0:
            enum_keys = {json.dumps(v, ensure_ascii=False, default=str) for v in enum_vals}
            val_key = json.dumps(coerced, ensure_ascii=False, default=str)
            if val_key not in enum_keys:
                return None, f'Parameter "{name}" must be one of enum values.'
        resolved[name] = coerced

    if missing_to_ask:
        bullets: list[str] = []
        for p in missing_to_ask:
            desc = str(p.get("description") or "").strip()
            pretty_name = str(p["name"]).replace("_", " ")
            if desc:
                bullets.append(f"  - {desc}")
            else:
                bullets.append(f"  - {pretty_name}")
        bullet_text = "\n".join(bullets)
        return None, (
            f"To help find the best matches for you, could you please share a few more details?\n"
            f"{bullet_text}\n\n"
            f"Feel free to say \"any\" or \"doesn't matter\" for filters you'd like to skip."
        )

    if missing_required:
        pretty = ", ".join(missing_required)
        return None, (
            f"I need a bit more information to run this query. "
            f"Could you please provide: {pretty}?"
        )

    logger.info(
        "template parameter resolution template_name=%s placeholders=%s resolved=%s",
        str(template.get("name") or ""),
        placeholders,
        json.dumps(resolved, ensure_ascii=False, default=str),
    )
    return resolved, None


def _row_count_from_db_answer(db_answer: str) -> int:
    try:
        parsed = json.loads(str(db_answer or ""))
    except Exception:
        return 0
    if not isinstance(parsed, dict):
        return 0
    rows = parsed.get("rows")
    if not isinstance(rows, list):
        return 0
    return len(rows)


def _build_large_result_followup_message(
    *,
    template: dict[str, Any],
    resolved_params: dict[str, Any],
    dialect: str,
    row_count: int,
) -> str:
    placeholders = _extract_template_placeholders(template, dialect)
    schema_obj = template.get("parameter_schema")
    schema_by_key: dict[str, dict[str, Any]] = {}
    if isinstance(schema_obj, dict):
        raw_params = schema_obj.get("parameters")
        if isinstance(raw_params, list):
            for item in raw_params:
                if not isinstance(item, dict):
                    continue
                pname = str(item.get("name") or "").strip().lower()
                if pname:
                    schema_by_key[pname] = item

    bullets: list[str] = []
    seen: set[str] = set()
    for name in placeholders:
        key = str(name).strip().lower()
        if not key or key in {"limit", "offset"}:
            continue
        value = resolved_params.get(name)
        if value is None and key in resolved_params:
            value = resolved_params.get(key)
        if value is not None and str(value).strip():
            continue

        schema_item = schema_by_key.get(key) or {}
        desc = str(schema_item.get("description") or "").strip()
        label = desc or str(name).replace("_", " ")
        norm = label.lower().strip()
        if not norm or norm in seen:
            continue
        seen.add(norm)
        bullets.append(f"  - {label}")

    if bullets:
        bullet_text = "\n".join(bullets)
        return (
            f"I found {row_count} matching records, which is too many to show at once. "
            f"To narrow this down, could you share one or more of these details?\n"
            f"{bullet_text}\n\n"
            "You can also say \"any\" or \"doesn't matter\" for filters you want to skip."
        )

    return (
        f"I found {row_count} matching records, which is too many to show at once. "
        "Could you please narrow it down with additional filters "
        "(for example city, area, budget range, or property type)?"
    )


def _followup_for_large_template_result(
    *,
    template: dict[str, Any],
    resolved_params: dict[str, Any],
    dialect: str,
    db_answer: str,
) -> str | None:
    row_count = _row_count_from_db_answer(db_answer)
    if row_count <= MAX_TEMPLATE_RESULT_ROWS_BEFORE_FOLLOWUP:
        return None
    return _build_large_result_followup_message(
        template=template,
        resolved_params=resolved_params,
        dialect=dialect,
        row_count=row_count,
    )


def _sql_literal(v: Any) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        s = json.dumps(v, ensure_ascii=False, default=str)
    else:
        s = str(v)
    s = s.replace("\\", "\\\\").replace("'", "''")
    return f"'{s}'"


def _bind_sql_template_params(sql: str, params: dict[str, Any]) -> tuple[str, str | None]:
    out = str(sql or "")
    placeholders = _extract_sql_placeholders(out)
    for name in placeholders:
        if name not in params:
            return out, f'Missing SQL template parameter "{name}".'
        lit = _sql_literal(params.get(name))
        pattern = re.compile(rf"(^|[^:]):{re.escape(name)}\b")
        out = pattern.sub(lambda m: f"{m.group(1)}{lit}", out)
    leftover = _extract_sql_placeholders(out)
    if leftover:
        return out, f"Unresolved SQL template parameters: {', '.join(leftover)}"
    return out, None


def _apply_mongo_template_params(node: Any, params: dict[str, Any]) -> Any:
    if isinstance(node, dict):
        return {k: _apply_mongo_template_params(v, params) for k, v in node.items()}
    if isinstance(node, list):
        return [_apply_mongo_template_params(v, params) for v in node]
    if isinstance(node, str):
        exact = re.fullmatch(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}", node)
        if exact:
            key = str(exact.group(1) or "").strip()
            return params.get(key)

        def _replace(m: re.Match[str]) -> str:
            key = str(m.group(1) or "").strip()
            val = params.get(key)
            return "" if val is None else str(val)

        return re.sub(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}", _replace, node)
    return node


def _load_db_context(
    supabase: Client,
    *,
    project_agent_id: str,
) -> tuple[list[dict[str, Any]], list[str], str]:
    sch = (
        supabase.table("document_database_schemas")
        .select("id, schema_sql, schema_snapshot, database_name")
        .eq("project_agent_id", project_agent_id)
        .eq("is_deleted", False)
        .execute()
    )
    schema_rows = list(sch.data or [])
    if not schema_rows:
        return [], [], ""

    schema_id = str(schema_rows[0]["id"])
    db_name = str(schema_rows[0].get("database_name") or "database")

    snap = schema_rows[0].get("schema_snapshot")
    sql = str(schema_rows[0].get("schema_sql") or "")

    names: list[str] = []
    names.extend(table_names_from_snapshot(snap))
    names.extend(extract_table_names_from_sql_ddl(sql))
    names = list(dict.fromkeys(names))

    trows = (
        supabase.table("document_database_table_data")
        .select("schema_name, table_name, table_data")
        .eq("schema_id", schema_id)
        .eq("project_agent_id", project_agent_id)
        .execute()
    )
    table_rows = list(trows.data or [])
    return table_rows, names, db_name


def _load_live_db_context(
    supabase: Client,
    *,
    project_agent_id: str,
) -> dict[str, Any] | None:
    logger.info("live_db_context_load start project_agent_id=%s", project_agent_id)
    conn_q = (
        supabase.table("database_connections")
        .select("id, database_id, database_name, host, port, username, ssl_mode, status, query_mode")
        .eq("project_agent_id", project_agent_id)
        .eq("is_deleted", False)
        .eq("status", "connected")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    conn_rows = list(conn_q.data or [])
    if not conn_rows:
        logger.info("live_db_context_load no connected database_connection found project_agent_id=%s", project_agent_id)
        return None
    conn_row = conn_rows[0]
    conn_id = str(conn_row.get("id") or "")
    logger.info(
        "live_db_context_load connection found connection_id=%s db_name=%s host=%s status=%s",
        conn_id,
        str(conn_row.get("database_name") or ""),
        str(conn_row.get("host") or ""),
        str(conn_row.get("status") or ""),
    )

    def _load_secret_rows() -> list[dict[str, Any]]:
        res = (
            supabase.table("database_connection_secrets")
            .select("password_value, ssl_ca_pem")
            .eq("connection_id", conn_id)
            .limit(1)
            .execute()
        )
        return list(res.data or [])

    def _load_schema_snapshot() -> dict[str, Any] | None:
        res = (
            supabase.table("database_connection_schemas")
            .select("schema_snapshot")
            .eq("connection_id", conn_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = list(res.data or [])
        snap = rows[0].get("schema_snapshot") if rows else None
        return snap if isinstance(snap, dict) else None

    dbid = str(conn_row.get("database_id") or "").strip()

    def _load_db_identifier() -> str:
        if not dbid:
            return "mysql"
        res = (
            supabase.table("databases")
            .select("identifier")
            .eq("id", dbid)
            .limit(1)
            .execute()
        )
        rows = list(res.data or [])
        if not rows:
            return "mysql"
        return str(rows[0].get("identifier") or "mysql").strip().lower()

    # Fan-out: these reads are independent once connection row is known.
    with ThreadPoolExecutor(max_workers=3) as ex:
        fut_secret = ex.submit(_load_secret_rows)
        fut_schema = ex.submit(_load_schema_snapshot)
        fut_identifier = ex.submit(_load_db_identifier)
        secret_rows = fut_secret.result()
        schema_snapshot = fut_schema.result()
        db_identifier = fut_identifier.result()

    if not secret_rows:
        logger.warning("live_db_context_load no secrets found connection_id=%s", conn_id)
        return None
    secret_row = secret_rows[0]
    password = str(secret_row.get("password_value") or "")
    if not password:
        logger.warning("live_db_context_load empty password connection_id=%s", conn_id)
        return None

    if not schema_snapshot:
        logger.warning("live_db_context_load no schema_snapshot found connection_id=%s", conn_id)
        return None

    dialect = str(schema_snapshot.get("dialect") or "").strip().lower()
    if not dialect:
        dialect = "mongodb" if db_identifier == "mongodb" else "mysql"

    table_names = table_names_from_snapshot(schema_snapshot)
    collection_names = collection_names_from_snapshot(schema_snapshot)
    logger.info(
        "live_db_context_load resolved connection_id=%s dialect=%s db_identifier=%s tables=%d collections=%d",
        conn_id, dialect, db_identifier, len(table_names), len(collection_names),
    )
    if dialect == "mongodb" and not collection_names:
        logger.warning("live_db_context_load mongodb dialect but no collections connection_id=%s", conn_id)
        return None
    if dialect != "mongodb" and not table_names:
        logger.warning("live_db_context_load sql dialect but no tables connection_id=%s dialect=%s", conn_id, dialect)
        return None

    qm_raw = str(conn_row.get("query_mode") or "template_only").strip().lower()
    if qm_raw not in ("generated", "template_preferred", "template_only"):
        qm_raw = "template_only"

    logger.info(
        "live_db_context_load success connection_id=%s dialect=%s query_mode=%s",
        conn_id, dialect, qm_raw,
    )
    return {
        "connection_id": conn_id,
        "query_mode": qm_raw,
        "database_name": str(conn_row.get("database_name") or "database"),
        "host": str(conn_row.get("host") or ""),
        "port": int(conn_row.get("port") or 3306),
        "username": str(conn_row.get("username") or ""),
        "password": password,
        "ssl_mode": str(conn_row.get("ssl_mode") or "required"),
        "ssl_ca_pem": str(secret_row.get("ssl_ca_pem") or ""),
        "dialect": dialect,
        "database_identifier": db_identifier,
        "table_names": table_names,
        "collection_names": collection_names,
        "schema_snapshot": schema_snapshot,
    }


def _resolve_generation_config(
    model_config_overrides: dict[str, Any] | None,
    default_temperature: float = 0.4,
) -> GenerationConfig:
    temp = default_temperature
    top_p: float | None = None
    top_k: int | None = None
    max_tokens: int | None = None

    if model_config_overrides and isinstance(model_config_overrides, dict):
        if "temperature" in model_config_overrides:
            try:
                temp = float(model_config_overrides["temperature"])
            except (ValueError, TypeError):
                pass
        if "top_p" in model_config_overrides:
            try:
                top_p = float(model_config_overrides["top_p"])
            except (ValueError, TypeError):
                pass
        if "top_k" in model_config_overrides:
            try:
                top_k = int(model_config_overrides["top_k"])
            except (ValueError, TypeError):
                pass
        if "max_output_tokens" in model_config_overrides:
            try:
                max_tokens = int(model_config_overrides["max_output_tokens"])
            except (ValueError, TypeError):
                pass

    return GenerationConfig(
        temperature=temp,
        top_p=top_p,
        top_k=top_k,
        max_output_tokens=max_tokens,
    )


def _build_llm_client_for_agent(
    settings: Settings,
    supabase: Client,
    project_agent_id: str,
) -> tuple[LLMClient, str]:
    resolved = resolve_model_for_project_agent(supabase, project_agent_id)
    if resolved:
        logger.info(
            "LLM resolved: provider=%s model=%s display=%s project_agent_id=%s",
            resolved.provider_name, resolved.model_identifier,
            resolved.display_name, project_agent_id,
        )
        client = build_llm_client(resolved.provider_name, resolved.model_identifier)
        return client, resolved.model_identifier

    logger.info(
        "LLM fallback: provider=%s model=%s project_agent_id=%s",
        settings.fallback_provider, settings.fallback_chat_model, project_agent_id,
    )
    client = build_llm_client(settings.fallback_provider, settings.fallback_chat_model)
    return client, settings.fallback_chat_model


# --- In-memory TTL caches for hot prep-phase reads ----------------------------
# These prep reads (model resolution + live DB context) change rarely (minutes/hours)
# but were being re-fetched on every chat turn, contributing ~1-3s to TTFT.
# A short-lived cache (60s) keyed by project_agent_id is safe: schema refreshes,
# model swaps, and connection changes recover within the TTL window.
_PREP_CACHE_TTL_S = 60.0
_LLM_CLIENT_CACHE: dict[str, tuple[float, LLMClient, str]] = {}
_LLM_CLIENT_CACHE_LOCK = Lock()
_LIVE_CTX_CACHE: dict[str, tuple[float, dict[str, Any] | None]] = {}
_LIVE_CTX_CACHE_LOCK = Lock()


def _build_llm_client_for_agent_cached(
    settings: Settings,
    supabase: Client,
    project_agent_id: str,
) -> tuple[LLMClient, str]:
    now = time.monotonic()
    with _LLM_CLIENT_CACHE_LOCK:
        hit = _LLM_CLIENT_CACHE.get(project_agent_id)
        if hit and (now - hit[0]) < _PREP_CACHE_TTL_S:
            return hit[1], hit[2]
    client, model_name = _build_llm_client_for_agent(settings, supabase, project_agent_id)
    with _LLM_CLIENT_CACHE_LOCK:
        _LLM_CLIENT_CACHE[project_agent_id] = (time.monotonic(), client, model_name)
    return client, model_name


def _load_live_db_context_cached(
    supabase: Client,
    *,
    project_agent_id: str,
) -> dict[str, Any] | None:
    now = time.monotonic()
    with _LIVE_CTX_CACHE_LOCK:
        hit = _LIVE_CTX_CACHE.get(project_agent_id)
        if hit and (now - hit[0]) < _PREP_CACHE_TTL_S:
            return hit[1]
    ctx = _load_live_db_context(supabase, project_agent_id=project_agent_id)
    with _LIVE_CTX_CACHE_LOCK:
        _LIVE_CTX_CACHE[project_agent_id] = (time.monotonic(), ctx)
    return ctx


def _run_rag_retrieval(
    *,
    embedder: GeminiEmbedder,
    supabase: Client,
    user_message: str,
    project_agent_id: str,
    match_chunk_limit: int,
) -> tuple[list[dict[str, Any]], str | None]:
    """Run embedding + similarity search. Returns (chunks, error_message)."""
    try:
        qvec = embedder.embed_query(user_message)
    except Exception as e:
        return [], f"embedding_failed: {e}"
    try:
        chunks = retrieve_similar_chunks(
            supabase,
            query_embedding=qvec,
            project_agent_id=project_agent_id,
            limit=match_chunk_limit,
        )
        return list(chunks or []), None
    except Exception as e:
        return [], str(e)


MAX_SQL_PIPELINE_ATTEMPTS = 2
MAX_MONGO_PIPELINE_ATTEMPTS = 2
MAX_TEMPLATE_RESULT_ROWS_BEFORE_FOLLOWUP = 50


_SUPPORTED_LIVE_SQL_DIALECTS = frozenset({"mysql"})


def _run_select_live_sql(
    *,
    dialect: str,
    host: str,
    port: int,
    user: str,
    password: str,
    database: str,
    sql: str,
    allowed_tables: set[str],
    ssl_mode: str,
    ssl_ca_pem: str,
    max_rows: int = 200,
) -> tuple[list[str], list[dict[str, Any]]]:
    """Dispatch live SQL execution to the dialect-specific runner.

    Currently only MySQL is implemented.  When PostgreSQL (or another
    relational DB) is added, import its runner here and add a branch.
    """
    if dialect not in _SUPPORTED_LIVE_SQL_DIALECTS:
        raise ValueError(
            f"Live SQL execution is not yet supported for dialect '{dialect}'. "
            f"Supported: {', '.join(sorted(_SUPPORTED_LIVE_SQL_DIALECTS))}."
        )
    return run_select_mysql(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        sql=sql,
        allowed_tables=allowed_tables,
        ssl_mode=ssl_mode,
        ssl_ca_pem=ssl_ca_pem,
        max_rows=max_rows,
    )


def _default_port_for_dialect(dialect: str) -> int:
    if dialect in ("postgresql", "postgres"):
        return 5432
    return 3306


def _run_db_pipeline_live_sql(
    *,
    settings: Settings,
    tc: _TokenCounter,
    user_message: str,
    schema_detail: str,
    db_label: str,
    live_ctx: dict[str, Any],
    allow: set[str],
    schema_columns: dict[str, set[str]],
    dialect: str = "mysql",
) -> tuple[str, str]:
    """3-LLM pipeline for live SQL (dialect-aware): generate → execute → verify → maybe retry.

    Returns (db_answer, sql_used).
    """
    if dialect not in _SUPPORTED_LIVE_SQL_DIALECTS:
        return (
            f"[Live SQL pipeline is not yet supported for dialect '{dialect}'. "
            f"Supported: {', '.join(sorted(_SUPPORTED_LIVE_SQL_DIALECTS))}.]",
            "",
        )

    db_answer = ""
    sql_used = ""
    prev_error: str | None = None
    default_port = _default_port_for_dialect(dialect)

    for attempt in range(MAX_SQL_PIPELINE_ATTEMPTS):
        sql_used_new, gen_usage = generate_sql(
            settings,
            user_message=user_message,
            schema_detail=schema_detail,
            db_label=db_label,
            dialect=dialect,
            previous_sql=sql_used if attempt > 0 else None,
            previous_error=prev_error,
        )
        tc.add(gen_usage)
        if not sql_used_new:
            logger.warning("DB pipeline source=live_%s sql_generator returned empty SQL attempt=%d", dialect, attempt)
            break
        sql_used = sql_used_new
        logger.info("DB pipeline source=live_%s sql_generator attempt=%d sql=%s", dialect, attempt, sql_used)

        ok, schema_err = _validate_sql_qualified_refs_against_snapshot(sql_used, schema_columns)
        if not ok:
            logger.warning("DB pipeline source=live_%s schema_validation_error=%s attempt=%d", dialect, schema_err, attempt)
            db_answer = f"[SQL error: {schema_err}]"
            prev_error = schema_err
            continue

        try:
            logger.info(
                "DB pipeline source=live_%s executing attempt=%d visitor_question=%s sql=%s",
                dialect,
                attempt,
                user_message,
                sql_used,
            )
            cols, rows = _run_select_live_sql(
                dialect=dialect,
                host=str(live_ctx.get("host") or ""),
                port=int(live_ctx.get("port") or default_port),
                user=str(live_ctx.get("username") or ""),
                password=str(live_ctx.get("password") or ""),
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
            logger.warning(
                "DB pipeline source=live_%s exec_error=%s attempt=%d visitor_question=%s sql=%s raw_error=%r",
                dialect,
                e,
                attempt,
                user_message,
                sql_used,
                e,
            )
            db_answer = f"[SQL error: {e}]"

        verdict, ver_usage = verify_sql_result(
            settings,
            user_message=user_message,
            schema_detail=schema_detail,
            sql=sql_used,
            query_result=db_answer,
        )
        tc.add(ver_usage)
        logger.info(
            "DB pipeline source=live_%s verifier attempt=%d verdict=%s reason=%s",
            dialect, attempt, verdict.get("verdict"), verdict.get("reason"),
        )

        if verdict.get("verdict") == "pass":
            break

        prev_error = verdict.get("feedback") or verdict.get("reason") or db_answer
        if attempt == MAX_SQL_PIPELINE_ATTEMPTS - 1:
            logger.info("DB pipeline source=live_%s max attempts reached, forwarding last result", dialect)

    return db_answer, sql_used


def _run_db_pipeline_sqlite(
    *,
    settings: Settings,
    tc: _TokenCounter,
    user_message: str,
    schema_detail: str,
    db_label: str,
    conn: Any,
    allow: set[str],
) -> tuple[str, str]:
    """3-LLM pipeline for uploaded SQLite: generate SQL → execute → verify → maybe retry.

    Returns (db_answer, sql_used).
    """
    db_answer = ""
    sql_used = ""
    prev_error: str | None = None

    for attempt in range(MAX_SQL_PIPELINE_ATTEMPTS):
        # --- Step 1: SQL Generator LLM ---
        sql_used_new, gen_usage = generate_sql(
            settings,
            user_message=user_message,
            schema_detail=schema_detail,
            db_label=db_label,
            dialect="sqlite",
            previous_sql=sql_used if attempt > 0 else None,
            previous_error=prev_error,
        )
        tc.add(gen_usage)
        if not sql_used_new:
            logger.warning("DB pipeline source=upload_sqlite sql_generator returned empty SQL attempt=%d", attempt)
            break
        sql_used = sql_used_new
        logger.info("DB pipeline source=upload_sqlite sql_generator attempt=%d sql=%s", attempt, sql_used)

        # --- Step 2: Execute ---
        try:
            cols, rows = run_select(conn, sql_used, allowed_tables=allow)
            if rows:
                db_answer = json.dumps(
                    {"columns": cols, "rows": rows},
                    ensure_ascii=False,
                    default=str,
                )
            else:
                db_answer = "[Query returned 0 rows]"
        except ValueError as e:
            logger.warning("DB pipeline source=upload_sqlite exec_error=%s attempt=%d", e, attempt)
            db_answer = f"[SQL error: {e}]"

        # --- Step 3: SQL Verifier LLM ---
        verdict, ver_usage = verify_sql_result(
            settings,
            user_message=user_message,
            schema_detail=schema_detail,
            sql=sql_used,
            query_result=db_answer,
        )
        tc.add(ver_usage)
        logger.info(
            "DB pipeline source=upload_sqlite verifier attempt=%d verdict=%s reason=%s",
            attempt, verdict.get("verdict"), verdict.get("reason"),
        )

        if verdict.get("verdict") == "pass":
            break

        prev_error = verdict.get("feedback") or verdict.get("reason") or db_answer
        if attempt == MAX_SQL_PIPELINE_ATTEMPTS - 1:
            logger.info("DB pipeline source=upload_sqlite max attempts reached, forwarding last result")

    return db_answer, sql_used


def _run_db_pipeline_live_mongo(
    *,
    settings: Settings,
    tc: _TokenCounter,
    user_message: str,
    schema_detail: str,
    db_label: str,
    live_ctx: dict[str, Any],
    allow: set[str],
) -> tuple[str, str]:
    db_answer = ""
    mongo_used = ""
    prev_error: str | None = None

    for attempt in range(MAX_MONGO_PIPELINE_ATTEMPTS):
        spec, spec_raw, gen_usage = generate_mongo_query(
            settings,
            user_message=user_message,
            schema_detail=schema_detail,
            db_label=db_label,
            previous_spec=mongo_used if attempt > 0 else None,
            previous_error=prev_error,
        )
        tc.add(gen_usage)
        if not spec:
            logger.warning("DB pipeline source=live_mongo query_generator returned empty spec attempt=%d", attempt)
            break
        mongo_used = spec_raw or json.dumps(spec, ensure_ascii=False)
        logger.info("DB pipeline source=live_mongo query_generator attempt=%d spec=%s", attempt, mongo_used)

        try:
            logger.info(
                "DB pipeline source=live_mongo executing attempt=%d visitor_question=%s query_spec=%s",
                attempt,
                user_message,
                mongo_used,
            )
            cols, rows = run_query_mongo(
                host=str(live_ctx.get("host") or ""),
                port=int(live_ctx.get("port") or 27017),
                user=str(live_ctx.get("username") or ""),
                password=str(live_ctx.get("password") or ""),
                database=db_label,
                query_spec=spec,
                allowed_collections=allow,
                ssl_mode=str(live_ctx.get("ssl_mode") or "required"),
                ssl_ca_pem=str(live_ctx.get("ssl_ca_pem") or ""),
                max_rows=200,
            )
            if rows:
                db_answer = json.dumps({"columns": cols, "rows": rows}, ensure_ascii=False, default=str)
            else:
                db_answer = "[Query returned 0 rows]"
        except ValueError as e:
            logger.warning(
                "DB pipeline source=live_mongo exec_error=%s attempt=%d visitor_question=%s query_spec=%s raw_error=%r",
                e,
                attempt,
                user_message,
                mongo_used,
                e,
            )
            db_answer = f"[Mongo error: {e}]"

        verdict, ver_usage = verify_mongo_result(
            settings,
            user_message=user_message,
            schema_detail=schema_detail,
            query_spec_json=mongo_used,
            query_result=db_answer,
        )
        tc.add(ver_usage)
        logger.info(
            "DB pipeline source=live_mongo verifier attempt=%d verdict=%s reason=%s",
            attempt, verdict.get("verdict"), verdict.get("reason"),
        )

        if verdict.get("verdict") == "pass":
            break

        prev_error = verdict.get("feedback") or verdict.get("reason") or db_answer

    return db_answer, mongo_used


def _execute_live_sql_template(
    *,
    settings: Settings,
    tc: _TokenCounter,
    user_message: str,
    schema_detail: str,
    db_label: str,
    live_ctx: dict[str, Any],
    allowed_tables: set[str],
    schema_columns: dict[str, set[str]],
    template: dict[str, Any],
    resolved_params: dict[str, Any],
    dialect: str = "mysql",
    query_mode: str = "template_only",
) -> tuple[str, str]:
    """Run a stored SQL template (read-only, dialect-aware), then verifier."""
    template_sql = str(template.get("sql_text") or "").strip()
    if not template_sql:
        return "[Query template has no SQL text.]", ""
    sql_used, bind_err = _bind_sql_template_params(template_sql, resolved_params)
    if bind_err:
        return f"[SQL error: {bind_err}]", template_sql
    ok, schema_err = _validate_sql_qualified_refs_against_snapshot(sql_used, schema_columns)
    if not ok:
        return f"[SQL error: {schema_err}]", sql_used

    if dialect not in _SUPPORTED_LIVE_SQL_DIALECTS:
        return (
            f"[SQL template execution is not yet supported for dialect '{dialect}'. "
            f"Supported: {', '.join(sorted(_SUPPORTED_LIVE_SQL_DIALECTS))}.]",
            sql_used,
        )

    default_port = _default_port_for_dialect(dialect)
    db_answer = ""
    try:
        logger.info(
            "live_sql_template_execute dialect=%s template_name=%s visitor_question=%s sql=%s params=%s",
            dialect,
            str(template.get("name") or ""),
            user_message,
            sql_used,
            json.dumps(resolved_params, ensure_ascii=False, default=str),
        )
        cols, rows = _run_select_live_sql(
            dialect=dialect,
            host=str(live_ctx.get("host") or ""),
            port=int(live_ctx.get("port") or default_port),
            user=str(live_ctx.get("username") or ""),
            password=str(live_ctx.get("password") or ""),
            database=db_label,
            sql=sql_used,
            allowed_tables=allowed_tables,
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
        logger.warning(
            "live SQL template exec_error=%s dialect=%s visitor_question=%s sql=%s raw_error=%r",
            e,
            dialect,
            user_message,
            sql_used,
            e,
        )
        return f"[SQL error: {e}]", sql_used

    if query_mode != "template_only":
        verdict, ver_usage = verify_sql_result(
            settings,
            user_message=user_message,
            schema_detail=schema_detail,
            sql=sql_used,
            query_result=db_answer,
        )
        tc.add(ver_usage)
    else:
        logger.info("Skipping SQL verifier for template_only mode")
    return db_answer, sql_used


def _execute_live_mongo_template(
    *,
    settings: Settings,
    tc: _TokenCounter,
    user_message: str,
    schema_detail: str,
    db_label: str,
    live_ctx: dict[str, Any],
    allowed_collections: set[str],
    template: dict[str, Any],
    resolved_params: dict[str, Any],
    query_mode: str = "template_only",
) -> tuple[str, str]:
    """Run a stored mongo_json template, then verifier (skipped for template_only)."""
    tpl_name = str(template.get("name") or "")
    body_src = template.get("query_body")
    if not isinstance(body_src, dict):
        logger.warning("mongo template invalid query_body (not dict) template_name=%s", tpl_name)
        return "[Invalid Mongo query template: query_body must be a JSON object.]", ""
    body = _apply_mongo_template_params(body_src, resolved_params)
    if not isinstance(body, dict):
        logger.warning("mongo template invalid after param binding template_name=%s", tpl_name)
        return "[Invalid Mongo query template after parameter binding.]", ""
    mongo_used = json.dumps(body, ensure_ascii=False)
    try:
        logger.info(
            "live_mongo_template_execute template_name=%s visitor_question=%s query_spec=%s params=%s",
            str(template.get("name") or ""),
            user_message,
            mongo_used,
            json.dumps(resolved_params, ensure_ascii=False, default=str),
        )
        cols, rows = run_query_mongo(
            host=str(live_ctx.get("host") or ""),
            port=int(live_ctx.get("port") or 27017),
            user=str(live_ctx.get("username") or ""),
            password=str(live_ctx.get("password") or ""),
            database=db_label,
            query_spec=body,
            allowed_collections=allowed_collections,
            ssl_mode=str(live_ctx.get("ssl_mode") or "required"),
            ssl_ca_pem=str(live_ctx.get("ssl_ca_pem") or ""),
            max_rows=200,
        )
        if rows:
            db_answer = json.dumps({"columns": cols, "rows": rows}, ensure_ascii=False, default=str)
            logger.info(
                "live_mongo_template_result template_name=%s rows=%d columns=%s",
                tpl_name, len(rows), ",".join(cols) if cols else "(empty)",
            )
        else:
            op = str(body.get("operation") or "").strip().lower()
            filt = body.get("filter")
            did_relaxed_retry = False
            if op == "find" and isinstance(filt, dict) and "status" in filt:
                relaxed_filter = dict(filt)
                relaxed_filter.pop("status", None)
                relaxed_body = dict(body)
                relaxed_body["filter"] = relaxed_filter
                logger.info(
                    "live_mongo_template_retry_relaxed_filter template_name=%s reason=0_rows removed=status",
                    tpl_name,
                )
                r_cols, r_rows = run_query_mongo(
                    host=str(live_ctx.get("host") or ""),
                    port=int(live_ctx.get("port") or 27017),
                    user=str(live_ctx.get("username") or ""),
                    password=str(live_ctx.get("password") or ""),
                    database=db_label,
                    query_spec=relaxed_body,
                    allowed_collections=allowed_collections,
                    ssl_mode=str(live_ctx.get("ssl_mode") or "required"),
                    ssl_ca_pem=str(live_ctx.get("ssl_ca_pem") or ""),
                    max_rows=200,
                )
                if r_rows:
                    did_relaxed_retry = True
                    mongo_used = json.dumps(relaxed_body, ensure_ascii=False)
                    cols = r_cols
                    rows = r_rows
                    db_answer = json.dumps({"columns": cols, "rows": rows}, ensure_ascii=False, default=str)
                    logger.info(
                        "live_mongo_template_retry_relaxed_filter_success template_name=%s rows=%d columns=%s",
                        tpl_name, len(rows), ",".join(cols) if cols else "(empty)",
                    )
            if not did_relaxed_retry:
                db_answer = "[Query returned 0 rows]"
                logger.info("live_mongo_template_result template_name=%s rows=0", tpl_name)
    except ValueError as e:
        logger.warning(
            "live Mongo template exec_error=%s visitor_question=%s query_spec=%s raw_error=%r",
            e,
            user_message,
            mongo_used,
            e,
        )
        return f"[Mongo error: {e}]", mongo_used

    if query_mode != "template_only":
        verdict, ver_usage = verify_mongo_result(
            settings,
            user_message=user_message,
            schema_detail=schema_detail,
            query_spec_json=mongo_used,
            query_result=db_answer,
        )
        tc.add(ver_usage)
    else:
        logger.info("Skipping Mongo verifier for template_only mode")
    return db_answer, mongo_used


def run_rag_agent_turn(
    *,
    settings: Settings,
    supabase: Client,
    embedder: GeminiEmbedder,
    organization_id: str,
    project_id: str,
    project_agent_id: str,
    user_message: str,
    history: list[dict[str, str]],
    system_instruction: str | None = None,
    model_config_overrides: dict[str, Any] | None = None,
    on_reply_delta: Callable[[str], None] | None = None,
    on_phase: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    _ = organization_id, project_id

    def _phase(name: str) -> None:
        """Best-effort phase signal; never let UI callbacks break the turn."""
        if on_phase is None:
            return
        try:
            on_phase(name)
        except Exception:
            logger.debug("on_phase callback raised; continuing", exc_info=True)

    turn_started = time.monotonic()
    tc = _TokenCounter()
    ctx = ""
    sources: list[dict[str, Any]] = []

    # ------------------------------------------------------------------
    # Speculative prep fan-out (parallel I/O).
    # Without knowing the router's decision, we still know that:
    #   - we WILL need an LLM client,
    #   - we MIGHT need RAG chunks (if mode is rag/both),
    #   - we MIGHT need live DB context (if mode is db/both).
    # All three are independent I/O. We fire them concurrently; the wasted
    # branch (e.g. db context when mode=rag) costs only cheap Supabase reads
    # but saves ~2-3 seconds of sequential wall-clock time on the critical
    # path to first token.
    # ------------------------------------------------------------------
    hist_lines = "\n".join(f"{m.get('role', 'user')}: {m.get('content', '')}" for m in history[-8:])
    route_prompt = f"""You are a router for a support agent.
Classify the latest user message into one of:
- "rag" — needs document knowledge, policies, explanations, semantic search
- "db" — needs structured data: counts, lists, filters, joins, aggregations, SQL-style questions over exported data
- "both" — needs both

Conversation (recent):
{hist_lines}

Latest user message:
{user_message}

Respond with JSON only: {{"mode":"rag"|"db"|"both","reason":"short"}}"""

    prep_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="rag-prep")
    try:
        fut_llm = prep_executor.submit(
            _build_llm_client_for_agent_cached, settings, supabase, project_agent_id,
        )
        fut_live_ctx = prep_executor.submit(
            _load_live_db_context_cached, supabase, project_agent_id=project_agent_id,
        )
        fut_retrieval = prep_executor.submit(
            _run_rag_retrieval,
            embedder=embedder,
            supabase=supabase,
            user_message=user_message,
            project_agent_id=project_agent_id,
            match_chunk_limit=settings.match_chunk_limit,
        )

        # Router depends on llm_client; kick it off the moment the client is ready,
        # still in the shared executor so it overlaps with the other prep futures.
        llm_client, model_name = fut_llm.result()

        def _route_worker() -> tuple[dict[str, Any], LLMUsage]:
            data, usage = llm_client.generate_json(route_prompt)
            return data, usage

        fut_route = prep_executor.submit(_route_worker)

        # Wait for all prep futures together. Total wall-clock ≈ max(router, retrieval, live_ctx).
        retrieval_chunks, retrieval_err = fut_retrieval.result()
        live_ctx = fut_live_ctx.result()
        route, route_usage = fut_route.result()
        tc.add(route_usage)
    finally:
        prep_executor.shutdown(wait=False)

    mode = str(route.get("mode") or "rag").lower()
    if mode not in ("rag", "db", "both"):
        mode = "rag"
    logger.info(
        "RAG turn routed mode=%s prep_ms=%d project_agent_id=%s",
        mode,
        int((time.monotonic() - turn_started) * 1000),
        project_agent_id,
    )

    # 2) RAG branch — reuse the speculatively fetched chunks if needed.
    if mode in ("rag", "both"):
        if retrieval_err:
            ctx += f"\n[Retrieval error: {retrieval_err}]\n"
        for c in retrieval_chunks:
            content = str(c.get("content") or "")
            meta = c.get("metadata")
            sources.append(
                {
                    "chunk_id": str(c.get("id")),
                    "similarity": c.get("similarity"),
                    "metadata": meta,
                }
            )
            ctx += f"\n---\n{content}\n"

    # 3) DB branch — 3-LLM pipeline: sql_generator → execute → sql_verifier → (retry) → primary
    db_answer = ""
    sql_used = ""
    all_names: list[str] = []
    db_label = ""
    forced_reply = ""
    picked_template: dict[str, Any] | None = None
    selected_query_mode: str = "generated"
    template_only_suggestion_templates: list[dict[str, Any]] = []
    if mode in ("db", "both"):
        # live_ctx was fetched speculatively above in the prep fan-out.
        if not live_ctx:
            logger.info("live_db_context returned None, falling back to upload_sqlite project_agent_id=%s", project_agent_id)
        if live_ctx:
            live_dialect = str(live_ctx.get("dialect") or "mysql").lower()
            db_label = str(live_ctx.get("database_name") or "database")
            query_mode = str(live_ctx.get("query_mode") or "template_only").strip().lower()
            if query_mode not in ("generated", "template_preferred", "template_only"):
                query_mode = "template_only"
            selected_query_mode = query_mode

            logger.info(
                "DB branch source=live_%s host=%s db=%s query_mode=%s project_agent_id=%s",
                live_dialect,
                str(live_ctx.get("host") or ""),
                db_label,
                query_mode,
                project_agent_id,
            )

            db_answer_err = ""

            if query_mode != "generated":
                conn_id = str(live_ctx.get("connection_id") or "").strip()
                raw_templates = load_active_query_templates(supabase, conn_id) if conn_id else []
                templates = filter_templates_by_dialect(raw_templates, live_dialect)
                if query_mode == "template_only":
                    template_only_suggestion_templates = templates
                logger.info(
                    "query templates: connection_id=%s raw=%d filtered=%d dialect=%s mode=%s",
                    conn_id,
                    len(raw_templates),
                    len(templates),
                    live_dialect,
                    query_mode,
                )
                if query_mode == "template_only":
                    if not templates:
                        db_answer_err = (
                            "[No active query templates are configured for this connection. "
                            "Ask an administrator to add templates in the project database settings.]"
                        )
                    else:
                        idx, pick_usage = pick_query_template_index(
                            llm_client,
                            user_message,
                            templates,
                        )
                        tc.add(pick_usage)
                        if idx is None:
                            logger.info("query templates: no template matched in template_only mode")
                            db_answer_err = (
                                "[No query template matched this question. "
                                "Try rephrasing or ask an administrator to adjust templates.]"
                            )
                        else:
                            logger.info(
                                "query templates: selected template_name=%s template_id=%s",
                                str(templates[idx].get("name") or ""),
                                str(templates[idx].get("id") or ""),
                            )
                            picked_template = templates[idx]
                elif query_mode == "template_preferred" and templates:
                    idx, pick_usage = pick_query_template_index(
                        llm_client,
                        user_message,
                        templates,
                    )
                    tc.add(pick_usage)
                    if idx is not None:
                        logger.info(
                            "query templates: selected template_name=%s template_id=%s",
                            str(templates[idx].get("name") or ""),
                            str(templates[idx].get("id") or ""),
                        )
                        picked_template = templates[idx]

            if picked_template is not None:
                resolved_params, param_err = _resolve_template_parameters(
                    llm_client=llm_client,
                    tc=tc,
                    user_message=user_message,
                    history=history,
                    template=picked_template,
                    dialect=live_dialect,
                )
                if param_err:
                    logger.info(
                        "query template parameters unresolved template_name=%s reason=%s",
                        str(picked_template.get("name") or ""),
                        param_err,
                    )
                    forced_reply = param_err
                elif resolved_params is None:
                    forced_reply = "I could not resolve template parameters for this query."
                elif live_dialect == "mongodb":
                    all_names = [str(x) for x in (live_ctx.get("collection_names") or []) if str(x)]
                    allow = set(all_names)
                    logger.info(
                        "mongo template execution start template_name=%s collections=%s db=%s",
                        str(picked_template.get("name") or ""),
                        ",".join(sorted(allow)),
                        db_label,
                    )
                    schema_detail = _build_mongo_schema_hint_from_snapshot(
                        live_ctx.get("schema_snapshot"),
                        allow,
                    )
                    db_answer, sql_used = _execute_live_mongo_template(
                        settings=settings,
                        tc=tc,
                        user_message=user_message,
                        schema_detail=schema_detail,
                        db_label=db_label,
                        live_ctx=live_ctx,
                        allowed_collections=allow,
                        template=picked_template,
                        resolved_params=resolved_params,
                        query_mode=query_mode,
                    )
                    logger.info(
                        "mongo template execution done template_name=%s has_answer=%s answer_is_error=%s",
                        str(picked_template.get("name") or ""),
                        bool(db_answer),
                        db_answer.startswith("[") if db_answer else False,
                    )
                else:
                    all_names = [str(x) for x in (live_ctx.get("table_names") or []) if str(x)]
                    allow = set(all_names)
                    schema_detail = _build_schema_hint_from_snapshot(live_ctx.get("schema_snapshot"), allow)
                    schema_columns = _schema_columns_from_snapshot(live_ctx.get("schema_snapshot"), allow)
                    db_answer, sql_used = _execute_live_sql_template(
                        settings=settings,
                        tc=tc,
                        user_message=user_message,
                        schema_detail=schema_detail,
                        db_label=db_label,
                        live_ctx=live_ctx,
                        allowed_tables=allow,
                        schema_columns=schema_columns,
                        template=picked_template,
                        resolved_params=resolved_params,
                        dialect=live_dialect,
                        query_mode=query_mode,
                    )
                if not forced_reply and resolved_params is not None and db_answer and not db_answer.startswith("["):
                    large_result_followup = _followup_for_large_template_result(
                        template=picked_template,
                        resolved_params=resolved_params,
                        dialect=live_dialect,
                        db_answer=db_answer,
                    )
                    if large_result_followup:
                        logger.info(
                            "query template refinement requested template_name=%s row_count=%s",
                            str(picked_template.get("name") or ""),
                            _row_count_from_db_answer(db_answer),
                        )
                        forced_reply = large_result_followup
            elif db_answer_err:
                db_answer = db_answer_err
                sql_used = ""
            elif query_mode in ("generated", "template_preferred"):
                if live_dialect == "mongodb":
                    all_names = [str(x) for x in (live_ctx.get("collection_names") or []) if str(x)]
                    picked = shortlist_tables(user_message, all_names)
                    allow = set(picked) if picked else set(all_names)
                    if not allow:
                        allow = set(all_names)
                    logger.info(
                        "mongo generated/template_preferred pipeline start collections=%s db=%s query_mode=%s",
                        ",".join(sorted(allow)),
                        db_label,
                        query_mode,
                    )
                    schema_detail = _build_mongo_schema_hint_from_snapshot(
                        live_ctx.get("schema_snapshot"),
                        allow,
                    )
                    db_answer, sql_used = _run_db_pipeline_live_mongo(
                        settings=settings,
                        tc=tc,
                        user_message=user_message,
                        schema_detail=schema_detail,
                        db_label=db_label,
                        live_ctx=live_ctx,
                        allow=allow,
                    )
                else:
                    all_names = [str(x) for x in (live_ctx.get("table_names") or []) if str(x)]
                    picked_tbl = shortlist_tables(user_message, all_names)
                    allow = set(picked_tbl) if picked_tbl else set(all_names)
                    if not allow:
                        allow = set(all_names)

                    schema_detail = _build_schema_hint_from_snapshot(live_ctx.get("schema_snapshot"), allow)
                    schema_columns = _schema_columns_from_snapshot(live_ctx.get("schema_snapshot"), allow)
                    _db_resolved = False

                    if settings.use_langchain_sql and not _db_resolved:
                        try:
                            db_answer, sql_used, lc_usage = run_langchain_live_sql(
                                settings,
                                user_message=user_message,
                                schema_detail=schema_detail,
                                db_label=db_label,
                                live_ctx=live_ctx,
                                allow=allow,
                                dialect=live_dialect,
                            )
                            tc.add(lc_usage)
                            _db_resolved = True
                            logger.info("DB branch source=langchain dialect=%s completed project_agent_id=%s", live_dialect, project_agent_id)
                        except Exception as e:
                            logger.warning(
                                "DB branch source=langchain dialect=%s failed; trying next pipeline: %s",
                                live_dialect,
                                e,
                            )

                    if settings.use_llamaindex_sql and not _db_resolved:
                        try:
                            db_answer, sql_used, li_usage = run_llamaindex_live_sql(
                                settings,
                                user_message=user_message,
                                schema_detail=schema_detail,
                                db_label=db_label,
                                live_ctx=live_ctx,
                                allow=allow,
                                dialect=live_dialect,
                            )
                            tc.add(li_usage)
                            _db_resolved = True
                            logger.info("DB branch source=llamaindex dialect=%s completed project_agent_id=%s", live_dialect, project_agent_id)
                        except Exception as e:
                            logger.warning(
                                "DB branch source=llamaindex dialect=%s failed; falling back to custom pipeline: %s",
                                live_dialect,
                                e,
                            )

                    if not _db_resolved:
                        db_answer, sql_used = _run_db_pipeline_live_sql(
                            settings=settings,
                            tc=tc,
                            user_message=user_message,
                            schema_detail=schema_detail,
                            db_label=db_label,
                            live_ctx=live_ctx,
                            allow=allow,
                            schema_columns=schema_columns,
                            dialect=live_dialect,
                        )

        if not live_ctx:
            table_rows, all_names, db_label = _load_db_context(supabase, project_agent_id=project_agent_id)
            if table_rows and all_names:
                logger.info(
                    "DB branch source=upload_sqlite tables=%s db=%s project_agent_id=%s",
                    len(all_names),
                    db_label,
                    project_agent_id,
                )
                picked = shortlist_tables(user_message, all_names)
                allow = set(picked) if picked else set(all_names)
                filtered = [r for r in table_rows if str(r.get("table_name")) in allow]
                if not filtered:
                    filtered = table_rows
                    allow = {str(r.get("table_name")) for r in filtered}

                conn = load_tables_into_sqlite(filtered)
                loaded_tables: set[str] = set()
                try:
                    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
                    loaded_tables = {row[0] for row in cur.fetchall()}
                except Exception:
                    loaded_tables = allow

                allow = allow & loaded_tables

                if allow:
                    schema_detail = _build_schema_hint(conn, allow)
                    db_answer, sql_used = _run_db_pipeline_sqlite(
                        settings=settings,
                        tc=tc,
                        user_message=user_message,
                        schema_detail=schema_detail,
                        db_label=db_label,
                        conn=conn,
                        allow=allow,
                    )

                conn.close()
            else:
                logger.info("DB branch source=upload_sqlite unavailable (no tables/schema)")

    ranked_template_only_suggestions = (
        _build_template_description_suggestions(template_only_suggestion_templates, user_message, max_items=3)
        if selected_query_mode == "template_only"
        else []
    )
    template_only_suggestions = (
        _rewrite_ranked_template_suggestions(
            llm_client=llm_client,
            tc=tc,
            user_message=user_message,
            ranked_suggestions=ranked_template_only_suggestions,
            max_items=3,
        )
        if ranked_template_only_suggestions
        else []
    )

    # 4) Final answer — apply system instruction and model config
    if forced_reply:
        reply = forced_reply.strip()
        return {
            "reply": reply,
            "sources": sources,
            "route": {
                "mode": mode,
                "reason": route.get("reason"),
            },
            "sql": sql_used or None,
            "suggestions": template_only_suggestions,
            "cards": [],
            "model_name": model_name,
            "tokens_input": tc.input,
            "tokens_output": tc.output,
        }

    db_answer_preview = (db_answer or "").strip().replace("\n", " ")
    if len(db_answer_preview) > 1200:
        db_answer_preview = f"{db_answer_preview[:1200]}...(truncated)"
    logger.info(
        "DB final context mode=%s has_live_ctx=%s db_label=%s sql_used=%s db_answer=%s",
        mode,
        bool(live_ctx) if mode in ("db", "both") else False,
        db_label,
        bool(sql_used),
        db_answer_preview if db_answer_preview else "(none)",
    )

    template_card_config: dict[str, Any] | None = None
    if picked_template is not None:
        raw_cc = picked_template.get("card_config")
        if isinstance(raw_cc, dict):
            template_card_config = raw_cc

    db_answer_for_llm = db_answer
    if template_card_config and not template_card_config.get("carouselEnabled"):
        excluded = template_card_config.get("conversationExcludedColumns")
        if isinstance(excluded, list) and excluded:
            db_answer_for_llm = _filter_excluded_columns_from_db_answer(db_answer, excluded)

    sys_block = ""
    if system_instruction and system_instruction.strip():
        sys_block = f"""
System instruction (from the project owner — follow this closely):
{system_instruction.strip()}
"""

    conversation_context = _build_conversation_context(history, user_message, max_turns=8)
    contact_snapshot = _extract_contact_snapshot(history, user_message)
    missing_contact_fields = [
        k
        for k in ("name", "email", "phone")
        if not str(contact_snapshot.get(k) or "").strip()
    ]
    logger.info(
        "final_reply_context contact_snapshot name=%s email_present=%s phone_present=%s missing=%s",
        str(contact_snapshot.get("name") or ""),
        bool(contact_snapshot.get("email")),
        bool(contact_snapshot.get("phone")),
        ",".join(missing_contact_fields) if missing_contact_fields else "(none)",
    )

    final_prompt = f"""You are a helpful assistant for website visitors.
{sys_block}
Use the following context when relevant.

Conversation history (recent turns):
{conversation_context}

Retrieved document excerpts:
{ctx if ctx else "(none)"}

Database query result (JSON or error):
{db_answer_for_llm if db_answer_for_llm else "(none)"}

Known visitor contact details already provided:
- name: {contact_snapshot.get("name") or "(missing)"}
- email: {contact_snapshot.get("email") or "(missing)"}
- phone: {contact_snapshot.get("phone") or "(missing)"}

User message:
{user_message}

RESPONSE GUIDELINES:
- Write a clear, natural-language answer. Do NOT dump raw data or JSON.
- If database results contain a list, present the key highlights conversationally (e.g. name, price, location). Do not repeat every column or ID.
- Cite numbers and counts accurately from the data.
- If the data is empty or an error occurred, say so honestly and suggest the visitor rephrase.
- If context is insufficient, say so.
- If contact info is requested by project instruction, ask ONLY for missing fields ({", ".join(missing_contact_fields) if missing_contact_fields else "none"}). Never ask again for details already provided above.
- For product/data questions, do not ask for contact details unless explicitly required by project instruction and still missing.
- Keep it concise — a few sentences or a short bulleted summary, not a wall of text."""

    gen_config = _resolve_generation_config(model_config_overrides)

    if on_reply_delta is None:
        final_resp = llm_client.generate(final_prompt, config=gen_config)
        tc.add(final_resp.usage)
        reply = final_resp.text.strip() or "I could not generate a reply."
    else:
        reply_parts: list[str] = []
        for delta in llm_client.stream_generate(final_prompt, config=gen_config):
            if not delta:
                continue
            reply_parts.append(delta)
            on_reply_delta(delta)
        reply = "".join(reply_parts).strip() or "I could not generate a reply."

    # The reply is fully streamed; the remaining work is generating follow-up
    # suggestions + detecting card data. Signal the UI so it can show a
    # "wrapping up" status between the end of the stream and the final `done`
    # event (can be 1-4s while the suggestions LLM runs).
    _phase("finalizing")

    # 5) Generate follow-up suggestions + detect list/card data
    suggestions: list[str] = []
    cards: list[dict[str, Any]] = []

    data_context_hint = ""
    if all_names:
        data_context_hint = (
            f"The database has these tables: {', '.join(all_names)}. "
            "Suggest questions that can be answered from this data."
        )

    if template_only_suggestions:
        suggestions = template_only_suggestions
    else:
        try:
            followup_prompt = f"""You are suggesting follow-up questions for a website visitor chatbot.
{data_context_hint}

Based on the conversation, suggest exactly 3 short follow-up questions the visitor might ask next.
Each must be under 60 characters and MUST be answerable from the available data or documents.
Do NOT suggest questions about data that does not exist.

Visitor asked: {user_message}
Assistant replied: {reply[:600]}

Respond with JSON only: {{"suggestions":["q1","q2","q3"]}}"""
            fu = _llm_json(llm_client, followup_prompt, tc)
            raw_suggestions = fu.get("suggestions") or []
            if isinstance(raw_suggestions, list):
                suggestions = [str(s).strip() for s in raw_suggestions if str(s).strip()][:3]
        except Exception:
            pass

    if db_answer and not db_answer.startswith("[SQL error") and not db_answer.startswith("[Mongo error"):
        try:
            db_parsed = json.loads(db_answer)
            db_rows = db_parsed.get("rows") or []
            db_cols = db_parsed.get("columns") or []

            if isinstance(db_rows, list) and len(db_rows) >= 2 and isinstance(db_cols, list) and len(db_cols) >= 2:
                if template_card_config and template_card_config.get("carouselEnabled"):
                    cards = _build_cards_from_config(template_card_config, db_cols, db_rows)
                    mapping_dbg = template_card_config.get("cardMapping") or {}
                    logger.info(
                        "carousel_cards_built count=%d image_col=%s public_bucket_url=%s",
                        len(cards),
                        str(mapping_dbg.get("imageColumn") or ""),
                        str(mapping_dbg.get("publicBucketUrl") or ""),
                    )
        except Exception:
            pass

    return {
        "reply": reply,
        "sources": sources,
        "route": {
            "mode": mode,
            "reason": route.get("reason"),
        },
        "sql": sql_used or None,
        "suggestions": suggestions,
        "cards": cards,
        "model_name": model_name,
        "tokens_input": tc.input,
        "tokens_output": tc.output,
    }
