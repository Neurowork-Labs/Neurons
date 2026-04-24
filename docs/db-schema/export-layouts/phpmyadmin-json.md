# Export layout: PHPMyAdmin → JSON (array format)

This document describes the **standard layout** of database **data** exports produced by **phpMyAdmin** using the **Export → JSON** option (“Export to JSON” plugin). It was analyzed from a real export:

- Sample file (project reference): `data/the-hindu-property/database-data.json` (~4.1 MB)

Use this spec when implementing parsers that split one uploaded JSON file into **one row per logical table** in `public.document_database_table_data` (or equivalent downstream processing).

---

## Platform and format

| Field | Value |
|--------|--------|
| **Platform** | PHPMyAdmin |
| **Format** | JSON |
| **Encoding** | UTF-8 (typical) |
| **Top-level structure** | **JSON array** (`[ ... ]`) of heterogeneous objects |

The export is **not** a single object with a `tables` key; it is a **sequence of labeled objects**, each identified by a `type` field.

---

## Document structure (high level)

```text
[
  { "type": "header", ... },           -- plugin / version metadata
  { "type": "database", "name": "…" },  -- database name (once per export in sample)
  { "type": "table", ... },            -- first table + rows
  { "type": "table", ... },            -- second table + rows
  ...
]
```

Iteration order in the sample: **header → database → repeated table blocks**.

---

## Object types

### 1. `type: "header"`

Declares the export plugin and version.

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Always `"header"`. |
| `version` | string | PHPMyAdmin-related version string (e.g. `"5.2.2"`). |
| `comment` | string | Human-readable note (e.g. `"Export to JSON plugin for PHPMyAdmin"`). |

**Example:**

```json
{
  "type": "header",
  "version": "5.2.2",
  "comment": "Export to JSON plugin for PHPMyAdmin"
}
```

---

### 2. `type: "database"`

Declares the **MySQL database name** for the export.

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Always `"database"`. |
| `name` | string | Database name (e.g. `inrer1kr_muslimdb`). |

**Example:**

```json
{ "type": "database", "name": "inrer1kr_muslimdb" }
```

**Mapping hint:** This aligns with logical **schema/database** context. For `document_database_table_data.schema_name`, many MySQL setups use a single database name; PostgreSQL-oriented apps sometimes map this to `public` or keep the MySQL database name as a namespace—**product decision**.

---

### 3. `type: "table"`

One block **per table**. This is the unit to map to **one row** in `document_database_table_data` (with `table_name` = MySQL table name).

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Always `"table"`. |
| `name` | string | Table name (e.g. `advertisements`, `agency`, `city`). |
| `database` | string | Same database name as in the `database` object (repeated on each table). |
| `data` | array | Array of **row objects**. May be **empty** `[]` for tables with no rows. |

**Example (abbreviated):**

```json
{
  "type": "table",
  "name": "advertisements",
  "database": "inrer1kr_muslimdb",
  "data": [
    {
      "id": "6",
      "name": "Opening Soon!",
      "details": "wee",
      "is_active": "1",
      "advertisement_images": "6591e973a494823649600b7313664999.jpg",
      "created_by": null,
      "created_at": "2022-12-19 03:42:51",
      "updated_at": "2026-03-13 11:20:48"
    }
  ]
}
```

---

## Row object shape (`data[]` elements)

- Each element is a **flat JSON object**: keys are **column names**, values are cell values.
- **Strings:** MySQL values are often emitted as JSON strings (e.g. numeric IDs as `"6"` not `6`). Dates/times appear as strings (e.g. `"2022-12-19 03:42:51"`).
- **NULL:** JSON `null`.
- **Escaping:** Forward slashes may appear escaped inside strings (e.g. `Interior\/Architect`) per JSON rules; parsers should deserialize normally.

There is **no** guarantee that all tables share the same columns; each table defines its own row shape.

---

## Empty tables

Tables with no rows include `data` as an **empty array**:

```json
{
  "type": "table",
  "name": "category",
  "database": "inrer1kr_muslimdb",
  "data": []
}
```

**Extraction rule:** still emit a logical table (e.g. store empty array in `table_data` or skip row—**product decision**).

---

## Extraction algorithm (reference)

1. **Parse** the file as JSON; top level must be an **array**.
2. **Skip or record** objects where `type === "header"` (metadata).
3. **Record** the object where `type === "database"` → database name.
4. For each object where `type === "table"`:
   - `table_name` ← `name`
   - `schema_name` / namespace ← align with your app (e.g. MySQL database name or `public`).
   - `table_data` ← the `data` array (or the whole table object, depending on storage design).
5. **Ignore** unknown `type` values if encountered in future phpMyAdmin versions (log and skip or fail—policy choice).

---

## Relationship to `database_export_layouts`

In the application database, associate this layout with a row in `public.database_export_layouts` (e.g. `format = 'json'`, `platform = 'phpmyadmin'` or a more specific label agreed by the team). The **parser** for uploads with that layout should follow this document.

---

## Sample statistics (reference file)

| Metric | Approximate value |
|--------|-------------------|
| File size | ~4.2 MB |
| Top-level array elements | Header + database + many `table` blocks |
| `type: "table"` occurrences | Dozens of tables (see sample file) |

Re-count tables in other exports with: search for `"type": "table"` in the JSON file.

---

## Future analysis

When adding or validating other layouts (e.g. different phpMyAdmin JSON variants, mysqldump, other tools):

1. Add a new markdown file under `docs/db-schema/export-layouts/`.
2. Link it from `docs/db-schema/sql-queries.md` or `db-schema-i3.md` if the layout is tied to `database_export_layouts` seed data.
3. Keep **platform**, **format**, and **top-level shape** explicit to avoid mixing parsers.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-29 | Initial layout analysis from `data/the-hindu-property/database-data.json` (phpMyAdmin 5.2.x JSON export). |
