# RAG agent widget — embed snippet

Host the script from your deployed Next.js app (`public/scripts/rag-agent-widget.js`).

Replace placeholders:

- `YOUR_DEPLOYED_APP` — production origin (e.g. `https://neurons.neuroworklabs.com`)
- `aepk_...` — project API key from the dashboard
- `YOUR_PROJECT_AGENT_UUID` — `public.project_agents.id` for the RAG agent on that project
- `data-primary-color` — optional UI accent (default matches app CTAs: emerald `#065f46`)
- `data-agent-name` — optional widget title (defaults to `Chat` until history loads)
- `data-default-greetings` — optional first assistant greeting when the panel opens (supports string, JSON array, or `|`-separated paragraphs; overrides the built-in default intro)
- `data-greeting` — legacy alias for `data-default-greetings`

```html
<script
  src="https://YOUR_DEPLOYED_APP/scripts/rag-agent-widget.js"
  data-api-key="aepk_..."
  data-project-agent-id="YOUR_PROJECT_AGENT_UUID"
  data-agent-name="Your agent name"
  data-default-greetings="Hey how are you|We are happy to assist you!"
  data-primary-color="#065f46"
  async
></script>
```

Optional: `data-api-base-url="https://YOUR_DEPLOYED_APP"` if the API origin differs from the script URL.

Public API: `POST /api/public/rag/chat` (see `apps/web/src/app/api/public/rag/chat/route.ts`).
