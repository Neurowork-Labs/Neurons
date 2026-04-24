**Neurons — Database Schema Design (Iteration 3)**  
*AI Agent Marketplace — Supabase / PostgreSQL*  
 *  
 Scale target: 100–200 M monthly active users*  
 *  
 Last updated: 2026-03-24*  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSNBCkJfFSqwwIgHRiywEZJWQZeZ2ao9AAD+4lyruzq+ngAA8Nr1AOH8BeZxN/IIAAAAAElFTkSuQmCC)  
**Table of Contents**  
1. [Architecture Notes](#anchor-1 "#anchor-1")  
2. [Schema Conventions](#anchor-2 "#anchor-2")  
3. [Required Extensions](#anchor-3 "#anchor-3")  
4. [Tables](#anchor-4 "#anchor-4")  
- [4.1 Core Identity](#anchor-5 "#anchor-5")  
- [4.2 Geography (Reference)](#anchor-6 "#anchor-6")  
- [4.3 User Preferences](#anchor-7 "#anchor-7")  
- [4.4 Organization & Teams](#anchor-8 "#anchor-8")  
- [4.5 Plans & Models](#anchor-9 "#anchor-9")  
- [4.6 Projects](#anchor-10 "#anchor-10")  
- [4.7 Agents](#anchor-11 "#anchor-11")  
- [4.8 Subscriptions & Billing](#anchor-12 "#anchor-12")  
- [4.9 Usage Tracking](#anchor-13 "#anchor-13")  
- [4.10 RAG — Conversations & Visitors](#anchor-14 "#anchor-14")  
- [4.11 RAG — Knowledge Base](#anchor-15 "#anchor-15")  
- [4.12 Notifications](#anchor-16 "#anchor-16")  
- [4.13 Audit & Security](#anchor-17 "#anchor-17")  
5. [Indexes](#anchor-18 "#anchor-18")  
6. [Functions & Triggers](#anchor-19 "#anchor-19")  
7. [RLS Policies](#anchor-20 "#anchor-20")  
8. [Partitioning Strategy](#anchor-21 "#anchor-21")  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQmAABRAsSd4NIGJjPWxpgGsYQVvImwJtszMXp0BAPAX91pt1fH1BACA164HhZwEOFrXVOsAAAAASUVORK5CYII=)  
**1. Architecture Notes**  
**Scale Considerations (100–200 M MAU)**  
- **Connection pooling** — Use Supabase's built-in PgBouncer (transaction mode). Application should use the pooled connection string for all queries.  
- **Read replicas** — Enable Supabase read replicas for dashboard analytics, billing summaries, and any read-heavy path. Write path stays on the primary.  
- **UUID v7 (time-sortable)** — Prefer uuid_generate_v7() (available via pg_uuidv7 extension or Supabase's built-in) over gen_random_uuid() for all user-facing entity PKs. Time-sorted UUIDs vastly improve B-tree index locality and range-scan performance at scale. If v7 is unavailable, gen_random_uuid() is acceptable but consider switching later.  
- **Partial indexes** — Every table with is_deleted gets a partial index WHERE is_deleted = FALSE on its most-queried columns. This keeps index size small and speeds up all "active record" queries.  
- **Partitioning** — High-write tables (messages, agent_executions, audit_logs) should be range-partitioned by created_at (monthly). See [Section 8.](#anchor-21 "#anchor-21")  
- **Archival** — Use pg_cron to move soft-deleted or aged-out rows to archive tables or cold storage quarterly.  
**Soft-Delete Strategy (Improvement over Iteration 2)**  
The previous design placed is_deleted on every table and proposed cascading is_deleted = TRUE from public.users to all related tables. **This does not scale** because:  
1. **Write amplification** — One user deletion triggers updates across dozens of rows in many tables.  
2. **Lock contention** — Large multi-table transactions block concurrent writes.  
3. **Query overhead** — Every query must include WHERE is_deleted = FALSE.  
**New approach:**  
| | |  
|-|-|  
| **Table category** | **Strategy** |   
| **Lookup / reference tables** (statuses, types, countries, languages) | Use is_active boolean (default TRUE). These rows are never truly deleted; they are deactivated. No need for soft-delete semantics. |   
| **Core entity tables** (users, organizations, projects, agents, project_agents) | Keep is_deleted with a partial index WHERE is_deleted = FALSE. **Do NOT cascade.** If a user is soft-deleted they cannot authenticate via Supabase Auth, so their data is unreachable through the API. |   
| **High-volume tables** (messages, agent_executions, audit_logs) | **No soft-delete.** These are append-only. Stale data is purged or archived by pg_cron jobs after a retention period (e.g., 90 days for raw executions, 12 months for messages). |   
| **Billing tables** (subscriptions, invoices, payments) | **No soft-delete.** Financial records are immutable for audit compliance. Mark as canceled / void via status columns. |   
   
**Cleanup**: A nightly pg_cron job can cascade-deactivate related rows for deleted users asynchronously, outside of the request path.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSNhwgJuUPYDMpnRgQU2QtIq6DIze3UGAMBf3Gu1VcfXEwAAXrseaHEEM+cJoFcAAAAASUVORK5CYII=)  
**2. Schema Conventions**  
| | |  
|-|-|  
| **Convention** | **Rule** |   
| Primary key column | Always id |   
| Foreign key column | {referenced_table_singular}_id (e.g., organization_id) |   
| Timestamps | created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now() on every table |   
| Soft-delete | is_deleted BOOLEAN NOT NULL DEFAULT FALSE on core entity tables |   
| Active flag | is_active BOOLEAN NOT NULL DEFAULT TRUE on lookup/reference tables |   
| UUID generation | gen_random_uuid() (upgrade to uuid_generate_v7() when available) |   
| Text enums | New tables with fewer than 10 fixed status values use TEXT + CHECK constraint instead of a FK to a lookup table (reduces JOINs) |   
| updated_at auto-update | All tables use the set_updated_at() trigger |   
   
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSPBCj5fFgpQwYwEZiywEZJWQZeZ2ao9AAD+4lyruzq+ngAA8Nr1AMTRBeEgNK9YAAAAAElFTkSuQmCC)  
**3. Required Extensions**  
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation  
 CREATE EXTENSION IF NOT EXISTS "pgcrypto";        -- gen_random_uuid(), hashing  
 CREATE EXTENSION IF NOT EXISTS "vector";          -- pgvector for embeddings  
 CREATE EXTENSION IF NOT EXISTS "pg_cron";         -- scheduled jobs (usage rollups, archival)  
 CREATE EXTENSION IF NOT EXISTS "pgsodium";        -- encryption (Supabase Vault)  
 CREATE EXTENSION IF NOT EXISTS "supabase_vault";  -- secret storage for LLM API keys  
   
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANElEQVR4nO3OMQ0AIAwAwZIgBKnVgjN8dGDBABMhuZt+/JaZIyJmAADwi9VP1NMNAABu1AaU3AUhiyfJeAAAAABJRU5ErkJggg==)  
**4. Tables**  
**4.1 Core Identity**  
*public.users*  
*Mirrors * *auth.users* *. Created automatically via a trigger on * *auth.users* * INSERT.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | — | YES | auth.users(id) ON DELETE CASCADE | Same ID as Supabase Auth |   
| first_name | text | NO | — |   |   |   |   
| last_name | text | NO | — |   |   |   |   
| email | text | NO | — |   |   | Synced from auth.users; unique identity for lookups |   
| country_id | bigint | YES | — |   | public.countries(id) | Used to determine payment gateway (IN → Razorpay, else → Stripe) |   
| is_deleted | boolean | NO | FALSE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(email)  
**Changes from i2:** Added country_id (needed for payment gateway routing). Avatar is not stored in DB (e.g. use auth.users metadata or client-only UI).  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OYQ1AABSAwc8mi5wvlAB6CKCAACr4Z7a7BLfMzFYdAQDwF+da3dX+9QQAgNeuB6fWBdZMUxZ2AAAAAElFTkSuQmCC)  
**4.2 Geography (Reference Data)**  
*public.countries*  
*Seed data — all world countries. Used for address, payment gateway selection, and phone codes.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | bigint | NO | GENERATED ALWAYS AS IDENTITY | YES |   |   |   
| iso2 | text | NO | — |   |   | e.g., IN, US |   
| iso3 | text | NO | — |   |   | e.g., IND, USA |   
| name | text | NO | — |   |   |   |   
| phone_code | text | NO | — |   |   | e.g., +91, +1 |   
| currency_code | text | YES | — |   |   | e.g., INR, USD — used for billing |   
| is_active | boolean | NO | TRUE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(iso2), UNIQUE(iso3)  
**Changes from i2:** Replaced is_deleted with is_active. Added currency_code.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANElEQVR4nO3OQQmAUBBAwSd8bOHVnBvBkAaxgjcRZhLMNjNHdQUAwF/cq9qr8+sJAACvrQctgQNH4A++9QAAAABJRU5ErkJggg==)  
*public.states*  
*Seed data — states/provinces per country.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | bigint | NO | GENERATED ALWAYS AS IDENTITY | YES |   |   |   
| country_id | bigint | NO | — |   | public.countries(id) |   |   
| code | text | YES | — |   |   | State/province code |   
| name | text | NO | — |   |   |   |   
| is_active | boolean | NO | TRUE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Changes from i2:** Replaced is_deleted with is_active.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsSfYxZo/kC1sYQLPJrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA4qzBdC53Vr8AAAAAElFTkSuQmCC)  
**4.3 User Preferences**  
*public.languages*  
*Available UI languages. Renamed from * *plans.languages* * (incorrect schema prefix in i2).*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| name | text | NO | — |   |   | e.g., English, Hindi, Spanish |   
| code | text | NO | — |   |   | ISO 639-1 code, e.g., en, hi |   
| is_active | boolean | NO | TRUE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(code)  
**Changes from i2:** Moved from plans schema to public. Added code. Replaced is_deleted with is_active.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANElEQVR4nO3OQQmAABRAsad4FCtY9ecwnkms4E2ELcGWmTmrKwAA/uLeqrU6vp4AAPDa/gDzUgM9+S8z3AAAAABJRU5ErkJggg==)  
*public.settings*  
*Per-user application preferences. Auto-created on user signup. Theme preference is stored in the browser's * *localStorage* * (not in the database) to avoid unnecessary DB storage at scale.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| user_id | uuid | NO | — |   | public.users(id) ON DELETE CASCADE | One-to-one with users |   
| language_id | uuid | NO | get_default_language_id() |   | public.languages(id) |   |   
| timezone | text | YES | 'UTC' |   |   | IANA timezone, e.g., Asia/Kolkata |   
| email_notifications | boolean | NO | TRUE |   |   |   |   
| in_app_notifications | boolean | NO | TRUE |   |   |   |   
| is_deleted | boolean | NO | FALSE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(user_id)  
**Changes from i2:** Added timezone, notification preferences. Theme stored in browser localStorage, not in DB.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQmAABRAsSfYxKK/kJXEkyE8WcGbCFuCLTOzVXsAAPzFsVZ3dX4cAQDgvesB/vEF9H9odtUAAAAASUVORK5CYII=)  
*public.cookie_consents*  
*GDPR / privacy consent tracking per user. Auto-created on user signup.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| user_id | uuid | NO | — |   | public.users(id) ON DELETE CASCADE | One-to-one with users |   
| analytics | boolean | NO | TRUE |   |   |   |   
| marketing | boolean | NO | TRUE |   |   |   |   
| is_deleted | boolean | NO | FALSE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(user_id)  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OsQ1AABRAwSdRaPXGMOCv7WkPK+hEcjfBLTNzVFcAAPzFvVZbdX49AQDgtf0BSpoDXv5TGXgAAAAASUVORK5CYII=)  
**4.4 Organization & Teams**  
*public.organization_statuses*  
*Lookup: active, suspended, paused.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| name | text | NO | — |   |   | e.g., active, suspended, paused |   
| is_active | boolean | NO | TRUE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(name)  
**Changes from i2:** PK is now NOT NULL. Replaced is_deleted with is_active.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQmAABRAsSdYxZ4/mJjEsxE8W8GbCFuCLTOzVXsAAPzFuVZ3dXw9AQDgtesBxPEF3bv7x0IAAAAASUVORK5CYII=)  
*public.organizations*  
*Top-level billing entity. Each organization subscribes to a plan.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| name | text | NO | — |   |   |   |   
| slug | text | NO | — |   |   | URL-safe unique identifier |   
| owner_id | uuid | NO | — |   | public.users(id) | Organization creator / primary owner |   
| status_id | uuid | NO | — |   | public.organization_statuses(id) |   |   
| country_id | bigint | YES | — |   | public.countries(id) | Billing country — determines payment gateway |   
| address_line_1 | text | YES | — |   |   |   |   
| address_line_2 | text | YES | — |   |   |   |   
| city | text | YES | — |   |   |   |   
| state_id | bigint | YES | — |   | public.states(id) |   |   
| zipcode | text | YES | — |   |   |   |   
| plan_id | uuid | NO | get_default_plan_id() |   | public.plans(id) | Denormalized current plan for fast reads. Source of truth is subscriptions table. |   
| is_deleted | boolean | NO | FALSE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(slug)  
**Changes from i2:** Renamed user_id to owner_id for clarity. Added slug, country_id. plan_id now defaults via get_default_plan_id().  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSPBCj5fFgpQwYwEZiywEZJWQZeZ2ao9AAD+4lyruzq+ngAA8Nr1AMTRBeEgNK9YAAAAAElFTkSuQmCC)  
*public.organization_members* *(NEW)*  
*Team members within an organization. The owner is also a member with role * *owner* *. Required for multi-user organizations.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| organization_id | uuid | NO | — |   | public.organizations(id) ON DELETE CASCADE |   |   
| user_id | uuid | NO | — |   | public.users(id) |   |   
| role | text | NO | 'member' |   |   | CHECK: owner, admin, member, viewer |   
| invited_by | uuid | YES | — |   | public.users(id) | NULL for the founding owner |   
| joined_at | timestamptz | YES | — |   |   | NULL until invitation accepted |   
| is_deleted | boolean | NO | FALSE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(organization_id, user_id)  
**Check constraints:** CHECK (role IN ('owner', 'admin', 'member', 'viewer'))  
**Design note:** When a user creates an organization, a trigger auto-inserts an organization_members row with role = 'owner' and joined_at = now().  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSNhZscZXlheJwqQgQU2QtIq6DIze3UGAMBf3Gu1VcfXEwAAXrseop8EQrmJduIAAAAASUVORK5CYII=)  
**4.5 Plans & Models**  
*public.support_types*  
*Lookup: community, email, priority, dedicated.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| name | text | NO | — |   |   |   |   
| is_active | boolean | NO | TRUE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(name)  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSNBCkLfE07YGfHAiAU2QtIq6DIzW7UHAMBfnGt1V8fXEwAAXrse4eQF6VhvmPsAAAAASUVORK5CYII=)  
*public.model_tiers* *(NEW)*  
*Groups LLM models into access tiers mapped to plans. Higher-tier plans can access all lower tiers.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| name | text | NO | — |   |   | e.g., basic, standard, advanced, premium |   
| min_plan_index | integer | NO | — |   |   | Minimum plans.index required to use this tier. 0 = Free, 1 = Plus, 2 = Pro, 3 = Enterprise |   
| description | text | YES | — |   |   |   |   
| is_active | boolean | NO | TRUE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(name), UNIQUE(min_plan_index)  
**Seed data:**  
| | | |  
|-|-|-|  
| **name** | **min_plan_index** | **description** |   
| basic | 0 | Available on all plans (e.g., GPT-4o Mini, Haiku) |   
| standard | 1 | Plus and above (e.g., GPT-4o, Sonnet) |   
| advanced | 2 | Pro and above (e.g., GPT-4.1, Opus) |   
| premium | 3 | Enterprise only (e.g., fine-tuned, dedicated capacity) |   
   
**Why this exists:** The i2 design had plan_id directly on public.models, creating a rigid 1-to-1 mapping. A model tier system allows higher plans to access all lower-tier models naturally: user.plan.index >= model.tier.min_plan_index.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSNBACPykMH4NpGACyywEZJWQZeZ2aszAAD+4l6rrTo+jgAA8N71AL/CBEiG5xPoAAAAAElFTkSuQmCC)  
*public.plans*  
*Organization-level subscription plans with limits and features.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| name | text | NO | — |   |   | Free, Plus, Pro, Enterprise |   
| index | integer | NO | — |   |   | Sort order and tier level: 0, 1, 2, 3 |   
| max_projects_per_org | integer | NO | — |   |   | -1 = unlimited |   
| max_agents_per_project | integer | NO | — |   |   | -1 = unlimited |   
| monthly_execution_limit | bigint | NO | — |   |   | Total agent executions per org per month. -1 = unlimited |   
| rate_limit_rps | integer | NO | — |   |   | Requests per second per org |   
| concurrency_limit | integer | NO | — |   |   | Max parallel agent jobs per org |   
| max_model_tier_index | integer | NO | — |   |   | Highest model_tiers.min_plan_index accessible |   
| default_model_id | uuid | YES | — |   | public.models(id) | Default LLM when project_agents.model_id is null (“Use default model”). ON DELETE SET NULL |   
| support_type_id | uuid | NO | — |   | public.support_types(id) |   |   
| has_sla | boolean | NO | FALSE |   |   |   |   
| queue_priority | integer | NO | 0 |   |   | Higher = processed first. 0 = lowest |   
| max_document_storage_mb_per_org | integer | NO | 100 |   |   | Max storage for RAG documents per org |   
| overage_enabled | boolean | NO | FALSE |   |   | Whether usage beyond monthly limit incurs charges |   
| overage_cost_per_1k | numeric(10,4) | YES | — |   |   | USD cost per 1,000 additional executions |   
| is_active | boolean | NO | TRUE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(name), UNIQUE(index)  
**Changes from i2:** Renamed columns for clarity (e.g., rate_limit_per_organization → rate_limit_rps). Added max_model_tier_index, max_document_storage_mb_per_org, overage columns. Replaced is_deleted with is_active. Removed support_id → renamed to support_type_id.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsScYxpg/h5VMYARvRrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA224BcUMk6pDAAAAAElFTkSuQmCC)  
*public.plan_prices* *(NEW)*  
*Multi-currency pricing for each plan. Supports different billing intervals and maps to Stripe/Razorpay price objects.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| plan_id | uuid | NO | — |   | public.plans(id) |   |   
| currency | text | NO | — |   |   | ISO 4217: USD, INR, etc. |   
| billing_interval | text | NO | — |   |   | CHECK: monthly, yearly |   
| amount | numeric(10,2) | NO | — |   |   | Price in the specified currency |   
| stripe_price_id | text | YES | — |   |   | Stripe Price object ID, e.g., price_xxx |   
| razorpay_plan_id | text | YES | — |   |   | Razorpay Plan ID |   
| is_active | boolean | NO | TRUE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(plan_id, currency, billing_interval)  
**Check constraints:** CHECK (billing_interval IN ('monthly', 'yearly')), CHECK (amount >= 0)  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AUBBAsUfyVTCg9UygEBVsWGAjJK2CbjNzVGcAAPzFtapV7V9PAAB47X4AEWIEM8iQs0EAAAAASUVORK5CYII=)  
*public.models*  
*Available LLM models. Managed by the developer (admin). Users consume these through agents.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| name | text | NO | — |   |   | e.g., gpt-4o, claude-sonnet-4 |   
| display_name | text | NO | — |   |   | Human-readable name for UI |   
| model_tier_id | uuid | NO | — |   | public.model_tiers(id) | Which access tier this model belongs to |   
| provider_name | text | NO | — |   |   | e.g., OpenAI, Anthropic, Google |   
| provider_url | text | YES | — |   |   | Provider website |   
| model_identifier | text | NO | — |   |   | API model string, e.g., gpt-4o-2024-08-06 |   
| input_cost_per_1m_tokens | numeric(10,4) | YES | — |   |   | USD cost per 1M input tokens (for usage billing) |   
| output_cost_per_1m_tokens | numeric(10,4) | YES | — |   |   | USD cost per 1M output tokens |   
| max_context_tokens | integer | YES | — |   |   | Model context window size |   
| description | text | YES | — |   |   |   |   
| is_active | boolean | NO | TRUE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(name)  
**Changes from i2:** Removed api_hash (LLM API keys now stored in Supabase Vault — see [Section 4.13). Removed plan_id (replaced by model_tier_id for flexible tier-based access). Removed model_url. Added display_name, model_identifier, token costs, max_context_tokens.](#anchor-17 "#anchor-17")  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSNhZscaUpheJwqQgQU2QtIq6DIze3UGAMBf3Gu1VcfXEwAAXrseopcEQ2uoYnwAAAAASUVORK5CYII=)  
*public.worker_models* *(NEW)*  
*Worker-only model catalog used by background services (embedding, reranking, OCR helpers). Not used by agent model picker.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| name | text | NO | — |   |   | Internal key, e.g., gemini-embedding-001 |   
| display_name | text | NO | — |   |   | Human-readable label |   
| provider_name | text | NO | — |   |   | e.g., Google, OpenAI |   
| provider_url | text | YES | — |   |   | Provider website/docs |   
| model_identifier | text | NO | — |   |   | Exact API model identifier used by worker |   
| input_cost_per_1m_tokens | numeric(10,4) | YES | — |   |   | USD cost per 1M input tokens |   
| output_cost_per_1m_tokens | numeric(10,4) | YES | — |   |   | Optional output pricing (for future worker tasks) |   
| max_context_tokens | integer | YES | — |   |   | Model context window |   
| description | text | YES | — |   |   |   |   
| is_active | boolean | NO | TRUE |   |   | Soft disable model without deleting |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
  
**Unique constraints:** UNIQUE(name)  
**4.6 Projects**  
*public.project_statuses*  
*Lookup: active, paused, archived.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| name | text | NO | — |   |   |   |   
| is_active | boolean | NO | TRUE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(name)  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSNBCkLfE07YGfHAiAU2QtIq6DIzW7UHAMBfnGt1V8fXEwAAXrse4eQF6VhvmPsAAAAASUVORK5CYII=)  
*public.projects*  
*A project represents a website/domain where AI agents are deployed. One project = one domain.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| organization_id | uuid | NO | — |   | public.organizations(id) |   |   
| title | text | NO | — |   |   |   |   
| description | text | YES | — |   |   |   |   
| domain | text | YES | — |   |   | e.g., example.com. One domain per project. |   
| verification_token | text | YES | — |   |   | Backend-generated token for domain ownership verification via DNS TXT record or HTML meta tag |   
| is_domain_verified | boolean | NO | FALSE |   |   | Set to TRUE after domain ownership is confirmed |   
| domain_verified_at | timestamptz | YES | — |   |   |   |   
| status_id | uuid | NO | — |   | public.project_statuses(id) |   |   
| is_deleted | boolean | NO | FALSE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(domain) where domain is not null (partial unique index — no two projects can claim the same domain)  
**Domain verification flow:**  
1. User enters domain when creating/editing a project.  
2. Backend generates a random verification_token (e.g., ae_verify_a8f3b2c1d4e5) and stores it on the project row.  
3. User adds a DNS TXT record: _neurons.example.com TXT ae_verify_a8f3b2c1d4e5 — OR — adds <meta name="neurons-verification" content="ae_verify_a8f3b2c1d4e5"> to their homepage.  
4. User clicks "Verify" in the dashboard → backend checks DNS/HTML → if token matches, sets is_domain_verified = TRUE and domain_verified_at = now().  
**Changes from i2:** Renamed status to status_id. Replaced domain_id FK with inline domain column + verification fields. Added description.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAM0lEQVR4nO3OMQ0AIAwAwdIgBKl1gjacsGCAiZDcTT9+q6oRETMAAPjF6ify6QYAADdyA9Y0AypN+bdfAAAAAElFTkSuQmCC)  
*public.project_api_keys* *(NEW)*  
*API keys issued to projects for calling neurons from client websites. Keys are SHA-256 hashed; the full key is shown only once at creation time.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| project_id | uuid | NO | — |   | public.projects(id) ON DELETE CASCADE |   |   
| name | text | NO | — |   |   | User-given label, e.g., "Production", "Staging" |   
| key_hash | text | NO | — |   |   | SHA-256 hash of the full API key |   
| key_prefix | text | NO | — |   |   | First 8 characters for identification in UI |   
| last_used_at | timestamptz | YES | — |   |   |   |   
| expires_at | timestamptz | YES | — |   |   | NULL = never expires |   
| is_active | boolean | NO | TRUE |   |   | Allows key rotation without deletion |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(key_hash)  
**Auth flow:** Incoming request → extract API key from X-API-Key header → SHA-256 hash → lookup in project_api_keys → get project_id → validate request Origin against projects.domain → process request.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSNBCkJfFEIwwIgHRiywEZJWQZeZ2ao9AAD+4lyruzq+ngAA8Nr1AOHsBegrsOrIAAAAAElFTkSuQmCC)  
**4.7 Agents**  
*public.agent_types* *(NEW)*  
*Categories of agents available in the marketplace.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| name | text | NO | — |   |   | e.g., rag, chatbot, lead_qualifier, form_filler |   
| display_name | text | NO | — |   |   | e.g., "RAG Assistant", "Chatbot" |   
| description | text | YES | — |   |   |   |   
| icon_url | text | YES | — |   |   |   |   
| is_active | boolean | NO | TRUE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(name)  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSNhYMEBIpD4ArCJDyywEZJWQZeZOaorAAD+4l6rrTq/ngAA8Nr+AEqmA1hl45m5AAAAAElFTkSuQmCC)  
*public.agent_statuses*  
*Lookup: active, inactive, maintenance, deprecated.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| name | text | NO | — |   |   |   |   
| is_active | boolean | NO | TRUE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(name)  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsSfYxZo/jkUsYQLPJrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA4rDBc72meO5AAAAAElFTkSuQmCC)  
*public.agents*  
*Agent catalog — created and maintained by the developer. Users link agents to their projects via * *project_agents* *.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| name | text | NO | — |   |   | Internal identifier, e.g., rag-v1 |   
| display_name | text | NO | — |   |   | Marketplace-facing name |   
| type_id | uuid | NO | — |   | public.agent_types(id) |   |   
| status_id | uuid | NO | — |   | public.agent_statuses(id) |   |   
| default_model_id | uuid | NO | — |   | public.models(id) | Default LLM; can be overridden per project_agent |   
| system_instruction | text | NO | — |   |   | Base system prompt |   
| description | text | YES | — |   |   | Marketplace description |   
| icon_url | text | YES | — |   |   |   |   
| version | text | NO | '1.0.0' |   |   | Semver |   
| config_schema | jsonb | YES | — |   |   | JSON Schema defining what config options the user can set in project_agents |   
| is_public | boolean | NO | FALSE |   |   | Visible in marketplace when TRUE |   
| requires_document_embedding | boolean | NO | FALSE |   |   | When TRUE, uploads for this agent should be queued for chunking + embedding (RAG knowledge base) |   
| is_deleted | boolean | NO | FALSE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(name, version)  
**Changes from i2:** Added type_id, display_name, description, icon_url, version, config_schema. Renamed model_id to default_model_id.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsSeYxZw/lieLGMACBrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA6fGBdgoVMwYAAAAAElFTkSuQmCC)  
*public.project_agents*  
*Junction table: links agents to projects. This is the user's "instance" of an agent within their project. Many-to-many: one project has many agents, one agent is used by many projects.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| project_id | uuid | NO | — |   | public.projects(id) ON DELETE CASCADE |   |   
| agent_id | uuid | NO | — |   | public.agents(id) |   |   
| status_id | uuid | NO | — |   | public.agent_statuses(id) | Status of this agent within this project |   
| model_id | uuid | YES | — |   | public.models(id) | Override model; NULL = use agents.default_model_id. Must satisfy plan's tier access. |   
| user_instruction | text | YES | — |   |   | User's custom instructions appended to system prompt |   
| config | jsonb | YES | — |   |   | User's config overrides (validated against agents.config_schema) |   
| greeting | text | YES | — |   |   | Custom greeting message shown when the widget opens. NULL = use default. |   
| is_deleted | boolean | NO | FALSE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(project_id, agent_id)  
**Changes from i2:** Renamed agent_status to status_id. Added model_id override, config.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSNhZscaUpheJwqQgQU2QtIq6DIze3UGAMBf3Gu1VcfXEwAAXrseopcEQ2uoYnwAAAAASUVORK5CYII=)  
**4.8 Subscriptions & Billing**  
*public.subscriptions* *(NEW)*  
*Tracks the active subscription for each organization. Source of truth for billing state. One active subscription per organization at a time (historical records kept).*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| organization_id | uuid | NO | — |   | public.organizations(id) |   |   
| plan_id | uuid | NO | — |   | public.plans(id) |   |   
| plan_price_id | uuid | YES | — |   | public.plan_prices(id) | Specific price entry (currency + interval) |   
| status | text | NO | 'active' |   |   | CHECK: trialing, active, past_due, canceled, paused, incomplete |   
| payment_gateway | text | YES | — |   |   | CHECK: stripe, razorpay. NULL for free plan. |   
| stripe_subscription_id | text | YES | — |   |   | Stripe Subscription ID |   
| razorpay_subscription_id | text | YES | — |   |   | Razorpay Subscription ID |   
| current_period_start | timestamptz | NO | now() |   |   |   |   
| current_period_end | timestamptz | NO | — |   |   |   |   
| cancel_at_period_end | boolean | NO | FALSE |   |   | If TRUE, subscription downgrades/cancels at period end |   
| canceled_at | timestamptz | YES | — |   |   | When the user requested cancellation |   
| trial_start | timestamptz | YES | — |   |   |   |   
| trial_end | timestamptz | YES | — |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Check constraints:** CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'paused', 'incomplete'))  
**Design note:** Free-plan organizations get a subscription row with status = 'active', payment_gateway = NULL, and the free plan's plan_id. This simplifies queries — every org always has a subscription.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSPBCj7fFjsymJHAjAU2QtIq6DIzW7UHAMBfnGt1V8fXEwAAXrsexNkF4H1/HJoAAAAASUVORK5CYII=)  
*public.invoices* *(NEW)*  
*Monthly invoices generated for each billing period. Includes base subscription + overage charges.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| organization_id | uuid | NO | — |   | public.organizations(id) |   |   
| subscription_id | uuid | NO | — |   | public.subscriptions(id) |   |   
| status | text | NO | 'draft' |   |   | CHECK: draft, open, paid, void, uncollectible |   
| currency | text | NO | — |   |   | ISO 4217 |   
| subtotal | numeric(12,2) | NO | 0 |   |   | Base plan cost |   
| overage_amount | numeric(12,2) | NO | 0 |   |   | Additional usage charges |   
| tax_amount | numeric(12,2) | NO | 0 |   |   | GST/VAT if applicable |   
| total | numeric(12,2) | NO | 0 |   |   | subtotal + overage + tax |   
| amount_paid | numeric(12,2) | NO | 0 |   |   |   |   
| period_start | timestamptz | NO | — |   |   |   |   
| period_end | timestamptz | NO | — |   |   |   |   
| due_date | timestamptz | YES | — |   |   |   |   
| paid_at | timestamptz | YES | — |   |   |   |   
| stripe_invoice_id | text | YES | — |   |   |   |   
| razorpay_invoice_id | text | YES | — |   |   |   |   
| hosted_invoice_url | text | YES | — |   |   | Link to hosted payment page |   
| pdf_url | text | YES | — |   |   | Download link for invoice PDF |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Check constraints:** CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible'))  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSPBCUZfE2IYmVDBhAU2QtIq6DIzW7UHAMBfnGt1V8fXEwAAXrse/xcF7U7sx4wAAAAASUVORK5CYII=)  
*public.payments* *(NEW)*  
*Individual payment attempts. One invoice can have multiple payment attempts (retries on failure).*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| organization_id | uuid | NO | — |   | public.organizations(id) |   |   
| invoice_id | uuid | YES | — |   | public.invoices(id) | NULL for standalone payments (e.g., one-time charges) |   
| payment_method_id | uuid | YES | — |   | public.payment_methods(id) |   |   
| amount | numeric(12,2) | NO | — |   |   |   |   
| currency | text | NO | — |   |   |   |   
| status | text | NO | 'pending' |   |   | CHECK: pending, processing, succeeded, failed, refunded, partially_refunded |   
| payment_gateway | text | NO | — |   |   | CHECK: stripe, razorpay |   
| gateway_payment_id | text | YES | — |   |   | Stripe PaymentIntent ID or Razorpay Payment ID |   
| gateway_response | jsonb | YES | — |   |   | Raw response from gateway for debugging |   
| failure_reason | text | YES | — |   |   |   |   
| paid_at | timestamptz | YES | — |   |   |   |   
| refunded_at | timestamptz | YES | — |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Check constraints:** CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded')), CHECK (payment_gateway IN ('stripe', 'razorpay'))  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQmAABRAsSeYxKS/kJkED6bwYAVvImwJtszMVu0BAPAXx1rd1fn1BACA164HHDwF+DpPyKwAAAAASUVORK5CYII=)  
*public.payment_methods* *(NEW)*  
*Stored payment methods per organization (cards, UPI, bank accounts).*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| organization_id | uuid | NO | — |   | public.organizations(id) |   |   
| payment_gateway | text | NO | — |   |   | CHECK: stripe, razorpay |   
| gateway_method_id | text | NO | — |   |   | Stripe PaymentMethod ID or Razorpay Token |   
| type | text | NO | — |   |   | card, upi, bank_transfer, wallet |   
| last_four | text | YES | — |   |   | Last 4 digits of card/account |   
| brand | text | YES | — |   |   | Card brand or UPI app name |   
| exp_month | integer | YES | — |   |   | Card expiry month |   
| exp_year | integer | YES | — |   |   | Card expiry year |   
| is_default | boolean | NO | FALSE |   |   | Default payment method for the org |   
| is_active | boolean | NO | TRUE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Check constraints:** CHECK (payment_gateway IN ('stripe', 'razorpay'))  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSNBCkJfFSqwwIgHRiywEZJWQZeZ2ao9AAD+4lyruzq+ngAA8Nr1AOH8BeZxN/IIAAAAAElFTkSuQmCC)  
**4.9 Usage Tracking**  
*public.agent_executions* *(NEW)*  
*Individual agent execution log. High-volume, append-only. Partitioned by * *created_at* * (monthly). Raw data retained for 90 days, then archived.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| project_agent_id | uuid | NO | — |   | public.project_agents(id) | Which project+agent combo |   
| organization_id | uuid | NO | — |   | public.organizations(id) | Denormalized for fast org-level queries |   
| conversation_id | uuid | YES | — |   | public.conversations(id) | NULL for non-conversational executions |   
| model_id | uuid | NO | — |   | public.models(id) | Model actually used |   
| tokens_input | integer | NO | 0 |   |   |   |   
| tokens_output | integer | NO | 0 |   |   |   |   
| latency_ms | integer | YES | — |   |   | End-to-end execution time |   
| status | text | NO | — |   |   | CHECK: success, error, timeout, rate_limited |   
| error_code | text | YES | — |   |   |   |   
| metadata | jsonb | YES | — |   |   | Agent-specific execution metadata |   
| created_at | timestamptz | NO | now() |   |   | Partition key |   
   
**No soft-delete.** No updated_at. Append-only by design.  
**Check constraints:** CHECK (status IN ('success', 'error', 'timeout', 'rate_limited'))  
**Partition:** PARTITION BY RANGE (created_at) — create monthly partitions via pg_cron.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSNBCkJfFSqwwIgHRiywEZJWQZeZ2ao9AAD+4lyruzq+ngAA8Nr1AOH8BeZxN/IIAAAAAElFTkSuQmCC)  
*public.usage_daily_rollups* *(NEW)*  
*Daily aggregated usage per project. Populated by a * *pg_cron* * job. Used for billing calculations and dashboard analytics.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| organization_id | uuid | NO | — |   | public.organizations(id) |   |   
| project_id | uuid | NO | — |   | public.projects(id) |   |   
| date | date | NO | — |   |   | The day this rollup covers |   
| execution_count | bigint | NO | 0 |   |   |   |   
| successful_executions | bigint | NO | 0 |   |   |   |   
| failed_executions | bigint | NO | 0 |   |   |   |   
| total_tokens_input | bigint | NO | 0 |   |   |   |   
| total_tokens_output | bigint | NO | 0 |   |   |   |   
| total_latency_ms | bigint | NO | 0 |   |   | Sum; divide by execution_count for avg |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(project_id, date)  
**Billing query:** To get an org's monthly usage: SELECT SUM(execution_count) FROM usage_daily_rollups WHERE organization_id = $1 AND date BETWEEN period_start AND period_end.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsScYxpg/h5VMYARvRrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA224BcUMk6pDAAAAAElFTkSuQmCC)  
*public.embedding_usage_events* *(NEW)*  
*Append-only usage audit for document embedding ingestion. Each row represents one embedding API usage event (typically one document-processing job run). Used for cost tracking, margin analysis, and invoice proof.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| organization_id | uuid | NO | — |   | public.organizations(id) |   |   
| project_id | uuid | NO | — |   | public.projects(id) |   |   
| document_id | uuid | NO | — |   | public.documents(id) ON DELETE CASCADE | The file whose chunks were embedded |   
| job_id | uuid | YES | — |   | public.document_processing_jobs(id) ON DELETE SET NULL | Which job produced this usage (nullable) |   
| worker_model_id | uuid | NO | — |   | public.worker_models(id) | Worker model used for embeddings |   
| tokens_input | bigint | NO | 0 |   |   | Total embedding input tokens billed |   
| cost_usd | numeric(12,6) | NO | 0 |   |   | Cost at time of processing (USD) |   
| metadata | jsonb | YES | — |   |   | Optional breakdown (batch sizes, dims, etc.) |   
| created_at | timestamptz | NO | now() |   |   | Event timestamp |   
  
**No soft-delete.** No updated_at. Append-only by design.  
**4.10 RAG — Conversations & Visitors**  
*public.conversations* *(NEW)*  
*A conversation session between a website visitor and an AI agent deployed on a project.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| project_agent_id | uuid | NO | — |   | public.project_agents(id) | Which project+agent combo |   
| visitor_contact_id | uuid | YES | — |   | public.visitor_contacts(id) | Linked once visitor info is captured |   
| session_id | text | NO | — |   |   | Browser session / fingerprint identifier |   
| status | text | NO | 'active' |   |   | CHECK: active, ended, archived |   
| source_url | text | YES | — |   |   | Page URL where conversation started |   
| started_at | timestamptz | NO | now() |   |   |   |   
| ended_at | timestamptz | YES | — |   |   |   |   
| metadata | jsonb | YES | — |   |   | Browser, device, geo info |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Check constraints:** CHECK (status IN ('active', 'ended', 'archived'))  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQmAABRAsSd49m4tA8nPaQJjWMGbCFuCLTOzV2cAAPzFvVZbdXw9AQDgtesBorcEPwOKyvQAAAAASUVORK5CYII=)  
*public.messages* *(NEW)*  
*Individual messages within a conversation. High-volume, append-only. Partitioned by * *created_at* *.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| conversation_id | uuid | NO | — |   | public.conversations(id) ON DELETE CASCADE |   |   
| role | text | NO | — |   |   | CHECK: visitor, agent, system |   
| content | text | NO | — |   |   | Message text |   
| tokens_used | integer | YES | — |   |   | Tokens consumed for this message (agent messages) |   
| metadata | jsonb | YES | — |   |   | Tool calls, sources cited, confidence score, etc. |   
| created_at | timestamptz | NO | now() |   |   |   |   
   
**No soft-delete.** No updated_at. Append-only.  
**Check constraints:** CHECK (role IN ('visitor', 'agent', 'system'))  
**Partition:** PARTITION BY RANGE (created_at) — monthly partitions.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANElEQVR4nO3OQQmAUBBAwSf8GGLWDWFDY3ixgjcRZhLMNjNHdQYAwF9cq1rV/vUEAIDX7gcRXAQ2s/16gwAAAABJRU5ErkJggg==)  
*public.visitor_contacts* *(NEW)*  
*Contact information and lead data captured by the AI agent during conversations. Each record represents a unique lead for a project.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| project_id | uuid | NO | — |   | public.projects(id) |   |   
| name | text | YES | — |   |   |   |   
| email | text | YES | — |   |   |   |   
| phone | text | YES | — |   |   |   |   
| extracted_data | jsonb | YES | — |   |   | Any structured data the AI extracts: interests, budget, requirements, etc. |   
| metadata | jsonb | YES | — |   |   | Extra info visitor shared (company, location, preferences, etc.) |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(project_id, email) where email is not null (partial unique index)  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSNBCUpfEJ5YGBDBgAU2QtIq6DIzW7UHAMBfHGt1V+fXEwAAXrseHDYF+yOk59sAAAAASUVORK5CYII=)  
**4.11 RAG — Knowledge Base**  
*public.documents* *(NEW)*  
*Metadata for files uploaded by users to train RAG agents. Actual files are stored in Supabase Storage. This table tracks what was uploaded, for which project+agent, and where it lives in storage.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| project_agent_id | uuid | NO | — |   | public.project_agents(id) | Scoped to a specific project+agent combo |   
| organization_id | uuid | NO | — |   | public.organizations(id) | Denormalized for org-level storage quota checks |   
| file_name | text | NO | — |   |   | Original upload filename |   
| file_type | text | NO | — |   |   | MIME type, e.g., application/pdf |   
| file_size_bytes | bigint | NO | — |   |   |   |   
| storage_bucket | text | NO | — |   |   | Supabase Storage bucket name |   
| storage_path | text | NO | — |   |   | Full path in storage, e.g., {org_id}/{project_id}/{agent_id}/{document_id}.pdf |   
| status | text | NO | 'pending' |   |   | CHECK: pending, processing, ready, failed |   
| chunk_count | integer | NO | 0 |   |   | Number of chunks generated |   
| error_message | text | YES | — |   |   | Processing error details |   
| processed_at | timestamptz | YES | — |   |   | When chunking/embedding completed |   
| is_db_schema_file | boolean | NO | FALSE |   |   | TRUE when the uploaded file is a database schema file (e.g., `.sql`) |   
| is_db_data_file | boolean | NO | FALSE |   |   | TRUE when the uploaded file is a database data file (e.g., `.json`) |   
| is_deleted | boolean | NO | FALSE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Check constraints:** CHECK (status IN ('pending', 'processing', 'ready', 'failed')); CHECK (NOT (is_db_schema_file AND is_db_data_file))  
   
*public.document_allowed_extensions* *(NEW)*  
*Reference list of file extensions (lowercase, no dot) allowed for project storage uploads. RLS: authenticated SELECT only; no client INSERT/UPDATE/DELETE policies.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| extension | text | NO | — |   |   | UNIQUE, e.g. pdf, md |   
| type_name | text | NO | — |   |   | Display label, e.g. PDF, Markdown |   
| created_at | timestamptz | NO | now() |   |   | Added via migration 2026-03-29 |   
| updated_at | timestamptz | NO | now() |   |   | `set_updated_at` trigger |   
   
*public.database_export_layouts* *(lookup; migration 2026-03-29)*  
*Defines export format/platform options for database uploads. Columns: id, format, platform, is_active, created_at, updated_at. Referenced by `document_database_schemas.database_export_layout_id`. RLS: authenticated can SELECT active rows only.*  
   
**Supabase Storage folder structure:**  
bucket: documents-storage
   └── {organization_id}/  
       └── {project_id}/  
           └── {agent_id}/  
               ├── {document_id_1}.pdf  
               ├── {document_id_2}.docx  
               └── ...  

**Deleted document archive bucket:**  
bucket: documents-dump  
  └── {organization_id}/{project_id}/{agent_id}/{document_id}__{file_name}  
*(Used when a document is deleted from active storage. The `public.documents` row is soft-deleted by setting `is_deleted = TRUE`, and the file is moved from `documents-storage` to `documents-dump`.)*  
   
*Database files extensions + schema/data snapshots (incremental):*  
- `public.document_db_file_purposes`  
- `public.document_db_file_allowed_extensions`  
- `public.document_database_schemas`  
- `public.document_database_table_data`  
- `public.database_types`  
- `public.databases`  
- `public.database_export_layouts`  

Reference migrations:  
`docs/db-schema/migrations/2026-03-27-database-files-schema-and-policies.sql`  
`docs/db-schema/migrations/2026-03-29-database-export-layouts-and-document-extensions.sql`

![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAALUlEQVR4nO3OQQ0AIAwEsAMlSJ0UrOFkGngRklZBR1WtJDsAAPzizNcDAADuNcKwAyU+nb+5AAAAAElFTkSuQmCC)  
*public.document_chunks* *(NEW)*  
*Vector embeddings for RAG retrieval. Each chunk is a segment of a document with its embedding stored via pgvector. The * *project_agent_id* * is denormalized to enable efficient filtered vector similarity search without JOINing through * *documents* *.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| document_id | uuid | NO | — |   | public.documents(id) ON DELETE CASCADE |   |   
| project_agent_id | uuid | NO | — |   | public.project_agents(id) | Denormalized from documents for fast filtered search |   
| chunk_index | integer | NO | — |   |   | Order within the document (0-based) |   
| content | text | NO | — |   |   | Raw text of the chunk |   
| token_count | integer | YES | — |   |   | Number of tokens in this chunk |   
| embedding | vector(1536) | NO | — |   |   | Embedding vector. Dimension depends on model (1536 for OpenAI ada-002/text-embedding-3-small, 3072 for text-embedding-3-large) |   
| metadata | jsonb | YES | — |   |   | Page number, section heading, etc. |   
| created_at | timestamptz | NO | now() |   |   |   |   
   
**No soft-delete.** Chunks are hard-deleted when the parent document is deleted.  
**Why ** **project_agent_id** ** is denormalized:** During RAG retrieval, the query is: "Find the most similar chunks  **for this specific project+agent**." Without denormalization, every vector search would need a JOIN to documents to filter by project_agent_id, which destroys performance at scale. With denormalization, the vector index can filter directly.  
**Vector index:** See [Section 5 — Indexes for the HNSW index definition.](#anchor-18 "#anchor-18")  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAM0lEQVR4nO3OQQmAUBBAwSeILbyYdDP8jAaxgjcRZhLMNjNntQIA4C/uvTqq6+sJAADvPS2NA0FrXqf/AAAAAElFTkSuQmCC)  
*public.document_processing_jobs* *(NEW)*  
*Queue for document chunking and embedding. Producers enqueue rows from the Next.js API (org admins). Python workers poll using the Supabase service role (bypasses RLS). Status lifecycle: queued → processing → completed | failed | cancelled.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| organization_id | uuid | NO | — |   | public.organizations(id) | Denormalized for RLS and org-scoped listing |   
| project_id | uuid | NO | — |   | public.projects(id) ON DELETE CASCADE | Must match the document’s project (enforced on INSERT policy) |   
| document_id | uuid | NO | — |   | public.documents(id) ON DELETE CASCADE | One job targets one document per enqueue |   
| status | text | NO | 'queued' |   |   | CHECK: queued, processing, completed, failed, cancelled |   
| job_type | text | NO | 'embed_document' |   |   | CHECK: embed_document, reindex_document |   
| priority | integer | NO | 0 |   |   | Higher runs first (optional worker ordering) |   
| payload | jsonb | YES | — |   |   | Extra metadata for worker (e.g. embedding model id) |   
| attempt_count | integer | NO | 0 |   |   | Retry counter |   
| max_attempts | integer | NO | 5 |   |   | Max retries before failed |   
| run_after | timestamptz | NO | now() |   |   | Scheduled visibility for backoff |   
| locked_at | timestamptz | YES | — |   |   | When a worker claimed the job |   
| locked_by | text | YES | — |   |   | Worker instance id |   
| lease_expires_at | timestamptz | YES | — |   |   | Reclaim if worker dies |   
| started_at | timestamptz | YES | — |   |   |   |   
| completed_at | timestamptz | YES | — |   |   |   |   
| last_error | text | YES | — |   |   | Last failure message |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**4.12 Notifications**  
*public.notification_types*  
*Lookup: billing, agent_alert, system, security, usage_warning.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| name | text | NO | — |   |   |   |   
| is_active | boolean | NO | TRUE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Unique constraints:** UNIQUE(name)  
**Changes from i2:** Renamed type column to name for consistency. Replaced is_deleted with is_active.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsSfYxZo/jzlMYQLPJrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA4q7Bc870TqdAAAAAElFTkSuQmCC)  
*public.notifications*  
*User-facing notifications. Supports both user-level (account/security) and organization-level (billing/project alerts) notifications.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| user_id | uuid | NO | — |   | public.users(id) | Who receives this notification |   
| organization_id | uuid | YES | — |   | public.organizations(id) | Context: which org (NULL for user-level notifications) |   
| project_id | uuid | YES | — |   | public.projects(id) | Context: which project (NULL if not project-specific) |   
| agent_id | uuid | YES | — |   | public.agents(id) | Context: which agent (NULL if not agent-specific) |   
| type_id | uuid | NO | — |   | public.notification_types(id) |   |   
| title | text | NO | — |   |   | Short headline |   
| body | text | YES | — |   |   | Detailed message |   
| action_url | text | YES | — |   |   | Deep link into the dashboard |   
| is_read | boolean | NO | FALSE |   |   |   |   
| read_at | timestamptz | YES | — |   |   |   |   
| is_deleted | boolean | NO | FALSE |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
| updated_at | timestamptz | NO | now() |   |   |   |   
   
**Changes from i2:** Made organization_id, project_id, agent_id all  **nullable** (not all notifications relate to all entities). Added title, body, action_url, read_at. Renamed is_opened to is_read.  
**Answer to i2 question ("Should notifications be per user or per org?"):** Both. user_id is always required (who sees it). organization_id is optional context. User-level notifications (password change, login alert) have organization_id = NULL. Org-level notifications (billing, usage) include the organization_id. Users see notifications where user_id = auth.uid().  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSPBCj7fFRYQwYwEZiywEZJWQZeZ2ao9AAD+4lyruzq+ngAA8Nr1AMTJBeJDClAyAAAAAElFTkSuQmCC)  
**4.13 Audit & Security**  
*public.audit_logs* *(NEW)*  
*Tracks significant user actions for compliance, debugging, and security. High-volume, append-only. Partitioned by * *created_at* *.*  
| | | | | | | |  
|-|-|-|-|-|-|-|  
| **Column** | **Type** | **Nullable** | **Default** | **PK** | **References** | **Remarks** |   
| id | uuid | NO | gen_random_uuid() | YES |   |   |   
| actor_id | uuid | YES | — |   | public.users(id) | Who performed the action. NULL for system actions. |   
| organization_id | uuid | YES | — |   | public.organizations(id) |   |   
| action | text | NO | — |   |   | e.g., org.created, project.deleted, subscription.upgraded, api_key.rotated |   
| entity_type | text | NO | — |   |   | e.g., organization, project, agent, subscription |   
| entity_id | uuid | YES | — |   |   | ID of the affected entity |   
| changes | jsonb | YES | — |   |   | Before/after diff of changed fields |   
| ip_address | inet | YES | — |   |   |   |   
| user_agent | text | YES | — |   |   |   |   
| created_at | timestamptz | NO | now() |   |   |   |   
   
**No soft-delete. No ** **updated_at** **.** Immutable audit trail.  
**Partition:** PARTITION BY RANGE (created_at) — monthly. Retain 12 months online, archive to cold storage.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsSfYxZo/jVEMYQLPJrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA4rLBc059ysnAAAAAElFTkSuQmCC)  
***LLM API Key Storage (Supabase Vault)***  
*LLM provider API keys (OpenAI, Anthropic, Google, etc.) are * ***not stored in a regular table*** *. They are stored in * ***Supabase Vault*** * (* *vault.secrets* *) because:*  
1. *These keys must be * ***decryptable*** * (used to make API calls) — hashing (one-way) does not work here.*  
2. *Supabase Vault uses * *pgsodium* * for transparent column encryption at rest.*  
3. *Access is restricted to * *service_role* * only — never exposed to client-side queries.*  
-- Store a key  
 SELECT vault.create_secret(  
   'sk-openai-xxx...',           -- the secret value  
   'openai-api-key',             -- unique name  
   'OpenAI production API key'   -- description  
 );  
   
 -- Retrieve in server-side code (service_role only)  
 SELECT decrypted_secret  
 FROM vault.decrypted_secrets  
 WHERE name = 'openai-api-key';  
   
The public.models table does **not** store any API key information. The application layer maps models.provider_name → Vault secret name at runtime.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSNhYMMAKlD4OzrxgQU2QtIq6DIzR3UFAMBf3Gu1VefXEwAAXtsfSqADWz4G/HUAAAAASUVORK5CYII=)  
**5. Indexes**  
**Naming convention: **idx_{table}_{columns}  
**Core Identity**  
-- users  
 CREATE UNIQUE INDEX idx_users_email ON public.users (email);  
 CREATE INDEX idx_users_country ON public.users (country_id) WHERE is_deleted = FALSE;  
 CREATE INDEX idx_users_active ON public.users (id) WHERE is_deleted = FALSE;  
   
**Geography**  
CREATE UNIQUE INDEX idx_countries_iso2 ON public.countries (iso2);  
 CREATE UNIQUE INDEX idx_countries_iso3 ON public.countries (iso3);  
 CREATE INDEX idx_states_country ON public.states (country_id) WHERE is_active = TRUE;  
   
**User Preferences**  
CREATE UNIQUE INDEX idx_settings_user ON public.settings (user_id);  
 CREATE UNIQUE INDEX idx_cookie_consents_user ON public.cookie_consents (user_id);  
   
**Organization & Teams**  
CREATE UNIQUE INDEX idx_organizations_slug ON public.organizations (slug);  
 CREATE INDEX idx_organizations_owner ON public.organizations (owner_id) WHERE is_deleted = FALSE;  
 CREATE INDEX idx_organizations_plan ON public.organizations (plan_id) WHERE is_deleted = FALSE;  
 CREATE INDEX idx_organizations_country ON public.organizations (country_id) WHERE is_deleted = FALSE;  
   
 CREATE UNIQUE INDEX idx_org_members_unique ON public.organization_members (organization_id, user_id);  
 CREATE INDEX idx_org_members_user ON public.organization_members (user_id) WHERE is_deleted = FALSE;  
 CREATE INDEX idx_org_members_org ON public.organization_members (organization_id) WHERE is_deleted = FALSE;  
   
**Plans & Models**  
CREATE UNIQUE INDEX idx_plans_name ON public.plans (name);  
 CREATE UNIQUE INDEX idx_plans_index ON public.plans (index);  
 CREATE INDEX idx_plans_default_model_id ON public.plans (default_model_id) WHERE default_model_id IS NOT NULL;  
 CREATE UNIQUE INDEX idx_plan_prices_unique ON public.plan_prices (plan_id, currency, billing_interval);  
 CREATE UNIQUE INDEX idx_model_tiers_name ON public.model_tiers (name);  
   
 CREATE UNIQUE INDEX idx_models_name ON public.models (name);  
 CREATE INDEX idx_models_tier ON public.models (model_tier_id) WHERE is_active = TRUE;  
 CREATE UNIQUE INDEX idx_worker_models_name ON public.worker_models (name);  
 CREATE INDEX idx_worker_models_provider ON public.worker_models (provider_name) WHERE is_active = TRUE;  
   
**Projects**  
CREATE INDEX idx_projects_org ON public.projects (organization_id) WHERE is_deleted = FALSE;  
 CREATE INDEX idx_projects_status ON public.projects (status_id) WHERE is_deleted = FALSE;  
 CREATE UNIQUE INDEX idx_projects_domain ON public.projects (domain) WHERE domain IS NOT NULL;  
   
 CREATE UNIQUE INDEX idx_project_api_keys_hash ON public.project_api_keys (key_hash);  
 CREATE INDEX idx_project_api_keys_project ON public.project_api_keys (project_id) WHERE is_active = TRUE;  
   
**Agents**  
CREATE UNIQUE INDEX idx_agents_name_version ON public.agents (name, version);  
 CREATE INDEX idx_agents_type ON public.agents (type_id) WHERE is_deleted = FALSE;  
 CREATE INDEX idx_agents_public ON public.agents (id) WHERE is_public = TRUE AND is_deleted = FALSE;
 CREATE INDEX idx_agents_requires_document_embedding ON public.agents (id)
   WHERE is_deleted = FALSE AND requires_document_embedding = TRUE;  
   
 CREATE UNIQUE INDEX idx_project_agents_unique ON public.project_agents (project_id, agent_id);  
 CREATE INDEX idx_project_agents_project ON public.project_agents (project_id) WHERE is_deleted = FALSE;  
 CREATE INDEX idx_project_agents_agent ON public.project_agents (agent_id) WHERE is_deleted = FALSE;  
   
**Subscriptions & Billing**  
CREATE INDEX idx_subscriptions_org ON public.subscriptions (organization_id);  
 CREATE INDEX idx_subscriptions_active ON public.subscriptions (organization_id) WHERE status = 'active';  
 CREATE INDEX idx_subscriptions_stripe ON public.subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;  
 CREATE INDEX idx_subscriptions_razorpay ON public.subscriptions (razorpay_subscription_id) WHERE razorpay_subscription_id IS NOT NULL;  
   
 CREATE INDEX idx_invoices_org ON public.invoices (organization_id);  
 CREATE INDEX idx_invoices_subscription ON public.invoices (subscription_id);  
 CREATE INDEX idx_invoices_status ON public.invoices (status) WHERE status IN ('open', 'draft');  
 CREATE INDEX idx_invoices_period ON public.invoices (organization_id, period_start, period_end);  
   
 CREATE INDEX idx_payments_org ON public.payments (organization_id);  
 CREATE INDEX idx_payments_invoice ON public.payments (invoice_id);  
 CREATE INDEX idx_payments_gateway ON public.payments (gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;  
   
 CREATE INDEX idx_payment_methods_org ON public.payment_methods (organization_id) WHERE is_active = TRUE;  
   
**Usage Tracking**  
CREATE INDEX idx_agent_executions_project_agent ON public.agent_executions (project_agent_id, created_at);  
 CREATE INDEX idx_agent_executions_org ON public.agent_executions (organization_id, created_at);  
 CREATE INDEX idx_agent_executions_conversation ON public.agent_executions (conversation_id) WHERE conversation_id IS NOT NULL;  
   
 CREATE UNIQUE INDEX idx_usage_rollups_unique ON public.usage_daily_rollups (project_id, date);  
 CREATE INDEX idx_usage_rollups_org_date ON public.usage_daily_rollups (organization_id, date);  
   
 CREATE INDEX idx_embedding_usage_events_org_created ON public.embedding_usage_events (organization_id, created_at DESC);  
 CREATE INDEX idx_embedding_usage_events_project_created ON public.embedding_usage_events (project_id, created_at DESC);  
 CREATE INDEX idx_embedding_usage_events_document ON public.embedding_usage_events (document_id);  
 CREATE INDEX idx_embedding_usage_events_job ON public.embedding_usage_events (job_id) WHERE job_id IS NOT NULL;  
 CREATE INDEX idx_embedding_usage_events_worker_model ON public.embedding_usage_events (worker_model_id);  
   
**RAG — Conversations & Visitors**  
CREATE INDEX idx_conversations_project_agent ON public.conversations (project_agent_id, created_at DESC);  
 CREATE INDEX idx_conversations_visitor ON public.conversations (visitor_contact_id) WHERE visitor_contact_id IS NOT NULL;  
 CREATE INDEX idx_conversations_session ON public.conversations (session_id);  
   
 CREATE INDEX idx_messages_conversation ON public.messages (conversation_id, created_at);  
   
 CREATE INDEX idx_visitor_contacts_project ON public.visitor_contacts (project_id);  
 CREATE UNIQUE INDEX idx_visitor_contacts_email ON public.visitor_contacts (project_id, email) WHERE email IS NOT NULL;  
   
**RAG — Knowledge Base**  
CREATE INDEX idx_documents_project_agent ON public.documents (project_agent_id) WHERE is_deleted = FALSE;  
 CREATE INDEX idx_documents_org ON public.documents (organization_id) WHERE is_deleted = FALSE;  
 CREATE INDEX idx_documents_status ON public.documents (status) WHERE status IN ('pending', 'processing');  
   
 CREATE INDEX idx_document_chunks_document ON public.document_chunks (document_id);  
 CREATE INDEX idx_document_chunks_project_agent ON public.document_chunks (project_agent_id);  
   
 -- HNSW vector index for similarity search, filtered by project_agent_id  
 -- Uses cosine distance (most common for text embeddings)  
 CREATE INDEX idx_document_chunks_embedding ON public.document_chunks  
   USING hnsw (embedding vector_cosine_ops)  
   WITH (m = 16, ef_construction = 64);  
   
 CREATE INDEX idx_document_processing_jobs_org_created ON public.document_processing_jobs (organization_id, created_at DESC);
 CREATE INDEX idx_document_processing_jobs_document ON public.document_processing_jobs (document_id);
 CREATE INDEX idx_document_processing_jobs_poll ON public.document_processing_jobs (status, run_after)
   WHERE status = 'queued';
 CREATE INDEX idx_document_processing_jobs_lease ON public.document_processing_jobs (lease_expires_at)
   WHERE status = 'processing';

-- Additional indexes for database-file tables:
-- docs/db-schema/migrations/2026-03-27-database-files-schema-and-policies.sql
   
**Vector search query pattern:**  
SELECT dc.id, dc.content, dc.metadata,  
        1 - (dc.embedding <=> $1::vector) AS similarity  
 FROM public.document_chunks dc  
 WHERE dc.project_agent_id = $2  
 ORDER BY dc.embedding <=> $1::vector  
 LIMIT 5;  
   
The WHERE project_agent_id = $2 filter combined with the HNSW index provides efficient scoped retrieval.  
**Notifications**  
CREATE INDEX idx_notifications_user ON public.notifications (user_id, created_at DESC) WHERE is_deleted = FALSE;  
 CREATE INDEX idx_notifications_unread ON public.notifications (user_id) WHERE is_read = FALSE AND is_deleted = FALSE;  
 CREATE INDEX idx_notifications_org ON public.notifications (organization_id) WHERE organization_id IS NOT NULL AND is_deleted = FALSE;  
   
**Audit**  
CREATE INDEX idx_audit_logs_actor ON public.audit_logs (actor_id, created_at DESC);  
 CREATE INDEX idx_audit_logs_org ON public.audit_logs (organization_id, created_at DESC);  
 CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id, created_at DESC);  
 CREATE INDEX idx_audit_logs_action ON public.audit_logs (action, created_at DESC);  
   
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSNhQAQ60PcrIhnxgQU2QtIq6DIze3UGAMBf3Gu1VcfXEwAAXrseS14EKxPCORkAAAAASUVORK5CYII=)  
**6. Functions & Triggers**  
**6.1 Functions**  
-- 1. Return the Free plan ID  
 CREATE OR REPLACE FUNCTION get_default_plan_id()  
 RETURNS uuid  
 LANGUAGE sql STABLE  
 AS $$  
   SELECT id FROM public.plans WHERE index = 0 AND is_active = TRUE LIMIT 1;  
 $$;  
   
 -- 2. Return the default language ID (English)  
 CREATE OR REPLACE FUNCTION get_default_language_id()  
 RETURNS uuid  
 LANGUAGE sql STABLE  
 AS $$  
   SELECT id FROM public.languages WHERE code = 'en' AND is_active = TRUE LIMIT 1;  
 $$;  
   
 -- 3. Auto-update updated_at on row modification  
 CREATE OR REPLACE FUNCTION set_updated_at()  
 RETURNS trigger  
 LANGUAGE plpgsql  
 AS $$  
 BEGIN  
   NEW.updated_at = now();  
   RETURN NEW;  
 END;  
 $$;  
   
 -- 4. Check if current user is a member of an organization (used in RLS policies)  
 CREATE OR REPLACE FUNCTION is_org_member(org_id uuid)  
 RETURNS boolean  
 LANGUAGE sql STABLE SECURITY DEFINER  
 AS $$  
   SELECT EXISTS (  
     SELECT 1 FROM public.organization_members  
     WHERE organization_id = org_id  
       AND user_id = auth.uid()  
       AND is_deleted = FALSE  
   );  
 $$;  
   
 -- 5. Check if current user has a specific role (or higher) in an organization  
 CREATE OR REPLACE FUNCTION has_org_role(org_id uuid, required_role text)  
 RETURNS boolean  
 LANGUAGE sql STABLE SECURITY DEFINER  
 AS $$  
   SELECT EXISTS (  
     SELECT 1 FROM public.organization_members  
     WHERE organization_id = org_id  
       AND user_id = auth.uid()  
       AND is_deleted = FALSE  
       AND role IN (  
         CASE required_role  
           WHEN 'viewer' THEN 'owner'  
           WHEN 'member' THEN 'owner'  
           WHEN 'admin'  THEN 'owner'  
           WHEN 'owner'  THEN 'owner'  
         END,  
         CASE required_role  
           WHEN 'viewer' THEN 'admin'  
           WHEN 'member' THEN 'admin'  
           WHEN 'admin'  THEN 'admin'  
           ELSE NULL  
         END,  
         CASE required_role  
           WHEN 'viewer' THEN 'member'  
           WHEN 'member' THEN 'member'  
           ELSE NULL  
         END,  
         CASE required_role  
           WHEN 'viewer' THEN 'viewer'  
           ELSE NULL  
         END  
       )  
   );  
 $$;  
   
 -- 6. Create user profile, settings, and cookie consent on auth signup  
 CREATE OR REPLACE FUNCTION handle_new_user()  
 RETURNS trigger  
 LANGUAGE plpgsql SECURITY DEFINER  
 SET search_path = public  
 AS $$  
 BEGIN  
   INSERT INTO public.users (id, first_name, last_name, email)  
   VALUES (  
     NEW.id,  
     COALESCE(NEW.raw_user_meta_data->>'first_name', ''),  
     COALESCE(NEW.raw_user_meta_data->>'last_name', ''),  
     NEW.email  
   );  
   
   INSERT INTO public.settings (user_id) VALUES (NEW.id);  
   INSERT INTO public.cookie_consents (user_id) VALUES (NEW.id);  
   
   RETURN NEW;  
 END;  
 $$;  
   
 -- 7. Auto-create organization_members row when an org is created  
 CREATE OR REPLACE FUNCTION handle_new_organization()  
 RETURNS trigger  
 LANGUAGE plpgsql SECURITY DEFINER  
 AS $$  
 BEGIN  
   INSERT INTO public.organization_members (organization_id, user_id, role, joined_at)  
   VALUES (NEW.id, NEW.owner_id, 'owner', now());  
   RETURN NEW;  
 END;  
 $$;  
   
 -- 8. Daily usage rollup job (called by pg_cron)  
 CREATE OR REPLACE FUNCTION rollup_daily_usage(target_date date DEFAULT CURRENT_DATE - INTERVAL '1 day')  
 RETURNS void  
 LANGUAGE plpgsql  
 AS $$  
 BEGIN  
   INSERT INTO public.usage_daily_rollups (  
     organization_id, project_id, date,  
     execution_count, successful_executions, failed_executions,  
     total_tokens_input, total_tokens_output, total_latency_ms  
   )  
   SELECT  
     ae.organization_id,  
     pa.project_id,  
     target_date,  
     COUNT(*),  
     COUNT(*) FILTER (WHERE ae.status = 'success'),  
     COUNT(*) FILTER (WHERE ae.status != 'success'),  
     COALESCE(SUM(ae.tokens_input), 0),  
     COALESCE(SUM(ae.tokens_output), 0),  
     COALESCE(SUM(ae.latency_ms), 0)  
   FROM public.agent_executions ae  
   JOIN public.project_agents pa ON pa.id = ae.project_agent_id  
   WHERE ae.created_at >= target_date  
     AND ae.created_at < target_date + INTERVAL '1 day'  
   GROUP BY ae.organization_id, pa.project_id  
   ON CONFLICT (project_id, date) DO UPDATE SET  
     execution_count = EXCLUDED.execution_count,  
     successful_executions = EXCLUDED.successful_executions,  
     failed_executions = EXCLUDED.failed_executions,  
     total_tokens_input = EXCLUDED.total_tokens_input,  
     total_tokens_output = EXCLUDED.total_tokens_output,  
     total_latency_ms = EXCLUDED.total_latency_ms,  
     updated_at = now();  
 END;  
 $$;  
   
**6.2 Triggers**  
-- Auto-update updated_at on all tables that have the column  
 DO $$  
 DECLARE  
   tbl text;  
 BEGIN  
   FOR tbl IN  
     SELECT table_schema || '.' || table_name  
     FROM information_schema.columns  
     WHERE column_name = 'updated_at'  
       AND table_schema = 'public'  
   LOOP  
     EXECUTE format(  
       'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %s  
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();', tbl  
     );  
   END LOOP;  
 END;  
 $$;  
   
 -- Create user profile on auth signup  
 CREATE TRIGGER on_auth_user_created  
   AFTER INSERT ON auth.users  
   FOR EACH ROW  
   EXECUTE FUNCTION handle_new_user();  
   
 -- Create org member when organization is created  
 CREATE TRIGGER on_organization_created  
   AFTER INSERT ON public.organizations  
   FOR EACH ROW  
   EXECUTE FUNCTION handle_new_organization();  
   
**6.3 Scheduled Jobs (pg_cron)**  
-- Daily usage rollup at 00:15 UTC  
 SELECT cron.schedule('rollup-daily-usage', '15 0 * * *', $$SELECT rollup_daily_usage()$$);  
   
 -- Monthly partition creation (create next month's partitions on the 25th)  
 SELECT cron.schedule('create-monthly-partitions', '0 0 25 * *', $$SELECT create_next_month_partitions()$$);  
   
 -- Archive old agent_executions (drop partitions older than 90 days)  
 SELECT cron.schedule('archive-executions', '0 2 1 * *', $$SELECT archive_old_partitions('agent_executions', 90)$$);  
   
 -- Archive old messages (drop partitions older than 12 months)  
 SELECT cron.schedule('archive-messages', '0 3 1 * *', $$SELECT archive_old_partitions('messages', 365)$$);  
   
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQ2AQBAAsSHhiQI0IWp9ngBsYIEfIWkVdJuZs5oAAPiLe6+O6vp6AgDAa+sBhYwEOqBD7p8AAAAASUVORK5CYII=)  
**7. RLS Policies**  
All tables have RLS enabled. Policies use auth.uid() and helper functions is_org_member() / has_org_role().  
**7.1 Users**  
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;  
   
 CREATE POLICY "Users can read own profile"  
   ON public.users FOR SELECT  
   USING (auth.uid() = id);  
   
 CREATE POLICY "Users can update own profile"  
   ON public.users FOR UPDATE  
   USING (auth.uid() = id)  
   WITH CHECK (auth.uid() = id);  
   
**7.2 Settings & Cookie Consents**  
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;  
 ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;  
   
 -- Settings  
 CREATE POLICY "Users can read own settings"  
   ON public.settings FOR SELECT USING (auth.uid() = user_id);  
   
 CREATE POLICY "Users can update own settings"  
   ON public.settings FOR UPDATE USING (auth.uid() = user_id);  
   
 -- Cookie consents  
 CREATE POLICY "Users can read own consents"  
   ON public.cookie_consents FOR SELECT USING (auth.uid() = user_id);  
   
 CREATE POLICY "Users can update own consents"  
   ON public.cookie_consents FOR UPDATE USING (auth.uid() = user_id);  
   
**7.3 Organizations**  
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;  
   
 CREATE POLICY "Members can read their org"  
   ON public.organizations FOR SELECT  
   USING (is_org_member(id));  
   
 CREATE POLICY "Authenticated users can create orgs"  
   ON public.organizations FOR INSERT  
   WITH CHECK (auth.uid() = owner_id);  
   
 CREATE POLICY "Admins can update org"  
   ON public.organizations FOR UPDATE  
   USING (has_org_role(id, 'admin'));  
   
 CREATE POLICY "Owner can delete org"  
   ON public.organizations FOR DELETE  
   USING (has_org_role(id, 'owner'));  
   
**7.4 Organization Members**  
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;  
   
 CREATE POLICY "Members can see co-members"  
   ON public.organization_members FOR SELECT  
   USING (is_org_member(organization_id));  
   
 CREATE POLICY "Admins can add members"  
   ON public.organization_members FOR INSERT  
   WITH CHECK (has_org_role(organization_id, 'admin'));  
   
 CREATE POLICY "Admins can update members"  
   ON public.organization_members FOR UPDATE  
   USING (has_org_role(organization_id, 'admin'));  
   
 CREATE POLICY "Admins can remove members"  
   ON public.organization_members FOR DELETE  
   USING (has_org_role(organization_id, 'admin'));  
   
**7.5 Projects**  
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;  
   
 CREATE POLICY "Org members can read projects"  
   ON public.projects FOR SELECT  
   USING (is_org_member(organization_id));  
   
 CREATE POLICY "Admins can create projects"  
   ON public.projects FOR INSERT  
   WITH CHECK (has_org_role(organization_id, 'admin'));  
   
 CREATE POLICY "Admins can update projects"  
   ON public.projects FOR UPDATE  
   USING (has_org_role(organization_id, 'admin'));  
   
 CREATE POLICY "Admins can delete projects"  
   ON public.projects FOR DELETE  
   USING (has_org_role(organization_id, 'admin'));  
   
**7.6 Project API Keys**  
ALTER TABLE public.project_api_keys ENABLE ROW LEVEL SECURITY;  
   
 CREATE POLICY "Admins can manage API keys"  
   ON public.project_api_keys FOR ALL  
   USING (EXISTS (  
     SELECT 1 FROM public.projects p  
     WHERE p.id = project_id AND has_org_role(p.organization_id, 'admin')  
   ));  
   
**7.7 Agents (Public Catalog)**  
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;  
   
 CREATE POLICY "Anyone can read public agents"  
   ON public.agents FOR SELECT  
   USING (is_public = TRUE AND is_deleted = FALSE);  
   
 -- INSERT/UPDATE/DELETE restricted to service_role (developer/admin) — no client-side policy needed.  
   
**7.8 Project Agents**  
ALTER TABLE public.project_agents ENABLE ROW LEVEL SECURITY;  
   
 CREATE POLICY "Org members can read project agents"  
   ON public.project_agents FOR SELECT  
   USING (EXISTS (  
     SELECT 1 FROM public.projects p  
     WHERE p.id = project_id AND is_org_member(p.organization_id)  
   ));  
   
 CREATE POLICY "Admins can manage project agents"  
   ON public.project_agents FOR ALL  
   USING (EXISTS (  
     SELECT 1 FROM public.projects p  
     WHERE p.id = project_id AND has_org_role(p.organization_id, 'admin')  
   ));  
   
**7.9 Billing Tables (subscriptions, invoices, payments, payment_methods)**  
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;  
 ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;  
 ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;  
 ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;  
   
 -- Read-only for org admins. All writes happen via service_role (webhooks/backend).  
 CREATE POLICY "Admins can read subscriptions"  
   ON public.subscriptions FOR SELECT  
   USING (has_org_role(organization_id, 'admin'));  
   
 CREATE POLICY "Admins can read invoices"  
   ON public.invoices FOR SELECT  
   USING (has_org_role(organization_id, 'admin'));  
   
 CREATE POLICY "Admins can read payments"  
   ON public.payments FOR SELECT  
   USING (has_org_role(organization_id, 'admin'));  
   
 CREATE POLICY "Admins can read payment methods"  
   ON public.payment_methods FOR SELECT  
   USING (has_org_role(organization_id, 'admin'));  
   
 CREATE POLICY "Admins can manage payment methods"  
   ON public.payment_methods FOR INSERT  
   WITH CHECK (has_org_role(organization_id, 'admin'));  
   
 CREATE POLICY "Admins can update payment methods"  
   ON public.payment_methods FOR UPDATE  
   USING (has_org_role(organization_id, 'admin'));  
   
**7.10 RAG Tables (conversations, messages, documents, chunks)**  
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;  
 ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;  
 ALTER TABLE public.visitor_contacts ENABLE ROW LEVEL SECURITY;  
 ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;  
 ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;  
 ALTER TABLE public.document_processing_jobs ENABLE ROW LEVEL SECURITY;  
   
 -- Conversations: read by org members via project_agents → projects → org  
 CREATE POLICY "Org members can read conversations"  
   ON public.conversations FOR SELECT  
   USING (EXISTS (  
     SELECT 1 FROM public.project_agents pa  
     JOIN public.projects p ON p.id = pa.project_id  
     WHERE pa.id = project_agent_id AND is_org_member(p.organization_id)  
   ));  
   
 -- Messages: read access through conversation ownership  
 CREATE POLICY "Org members can read messages"  
   ON public.messages FOR SELECT  
   USING (EXISTS (  
     SELECT 1 FROM public.conversations c  
     JOIN public.project_agents pa ON pa.id = c.project_agent_id  
     JOIN public.projects p ON p.id = pa.project_id  
     WHERE c.id = conversation_id AND is_org_member(p.organization_id)  
   ));  
   
 -- Visitor contacts  
 CREATE POLICY "Org members can read visitor contacts"  
   ON public.visitor_contacts FOR SELECT  
   USING (EXISTS (  
     SELECT 1 FROM public.projects p  
     WHERE p.id = project_id AND is_org_member(p.organization_id)  
   ));  
   
 -- Documents: org members can read, admins can manage  
 CREATE POLICY "Org members can read documents"  
   ON public.documents FOR SELECT  
   USING (is_org_member(organization_id));  
   
 CREATE POLICY "Admins can manage documents"  
   ON public.documents FOR INSERT  
   WITH CHECK (has_org_role(organization_id, 'admin'));  
   
 CREATE POLICY "Admins can update documents"  
   ON public.documents FOR UPDATE  
   USING (has_org_role(organization_id, 'admin'));  
   
 CREATE POLICY "Admins can delete documents"  
   ON public.documents FOR DELETE  
   USING (has_org_role(organization_id, 'admin'));  
   
 -- Document chunks: read-only for org members (writes via service_role during processing)  
 CREATE POLICY "Org members can read chunks"  
   ON public.document_chunks FOR SELECT  
   USING (EXISTS (  
     SELECT 1 FROM public.documents d  
     WHERE d.id = document_id AND is_org_member(d.organization_id)  
   ));  
   
 -- Document chunks: allow org admins to hard-delete chunks when a document is removed from storage  
 CREATE POLICY "Admins can delete chunks"  
   ON public.document_chunks FOR DELETE  
   USING (EXISTS (  
     SELECT 1 FROM public.documents d  
     WHERE d.id = document_id AND has_org_role(d.organization_id, 'admin')  
   ));  
   
 CREATE POLICY "Org members can read document processing jobs"  
   ON public.document_processing_jobs FOR SELECT  
   USING (is_org_member(organization_id));  
   
 CREATE POLICY "Admins can enqueue document processing jobs"  
   ON public.document_processing_jobs FOR INSERT  
   WITH CHECK (  
     has_org_role(organization_id, 'admin')  
     AND EXISTS (  
       SELECT 1 FROM public.documents d  
       JOIN public.project_agents pa ON pa.id = d.project_agent_id  
       WHERE d.id = document_id  
         AND d.organization_id = organization_id  
         AND pa.project_id = project_id  
         AND d.is_deleted = FALSE  
     )  
   );  
   
 CREATE POLICY "Admins can update document processing jobs"  
   ON public.document_processing_jobs FOR UPDATE  
   USING (has_org_role(organization_id, 'admin'))  
   WITH CHECK (has_org_role(organization_id, 'admin'));  
   
 CREATE POLICY "Admins can delete document processing jobs"  
   ON public.document_processing_jobs FOR DELETE  
   USING (has_org_role(organization_id, 'admin'));  

**Supabase Storage bucket policies (documents-storage + documents-dump):**  
```sql
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read documents storage"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents-storage'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "Org members can upload documents storage"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents-storage'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "Org members can update documents storage"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'documents-storage'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  )
  WITH CHECK (
    bucket_id = 'documents-storage'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "Org members can delete documents storage"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents-storage'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "Org members can read documents dump"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents-dump'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "Org members can upload documents dump"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents-dump'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "Org members can update documents dump"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'documents-dump'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  )
  WITH CHECK (
    bucket_id = 'documents-dump'
    AND is_org_member(split_part(name, '/', 1)::uuid)
  );
```

**Additional storage bucket policies (database files):**  
- `database-files-storage`: read, upload, update, delete  
- `database-files-dump`: read, upload, update  

Reference migration:  
`docs/db-schema/migrations/2026-03-27-database-files-schema-and-policies.sql`
   
**7.11 Notifications**  
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;  
   
 CREATE POLICY "Users can read own notifications"  
   ON public.notifications FOR SELECT  
   USING (auth.uid() = user_id);  
   
 CREATE POLICY "Users can update own notifications"  
   ON public.notifications FOR UPDATE  
   USING (auth.uid() = user_id);  
   
**7.12 Lookup / Reference Tables**  
-- These are public-readable. Writes are restricted to service_role.  
 DO $$  
 DECLARE  
   tbl text;  
 BEGIN  
   FOR tbl IN VALUES  
     ('public.countries'), ('public.states'), ('public.languages'),  
     ('public.plans'), ('public.plan_prices'), ('public.model_tiers'), ('public.models'),  
     ('public.support_types'), ('public.agent_types'),  
     ('public.organization_statuses'), ('public.project_statuses'), ('public.agent_statuses'),  
     ('public.notification_types')  
   LOOP  
     EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);  
     EXECUTE format(  
       'CREATE POLICY "Public read access" ON %s FOR SELECT USING (true)', tbl  
     );  
   END LOOP;  
 END;  
 $$;  
   
**7.13 Audit Logs & Usage**  
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;  
 ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;  
 ALTER TABLE public.usage_daily_rollups ENABLE ROW LEVEL SECURITY;  
 ALTER TABLE public.embedding_usage_events ENABLE ROW LEVEL SECURITY;  
 ALTER TABLE public.worker_models ENABLE ROW LEVEL SECURITY;  
   
 -- Audit logs: admins can read their org's logs  
 CREATE POLICY "Admins can read org audit logs"  
   ON public.audit_logs FOR SELECT  
   USING (has_org_role(organization_id, 'admin'));  
   
 -- Executions: admins can read  
 CREATE POLICY "Admins can read executions"  
   ON public.agent_executions FOR SELECT  
   USING (has_org_role(organization_id, 'admin'));  
   
 -- Usage rollups: members can read  
 CREATE POLICY "Members can read usage"  
   ON public.usage_daily_rollups FOR SELECT  
   USING (is_org_member(organization_id));  
   
 -- Embedding usage events: members can read (writes via service_role)  
 CREATE POLICY "Members can read embedding usage events"  
   ON public.embedding_usage_events FOR SELECT  
   USING (is_org_member(organization_id));  
   
 -- Worker models: authenticated users can read active models; writes are service-role only  
 CREATE POLICY "Authenticated users can read active worker models"  
   ON public.worker_models FOR SELECT  
   TO authenticated  
   USING (is_active = TRUE);  
   
 CREATE POLICY "Service role can manage worker models"  
   ON public.worker_models FOR ALL  
   USING (auth.role() = 'service_role')  
   WITH CHECK (auth.role() = 'service_role');  
   
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQmAABRAsSd49m4tA8nPaQJjWMGbCFuCLTOzV2cAAPzFvVZbdXw9AQDgtesBorcEPwOKyvQAAAAASUVORK5CYII=)  
**8. Partitioning Strategy**  
For tables expected to grow beyond hundreds of millions of rows, use PostgreSQL native range partitioning by created_at:  
**Partitioned Tables**  
| | | | |  
|-|-|-|-|  
| **Table** | **Partition interval** | **Retention** | **Archive strategy** |   
| agent_executions | Monthly | 90 days | Detach old partitions → archive to cold storage |   
| messages | Monthly | 12 months | Detach → archive |   
| audit_logs | Monthly | 12 months | Detach → archive |   
   
**Partition DDL Example**  
-- Create parent table as partitioned  
 CREATE TABLE public.messages (  
   id uuid NOT NULL DEFAULT gen_random_uuid(),  
   conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,  
   role text NOT NULL CHECK (role IN ('visitor', 'agent', 'system')),  
   content text NOT NULL,  
   tokens_used integer,  
   metadata jsonb,  
   created_at timestamptz NOT NULL DEFAULT now()  
 ) PARTITION BY RANGE (created_at);  
   
 -- Create monthly partitions  
 CREATE TABLE public.messages_2026_03 PARTITION OF public.messages  
   FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');  
   
 CREATE TABLE public.messages_2026_04 PARTITION OF public.messages  
   FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');  
   
 -- pg_cron auto-creates future partitions (see Section 6.3)  
   
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANElEQVR4nO3OQQmAUBBAwSfIb+HdmNvAkgaxgjcRZhLMNjNHdQUAwF/ce7Wq8+sJAACvrQctewNKtdojwQAAAABJRU5ErkJggg==)  
**Removed Tables from Iteration 2**  
| | | |  
|-|-|-|  
| **Old table** | **Reason** | **Replacement** |   
| public.domains | Missing project_id, unclear key column | domain column directly on public.projects with verification fields |   
| public.payment_statuses | Only 4-5 static values; JOIN overhead at scale | CHECK constraint on payments.status |   
| public.themes | Theme preference stored in browser localStorage to save DB space at scale | — (client-side only) |   
   
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OMQ2AABAAsSNBACPykMH4NpGACyywEZJWQZeZ2aszAAD+4l6rrTo+jgAA8N71AL/CBEiG5xPoAAAAAElFTkSuQmCC)  
**Summary: Complete Table List (38 tables)**  
| | | |  
|-|-|-|  
| **#** | **Table** | **Status** |   
| 1 | public.users | Updated |   
| 2 | public.countries | Updated |   
| 3 | public.states | Updated |   
| 4 | public.languages | Updated (was plans.languages) |   
| 5 | public.settings | Updated |   
| 6 | public.cookie_consents | Unchanged |   
| 7 | public.organization_statuses | Updated |   
| 8 | public.organizations | Updated |   
| 9 | public.organization_members | **New** |   
| 10 | public.support_types | Updated |   
| 11 | public.model_tiers | **New** |   
| 12 | public.plans | Updated |   
| 13 | public.plan_prices | **New** |   
| 14 | public.models | Updated |   
| 15 | public.worker_models | **New** |   
| 16 | public.project_statuses | Updated |   
| 17 | public.projects | Updated (domain + verification fields inline) |   
| 18 | public.project_api_keys | **New** |   
| 19 | public.agent_types | **New** |   
| 20 | public.agent_statuses | Updated |   
| 21 | public.agents | Updated (requires_document_embedding) |   
| 22 | public.project_agents | Updated |   
| 23 | public.subscriptions | **New** |   
| 24 | public.invoices | **New** |   
| 25 | public.payments | **New** |   
| 26 | public.payment_methods | **New** |   
| 27 | public.agent_executions | **New** |   
| 28 | public.usage_daily_rollups | **New** |   
| 29 | public.embedding_usage_events | **New** |   
| 30 | public.conversations | **New** |   
| 31 | public.messages | **New** |   
| 32 | public.visitor_contacts | **New** |   
| 33 | public.documents | **New** |   
| 34 | public.document_chunks | **New** |   
| 35 | public.document_processing_jobs | **New** |   
| 36 | public.notification_types | Updated |   
| 37 | public.notifications | Updated |   
| 38 | public.audit_logs | **New** |   
   
