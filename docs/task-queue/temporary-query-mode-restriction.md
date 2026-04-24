# Temporary Change: Query Mode Restriction

## Scope
- Web app query mode updates for project database connections.

## Temporary behavior
- Only `template_only` is accepted by the server update API.
- `template_preferred` and `generated` remain in codebase but are intentionally blocked for updates.

## Why
- Temporary product restriction so users cannot enable non-template execution modes.

## Where enforced
- Frontend dialog disables `template_preferred` and `generated` options.
- Backend update guard enforces `template_only` in `database-connection-query-templates-server.ts`.

## Rollback note
- Remove the temporary backend allowlist check and re-enable frontend options when restriction is lifted.
