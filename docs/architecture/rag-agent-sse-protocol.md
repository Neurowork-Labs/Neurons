# RAG Agent SSE Protocol

This document defines the Server-Sent Events (SSE) contract used by public chat streaming.

## Scope

- Browser widget -> `apps/web` public chat API route
- `apps/web` public chat API route -> RAG agent stream endpoint
- Event stream carries incremental reply deltas and final payload

## Endpoints

- Public API route (widget-facing): `POST /api/public/rag/chat` with `stream: true`
- Agent route (internal): `POST /v1/chat/stream`

If `stream: true` is omitted, existing JSON response mode is used.

## Content Type

- Response header: `Content-Type: text/event-stream; charset=utf-8`
- Recommended headers:
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`
  - `X-Accel-Buffering: no`

## Event Format

Each event uses standard SSE framing:

```text
event: <name>
data: <json>

```

## Event Types

### `start`

Emitted once at stream start.

Payload example:

```json
{ "ok": true }
```

### `delta`

Emitted many times as reply tokens/chunks arrive.

Payload example:

```json
{ "text": "partial reply text" }
```

Client behavior:
- Append `text` to the in-progress assistant bubble.

### `phase`

Emitted zero or more times between `start` and `done` to let the UI change its
status label while the backend moves through distinct work stages. It carries
no reply content and must not influence the rendered bubble.

Payload example:

```json
{ "name": "finalizing" }
```

Currently defined `name` values:

| `name`        | When it fires                                                                                     | Suggested UI label |
|---------------|---------------------------------------------------------------------------------------------------|--------------------|
| `finalizing`  | After the final-reply stream drains, before the follow-up suggestions LLM runs and `done` is sent | "Wrapping up…" / "Almost done…" |

Client behavior:
- Update the status indicator to match the phase.
- Unknown phase names must be ignored (forward-compatible).
- Phase indicators are never shown on already-rendered bubbles; they only
  affect the active "typing" / "wrap-up" indicator for the current turn.

### `done`

Emitted once when full turn completes successfully.

Payload example:

```json
{
  "ok": true,
  "reply": "final assistant reply",
  "conversationId": "uuid",
  "visitorId": "id",
  "sessionId": "id",
  "sources": [],
  "route": { "mode": "rag", "reason": "..." },
  "sql": null,
  "suggestions": ["..."],
  "cards": [],
  "projectName": "Project",
  "greeting": null
}
```

Client behavior:
- Finalize rendered reply bubble.
- Update conversation/session metadata.
- Render cards and suggestions if present.

### `error`

Emitted on recoverable or terminal failure.

Payload example:

```json
{ "ok": false, "message": "human readable error", "code": "BAD_REQUEST" }
```

Client behavior:
- Stop streaming UI.
- Show friendly error bubble.

### `cancelled`

Emitted when server-side processing is cancelled due to disconnect detection.

Payload example:

```json
{ "message": "client_disconnected" }
```

## Lifecycle

Typical success sequence:

1. `start`
2. `delta` (0..N)
3. `phase` (0..N, e.g. `finalizing` after the last delta)
4. `done`
5. stream closes

Failure sequence:

1. `start` (optional depending on failure timing)
2. `error`
3. stream closes

## Fallback Behavior

- If SSE is unavailable or response is non-stream JSON, client must fall back to JSON handling.
- Existing non-stream API contract remains backward-compatible.

## Cancellation and Disconnects

- Server checks connection state (`request.is_disconnected()` on agent stream endpoint).
- On disconnect, backend marks cancellation and stops further work where possible.

## Compatibility Notes

- Keep `done` payload aligned with non-stream JSON response shape to reduce frontend branching.
- Event names and payload keys should be treated as versioned contract.
- Additive keys are safe; removing/renaming keys is a breaking change.
