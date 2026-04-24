# Notes
1. Structures which are shown here are just for reference.

## General structure
```
neurons/
├─ apps/
│  ├─ web/              # Next.js app (dashboard + public APIs + widget build)
│  └─ workers/          # Python workers (sync + async agents)
├─ packages/
│  └─ shared-types/     # (optional later) shared schemas/types/openapi, etc.
├─ supabase/            # Supabase config & migrations (if using Supabase CLI)
├─ infra/               # Dockerfiles, Render configs, deployment scripts
├─ .github/             # CI workflows (optional)
├─ README.md
└─ package.json         # root dev scripts (lint, format, etc. for web)
```

## Next.js app structure
```
apps/web/
├─ app/
│  ├─ (marketing)/          # optional: landing pages
│  ├─ dashboard/            # owner-facing dashboard routes
│  ├─ api/
│  │  ├─ public/
│  │  │  ├─ chat/
│  │  │  │  └─ message/route.ts        # /public/chat/message
│  │  │  └─ lead-events/route.ts       # /public/lead-events
│  │  ├─ agents/route.ts               # internal CRUD for agents
│  │  ├─ installations/route.ts        # internal CRUD for installations
│  │  ├─ documents/route.ts            # upload/list docs (RAG)
│  │  └─ leads/route.ts                # list leads, follow-ups for dashboard
│  └─ layout.tsx
├─ components/
│  ├─ dashboard/
│  ├─ forms/
│  └─ shared/
├─ lib/
│  ├─ supabase.ts           # Supabase client (server-side)
│  ├─ auth.ts               # owner auth helpers
│  ├─ rate-limit.ts         # Upstash rate limiting helpers
│  ├─ conversations.ts      # chat & conversation logic
│  ├─ leads.ts              # lead creation + loading
│  ├─ agents.ts             # agent configuration logic
│  ├─ documents.ts          # doc metadata, status, etc.
│  └─ queue.ts              # enqueue jobs to Redis (lead_scoring, doc_ingestion)
├─ public/
│  └─ widget.js             # built widget bundle (from separate src)
├─ widget-src/              # optional: TS source for widget
├─ next.config.mjs
├─ package.json
└─ tsconfig.json
```

## Python workers structure
```
apps/workers/
├─ sync/
│  ├─ main.py               # entrypoint: Conversational RAG HTTP service (FastAPI)
│  ├─ agents/
│  │  └─ conversational.py  # ConvAgent implementation
│  ├─ rag/
│  │  ├─ retriever.py
│  │  └─ prompt_builder.py
│  ├─ llm/
│  │  └─ openrouter_client.py
│  ├─ models/
│  │  └─ schemas.py         # Pydantic models for requests/responses
│  └─ config.py
├─ async/
│  ├─ lead_worker.py        # consumes lead_scoring jobs
│  ├─ followup_worker.py    # consumes LeadQualified events
│  ├─ doc_ingestion_worker.py  # consumes doc_ingestion jobs
│  ├─ queue/
│  │  └─ redis_client.py    # Redis connection & job helpers
│  ├─ db/
│  │  └─ supabase_client.py # or HTTP client for Supabase RPC (if you use it)
│  ├─ llm/
│  │  └─ openrouter_client.py
│  ├─ email/
│  │  └─ sendgrid_client.py
│  ├─ sms/
│  │  └─ twilio_client.py
│  └─ config.py
├─ pyproject.toml
└─ README.md
```

## Supabase
```
supabase/
├─ migrations/
├─ seed.sql
└─ config.toml

infra/
├─ render/
│  ├─ workers-sync.yaml      # Render service definition (optional)
│  ├─ workers-async.yaml
├─ docker/
│  └─ workers.Dockerfile
└─ vercel.json               # if you want explicit config, optional
```

## Frontend setup with npm
1. Install npm and node in system globally. (Locally also works; specific to `frontend/` directory)
2. Create Next.js app with required features
```
npx create-next-app@latest .\
    --typescript \
    --app \
    --tailwind \
    --eslint \
    --src-dir \
    --import-alias "@/*"
```
3. Install Shadcn UI
```
npx shadcn@latest init
```
4. Configure and customize components using Shadcn CLI (as needed)
```
npx shadcn@latest add <component>
```

## Install Supabase using npm
```
npm install @supabase/supabase-js @supabase/ssr
```

## Font sizes in Next.js
1. text-xs → 0.75rem (12px), leading 1rem
2. text-sm → 0.875rem (14px), leading 1.25rem
3. text-base → 1rem (16px), leading 1.5rem
4. text-lg → 1.125rem (18px), leading 1.75rem
5. text-xl → 1.25rem (20px), leading 1.75rem
6. text-2xl → 1.5rem (24px), leading 2rem
7. text-3xl → 1.875rem (30px), leading 2.25rem
8. text-4xl → 2.25rem (36px), leading 2.5rem
9. text-5xl → 3rem (48px)
10. text-6xl → 3.75rem (60px)
11. text-7xl → 4.5rem (72px)
12. text-8xl → 6rem (96px)
13. text-9xl → 8rem (128px)

