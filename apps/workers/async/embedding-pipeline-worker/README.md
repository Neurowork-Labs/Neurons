## Embedding pipeline worker

This service runs as a background worker (e.g. Render Background Worker). It polls
`public.document_processing_jobs`, downloads documents from Supabase Storage,
chunks them, creates embeddings, and writes into `public.document_chunks`.

### Local setup

From repo root:

```bash
python apps/workers/async/embedding-pipeline-worker/environment/setup.py
```

Activate the venv:

```bash
source apps/workers/async/embedding-pipeline-worker/.venv/bin/activate
```

Run:

```bash
python apps/workers/async/embedding-pipeline-worker/src/main.py
```

### Environment

This worker reads config from `.env` in this directory.

Required variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose to browser)
- `SUPABASE_DOCUMENTS_STORAGE_BUCKET`
- `SUPABASE_DOCUMENTS_DUMP_BUCKET`
- `GOOGLE_LLM_API_KEY`