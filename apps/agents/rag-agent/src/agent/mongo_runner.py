"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons
"""

from __future__ import annotations

import json
import logging
import os
import ssl
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

from pymongo import MongoClient
from pymongo.errors import PyMongoError

logger = logging.getLogger(__name__)

_ALLOWED_FILTER_OPERATORS = {
    "$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$nin", "$exists",
    "$and", "$or", "$not", "$nor", "$regex", "$elemMatch", "$all", "$size",
}

_ALLOWED_PIPELINE_STAGES = {
    "$match", "$project", "$group", "$sort", "$limit", "$skip", "$count",
    "$unwind", "$addFields",
}

_BLOCKED_OPERATORS = {"$where", "$function", "$accumulator"}


def _validate_doc_operators(node: Any) -> None:
    if isinstance(node, dict):
        for k, v in node.items():
            if isinstance(k, str) and k.startswith("$"):
                if k in _BLOCKED_OPERATORS:
                    raise ValueError(f"Forbidden Mongo operator: {k}")
                if k not in _ALLOWED_FILTER_OPERATORS and k not in _ALLOWED_PIPELINE_STAGES:
                    raise ValueError(f"Unsupported Mongo operator: {k}")
            _validate_doc_operators(v)
    elif isinstance(node, list):
        for x in node:
            _validate_doc_operators(x)


def _normalize_sort(sort_spec: Any) -> list[tuple[str, int]]:
    if not isinstance(sort_spec, list):
        return []
    out: list[tuple[str, int]] = []
    for item in sort_spec:
        if not (isinstance(item, list) and len(item) == 2):
            continue
        field = str(item[0] or "").strip()
        direction = str(item[1] or "asc").strip().lower()
        if not field:
            continue
        out.append((field, -1 if direction == "desc" else 1))
    return out


def _client_tls_kwargs(ssl_mode: str, ssl_ca_pem: str | None) -> tuple[dict[str, Any], Path | None]:
    mode = (ssl_mode or "required").strip().lower()
    if mode == "disable":
        return {"tls": False}, None

    kwargs: dict[str, Any] = {"tls": True}
    if mode in ("required", "preferred"):
        kwargs["tlsAllowInvalidCertificates"] = True
        kwargs["tlsAllowInvalidHostnames"] = True
        return kwargs, None

    ca_path: Path | None = None
    ca = (ssl_ca_pem or "").strip()
    if mode in ("verify_ca", "verify_identity"):
        if not ca:
            raise ValueError("SSL/TLS mode requires CA PEM.")
        fd, p = tempfile.mkstemp(prefix="mongo-ca-", suffix=".pem")
        os.close(fd)
        Path(p).write_text(ca, encoding="utf-8")
        ca_path = Path(p)
        kwargs["tlsCAFile"] = str(ca_path)
        kwargs["tlsAllowInvalidCertificates"] = False
        kwargs["tlsAllowInvalidHostnames"] = mode != "verify_identity"
        kwargs["ssl_cert_reqs"] = ssl.CERT_REQUIRED
    return kwargs, ca_path


def run_query_mongo(
    *,
    host: str,
    port: int,
    user: str,
    password: str,
    database: str,
    query_spec: dict[str, Any],
    allowed_collections: set[str],
    ssl_mode: str = "required",
    ssl_ca_pem: str | None = None,
    max_rows: int = 50,
    connect_timeout_seconds: int = 10,
) -> tuple[list[str], list[dict[str, Any]]]:
    if not isinstance(query_spec, dict):
        raise ValueError("Mongo query spec must be an object.")

    op = str(query_spec.get("operation") or "").strip().lower()
    if op not in {"find", "aggregate"}:
        raise ValueError("Mongo operation must be find or aggregate.")

    collection = str(query_spec.get("collection") or "").strip()
    if not collection:
        raise ValueError("Mongo query spec must include collection.")
    if collection not in allowed_collections:
        raise ValueError(f"Unknown collection: {collection}")

    tls_kwargs, ca_path = _client_tls_kwargs(ssl_mode, ssl_ca_pem)
    client = None
    try:
        host_clean = (host or "").strip()
        use_srv = host_clean.lower().endswith(".mongodb.net") and ":" not in host_clean
        auth = f"{quote_plus(user)}:{quote_plus(password)}@"
        db_path = f"/{quote_plus(database)}"
        uri = (
            f"mongodb+srv://{auth}{host_clean}{db_path}"
            if use_srv
            else f"mongodb://{auth}{host_clean}:{int(port)}{db_path}"
        )
        logger.info(
            "live_mongo_connect_attempt host=%s port=%s database=%s user=%s collection=%s operation=%s ssl_mode=%s",
            host_clean,
            port,
            database,
            user,
            collection,
            op,
            ssl_mode,
        )
        client = MongoClient(
            uri,
            serverSelectionTimeoutMS=max(connect_timeout_seconds, 1) * 1000,
            **tls_kwargs,
        )
        db = client[database]
        col = db[collection]

        if op == "find":
            filt = query_spec.get("filter")
            proj = query_spec.get("projection")
            sort_spec = query_spec.get("sort")
            limit = int(query_spec.get("limit") or max_rows)
            limit = max(1, min(limit, max_rows))
            filt = filt if isinstance(filt, dict) else {}
            proj = proj if isinstance(proj, dict) else None
            _validate_doc_operators(filt)
            if proj is not None:
                _validate_doc_operators(proj)
            logger.info("live_mongo_query_execute operation=find query_spec=%s", json.dumps(query_spec, ensure_ascii=False))
            cursor = col.find(filt, proj).limit(limit)
            sort_list = _normalize_sort(sort_spec)
            if sort_list:
                cursor = cursor.sort(sort_list)
            rows = list(cursor)
        else:
            pipeline = query_spec.get("pipeline")
            if not isinstance(pipeline, list) or not pipeline:
                raise ValueError("Aggregate operation requires a non-empty pipeline.")
            _validate_doc_operators(pipeline)
            # Enforce bounded output.
            has_limit = any(isinstance(stage, dict) and "$limit" in stage for stage in pipeline)
            if not has_limit:
                pipeline = [*pipeline, {"$limit": max_rows}]
            logger.info("live_mongo_query_execute operation=aggregate query_spec=%s", json.dumps(query_spec, ensure_ascii=False))
            rows = list(col.aggregate(pipeline))

        rows_json = json.loads(json.dumps(rows, default=str))
        cols: list[str] = []
        if rows_json:
            seen: set[str] = set()
            for r in rows_json[:25]:
                if isinstance(r, dict):
                    for k in r.keys():
                        if k not in seen:
                            cols.append(k)
                            seen.add(k)
        logger.info(
            "live_mongo_query_result collection=%s operation=%s rows=%d columns=%s",
            collection, op, len(rows_json), ",".join(cols) if cols else "(empty)",
        )
        return cols, rows_json
    except PyMongoError as e:
        logger.exception("live_mongo_query_failed raw_error=%r", e)
        raise ValueError(str(e)) from e
    finally:
        if client is not None:
            client.close()
        if ca_path is not None:
            try:
                ca_path.unlink(missing_ok=True)
            except Exception:
                pass
