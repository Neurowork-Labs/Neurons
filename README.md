# Neurons
A marketplace of AI agents that integrate into any website through a lightweight JavaScript widget.

## Goal
Build agent marketplace from where anyone from anywhere in the world can integrate agents in their web applications or websites.

## Project Structure

```
.
├── apps
│   ├── agents
│   │   ├── conversational-agent
│   │   ├── follow-up-agent
│   │   └── lead-qualification-agent
│   ├── web
│   └── workers
│       ├── async
│       │   └── embedding-pipeline-worker
│       └── sync
├── .gitignore
├── README.md
└── supabase
    └── migrations

13 directories, 2 files
```

## System Architecture

### Architecture Diagram

```
mermaid

---
config:
  layout: dagre
---

%% author: Yagnik Poshiya
%% github: https://github.com/yagnikposhiya/Neurons

flowchart TB

  %% ========= Client Websites =========
  subgraph ClientWebsite["Client Website (WordPress / Next.js / React / etc.)"]
    VBrowser["Visitor Browser"]
    VWidget["Neurons Widget (widget.js)"]
    VForm["Lead Form / Contact Form<br>(Webhook)"]
    VBrowser --> VWidget
    VBrowser --> VForm
  end

  %% ========= Neurons Frontend =========
  subgraph NeuronsFrontend["Neurons Frontend (Next.js on Vercel)"]
    Dashboard["Owner Dashboard<br>(Configure agents, view leads, analytics)"]
  end

  %% ========= Public & Internal API Gateway =========  
  subgraph InternalAPI["Internal API Gateway"]
    AuthAPI["Authentication API"]
    StorageAPI["Upload/Fetch documents API"]
    CRUDAPIs["Create/Read/Update/Delete APIs"]
    PgvectorAPI["Pgvector API"]
  end
  
  subgraph PublicAPI["Public API Gateway<br>(Next.js API Routes @ api.neurons.com)"]
    ChatAPI["/public/chat/*<br>(conversational agent)"]
    LeadAPI["/public/lead-events<br>(lead ingestion)"]
  end

  subgraph APIGateway["API Gateway (Next.js API routes on Vercel)"]
    PublicAPI
    InternalAPI
  end

  %% ========= Core Backend & Storage =========
  subgraph Supabase["Supabase"]
    DB[("Supabase PostgreSQL<br>(users, agents, installations,<br>conversations, leads, followups)")]
    Vector["Supabase pgvector<br>(agent KB embeddings)"]
    Storage["Supabase Storage<br>(RAG documents / files)"]
    Auth["Supabase Auth<br>(owner identities, sessions)"]
  end

  %% ========= Upstash =========
  subgraph Upstash["Upstash"]
    RateLimiter["Redis<br>(Rate Limiting)"]
    QueueOne["Redis<br>(Queue-1)"]
    QueueTwo["Redis<br>(Queue-2)"]
    QueueThree["Redis<br>(Queue-3)"]
  end

  %% ========= Python Services =========
  subgraph PythonSync["Python Sync Workers"]
    ConvAgent["Conversational RAG Agent"]
  end

  subgraph PythonAsync["Python Async Workers"]
    LeadWorker["Lead Qualification Agent"]
    FollowupWorker["Instant Follow-up Agent"]
    PgvectorWorker["Create chunks, vectors & store into pgvector"]
  end

  subgraph PythonWorkers["Render<br>Python Workers"]
    PythonAsync
    PythonSync
  end

  %% ========= External Providers =========
  subgraph External["External Services"]
    Email["Twilio SendGrid<br>(Email)"]
    SMS["Twilio<br>(SMS)"]
    WA["Twilio<br>(WhatsApp)"]
    LLMProvider
  end

  subgraph LLMProvider["LLM Provider"]
    OpenRouter
  end

  subgraph OpenRouter["OpenRouter"]
    TextLLM["Text generation model"]
    EmbeddingLLM["Embedding model"]
  end

  %% ========= Flows =========

  %% --- Conversational Agent Flow ---
  VWidget -- User message/<br>Page context --> ChatAPI
  ChatAPI -- Authentication<br>Domain, Project, Subscription check --> Auth
  ChatAPI -- Rate limit check --> RateLimiter
  ChatAPI -- Load/save<br>conversations & messages --> DB
  ChatAPI -- RAG doc fetch<br>(if needed) --> Vector
  ChatAPI -- Call sync<br>conversational agent --> ConvAgent

  ConvAgent -- Fetch docs<br>(if needed)--> Vector
  ConvAgent -- LLM calls --> TextLLM
  ConvAgent -- Assistant reply,<br>citations, summary --> ChatAPI

  ChatAPI -- Store reply,<br>update summary --> DB
  ChatAPI -- Stream response --> VWidget

  %% --- Lead Ingestion & Qualification ---
  VForm -- HTTP POST /<br> JS fetch lead payload --> LeadAPI
  LeadAPI -- Authentication<br>Domain, Project, Subscription check --> Auth
  LeadAPI -- Rate limit check --> RateLimiter
  LeadAPI -- Store raw lead --> DB
  LeadAPI -- Enqueue<br>(lead_scoring job) --> QueueOne

  QueueOne -- Dequeue<br>(lead_scoring job) --> LeadWorker
  LeadWorker -- Fetch lead<br>(+ optional chat summary) --> DB
  LeadWorker -- LLM scoring:<br>Hot / Warm / Cold --> TextLLM
  LeadWorker -- Store score & reason,<br>update lead status --> DB
  LeadWorker -- Emit LeadQualified<br>event --> QueueTwo

  %% --- Instant Follow-up Agent ---
  QueueTwo -- LeadQualified event --> FollowupWorker
  FollowupWorker -- Fetch lead &<br>owner preferences --> DB
  FollowupWorker -- Generate<br>personalized text --> TextLLM
  FollowupWorker -- Send email --> Email
  FollowupWorker -- Send SMS --> SMS
  FollowupWorker -- Send WhatsApp --> WA
  FollowupWorker -- Store follow up<br>status & logs --> DB

  %% --- Dashboard / Owner Side ---
  Dashboard -- Sign in / Sign up --> AuthAPI
  Dashboard -- View conversations,<br>leads, follow ups --> CRUDAPIs
  Dashboard -- Upload docs for RAG --> StorageAPI
  Dashboard -- Index docs & embeddings --> PgvectorAPI


  %% --- Intrenal API & Owner Dashboard ---
  AuthAPI -- HTTPS --> Auth
  CRUDAPIs -- HTTPS --> DB
  StorageAPI -- HTTPS --> Storage
  PgvectorAPI -- Enqueue --> QueueThree
  QueueThree -- Dequeue --> PgvectorWorker
  PgvectorWorker -- HTTPS --> EmbeddingLLM
  PgvectorWorker -- HTTPS --> Vector
  PgvectorWorker -- Document metadata/status --> DB
  PgvectorWorker -- Download files --> Storage
```
<img width="8192" height="3074" alt="neurons-sys-arch-diagram" src="https://github.com/user-attachments/assets/ed267711-e079-41ef-a0ca-f89cb95117ce" />

### Tech-stack
| Component | Tool | Remark |
|-----------|------|--------|
| Frontend | Next.js | - |
| Backend | Next.js API routes + Supabase | - |
| Database | Supabase PostgreSQL | - |
| Auth | Supabase Auth | - |
| Vector store (RAG) | Supabase pgvector | For storing vectors of uploaded docs |
| Storage | Supabase Storage | - |
| Sync & Async workers | Python | For all agent' microservice architecture |
| Event queue | Upstash Redis | - |
| Rate limit | Upstash Redis | - |
| Frontend deployment | Vercel | - |
| Content Delivery Network (CDN) for Widget | Vercel | Serves Widget JavaScript to all customer sites. |
| SMS | Twilio | - |
| WhatsApp message | Twilio | - |
| Email | Twilio SendGrid | - |
| LLM Provider | OpenRouter | - |

### Required Secrets/Tokens
| Tool | Secret |
|------|--------|
| Supabase | `SUPABASE_URL` and `SUPABASE_API_KEY` |
| Upstash | `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` |
| Twilio SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` |
| Twilio WhatsApp message | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_WHATSAPP_NUMBER` |
| Twilio SendGrid | `SENDGRID_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, and `OPENROUTER_MODEL` |

## Widget Integration
> Widget integration is implemented using steps mentioned below:
1. Users write script tags in their website code.
```
<script
    src="your_deployed_app_origin/scripts/rag-agent-widget.js"
    data-api-key="aepk_TPP••••••••"
    data-project-agent-id="157d3dc5-fb7••••••••••••••••••••••••"
    async
>
</script>
```
2. Users’ browser downloads the Widget JavaScript and sends requests to Neurons’s CDN.
3. Based on the domain-key, it authenticates the request if it is a valid request then Neurons allows access to an agent otherwise throws **403**.
4. Widget script hosting: Vercel (in `public/` directory in Next.js project)

### Notes
1. The length of the domain-key is `2048 bits/256 bytes`.
2. User is able to regenerate the domain-key from the Neurons web application.
3. For session and conversation management, `visitor_id` and `conversation_id` are sent through payload. When a visitor visits a website then `32 lengths of uuids` are generated on the `client side` and `server side` respectively and stored into `localstorage `of the visitor's browser.
4. **Prompt structure**: Summary of old messages + Recent conversation window + Current input + System instructions
5. **Origin** and **Referrer** header will be used to know the domain and the page respectively from which request is coming.
6. **Context injection** is the core design pattern of this architecture.

#### Project Creation
1. User must have to create a project and allowed to link only a single domain (website) to newly created project.
2. User is able to connect each project to all listed agents.
3. A single user may have more than one project in the agent engine.
4. Subscription plan is applied to **PER PROJECT; NOT PER USER**.
5. The domain-key is generated **PER PROJECT PER USER**.

#### Billing
1. Messages per month
2. Tokens per month
3. Max concurrent conversations
4. After hitting plan limit, return **429 or 402**

#### Technical burst limits (to stop spam/abuse/bugs)
1. `# requests` per second/time-duration of seconds
2. `# requests` per minute per IP.

## Scope

### Hosting
1. Widget script hosting: Vercel

### Features
1. Public API integration (Only API)
2. Plugin for various platforms
3. SDK like ShadCN’s components for React/Next.js ecosystem
4. Mobile SDKs
