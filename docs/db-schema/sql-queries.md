# Neurons — SQL DDL Queries (Iteration 3)

> Execute these queries in Supabase SQL Editor in the order listed.  
> Prerequisite: Supabase project with Auth enabled.  
> Last updated: 2026-04-12
>  
> Incremental migration for database-files schema/policies:  
> `docs/db-schema/migrations/2026-03-27-database-files-schema-and-policies.sql`  
> Incremental migration for export layouts + `document_allowed_extensions` timestamps + `document_database_schemas.database_export_layout_id`:  
> `docs/db-schema/migrations/2026-03-29-database-export-layouts-and-document-extensions.sql`  
>  
> Incremental migration for pgvector `match_document_chunks` RPC (rag-agent retrieval):  
> `docs/db-schema/migrations/2026-03-29-match-document-chunks-rpc.sql`
>
> Incremental migration for MongoDB support lookups + live schema generic metadata columns (`snapshot_kind`, `entity_count`):  
> `docs/db-schema/migrations/2026-04-08-mongodb-snapshot-kind-and-entity-count.sql`
>
> Incremental migration for live connection `query_mode` + predefined query templates table/policies:
> `docs/db-schema/migrations/2026-04-10-database-connection-query-templates-and-mode.sql`
>
> Fix query-template SQL check constraint (PostgreSQL `\y` word boundary, not `\b`):
> `docs/db-schema/migrations/2026-04-11-fix-query-template-sql-check-postgres-regex.sql`
>
> Non-relational query templates (`query_kind` + `query_body` JSONB for Mongo-style documents):
> `docs/db-schema/migrations/2026-04-12-database-connection-query-templates-non-relational.sql`

---

## Table of Contents

1. [Extensions](#1-extensions)
2. [Functions (must exist before tables that reference them)](#2-functions)
3. [Tables](#3-tables)
4. [Triggers](#4-triggers)
5. [Indexes](#5-indexes)
6. [RLS Policies](#6-rls-policies)
7. [Scheduled Jobs (pg_cron)](#7-scheduled-jobs)
8. [Seed Data](#8-seed-data)

---

## 1. Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pgsodium";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
```

---

## 1.1 Supabase Vault Notes (LLM provider global API keys)

This project has Vault available:
- extension: `supabase_vault` (installed)
- schema/views: `vault.secrets`, `vault.decrypted_secrets`

In *your* environment:
- `vault.keys` does not exist (so do not rely on it)
- `vault.create_secret` signature is:
  - `vault.create_secret(new_secret text, new_name text DEFAULT NULL, new_description text DEFAULT '', new_key_id uuid DEFAULT NULL)`

Recommended usage for GLOBAL (not per-org) LLM keys:

```sql
-- Create a global secret (example for OpenAI)
-- Put the real provider key value in new_secret.
-- Run this from a trusted admin/server context only.
SELECT vault.create_secret(
  'sk-openai-xxx...',         -- new_secret (provider API key)
  'openai-api-key',          -- new_name
  'OpenAI global API key'  -- new_description
);

-- Read decrypted secrets (server/worker only; never expose to client)
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE name = 'openai-api-key';
```

If you need more secrets, repeat with different `new_name` values (e.g. `anthropic-api-key`, `gemini-api-key`).

---

## 2. Functions

> Functions are defined first because some tables use them as column defaults (e.g., `get_default_plan_id()`).

```sql
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
          WHEN 'admin'  THEN 'owner'
          WHEN 'owner'  THEN 'owner'
        END,
        CASE required_role
          WHEN 'viewer' THEN 'admin'
          WHEN 'member' THEN 'admin'
          WHEN 'admin'  THEN 'admin'
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
```

---

**Web app (Next.js signup):** The Neurons web client collects **first name** and **last name** on the sign-up form and sends them in two ways so `public.users` stays aligned with `handle_new_user()`:

1. **Auth user metadata (always):** `supabase.auth.signUp({ ..., options: { data: { first_name, last_name } } })` — Supabase stores these on `auth.users.raw_user_meta_data`, which `handle_new_user()` reads when inserting into `public.users` (including when email confirmation is required and no session is returned yet).
2. **Explicit profile update (when a session exists):** After a successful sign-up that returns a session, the server uses the authenticated Supabase client to `UPDATE public.users SET first_name, last_name` for `auth.uid()` (RLS: users may update their own row). This reinforces the values once the user is immediately authenticated.

---

```sql
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
```

---

## 3. Tables

### 3.1 Core Identity

```sql
-- =============================================
-- public.users
-- =============================================
CREATE TABLE public.users (
  id              uuid        NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name      text        NOT NULL,
  last_name       text        NOT NULL,
  email           text        NOT NULL,
  country_id      bigint,
  is_deleted      boolean     NOT NULL DEFAULT FALSE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_users_email UNIQUE (email)
);
```

**Why no `username`:** Identity and login use **`email`** (and `auth.users`). A separate username duplicates data and is easy to drift out of sync. Use `first_name` / `last_name` for display; use `email` for uniqueness and lookups.

**Migrations (existing databases only):**

```sql
-- Drop legacy avatar column if present
ALTER TABLE public.users DROP COLUMN IF EXISTS avatar_url;

-- Drop username + partial index + helper only used for username default
ALTER TABLE public.users DROP COLUMN IF EXISTS username;
DROP INDEX IF EXISTS public.idx_users_username;
DROP FUNCTION IF EXISTS public.get_user_email();
```

### 3.2 Geography (Reference Data)

```sql
-- =============================================
-- public.countries
-- =============================================
CREATE TABLE public.countries (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  iso2          text        NOT NULL,
  iso3          text        NOT NULL,
  name          text        NOT NULL,
  phone_code    text        NOT NULL,
  currency_code text,
  is_active     boolean     NOT NULL DEFAULT TRUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_countries_iso2 UNIQUE (iso2),
  CONSTRAINT uq_countries_iso3 UNIQUE (iso3)
);

-- =============================================
-- public.states
-- =============================================
CREATE TABLE public.states (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country_id  bigint      NOT NULL REFERENCES public.countries(id),
  code        text,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Add FK from users to countries (deferred because countries must exist first)
ALTER TABLE public.users
  ADD CONSTRAINT fk_users_country FOREIGN KEY (country_id) REFERENCES public.countries(id);
```

### 3.3 User Preferences

```sql
-- =============================================
-- public.languages
-- =============================================
CREATE TABLE public.languages (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  code        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_languages_code UNIQUE (code)
);

-- =============================================
-- public.settings
-- =============================================
CREATE TABLE public.settings (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  language_id           uuid        NOT NULL DEFAULT get_default_language_id() REFERENCES public.languages(id),
  timezone              text                 DEFAULT 'UTC',
  email_notifications   boolean     NOT NULL DEFAULT TRUE,
  in_app_notifications  boolean     NOT NULL DEFAULT TRUE,
  is_deleted            boolean     NOT NULL DEFAULT FALSE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_settings_user UNIQUE (user_id)
);

-- =============================================
-- public.cookie_consents
-- =============================================
CREATE TABLE public.cookie_consents (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  analytics   boolean     NOT NULL DEFAULT TRUE,
  marketing   boolean     NOT NULL DEFAULT TRUE,
  is_deleted  boolean     NOT NULL DEFAULT FALSE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_cookie_consents_user UNIQUE (user_id)
);
```

### 3.4 Organization & Teams

```sql
-- =============================================
-- public.organization_statuses
-- =============================================
CREATE TABLE public.organization_statuses (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_org_statuses_name UNIQUE (name)
);

-- =============================================
-- public.support_types
-- =============================================
CREATE TABLE public.support_types (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_support_types_name UNIQUE (name)
);

-- =============================================
-- public.model_tiers
-- =============================================
CREATE TABLE public.model_tiers (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name            text        NOT NULL,
  min_plan_index  integer     NOT NULL,
  description     text,
  is_active       boolean     NOT NULL DEFAULT TRUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_model_tiers_name      UNIQUE (name),
  CONSTRAINT uq_model_tiers_plan_idx  UNIQUE (min_plan_index)
);

-- =============================================
-- public.plans
-- =============================================
CREATE TABLE public.plans (
  id                      uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                    text          NOT NULL,
  index                   integer       NOT NULL,
  max_projects_per_org    integer       NOT NULL,
  max_agents_per_project  integer       NOT NULL,
  monthly_execution_limit bigint        NOT NULL,
  rate_limit_rps          integer       NOT NULL,
  concurrency_limit       integer       NOT NULL,
  max_model_tier_index    integer       NOT NULL,
  default_model_id        uuid,
  support_type_id         uuid          NOT NULL REFERENCES public.support_types(id),
  has_sla                 boolean       NOT NULL DEFAULT FALSE,
  queue_priority          integer       NOT NULL DEFAULT 0,
  max_document_storage_mb_per_org integer       NOT NULL DEFAULT 100,
  overage_enabled         boolean       NOT NULL DEFAULT FALSE,
  overage_cost_per_1k     numeric(10,4),
  is_active               boolean       NOT NULL DEFAULT TRUE,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT uq_plans_name  UNIQUE (name),
  CONSTRAINT uq_plans_index UNIQUE (index)
);

-- =============================================
-- public.plan_prices
-- =============================================
CREATE TABLE public.plan_prices (
  id                uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id           uuid          NOT NULL REFERENCES public.plans(id),
  currency          text          NOT NULL,
  billing_interval  text          NOT NULL,
  amount            numeric(10,2) NOT NULL,
  stripe_price_id   text,
  razorpay_plan_id  text,
  is_active         boolean       NOT NULL DEFAULT TRUE,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT uq_plan_prices_combo UNIQUE (plan_id, currency, billing_interval),
  CONSTRAINT chk_billing_interval CHECK (billing_interval IN ('monthly', 'yearly')),
  CONSTRAINT chk_amount_positive  CHECK (amount >= 0)
);

-- =============================================
-- public.organizations
-- =============================================
CREATE TABLE public.organizations (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name            text        NOT NULL,
  slug            text        NOT NULL,
  owner_id        uuid        NOT NULL REFERENCES public.users(id),
  status_id       uuid        NOT NULL REFERENCES public.organization_statuses(id),
  country_id      bigint               REFERENCES public.countries(id),
  address_line_1  text,
  address_line_2  text,
  city            text,
  state_id        bigint               REFERENCES public.states(id),
  zipcode         text,
  plan_id         uuid        NOT NULL DEFAULT get_default_plan_id() REFERENCES public.plans(id),
  is_deleted      boolean     NOT NULL DEFAULT FALSE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_organizations_slug UNIQUE (slug)
);

-- =============================================
-- public.organization_members
-- =============================================
CREATE TABLE public.organization_members (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.users(id),
  role            text        NOT NULL DEFAULT 'member',
  invited_by      uuid                 REFERENCES public.users(id),
  joined_at       timestamptz,
  is_deleted      boolean     NOT NULL DEFAULT FALSE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_org_members UNIQUE (organization_id, user_id),
  CONSTRAINT chk_org_member_role CHECK (role IN ('owner', 'admin', 'member', 'viewer'))
);
```

### 3.5 Models

```sql
-- =============================================
-- public.models
-- =============================================
CREATE TABLE public.models (
  id                       uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                     text          NOT NULL,
  display_name             text          NOT NULL,
  model_tier_id            uuid          NOT NULL REFERENCES public.model_tiers(id),
  provider_name            text          NOT NULL,
  provider_url             text,
  model_identifier         text          NOT NULL,
  input_cost_per_1m_tokens  numeric(10,4),
  output_cost_per_1m_tokens numeric(10,4),
  max_context_tokens       integer,
  description              text,
  is_active                boolean       NOT NULL DEFAULT TRUE,
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT uq_models_name UNIQUE (name)
);

ALTER TABLE public.plans
  ADD CONSTRAINT plans_default_model_id_fkey
  FOREIGN KEY (default_model_id) REFERENCES public.models (id) ON DELETE SET NULL;

-- =============================================
-- public.worker_models
-- Worker-only model catalog (embedding/rerank/etc.), not exposed to agent selection.
-- =============================================
CREATE TABLE public.worker_models (
  id                         uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                       text          NOT NULL,
  display_name               text          NOT NULL,
  provider_name              text          NOT NULL,
  provider_url               text,
  model_identifier           text          NOT NULL,
  input_cost_per_1m_tokens   numeric(10,4),
  output_cost_per_1m_tokens  numeric(10,4),
  max_context_tokens         integer,
  description                text,
  is_active                  boolean       NOT NULL DEFAULT TRUE,
  created_at                 timestamptz   NOT NULL DEFAULT now(),
  updated_at                 timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT uq_worker_models_name UNIQUE (name)
);
```

### 3.6 Projects

```sql
-- =============================================
-- public.project_statuses
-- =============================================
CREATE TABLE public.project_statuses (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_project_statuses_name UNIQUE (name)
);

-- =============================================
-- public.projects
-- =============================================
CREATE TABLE public.projects (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid        NOT NULL REFERENCES public.organizations(id),
  title                 text        NOT NULL,
  description           text,
  domain                text,
  verification_token    text,
  is_domain_verified    boolean     NOT NULL DEFAULT FALSE,
  domain_verified_at    timestamptz,
  status_id             uuid        NOT NULL REFERENCES public.project_statuses(id),
  is_deleted            boolean     NOT NULL DEFAULT FALSE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- public.project_api_keys
-- =============================================
CREATE TABLE public.project_api_keys (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  key_hash      text        NOT NULL,
  key_prefix    text        NOT NULL,
  last_used_at  timestamptz,
  expires_at    timestamptz,
  is_active     boolean     NOT NULL DEFAULT TRUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_project_api_keys_hash UNIQUE (key_hash)
);
```

### 3.7 Agents

```sql
-- =============================================
-- public.agent_types
-- =============================================
CREATE TABLE public.agent_types (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text        NOT NULL,
  display_name  text        NOT NULL,
  description   text,
  icon_url      text,
  is_active     boolean     NOT NULL DEFAULT TRUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_agent_types_name UNIQUE (name)
);

-- =============================================
-- public.agent_statuses
-- =============================================
CREATE TABLE public.agent_statuses (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_agent_statuses_name UNIQUE (name)
);

-- =============================================
-- public.agents
-- =============================================
CREATE TABLE public.agents (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                text        NOT NULL,
  display_name        text        NOT NULL,
  type_id             uuid        NOT NULL REFERENCES public.agent_types(id),
  status_id           uuid        NOT NULL REFERENCES public.agent_statuses(id),
  default_model_id    uuid        NOT NULL REFERENCES public.models(id),
  system_instruction  text        NOT NULL,
  description         text,
  icon_url            text,
  version             text        NOT NULL DEFAULT '1.0.0',
  config_schema       jsonb,
  is_public           boolean     NOT NULL DEFAULT FALSE,
  requires_document_embedding boolean NOT NULL DEFAULT FALSE,
  is_deleted          boolean     NOT NULL DEFAULT FALSE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_agents_name_version UNIQUE (name, version)
);

-- =============================================
-- public.project_agents (junction: projects <-> agents)
-- =============================================
CREATE TABLE public.project_agents (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  agent_id          uuid        NOT NULL REFERENCES public.agents(id),
  status_id         uuid        NOT NULL REFERENCES public.agent_statuses(id),
  model_id          uuid                 REFERENCES public.models(id),
  user_instruction  text,
  config            jsonb,
  greeting          text,
  is_deleted        boolean     NOT NULL DEFAULT FALSE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_project_agents UNIQUE (project_id, agent_id)
);
```

### 3.8 Subscriptions & Billing

```sql
-- =============================================
-- public.subscriptions
-- =============================================
CREATE TABLE public.subscriptions (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id             uuid        NOT NULL REFERENCES public.organizations(id),
  plan_id                     uuid        NOT NULL REFERENCES public.plans(id),
  plan_price_id               uuid                 REFERENCES public.plan_prices(id),
  status                      text        NOT NULL DEFAULT 'active',
  payment_gateway             text,
  stripe_subscription_id      text,
  razorpay_subscription_id    text,
  current_period_start        timestamptz NOT NULL DEFAULT now(),
  current_period_end          timestamptz NOT NULL,
  cancel_at_period_end        boolean     NOT NULL DEFAULT FALSE,
  canceled_at                 timestamptz,
  trial_start                 timestamptz,
  trial_end                   timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_subscription_status CHECK (
    status IN ('trialing', 'active', 'past_due', 'canceled', 'paused', 'incomplete')
  ),
  CONSTRAINT chk_subscription_gateway CHECK (
    payment_gateway IS NULL OR payment_gateway IN ('stripe', 'razorpay')
  )
);

-- =============================================
-- public.invoices
-- =============================================
CREATE TABLE public.invoices (
  id                    uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid          NOT NULL REFERENCES public.organizations(id),
  subscription_id       uuid          NOT NULL REFERENCES public.subscriptions(id),
  status                text          NOT NULL DEFAULT 'draft',
  currency              text          NOT NULL,
  subtotal              numeric(12,2) NOT NULL DEFAULT 0,
  overage_amount        numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount            numeric(12,2) NOT NULL DEFAULT 0,
  total                 numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid           numeric(12,2) NOT NULL DEFAULT 0,
  period_start          timestamptz   NOT NULL,
  period_end            timestamptz   NOT NULL,
  due_date              timestamptz,
  paid_at               timestamptz,
  stripe_invoice_id     text,
  razorpay_invoice_id   text,
  hosted_invoice_url    text,
  pdf_url               text,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT chk_invoice_status CHECK (
    status IN ('draft', 'open', 'paid', 'void', 'uncollectible')
  )
);

-- =============================================
-- public.payment_methods
-- =============================================
CREATE TABLE public.payment_methods (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid        NOT NULL REFERENCES public.organizations(id),
  payment_gateway     text        NOT NULL,
  gateway_method_id   text        NOT NULL,
  type                text        NOT NULL,
  last_four           text,
  brand               text,
  exp_month           integer,
  exp_year            integer,
  is_default          boolean     NOT NULL DEFAULT FALSE,
  is_active           boolean     NOT NULL DEFAULT TRUE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_payment_method_gateway CHECK (payment_gateway IN ('stripe', 'razorpay'))
);

-- =============================================
-- public.payments
-- =============================================
CREATE TABLE public.payments (
  id                  uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid          NOT NULL REFERENCES public.organizations(id),
  invoice_id          uuid                   REFERENCES public.invoices(id),
  payment_method_id   uuid                   REFERENCES public.payment_methods(id),
  amount              numeric(12,2) NOT NULL,
  currency            text          NOT NULL,
  status              text          NOT NULL DEFAULT 'pending',
  payment_gateway     text          NOT NULL,
  gateway_payment_id  text,
  gateway_response    jsonb,
  failure_reason      text,
  paid_at             timestamptz,
  refunded_at         timestamptz,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT chk_payment_status CHECK (
    status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded')
  ),
  CONSTRAINT chk_payment_gateway CHECK (payment_gateway IN ('stripe', 'razorpay'))
);
```

### 3.9 Usage Tracking

```sql
-- =============================================
-- public.agent_executions (partitioned by created_at)
-- =============================================
CREATE TABLE public.agent_executions (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  project_agent_id  uuid        NOT NULL,
  organization_id   uuid        NOT NULL,
  conversation_id   uuid,
  model_id          uuid        NOT NULL,
  tokens_input      integer     NOT NULL DEFAULT 0,
  tokens_output     integer     NOT NULL DEFAULT 0,
  latency_ms        integer,
  status            text        NOT NULL,
  error_code        text,
  metadata          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_execution_status CHECK (
    status IN ('success', 'error', 'timeout', 'rate_limited')
  )
) PARTITION BY RANGE (created_at);

-- Create initial monthly partitions
CREATE TABLE public.agent_executions_2026_03 PARTITION OF public.agent_executions
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE public.agent_executions_2026_04 PARTITION OF public.agent_executions
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE public.agent_executions_2026_05 PARTITION OF public.agent_executions
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE public.agent_executions_2026_06 PARTITION OF public.agent_executions
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- =============================================
-- public.usage_daily_rollups
-- =============================================
CREATE TABLE public.usage_daily_rollups (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid        NOT NULL REFERENCES public.organizations(id),
  project_id            uuid        NOT NULL REFERENCES public.projects(id),
  date                  date        NOT NULL,
  execution_count       bigint      NOT NULL DEFAULT 0,
  successful_executions bigint      NOT NULL DEFAULT 0,
  failed_executions     bigint      NOT NULL DEFAULT 0,
  total_tokens_input    bigint      NOT NULL DEFAULT 0,
  total_tokens_output   bigint      NOT NULL DEFAULT 0,
  total_latency_ms      bigint      NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_usage_rollups UNIQUE (project_id, date)
);

-- =============================================
-- public.embedding_usage_events (append-only)
-- Tracks embedding API usage for document ingestion (cost + audit).
-- =============================================
CREATE TABLE public.embedding_usage_events (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id),
  project_id      uuid        NOT NULL REFERENCES public.projects(id),
  document_id     uuid        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  job_id          uuid                 REFERENCES public.document_processing_jobs(id) ON DELETE SET NULL,
  worker_model_id  uuid        NOT NULL REFERENCES public.worker_models(id),
  tokens_input    bigint      NOT NULL DEFAULT 0,
  cost_usd        numeric(12,6) NOT NULL DEFAULT 0,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_embedding_usage_tokens CHECK (tokens_input >= 0),
  CONSTRAINT chk_embedding_usage_cost CHECK (cost_usd >= 0)
);
```

### 3.10 RAG — Conversations & Visitors

```sql
-- =============================================
-- public.visitor_contacts
-- =============================================
CREATE TABLE public.visitor_contacts (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id              uuid        NOT NULL REFERENCES public.projects(id),
  name                    text,
  email                   text,
  phone                   text,
  extracted_data          jsonb,
  metadata                jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- public.conversations
-- =============================================
CREATE TABLE public.conversations (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_agent_id    uuid        NOT NULL REFERENCES public.project_agents(id),
  visitor_contact_id  uuid                 REFERENCES public.visitor_contacts(id),
  session_id          text        NOT NULL,
  status              text        NOT NULL DEFAULT 'active',
  source_url          text,
  started_at          timestamptz NOT NULL DEFAULT now(),
  ended_at            timestamptz,
  metadata            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_conversation_status CHECK (status IN ('active', 'ended', 'archived'))
);

-- =============================================
-- public.messages (partitioned by created_at)
-- =============================================
CREATE TABLE public.messages (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  conversation_id   uuid        NOT NULL,
  role              text        NOT NULL,
  content           text        NOT NULL,
  tokens_used       integer,
  metadata          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_message_role CHECK (role IN ('visitor', 'agent', 'system'))
) PARTITION BY RANGE (created_at);

-- Create initial monthly partitions
CREATE TABLE public.messages_2026_03 PARTITION OF public.messages
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE public.messages_2026_04 PARTITION OF public.messages
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE public.messages_2026_05 PARTITION OF public.messages
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE public.messages_2026_06 PARTITION OF public.messages
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
```

### 3.11 RAG — Knowledge Base

```sql
-- =============================================
-- public.documents
-- =============================================
CREATE TABLE public.documents (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_agent_id  uuid        NOT NULL REFERENCES public.project_agents(id),
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id),
  file_name         text        NOT NULL,
  file_type         text        NOT NULL,
  file_size_bytes   bigint      NOT NULL,
  storage_bucket    text        NOT NULL,
  storage_path      text        NOT NULL,
  status            text        NOT NULL DEFAULT 'pending',
  chunk_count       integer     NOT NULL DEFAULT 0,
  error_message     text,
  processed_at      timestamptz,
  is_deleted        boolean     NOT NULL DEFAULT FALSE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_document_status CHECK (status IN ('pending', 'processing', 'ready', 'failed'))
);

-- Database files support (added in incremental migration):
-- - Adds `is_db_schema_file` and `is_db_data_file` columns to public.documents
-- - Adds CHECK constraint to prevent both flags being true simultaneously
-- Execute:
-- docs/db-schema/migrations/2026-03-27-database-files-schema-and-policies.sql

-- Export layouts + document_allowed_extensions timestamps + document_database_schemas.database_export_layout_id:
-- docs/db-schema/migrations/2026-03-29-database-export-layouts-and-document-extensions.sql

-- =============================================
-- public.document_allowed_extensions
-- Allowed upload extensions (lowercase, no leading dot). Seeded reference data.
-- For existing DBs without timestamps, run the 2026-03-29 migration above.
-- =============================================
CREATE TABLE public.document_allowed_extensions (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  extension   text        NOT NULL,
  type_name   text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_document_allowed_extensions_extension UNIQUE (extension)
);

-- Additional database-file tables (incremental migration):
-- - public.document_db_file_purposes
-- - public.document_db_file_allowed_extensions
-- - public.document_database_schemas
-- - public.document_database_table_data
-- - public.database_types
-- - public.databases
-- - public.database_export_layouts (lookup: format, platform; FK from document_database_schemas)
-- Execute:
-- docs/db-schema/migrations/2026-03-27-database-files-schema-and-policies.sql

-- =============================================
-- public.document_chunks (with pgvector embedding)
-- =============================================
CREATE TABLE public.document_chunks (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id       uuid        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  project_agent_id  uuid        NOT NULL REFERENCES public.project_agents(id),
  chunk_index       integer     NOT NULL,
  content           text        NOT NULL,
  token_count       integer,
  embedding         vector(1536) NOT NULL,
  metadata          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- public.document_processing_jobs
-- Queue for document chunking + embedding (worker polls; service role bypasses RLS).
-- =============================================
CREATE TABLE public.document_processing_jobs (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid        NOT NULL REFERENCES public.organizations(id),
  project_id          uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id       uuid        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  status              text        NOT NULL DEFAULT 'queued',
  job_type            text        NOT NULL DEFAULT 'embed_document',
  priority            integer     NOT NULL DEFAULT 0,
  payload             jsonb,
  attempt_count       integer     NOT NULL DEFAULT 0,
  max_attempts        integer     NOT NULL DEFAULT 5,
  run_after           timestamptz NOT NULL DEFAULT now(),
  locked_at           timestamptz,
  locked_by           text,
  lease_expires_at    timestamptz,
  started_at          timestamptz,
  completed_at      timestamptz,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_document_processing_job_status CHECK (
    status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')
  ),
  CONSTRAINT chk_document_processing_job_type CHECK (
    job_type IN ('embed_document', 'reindex_document')
  ),
  CONSTRAINT chk_document_processing_attempts CHECK (attempt_count >= 0 AND max_attempts > 0)
);
```

### 3.12 Notifications

```sql
-- =============================================
-- public.notification_types
-- =============================================
CREATE TABLE public.notification_types (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_notification_types_name UNIQUE (name)
);

-- =============================================
-- public.notifications
-- =============================================
CREATE TABLE public.notifications (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES public.users(id),
  organization_id uuid                 REFERENCES public.organizations(id),
  project_id      uuid                 REFERENCES public.projects(id),
  agent_id        uuid                 REFERENCES public.agents(id),
  type_id         uuid        NOT NULL REFERENCES public.notification_types(id),
  title           text        NOT NULL,
  body            text,
  action_url      text,
  is_read         boolean     NOT NULL DEFAULT FALSE,
  read_at         timestamptz,
  is_deleted      boolean     NOT NULL DEFAULT FALSE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### 3.13 Audit & Security

```sql
-- =============================================
-- public.audit_logs (partitioned by created_at)
-- =============================================
CREATE TABLE public.audit_logs (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  actor_id        uuid,
  organization_id uuid,
  action          text        NOT NULL,
  entity_type     text        NOT NULL,
  entity_id       uuid,
  changes         jsonb,
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Create initial monthly partitions
CREATE TABLE public.audit_logs_2026_03 PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE public.audit_logs_2026_04 PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE public.audit_logs_2026_05 PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE public.audit_logs_2026_06 PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
```

---

## 4. Triggers

```sql
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
```

---

## 5. Indexes

```sql
-- =============================================
-- Core Identity
-- =============================================
CREATE UNIQUE INDEX idx_users_email ON public.users (email);
CREATE INDEX idx_users_country ON public.users (country_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_users_active ON public.users (id) WHERE is_deleted = FALSE;

-- =============================================
-- Geography
-- =============================================
CREATE UNIQUE INDEX idx_countries_iso2 ON public.countries (iso2);
CREATE UNIQUE INDEX idx_countries_iso3 ON public.countries (iso3);
CREATE INDEX idx_states_country ON public.states (country_id) WHERE is_active = TRUE;

-- =============================================
-- User Preferences
-- =============================================
CREATE UNIQUE INDEX idx_settings_user ON public.settings (user_id);
CREATE UNIQUE INDEX idx_cookie_consents_user ON public.cookie_consents (user_id);

-- =============================================
-- Organization & Teams
-- =============================================
CREATE UNIQUE INDEX idx_organizations_slug ON public.organizations (slug);
CREATE INDEX idx_organizations_owner ON public.organizations (owner_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_organizations_plan ON public.organizations (plan_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_organizations_country ON public.organizations (country_id) WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX idx_org_members_unique ON public.organization_members (organization_id, user_id);
CREATE INDEX idx_org_members_user ON public.organization_members (user_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_org_members_org ON public.organization_members (organization_id) WHERE is_deleted = FALSE;

-- =============================================
-- Plans & Models
-- =============================================
CREATE UNIQUE INDEX idx_plans_name ON public.plans (name);
CREATE UNIQUE INDEX idx_plans_index ON public.plans (index);
CREATE INDEX idx_plans_default_model_id ON public.plans (default_model_id) WHERE default_model_id IS NOT NULL;
CREATE UNIQUE INDEX idx_plan_prices_unique ON public.plan_prices (plan_id, currency, billing_interval);
CREATE UNIQUE INDEX idx_model_tiers_name ON public.model_tiers (name);

CREATE UNIQUE INDEX idx_models_name ON public.models (name);
CREATE INDEX idx_models_tier ON public.models (model_tier_id) WHERE is_active = TRUE;
CREATE UNIQUE INDEX idx_worker_models_name ON public.worker_models (name);
CREATE INDEX idx_worker_models_provider ON public.worker_models (provider_name) WHERE is_active = TRUE;

-- =============================================
-- Projects
-- =============================================
CREATE INDEX idx_projects_org ON public.projects (organization_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_projects_status ON public.projects (status_id) WHERE is_deleted = FALSE;
CREATE UNIQUE INDEX idx_projects_domain ON public.projects (domain) WHERE domain IS NOT NULL;

CREATE UNIQUE INDEX idx_project_api_keys_hash ON public.project_api_keys (key_hash);
CREATE INDEX idx_project_api_keys_project ON public.project_api_keys (project_id) WHERE is_active = TRUE;

-- =============================================
-- Agents
-- =============================================
CREATE UNIQUE INDEX idx_agents_name_version ON public.agents (name, version);
CREATE INDEX idx_agents_type ON public.agents (type_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_agents_public ON public.agents (id) WHERE is_public = TRUE AND is_deleted = FALSE;
CREATE INDEX idx_agents_requires_document_embedding ON public.agents (id)
  WHERE is_deleted = FALSE AND requires_document_embedding = TRUE;

CREATE UNIQUE INDEX idx_project_agents_unique ON public.project_agents (project_id, agent_id);
CREATE INDEX idx_project_agents_project ON public.project_agents (project_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_project_agents_agent ON public.project_agents (agent_id) WHERE is_deleted = FALSE;

-- =============================================
-- Subscriptions & Billing
-- =============================================
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

-- =============================================
-- Usage Tracking
-- =============================================
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

-- =============================================
-- RAG — Conversations & Visitors
-- =============================================
CREATE INDEX idx_conversations_project_agent ON public.conversations (project_agent_id, created_at DESC);
CREATE INDEX idx_conversations_visitor ON public.conversations (visitor_contact_id) WHERE visitor_contact_id IS NOT NULL;
CREATE INDEX idx_conversations_session ON public.conversations (session_id);

CREATE INDEX idx_messages_conversation ON public.messages (conversation_id, created_at);

CREATE INDEX idx_visitor_contacts_project ON public.visitor_contacts (project_id);
CREATE UNIQUE INDEX idx_visitor_contacts_email ON public.visitor_contacts (project_id, email) WHERE email IS NOT NULL;

-- =============================================
-- RAG — Knowledge Base
-- =============================================
CREATE INDEX idx_documents_project_agent ON public.documents (project_agent_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_documents_org ON public.documents (organization_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_documents_status ON public.documents (status) WHERE status IN ('pending', 'processing');

CREATE INDEX idx_document_chunks_document ON public.document_chunks (document_id);
CREATE INDEX idx_document_chunks_project_agent ON public.document_chunks (project_agent_id);

-- HNSW vector index for similarity search (cosine distance)
CREATE INDEX idx_document_chunks_embedding ON public.document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_document_processing_jobs_org_created ON public.document_processing_jobs (organization_id, created_at DESC);
CREATE INDEX idx_document_processing_jobs_document ON public.document_processing_jobs (document_id);
CREATE INDEX idx_document_processing_jobs_poll ON public.document_processing_jobs (status, run_after)
  WHERE status = 'queued';
CREATE INDEX idx_document_processing_jobs_lease ON public.document_processing_jobs (lease_expires_at)
  WHERE status = 'processing';

-- Additional indexes for database-file support are maintained in:
-- docs/db-schema/migrations/2026-03-27-database-files-schema-and-policies.sql

-- =============================================
-- Notifications
-- =============================================
CREATE INDEX idx_notifications_user ON public.notifications (user_id, created_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_notifications_unread ON public.notifications (user_id) WHERE is_read = FALSE AND is_deleted = FALSE;
CREATE INDEX idx_notifications_org ON public.notifications (organization_id) WHERE organization_id IS NOT NULL AND is_deleted = FALSE;

-- =============================================
-- Audit
-- =============================================
CREATE INDEX idx_audit_logs_actor ON public.audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_audit_logs_org ON public.audit_logs (organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs (action, created_at DESC);
```

---

## 6. RLS Policies

```sql
-- =============================================
-- 6.1 Users
-- =============================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- =============================================
-- 6.2 Settings & Cookie Consents
-- =============================================
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own settings"
  ON public.settings FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON public.settings FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can read own consents"
  ON public.cookie_consents FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own consents"
  ON public.cookie_consents FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- 6.3 Organizations
-- =============================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their org"
  ON public.organizations FOR SELECT
  USING (is_org_member(id));

CREATE POLICY "Authenticated users can create orgs"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Admins can update org"
  ON public.organizations FOR UPDATE
  USING (has_org_role(id, 'admin'));

CREATE POLICY "Owner can delete org"
  ON public.organizations FOR DELETE
  USING (has_org_role(id, 'owner'));

-- =============================================
-- 6.4 Organization Members
-- =============================================
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can see co-members"
  ON public.organization_members FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can add members"
  ON public.organization_members FOR INSERT
  WITH CHECK (has_org_role(organization_id, 'admin'));

-- Bootstrap: after INSERT on organizations, trigger handle_new_organization() adds
-- the owner row. That insert cannot satisfy has_org_role() yet (chicken-and-egg).
CREATE POLICY "Owner can insert self membership on new org"
  ON public.organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_id
        AND o.owner_id = auth.uid()
        AND o.is_deleted = FALSE
    )
  );

CREATE POLICY "Admins can update members"
  ON public.organization_members FOR UPDATE
  USING (has_org_role(organization_id, 'admin'));

CREATE POLICY "Admins can remove members"
  ON public.organization_members FOR DELETE
  USING (has_org_role(organization_id, 'admin'));

-- =============================================
-- 6.5 Projects
-- =============================================
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

-- =============================================
-- 6.6 Project API Keys
-- =============================================
ALTER TABLE public.project_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage API keys"
  ON public.project_api_keys FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND has_org_role(p.organization_id, 'admin')
  ));

-- =============================================
-- 6.7 Agents (Public Catalog)
-- =============================================
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read public agents"
  ON public.agents FOR SELECT
  USING (is_public = TRUE AND is_deleted = FALSE);

-- =============================================
-- 6.8 Project Agents
-- =============================================
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

-- =============================================
-- 6.9 Billing Tables
-- =============================================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

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

-- =============================================
-- 6.10 RAG Tables
-- =============================================
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_allowed_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read conversations"
  ON public.conversations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.project_agents pa
    JOIN public.projects p ON p.id = pa.project_id
    WHERE pa.id = project_agent_id AND is_org_member(p.organization_id)
  ));

CREATE POLICY "Org members can read messages"
  ON public.messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.project_agents pa ON pa.id = c.project_agent_id
    JOIN public.projects p ON p.id = pa.project_id
    WHERE c.id = conversation_id AND is_org_member(p.organization_id)
  ));

CREATE POLICY "Org members can read visitor contacts"
  ON public.visitor_contacts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND is_org_member(p.organization_id)
  ));

CREATE POLICY "Org members can read documents"
  ON public.documents FOR SELECT
  USING (is_org_member(organization_id));

-- Authenticated users may read allowed extension list only (no INSERT/UPDATE/DELETE policies).
CREATE POLICY "Authenticated users can read document allowed extensions"
  ON public.document_allowed_extensions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage documents"
  ON public.documents FOR INSERT
  WITH CHECK (has_org_role(organization_id, 'admin'));

CREATE POLICY "Admins can update documents"
  ON public.documents FOR UPDATE
  USING (has_org_role(organization_id, 'admin'));

CREATE POLICY "Admins can delete documents"
  ON public.documents FOR DELETE
  USING (has_org_role(organization_id, 'admin'));

CREATE POLICY "Org members can read chunks"
  ON public.document_chunks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id AND is_org_member(d.organization_id)
  ));

-- Allow org admins to hard-delete chunks for documents they manage (e.g., when a document is removed from storage).
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

-- Additional RLS for database-file tables are maintained in:
-- docs/db-schema/migrations/2026-03-27-database-files-schema-and-policies.sql

-- =============================================
-- 6.11 Notifications
-- =============================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- =============================================
-- 6.12 Lookup / Reference Tables (public read access)
-- =============================================
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

-- =============================================
-- 6.13 Audit Logs & Usage
-- =============================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_daily_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embedding_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read org audit logs"
  ON public.audit_logs FOR SELECT
  USING (has_org_role(organization_id, 'admin'));

CREATE POLICY "Admins can read executions"
  ON public.agent_executions FOR SELECT
  USING (has_org_role(organization_id, 'admin'));

CREATE POLICY "Members can read usage"
  ON public.usage_daily_rollups FOR SELECT
  USING (is_org_member(organization_id));

-- Embedding usage events: read-only for org members (writes via service_role).
CREATE POLICY "Members can read embedding usage events"
  ON public.embedding_usage_events FOR SELECT
  USING (is_org_member(organization_id));

-- Worker model catalog: app users can read active models; writes are service-role only.
CREATE POLICY "Authenticated users can read active worker models"
  ON public.worker_models FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

CREATE POLICY "Service role can manage worker models"
  ON public.worker_models FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- 6.14 Supabase Storage (Bucket: documents-storage)
-- =============================================
-- Object path convention:
--   {organization_id}/{project_id}/{agent_id}/{file_name}
-- Policies below authorize by organization_id parsed from object path.
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

-- Dump bucket for soft-deleted document archives:
--   bucket: documents-dump
--   path:   {organization_id}/{project_id}/{agent_id}/{document_id}__{file_name}
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

-- Additional storage policies for:
-- - database-files-storage (read/insert/update/delete)
-- - database-files-dump (read/insert/update)
-- are maintained in:
-- docs/db-schema/migrations/2026-03-27-database-files-schema-and-policies.sql
```

---

## 7. Scheduled Jobs

```sql
-- Daily usage rollup at 00:15 UTC
SELECT cron.schedule('rollup-daily-usage', '15 0 * * *', $$SELECT rollup_daily_usage()$$);

-- Monthly partition creation (create next month's partitions on the 25th)
SELECT cron.schedule('create-monthly-partitions', '0 0 25 * *', $$SELECT create_next_month_partitions()$$);

-- Archive old agent_executions (drop partitions older than 90 days)
SELECT cron.schedule('archive-executions', '0 2 1 * *', $$SELECT archive_old_partitions('agent_executions', 90)$$);

-- Archive old messages (drop partitions older than 12 months)
SELECT cron.schedule('archive-messages', '0 3 1 * *', $$SELECT archive_old_partitions('messages', 365)$$);
```

---

## 8. Seed Data

```sql
-- =============================================
-- Languages
-- =============================================
INSERT INTO public.languages (name, code) VALUES
  ('English', 'en'),
  ('Hindi', 'hi'),
  ('Spanish', 'es'),
  ('French', 'fr'),
  ('German', 'de'),
  ('Japanese', 'ja'),
  ('Portuguese', 'pt'),
  ('Chinese (Simplified)', 'zh');

-- =============================================
-- Organization Statuses
-- =============================================
INSERT INTO public.organization_statuses (name) VALUES
  ('active'),
  ('suspended'),
  ('paused');

-- =============================================
-- Project Statuses
-- =============================================
INSERT INTO public.project_statuses (name) VALUES
  ('active'),
  ('paused'),
  ('archived');

-- =============================================
-- Agent Statuses
-- =============================================
INSERT INTO public.agent_statuses (name) VALUES
  ('active'),
  ('inactive'),
  ('maintenance'),
  ('deprecated');

-- =============================================
-- Support Types
-- =============================================
INSERT INTO public.support_types (name) VALUES
  ('community'),
  ('email'),
  ('priority'),
  ('dedicated');

-- =============================================
-- Notification Types
-- =============================================
INSERT INTO public.notification_types (name) VALUES
  ('billing'),
  ('agent_alert'),
  ('system'),
  ('security'),
  ('usage_warning');

-- =============================================
-- Document allowed extensions (upload whitelist)
-- =============================================
INSERT INTO public.document_allowed_extensions (extension, type_name) VALUES
  ('pdf', 'PDF'),
  ('txt', 'Text'),
  ('doc', 'Document'),
  ('docx', 'Document'),
  ('md', 'Markdown'),
  ('json', 'JSON'),
  ('xml', 'XML'),
  ('yaml', 'YAML'),
  ('log', 'LOG'),
  ('rtf', 'Rich Text'),
  ('pages', 'Apple Pages'),
  ('odt', 'OpenDocument Text');

-- Database-file lookup seed rows are maintained in:
-- docs/db-schema/migrations/2026-03-27-database-files-schema-and-policies.sql

-- =============================================
-- Model Tiers
-- =============================================
INSERT INTO public.model_tiers (name, min_plan_index, description) VALUES
  ('basic',    0, 'Available on all plans (e.g., GPT-4o Mini, Claude Haiku, Gemini Flash)'),
  ('standard', 1, 'Plus and above (e.g., GPT-4o, Claude Sonnet, Gemini Pro)'),
  ('advanced', 2, 'Pro and above (e.g., GPT-4.1, Claude Opus, Gemini Ultra)'),
  ('premium',  3, 'Enterprise only (fine-tuned models, dedicated capacity)');

-- =============================================
-- Agent Types
-- =============================================
INSERT INTO public.agent_types (name, display_name, description) VALUES
  ('rag', 'RAG Assistant', 'Retrieval-Augmented Generation agent that answers questions using uploaded documents'),
  ('chatbot', 'Chatbot', 'General-purpose conversational agent'),
  ('lead_qualifier', 'Lead Qualifier', 'Agent that qualifies leads by asking targeted questions'),
  ('form_filler', 'Smart Form', 'Replaces static forms with a conversational data collection agent');

-- =============================================
-- Plans (Free, Plus, Pro, Enterprise)
-- =============================================
INSERT INTO public.plans (
  name, index,
  max_projects_per_org, max_agents_per_project,
  monthly_execution_limit, rate_limit_rps, concurrency_limit,
  max_model_tier_index, support_type_id, has_sla,
  queue_priority, max_document_storage_mb_per_org,
  overage_enabled, overage_cost_per_1k
) VALUES
  (
    'Free', 0,
    1, 2,
    5000, 2, 1,
    0, (SELECT id FROM public.support_types WHERE name = 'community'), FALSE,
    0, 100,
    FALSE, NULL
  ),
  (
    'Plus', 1,
    5, 5,
    50000, 10, 5,
    1, (SELECT id FROM public.support_types WHERE name = 'email'), FALSE,
    1, 1024,
    TRUE, 0.5000
  ),
  (
    'Pro', 2,
    20, 15,
    400000, 50, 20,
    2, (SELECT id FROM public.support_types WHERE name = 'priority'), FALSE,
    2, 10240,
    TRUE, 0.2500
  ),
  (
    'Enterprise', 3,
    -1, -1,
    -1, 200, 50,
    3, (SELECT id FROM public.support_types WHERE name = 'dedicated'), TRUE,
    3, 102400,
    TRUE, 0.1000
  );

-- =============================================
-- Plan Prices (USD + INR, monthly + yearly)
-- =============================================
INSERT INTO public.plan_prices (plan_id, currency, billing_interval, amount) VALUES
  -- Free
  ((SELECT id FROM public.plans WHERE name = 'Free'), 'USD', 'monthly', 0.00),
  ((SELECT id FROM public.plans WHERE name = 'Free'), 'INR', 'monthly', 0.00),
  -- Plus
  ((SELECT id FROM public.plans WHERE name = 'Plus'), 'USD', 'monthly', 25.00),
  ((SELECT id FROM public.plans WHERE name = 'Plus'), 'USD', 'yearly', 240.00),
  ((SELECT id FROM public.plans WHERE name = 'Plus'), 'INR', 'monthly', 2000.00),
  ((SELECT id FROM public.plans WHERE name = 'Plus'), 'INR', 'yearly', 19200.00),
  -- Pro
  ((SELECT id FROM public.plans WHERE name = 'Pro'), 'USD', 'monthly', 100.00),
  ((SELECT id FROM public.plans WHERE name = 'Pro'), 'USD', 'yearly', 960.00),
  ((SELECT id FROM public.plans WHERE name = 'Pro'), 'INR', 'monthly', 8000.00),
  ((SELECT id FROM public.plans WHERE name = 'Pro'), 'INR', 'yearly', 76800.00);

-- =============================================
-- ============================================================
-- Model catalog (seed) - starter set + extend pattern
-- ============================================================
-- Starter GLOBAL model catalog. To add more (for "almost all recent"),
-- append more VALUES rows with correct model_identifier.
-- Re-run safe because it upserts on public.models.name.

INSERT INTO public.models (
  name,
  display_name,
  model_tier_id,
  provider_name,
  provider_url,
  model_identifier,
  input_cost_per_1m_tokens,
  output_cost_per_1m_tokens,
  max_context_tokens,
  description
) VALUES
  -- ---------------------------
  -- OpenAI
  -- ---------------------------
  ('gpt-4o-mini', 'GPT-4o Mini', (SELECT id FROM public.model_tiers WHERE name = 'basic'),
    'openai', 'https://openai.com', 'gpt-4o-mini', 0.1500, 0.6000, 128000, 'Fast small model'),
  ('gpt-4o', 'GPT-4o', (SELECT id FROM public.model_tiers WHERE name = 'standard'),
    'openai', 'https://openai.com', 'gpt-4o', 2.5000, 10.0000, 128000, 'Flagship model'),
  ('gpt-4.1', 'GPT-4.1', (SELECT id FROM public.model_tiers WHERE name = 'advanced'),
    'openai', 'https://openai.com', 'gpt-4.1', 2.0000, 8.0000, 1047576, 'Advanced reasoning model'),

  -- ---------------------------
  -- Gemini (Google)
  -- ---------------------------
  ('gemini-1.5-flash', 'Gemini 1.5 Flash', (SELECT id FROM public.model_tiers WHERE name = 'basic'),
    'google', 'https://ai.google.dev', 'gemini-1.5-flash', NULL, NULL, NULL, 'Fast low-latency model'),
  ('gemini-1.5-pro', 'Gemini 1.5 Pro', (SELECT id FROM public.model_tiers WHERE name = 'standard'),
    'google', 'https://ai.google.dev', 'gemini-1.5-pro', NULL, NULL, NULL, 'High quality model'),

  -- ---------------------------
  -- Anthropic (Claude)
  -- (kept your existing identifiers from this file)
  -- ---------------------------
  ('claude-haiku', 'Claude Haiku', (SELECT id FROM public.model_tiers WHERE name = 'basic'),
    'anthropic', 'https://www.anthropic.com', 'claude-haiku-4-20250514', 0.8000, 4.0000, 200000, 'Fast affordable model'),
  ('claude-sonnet', 'Claude Sonnet', (SELECT id FROM public.model_tiers WHERE name = 'standard'),
    'anthropic', 'https://www.anthropic.com', 'claude-sonnet-4-20250514', 3.0000, 15.0000, 200000, 'Balanced model'),
  ('claude-opus', 'Claude Opus', (SELECT id FROM public.model_tiers WHERE name = 'advanced'),
    'anthropic', 'https://www.anthropic.com', 'claude-opus-4-20250514', 15.0000, 75.0000, 200000, 'Most capable model')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  model_tier_id = EXCLUDED.model_tier_id,
  provider_name = EXCLUDED.provider_name,
  provider_url = EXCLUDED.provider_url,
  model_identifier = EXCLUDED.model_identifier,
  input_cost_per_1m_tokens = EXCLUDED.input_cost_per_1m_tokens,
  output_cost_per_1m_tokens = EXCLUDED.output_cost_per_1m_tokens,
  max_context_tokens = EXCLUDED.max_context_tokens,
  description = EXCLUDED.description;
```
