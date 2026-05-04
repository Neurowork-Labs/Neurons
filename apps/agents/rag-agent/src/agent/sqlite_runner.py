"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons
"""

from __future__ import annotations

import json
import logging
import re
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)


def _safe_identifier(name: str) -> str:
    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", name):
        raise ValueError(f"Invalid table name: {name}")
    return name


def _infer_sqlite_type(value: Any) -> str:
    if value is None:
        return "TEXT"
    if isinstance(value, bool):
        return "INTEGER"
    if isinstance(value, int) and not isinstance(value, bool):
        return "INTEGER"
    if isinstance(value, float):
        return "REAL"
    return "TEXT"


def load_tables_into_sqlite(
    rows: list[dict[str, Any]],
) -> sqlite3.Connection:
    """
    rows: each dict has schema_name, table_name, table_data (jsonb-compatible list of row dicts).
    """
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    for row in rows:
        tname = _safe_identifier(str(row.get("table_name", "t")))
        data = row.get("table_data")
        if isinstance(data, str):
            data = json.loads(data)
        if not isinstance(data, list) or not data:
            conn.execute(f'CREATE TABLE IF NOT EXISTS "{tname}" (id INTEGER PRIMARY KEY AUTOINCREMENT);')
            continue
        first = data[0]
        if not isinstance(first, dict):
            continue
        cols = list(first.keys())
        col_defs = []
        for c in cols:
            _safe_identifier(str(c))
            col_defs.append(f'"{c}" {_infer_sqlite_type(first.get(c))}')
        ddl = f'CREATE TABLE "{tname}" ({", ".join(col_defs)});'
        conn.execute(ddl)
        placeholders = ",".join(["?" for _ in cols])
        col_list = ",".join(f'"{c}"' for c in cols)
        insert_sql = f'INSERT INTO "{tname}" ({col_list}) VALUES ({placeholders})'
        for rec in data:
            if not isinstance(rec, dict):
                continue
            values = [rec.get(c) for c in cols]
            conn.execute(insert_sql, values)
    conn.commit()
    return conn


_SQL_KEYWORDS = frozenset({
    "SELECT", "WHERE", "ON", "AND", "OR", "AS", "FROM", "JOIN", "LEFT",
    "RIGHT", "INNER", "OUTER", "CROSS", "FULL", "NATURAL", "USING",
    "GROUP", "BY", "ORDER", "HAVING", "LIMIT", "OFFSET", "UNION", "ALL",
    "DISTINCT", "CASE", "WHEN", "THEN", "ELSE", "END", "NOT", "IN",
    "EXISTS", "BETWEEN", "LIKE", "IS", "NULL", "TRUE", "FALSE", "ASC",
    "DESC", "CAST", "COALESCE", "IFNULL", "COUNT", "SUM", "AVG", "MIN",
    "MAX", "SUBSTR", "LENGTH", "TRIM", "LOWER", "UPPER", "REPLACE",
    "ROUND", "ABS", "DATE", "TIME", "DATETIME", "TYPEOF", "TOTAL",
    "VALUES", "SET", "INTO", "WITH", "RECURSIVE",
})


def _tables_referenced(sql: str) -> set[str]:
    found = set(
        re.findall(r"(?:FROM|JOIN)\s+[\"`]?([A-Za-z_][A-Za-z0-9_]*)[\"`]?", sql, re.IGNORECASE)
    )
    return {t for t in found if t.upper() not in _SQL_KEYWORDS}


def validate_sql(sql: str, allowed_tables: set[str]) -> tuple[bool, str]:
    s = sql.strip().rstrip(";")
    low = s.lower().strip()
    if not low.startswith("select"):
        return False, "Only SELECT queries are allowed."
    forbidden = (
        "attach",
        "pragma",
        "detach",
        "vacuum",
        "reindex",
        "analyze",
        "insert",
        "update",
        "delete",
        "drop",
        "alter",
        "create",
        "replace",
        "truncate",
    )
    for f in forbidden:
        if re.search(rf"\b{f}\b", low):
            return False, f"Forbidden keyword: {f}"
    refs = _tables_referenced(s)
    unknown = refs - allowed_tables
    if unknown:
        return False, f"Unknown table(s): {', '.join(sorted(unknown))}"
    return True, ""


def run_select(
    conn: sqlite3.Connection,
    sql: str,
    *,
    allowed_tables: set[str],
    max_rows: int = 200,
) -> tuple[list[str], list[dict[str, Any]]]:
    ok, err = validate_sql(sql, allowed_tables)
    if not ok:
        raise ValueError(err)
    sql_inner = sql.strip().rstrip(";")
    limited = f"SELECT * FROM ({sql_inner}) AS _q LIMIT {max_rows}"
    try:
        logger.info("sqlite_query_execute sql=%s", sql)
        cur = conn.execute(limited)
    except sqlite3.Error as e:
        logger.warning("sqlite_query_failed raw_error=%r", e)
        raise ValueError(str(e)) from e
    colnames = [d[0] for d in cur.description] if cur.description else []
    out = [dict(zip(colnames, row)) for row in cur.fetchall()]
    return colnames, out
