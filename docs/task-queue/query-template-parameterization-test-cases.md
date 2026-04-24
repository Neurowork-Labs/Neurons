# Query Template Parameterization Test Cases

This document tracks end-to-end test execution for query template parameterization across:

1. Web app (`parameter_schema` UI + API payload)
2. RAG agent (parameter extraction/binding/follow-up)
3. SQL pre-validator alias support

## Status Legend

- `Not Run`
- `Pass`
- `Fail`
- `Blocked`

---

## Phase 1 — Web App (`parameter_schema`)

| Test case number | Test case | Expected | Status | Last run date | Notes |
|---|---|---|---|---|---|
| QTP-WEB-01 | Open Query Templates page for a connection | Header shows `Query templates : <connection name>` (space before `:`) | Not Run |  |  |
| QTP-WEB-02 | Open Add Template dialog | Dialog stays compact and shows `PARAMETERS` with `Configure` button | Not Run |  |  |
| QTP-WEB-03 | Enter SQL with placeholders (`:city_name`, `:limit`) | Parameter count updates and detected names are available in Configure dialog table | Not Run |  |  |
| QTP-WEB-04 | Enter Mongo query with placeholders (`{{city_name}}`, `{{limit}}`) | Parameter count updates and detected names are available in Configure dialog table | Not Run |  |  |
| QTP-WEB-05 | Click `Configure` in Add dialog | Separate parameter dialog opens with table columns (name/type/default/required/nullable/description) | Not Run |  |  |
| QTP-WEB-06 | Edit parameter rows then click `Done` | Changes persist in Add/Edit form state | Not Run |  |  |
| QTP-WEB-07 | Save template with valid parameter rows | Create succeeds and saved row includes `parameter_schema` | Not Run |  |  |
| QTP-WEB-08 | Reopen saved template in Edit | Parameter rows are preloaded from existing `parameter_schema` | Not Run |  |  |
| QTP-WEB-09 | Integer parameter with default `abc` | Save blocked with validation error | Not Run |  |  |
| QTP-WEB-10 | Non-nullable parameter with default `null` | Save blocked with validation error | Not Run |  |  |
| QTP-WEB-11 | Query has no placeholders | UI shows no-parameters message and save still works with `parameter_schema = null` | Not Run |  |  |
| QTP-WEB-12 | Edit query and add/remove placeholders | Sync is non-destructive; existing parameter settings remain for unchanged names | Not Run |  |  |
| QTP-WEB-13 | Add enum values in parameter row | Enum is stored in `parameter_schema.parameters[].enum` when provided as JSON array | Not Run |  |  |
| QTP-WEB-14 | Non-empty enum + default not in enum | Save blocked with validation error saying default must be one of enum values | Not Run |  |  |

---

## Phase 2 — RAG Agent (`parameter_schema` runtime)

| Test case number | Test case | Expected | Status | Last run date | Notes |
|---|---|---|---|---|---|
| QTP-RAG-01 | Template has optional params with defaults | Agent uses defaults when visitor does not provide values | Not Run |  |  |
| QTP-RAG-02 | Visitor provides explicit values in question | Agent extracts/coerces values and uses them instead of defaults | Not Run |  |  |
| QTP-RAG-03 | Required params missing in `template_only` | Agent asks targeted follow-up question listing missing params | Not Run |  |  |
| QTP-RAG-04 | Required params provided after follow-up | Agent proceeds with query execution and returns data answer | Not Run |  |  |
| QTP-RAG-05 | Invalid value type (e.g., integer expected, text provided) | Agent asks correction follow-up or returns clear validation error | Not Run |  |  |
| QTP-RAG-06 | SQL template with placeholders executes | SQL sent to DB is fully resolved/bound safely; no raw unresolved `:param` | Not Run |  |  |
| QTP-RAG-07 | Mongo template with placeholders executes | Resolved query document executes safely with validated values | Not Run |  |  |
| QTP-RAG-08 | Logs for parameter flow | Logs include selected template, resolved params, missing params, and execution outcome | Not Run |  |  |

---

## Phase 3 — SQL Pre-validator alias support

| Test case number | Test case | Expected | Status | Last run date | Notes |
|---|---|---|---|---|---|
| QTP-VAL-01 | Alias query (`FROM property p ... p.price`) | Pre-validator accepts alias-qualified references when base table exists | Not Run |  |  |
| QTP-VAL-02 | Unknown alias (`x.price`) not declared in FROM/JOIN | Pre-validator rejects with clear unknown table/alias error | Not Run |  |  |
| QTP-VAL-03 | Valid alias, unknown column (`p.unknown_col`) | Pre-validator rejects with clear unknown column error | Not Run |  |  |
| QTP-VAL-04 | Mixed table + alias refs (`property.id`, `p.price`) | Pre-validator handles both forms correctly | Not Run |  |  |
| QTP-VAL-05 | Prior failing template (`property_search_location_budget`) | No alias-related pre-validation error; flow proceeds to DB execution | Not Run |  |  |

---

## Execution Notes

- Update `Status`, `Last run date`, and `Notes` after every test cycle.
- Keep failed case notes precise with terminal/log snippets and root-cause pointer.
- If blocked, include dependency (migration, env var, or pending task ID).
