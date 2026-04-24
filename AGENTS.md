# Agent / contributor conventions

These rules apply to the **web app** (`apps/web`) unless a task says otherwise.

## Folder structure (feature-aligned)

Group by **name** (feature or domain), not by file type only:

| Area | Path | Purpose |
|------|------|---------|
| UI | `src/components/<name>/` | React components and views |
| Logic | `src/lib/<name>/` | Business logic, helpers, clients, server-safe modules |
| HTTP API | `src/app/api/<name>/` | Next.js Route Handlers (`route.ts`) |

Paths above are relative to `apps/web/`. Example: dashboard UI lives under `apps/web/src/components/dashboard/`, shared logic under `apps/web/src/lib/...`, endpoints under `apps/web/src/app/api/...`.

Keeping **components**, **lib**, and **api** mirrors makes navigation and debugging straightforward: one mental map for “where UI lives,” “where logic lives,” and “where HTTP is defined.”

## Logic vs rendering

- **`.ts` files** — Put logic here: pure functions, data shaping, API clients, Supabase calls, validation, and other non-UI code.
- **`.tsx` files** — Keep these primarily for **rendering**: layout, markup, props, and event wiring. They should **call** functions from `src/lib/...` and reach the backend through **`src/app/api/...`** (via `fetch` or thin client wrappers), not duplicate large chunks of business logic inline.

## API routes

- If the UI needs server-only work (secrets, privileged DB access, orchestration), define or extend handlers under **`src/app/api/<name>/`** and keep reusable pieces in **`src/lib/<name>/`**.
- Add routes when required; do not invent new server endpoints without a clear need.

## Summary

**New work:** follow `components/<name>`, `lib/<name>`, and `app/api/<name>` together when introducing a feature. Prefer **logic in `.ts`**, **UI in `.tsx`**, **HTTP via `app/api`**.
