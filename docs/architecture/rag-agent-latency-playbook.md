# RAG Agent Latency Playbook

This document explains why large AI products feel fast even when they run many model calls, and how to design this agent so latency stays low as features grow.

## Glossary

| Term | Full form | Meaning here |
|------|-----------|----------------|
| **ADR** | Architecture Decision Record | A short markdown note that records *what* was decided, *why*, alternatives, and consequences—so future changes do not repeat the same debate. |
| **SLO** | Service Level Objective | A numeric target for reliability or performance (e.g. “p95 chat latency ≤ 5s”) used to guide design and alerting—not a guarantee, but a goal you measure against. |

## Core idea

Fast products optimize for **time-to-first-value**, not "all backend work complete".

- Users perceive speed when first useful output appears quickly.
- Total backend work can still continue after first output.
- Latency control is an architecture decision, not just a model decision.

## Why large AI products feel smooth

They usually combine these patterns:

1. **Streaming-first UX**
   - Start rendering output quickly (first token / first chunk).
   - Even if total work takes longer, perceived latency is low.

2. **Critical path vs background path**
   - **Blocking request path** = work the server must finish *before* returning HTTP 200 (or before the first streamed chunk, if streaming). “Keep only minimal steps” means: put only what the user must see *in this turn* on that path; everything else is background/async.
   - Run non-essential steps asynchronously (after response starts/ends).

3. **Parallel fan-out**
   - Run independent retrieval/tool/model tasks concurrently.
   - Merge results instead of doing strict sequential chains.

4. **Tiered model strategy**
   - Fast/cheap models for routing, extraction, filtering.
   - Higher-quality model only for the final/high-impact generation step.

5. **Aggressive caching**
   - Cache model-resolution, config, retrieval, embeddings, and repeated context.
   - Reuse recent decisions and fetched data across turns.

6. **Speculative execution**
   - Pre-start likely branches in parallel.
   - Cancel losing branches once intent is known.

7. **Prompt/context minimization**
   - Strict token budgets for history, chunks, DB payload.
   - Smaller prompts reduce generation latency.

8. **Runtime/network engineering**
   - Warm workers, connection pooling, low-overhead serialization, colocated services.
   - Remove repeated per-request setup overhead.

## Problem to avoid

If every new feature is added to the blocking path, latency will keep growing linearly (or worse).  
Reducing a few calls now helps short-term, but does not protect future performance.

## Latency-safe architecture contract (future-proof)

Use this contract for every new capability:

### Blocking path budget

- Keep `/chat` to **one primary generation call** (or at most two in strict exceptions).
- Everything on blocking path must be justified by user-visible value in this turn.
- Target blocking path budget:
  - API/auth/validation: `<= 150ms`
  - model/context cache fetch: `<= 150ms`
  - retrieval (conditional): `<= 700ms`
  - primary generation: `<= 2200ms`
  - response assembly: `<= 150ms`
  - **Total target**: `~2.0s to 3.3s`

### Async path (non-blocking)

Move these out of blocking path:

- follow-up suggestions
- card enrichment and formatting extras
- analytics/telemetry writes
- memory updates and summarization
- offline quality checks/verifier audits
- expensive reranking/refinement that does not affect immediate answer

### Rules for new features

Every new feature must declare:

1. Is it blocking or async?
2. What user-visible value appears if this feature is delayed?
3. What is its worst-case latency contribution?
4. Can it be parallelized?
5. Can it be cached/reused?
6. What is fallback behavior on timeout?

If a feature cannot pass this review, it should not be added to blocking path.

## Implementation patterns for this agent

This section matches the earlier “why giants feel fast” list: streaming, async work, caching, and **parallel fan-out** (same idea as § “Parallel fan-out” above—applied concretely to this codebase).

1. **Stream answer immediately**
   - Start sending response as soon as primary generation begins/produces output.

2. **Async suggestions**
   - Do not block reply for suggestion generation.
   - Fetch suggestions via follow-up API/event and update UI when ready.

3. **Deterministic or cheap router first**
   - Use rule-based intent for obvious cases.
   - Escalate to LLM routing only for ambiguous queries.

4. **Conditional retrieval**
   - Skip retrieval for obvious small-talk.
   - Reuse retrieval context for related follow-up turns when valid.

5. **Per-agent TTL caches**
   - Cache model resolution/config and live DB metadata by `project_agent_id`.

6. **Prompt budget enforcement**
   - Cap history turns, chunk count, and chunk size.
   - Summarize large DB outputs before final generation.

7. **Parallel fan-out for independent work**
   - When steps do not depend on each other (e.g. model config fetch, live DB context reads, embedding + chunk match), run them **concurrently** and merge—total time ≈ max(step times), not sum.
   - This is the same “fan-out” pattern described under **Parallel fan-out** in “Why large AI products feel smooth”; it was listed there as principle and is spelled out here as implementation.

8. **Parallelize independent I/O (Supabase, etc.)**
   - Within the above, use concurrent awaits or thread pools for independent Supabase RPCs where the client stack allows it.

9. **SLO guardrails**
   - Define and monitor p50/p95 latency targets.
   - Add timeouts and graceful fallbacks for each stage.

## Suggested SLOs (Service Level Objectives)

- **Perceived first response** (stream start): `<= 1.0s` target
- **Blocking API completion** (non-stream mode): `<= 3.0s` target
- **p95 end-to-end**: `<= 5.0s` target

## Decision checklist for architecture reviews

Before merging any new agent feature:

- Does this increase blocking path time?
- Can the same value be delivered asynchronously?
- Is there a cache strategy?
- Is there a timeout and fallback?
- Is there a measurable latency budget impact?

## Recommended repository organization

For architecture/process changes, use docs and Architecture Decision Records (ADRs), not DB migrations.

- Architecture docs: `docs/architecture/`
- Optional ADRs (Architecture Decision Records): `docs/architecture/adr/`
- DB schema changes only: `docs/db-schema/migrations/`

## Answer to "Should we create migrations directory for architectural changes?"

**No**, not in database migrations.

- Use markdown docs/ADRs for architecture changes.
- Use DB migration scripts only for actual database schema/data changes.
