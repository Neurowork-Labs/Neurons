"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

import logging
import re
from typing import Any

import pymysql

logger = logging.getLogger(__name__)


_SQL_KEYWORDS = frozenset({
    "SELECT", "WHERE", "ON", "AND", "OR", "AS", "FROM", "JOIN", "LEFT",
    "RIGHT", "INNER", "OUTER", "CROSS", "FULL", "NATURAL", "USING",
    "GROUP", "BY", "ORDER", "HAVING", "LIMIT", "OFFSET", "UNION", "ALL",
    "DISTINCT", "CASE", "WHEN", "THEN", "ELSE", "END", "NOT", "IN",
    "EXISTS", "BETWEEN", "LIKE", "IS", "NULL", "TRUE", "FALSE", "ASC",
    "DESC", "CAST", "COALESCE", "IFNULL", "COUNT", "SUM", "AVG", "MIN",
    "MAX", "SUBSTR", "LENGTH", "TRIM", "LOWER", "UPPER", "REPLACE",
    "ROUND", "ABS", "DATE", "TIME", "DATETIME", "VALUES", "SET", "INTO",
    "WITH", "RECURSIVE",
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
        "insert",
        "update",
        "delete",
        "drop",
        "alter",
        "create",
        "replace",
        "truncate",
        "grant",
        "revoke",
        "lock",
        "unlock",
        "show",
        "use",
        "set",
        "describe",
        "explain",
    )
    for f in forbidden:
        if re.search(rf"\b{f}\b", low):
            return False, f"Forbidden keyword: {f}"
    refs = _tables_referenced(s)
    unknown = refs - allowed_tables
    if unknown:
        return False, f"Unknown table(s): {', '.join(sorted(unknown))}"
    return True, ""


def _build_ssl_args(ssl_mode: str, ssl_ca_pem: str | None) -> dict[str, Any]:
    mode = (ssl_mode or "required").strip().lower()
    if mode in ("disable",):
        return {}
    if mode in ("preferred", "required"):
        return {"ssl_disabled": False}
    if mode in ("verify_ca", "verify_identity"):
        if not (ssl_ca_pem or "").strip():
            raise ValueError("SSL/TLS mode requires CA PEM.")
        return {
            "ssl_disabled": False,
            "ssl": {"ca": ssl_ca_pem},
        }
    return {"ssl_disabled": False}


def run_select_mysql(
    *,
    host: str,
    port: int,
    user: str,
    password: str,
    database: str,
    sql: str,
    allowed_tables: set[str],
    ssl_mode: str = "required",
    ssl_ca_pem: str | None = None,
    max_rows: int = 200,
    connect_timeout_seconds: int = 10,
    read_timeout_seconds: int = 12,
    write_timeout_seconds: int = 12,
) -> tuple[list[str], list[dict[str, Any]]]:
    ok, err = validate_sql(sql, allowed_tables)
    if not ok:
        raise ValueError(err)
    # Subquery wrapper cannot contain trailing statement terminator.
    sql_inner = str(sql or "").strip().rstrip(";")
    limited = f"SELECT * FROM ({sql_inner}) AS _q LIMIT {max_rows}"
    ssl_kwargs = _build_ssl_args(ssl_mode, ssl_ca_pem)
    conn = None
    try:
        logger.info(
            "live_mysql_connect_attempt host=%s port=%s database=%s user=%s ssl_mode=%s",
            host,
            port,
            database,
            user,
            ssl_mode,
        )
        conn = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            connect_timeout=connect_timeout_seconds,
            read_timeout=read_timeout_seconds,
            write_timeout=write_timeout_seconds,
            cursorclass=pymysql.cursors.DictCursor,
            **ssl_kwargs,
        )
        with conn.cursor() as cur:
            logger.info("live_mysql_query_execute sql=%s", sql)
            cur.execute(limited)
            rows = list(cur.fetchall())
            colnames = list(rows[0].keys()) if rows else [d[0] for d in (cur.description or [])]
            return colnames, rows
    except pymysql.MySQLError as e:
        logger.exception("live_mysql_query_failed raw_error=%r", e)
        raise ValueError(str(e)) from e
    finally:
        if conn is not None:
            conn.close()
