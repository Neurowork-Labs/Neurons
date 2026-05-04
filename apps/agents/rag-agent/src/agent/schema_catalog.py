"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons
"""

from __future__ import annotations

import json
import re
from typing import Any


def extract_table_names_from_sql_ddl(schema_sql: str) -> list[str]:
    """Best-effort extraction of table names from CREATE TABLE statements."""
    names: list[str] = []
    for m in re.finditer(
        r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`\"]?(\w+)[`\"]?\.?)?[`\"]?(\w+)[`\"]?",
        schema_sql,
        re.IGNORECASE,
    ):
        t = m.group(2) or m.group(1)
        if t and t.upper() not in ("IF", "NOT", "EXISTS"):
            names.append(t)
    return list(dict.fromkeys(names))


def table_names_from_snapshot(schema_snapshot: Any) -> list[str]:
    if schema_snapshot is None:
        return []
    if isinstance(schema_snapshot, dict):
        tables = schema_snapshot.get("tables")
        if isinstance(tables, list):
            out: list[str] = []
            for t in tables:
                if isinstance(t, dict) and t.get("name"):
                    out.append(str(t["name"]))
                elif isinstance(t, str):
                    out.append(t)
            return out
    return []


def collection_names_from_snapshot(schema_snapshot: Any) -> list[str]:
    if schema_snapshot is None:
        return []
    if isinstance(schema_snapshot, dict):
        collections = schema_snapshot.get("collections")
        if isinstance(collections, list):
            out: list[str] = []
            for c in collections:
                if isinstance(c, dict) and c.get("name"):
                    out.append(str(c["name"]))
                elif isinstance(c, str):
                    out.append(c)
            return out
    return []


def shortlist_tables(user_message: str, candidates: list[str], *, max_tables: int = 5) -> list[str]:
    if not candidates:
        return []
    msg = user_message.lower()
    scored: list[tuple[int, str]] = []
    for name in candidates:
        n = name.lower()
        score = 0
        if n in msg:
            score += 10
        parts = re.split(r"[_\s]+", n)
        for p in parts:
            if len(p) > 2 and p in msg:
                score += 3
        scored.append((score, name))
    scored.sort(key=lambda x: (-x[0], x[1]))
    picked = [n for s, n in scored if s > 0][:max_tables]
    if picked:
        return picked
    return candidates[:max_tables]
