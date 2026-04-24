# Pending tasks

## Project Overview

- **Integration code snippet** on Project Overview: e.g. `fetch` / `curl` with `X-API-Key`, base URL, and env-var / security notes. Snippet should use a placeholder for the key or point users to the API Keys tab.

## Query templates — `parameter_schema`

- **`parameter_schema` (JSONB) on `public.database_connection_query_templates`**: Column exists and API create/update accept optional `parameterSchema`, but the Query templates **Add** / **Edit** dialogs do not collect it yet. Later: define a canonical JSON shape (or JSON Schema) for template parameters; add UI—either structured fields (name, type, required, etc.) that serialize to JSON, and/or an advanced JSON editor; validate client- and server-side before save; document usage for agents or runners that bind placeholders in `sql_text`. Schema reference: `docs/db-schema/migrations/2026-04-10-database-connection-query-templates-and-mode.sql`.

## Query templates parameterization rollout (active)

- **Tracking sheet**: `docs/task-queue/query-template-parameterization-test-cases.md` (status-driven test execution log for Web app, RAG runtime, and validator updates).

- **QTP-01: Web app — Parameter schema table UI in Add/Edit template dialogs**: In Query Templates dialogs, after SQL/query document input, auto-detect placeholder parameter names and show editable structured rows (name prefilled; user fills type/default/required/nullable/description/constraints). Keep logic in `.ts` and rendering in `.tsx`.

- **QTP-02: Web app — Placeholder detection + schema sync rules**: Add deterministic placeholder parser for SQL (`:param_name`) and Mongo query docs (`{{param_name}}`); merge with existing rows without destructive overwrite; show “new/removed/unchanged” state and warnings for drift.

- **QTP-03: Web app/server contract — Canonical `parameter_schema` model + validations**: Finalize canonical schema shape for SQL and Mongo templates, add client/server validation, and enforce consistency (query placeholders must exist in schema, invalid defaults/types rejected).

- **QTP-04: RAG agent — Template parameter extraction and coercion**: For selected template, extract parameter values from visitor question, coerce/validate using `parameter_schema` (type, enum, min/max), apply defaults, and emit clear logs for resolved parameters.

- **QTP-05: RAG agent — Missing required parameters follow-up flow**: In template modes, if required parameters are missing after extraction/defaults, ask targeted clarification questions to the visitor and continue once values are provided.

- **QTP-06: RAG agent — Safe parameter binding for SQL and Mongo templates**: Replace raw placeholder execution with safe bound-parameter runtime (SQL placeholders and Mongo template substitutions), including limit guards and null-handling strategy.

- **QTP-07: RAG agent — Pre-validator fix for SQL aliases**: Update snapshot-backed SQL qualified-reference validation to resolve table aliases from `FROM/JOIN` clauses (e.g., `property p`, `city c`) before column checks, so valid alias-based templates do not fail.

- **QTP-08: Observability — End-to-end template execution diagnostics**: Ensure logs clearly show template pick outcome, resolved parameters, validator decisions, final query/query-spec, and `db_answer` context for fast debugging of `template_only` runs.

- **QTP-09: RAG agent — Apply `conversationExcludedColumns` only when carousel is disabled**: Runtime currently filters excluded columns before LLM prompt whenever exclusions exist. Align runtime behavior with UI expectation so exclusions are applied only for conversational mode (`carouselEnabled = false`), while carousel-enabled template flows keep full mapped card context.

## Help (deferred)

- **Topbar Help control**: `TopbarHelpButton` is shown next to Feedback on dashboard and project layouts; `onClick` is intentionally a no-op. Implement a Help route or panel (e.g. `/help`, docs links, contact), wire the button to it, and remove the “coming soon” `title` when ready.

## Organization profile & address (deferred)

- **Organization settings page**: allow users to edit optional fields later (`country_id`, `state_id`, `city`, `zipcode`, `address_line_1`, `address_line_2`) per `public.organizations` in `docs/db-schema/sql-queries.md`. These are nullable in DB and were intentionally omitted from the create flow to keep onboarding simple.

## Billing & subscriptions (deferred)

- **Organization-level subscriptions**: `public.subscriptions` ties `organization_id` + `plan_id` (`docs/db-schema/sql-queries.md`, `docs/db-schema/revenue-model-i3.md`). After org creation we only set `organizations.plan_id` from the user’s plan choice; implement full subscription lifecycle (checkout, `subscriptions` row, invoices, payment gateway) per revenue model docs when billing is built.

## Connected agent widget preview (deferred)

- **Live website preview pseudo-scroll controls**: Current Playwright fallback renders a static snapshot in widget preview. Add pseudo-scroll support later by sending `scrollY` (and optional viewport params) to snapshot API, applying `window.scrollTo(0, scrollY)` in Playwright before capture, and exposing debounced controls (slider / page up-down) in preview UI so users can inspect below-the-fold website sections.
