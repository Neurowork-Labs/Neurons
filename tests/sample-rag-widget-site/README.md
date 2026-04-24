# Sample website — RAG widget end-to-end test

Single-page static site to embed `rag-agent-widget.js` and validate the full pipeline:

**Browser → Next.js `POST /api/public/rag/chat` → RAG agent `POST /v1/chat` → Supabase**

## 1) Prerequisites in Supabase

- Project has **`documents` / `document_chunks`** for the chosen `project_agent_id` (embedding pipeline completed).
- **`match_document_chunks`** RPC applied (see `docs/db-schema/migrations/2026-03-29-match-document-chunks-rpc.sql`).
- **`public.projects.domain`** is set to the hostname you will use in the browser (e.g. `localhost` or `widget-test.local`).
- **`projects.is_domain_verified`** is **true** (public API rejects unverified domains).
- A valid **`project_api_keys`** row (prefix `aepk_`) for that project.
- **`project_agents.id`** for the RAG agent on that project (for `data-project-agent-id`).

## 2) Configure and run the RAG agent (Python)

From repo root:

```bash
cd apps/agents/rag-agent
python environment/setup.py
source .venv/bin/activate
```

Set `apps/agents/rag-agent/.env` (see `env.example`): `SUPABASE_*`, `GOOGLE_LLM_API_KEY`, `RAG_AGENT_INTERNAL_SECRET`.

Start:

```bash
export PYTHONPATH=src
uvicorn main:app --reload --host 0.0.0.0 --port 8080
```

Check: `GET http://localhost:8080/health`

## 3) Configure and run Next.js (web app)

In `apps/web/.env.local` (create if missing):

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
RAG_AGENT_BASE_URL=http://localhost:8080
RAG_AGENT_INTERNAL_SECRET=same_as_rag_agent_env
```

Start:

```bash
cd apps/web
npm run dev
```

Default: `http://localhost:3000` — widget script URL becomes `http://localhost:3000/scripts/rag-agent-widget.js`.

## 4) Edit this sample page

Open `index.html` and replace:

| Placeholder | Example |
|-------------|---------|
| `YOUR_NEXT_ORIGIN` | `http://localhost:3000` |
| `aepk_REPLACE_ME` | full project API key from dashboard |
| `PROJECT_AGENT_UUID_REPLACE_ME` | `project_agents.id` UUID |

Save the file.

## 5) Serve the sample site with a matching Origin

The public API compares **`Origin`** to **`projects.domain`**.

- If your project domain is **`localhost`**, serve this folder on a **non‑3000** port and open **`http://localhost:PORT`** (same host, so Origin matches).

Example (port 5500):

```bash
cd tests/sample-rag-widget-site
npx --yes serve -l 5500
```

Then open **`http://localhost:5500`** in the browser.

- If your project domain is something like **`widget-test.local`**, add it to `/etc/hosts` pointing to `127.0.0.1`, set that domain on the project in the DB, verify it, then serve this site and open **`http://widget-test.local:5500`**.

**Do not** rely on `file:///.../index.html` for this test — `Origin` is often wrong or `null`.

## 6) What to verify

1. Widget launcher appears (bottom-right).
2. Send a message; you should get an assistant reply.
3. In Supabase: new **`conversations`** / **`messages`** rows for that `project_agent_id`.
4. If something fails: browser **Network** tab → `rag/chat` request → status and JSON `message`; Next.js terminal logs; RAG agent logs.

## Optional: curl (bypasses widget, no project API key)

Tests only the RAG service (requires internal secret, not the project key):

```bash
curl -sS http://localhost:8080/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-RAG-Agent-Secret: YOUR_RAG_AGENT_INTERNAL_SECRET" \
  -d '{"organization_id":"...","project_id":"...","project_agent_id":"...","user_message":"Hello","history":[]}'
```
