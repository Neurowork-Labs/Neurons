# RAG agent (FastAPI)

Python service that powers retrieval-augmented answers and optional structured **database** queries over rows stored in `public.document_database_table_data`.

## Features

- **RAG**: embed user query (Gemini, same family as the embedding worker) → `match_document_chunks` RPC → answer with Gemini.
- **Tools / DB path**: load exported table JSON into an in-memory **SQLite** database, shortlist tables, generate **SELECT-only** SQL with Gemini, validate, execute, then answer.
- **Auth**: Next.js calls this service with `X-RAG-Agent-Secret` (shared secret). Do not expose this secret to browsers.

## Environment

Copy `env.example` to `.env` and fill values.

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Service role** key (required for `document_chunks` RPC and DB tables) |
| `GOOGLE_LLM_API_KEY` | Google AI API key (Gemini) |
| `RAG_AGENT_INTERNAL_SECRET` | Shared secret with Next.js (`RAG_AGENT_INTERNAL_SECRET` in Vercel) |
| `GEMINI_EMBEDDING_MODEL` | Default `gemini-embedding-001` |
| `EMBEDDING_OUTPUT_DIMENSIONALITY` | Default `1536` (must match `document_chunks.embedding`) |
| `GEMINI_CHAT_MODEL` | Default `gemini-2.0-flash` |
| `RAG_MATCH_CHUNK_LIMIT` | Default `8` |
| `PORT` | Server port (default `8080`) |
| `USE_LANGCHAIN_SQL` | Default `true`; primary LangChain SQL path for live MySQL. Falls back to LlamaIndex (if enabled) or custom pipeline. |
| `LANGCHAIN_SQL_PROVIDER` | Default `google`; supported: `google`, `openai`, `anthropic`, `openrouter`. |
| `LANGCHAIN_SQL_MODEL` | Default `gemini-3-pro-preview` |
| `USE_LLAMAINDEX_SQL` | Default `false`; secondary LlamaIndex SQL path. Tried when LangChain is disabled or fails. |
| `LLAMAINDEX_SQL_PROVIDER` | Default `google`; supported: `google`, `openai`, `anthropic`, `openrouter`. |
| `LLAMAINDEX_SQL_MODEL` | Default `gemini-2.0-flash` |
| `RAG_AGENT_CORS_ORIGINS` | Optional comma-separated origins for direct browser access (normally unused; Next.js proxies) |

## Database prerequisites

Run incremental migrations (see `docs/db-schema/migrations/`), including:

- `2026-03-29-match-document-chunks-rpc.sql` — `match_document_chunks()` for pgvector search

## Local run

```bash
cd apps/agents/rag-agent
python environment/setup.py
source .venv/bin/activate
export PYTHONPATH=src
python src/main.py
```

Health: `GET http://localhost:8080/health`  
Chat: `POST http://localhost:8080/v1/chat` with headers `X-RAG-Agent-Secret` and JSON body (see `src/models/chat.py`).

## Render

Start command (example):

`PYTHONPATH=src python src/main.py`

Set the same environment variables as above.

## Next.js (Vercel)

- `RAG_AGENT_BASE_URL` — Render URL of this service (e.g. `https://rag-agent.onrender.com`).
- `RAG_AGENT_INTERNAL_SECRET` — same value as `RAG_AGENT_INTERNAL_SECRET` here.
- `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` — already required for server routes.

### Public widget

Embed (from your deployed Next.js app origin):

```html
<script
  src="https://YOUR_APP_ORIGIN/scripts/rag-agent-widget.js"
  data-api-key="aepk_..."
  data-project-agent-id="PROJECT_AGENT_UUID"
  data-agent-name="Your agent name"
  data-default-greetings="Hey how are you|We are doing well and are happy to assist you!"
  data-primary-color="#065f46"
  async
></script>
```

Optional `data-api-base-url` if the API lives on a different origin than the script URL.

Optional customization:

- `data-agent-name` sets the widget header title (defaults to `Chat` until history loads).
- `data-default-greetings` sets the first assistant greeting when the panel opens (supports string, JSON array, or `|`-separated paragraphs).
- `data-greeting` is a legacy alias for `data-default-greetings`.

Visitor chat: `POST /api/public/rag/chat` with header `X-API-Key` and JSON body `{ projectAgentId, message, visitorId, sessionId, conversationId?, pageUrl? }`.
