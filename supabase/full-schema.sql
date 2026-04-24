-- =============================================================================
-- Neurons — consolidated database schema (single-file rebuild)
-- =============================================================================
-- Run this file top-to-bottom in a fresh Supabase project (SQL Editor or psql).
--
-- Sections are ordered to respect dependencies:
--   1.  Extensions
--   2.  Helper functions (no table references)
--   3.  Reference / lookup tables (no FK dependencies)
--   4.  Core tables in FK dependency order
--   5.  Functions that reference tables
--   6.  ALTER TABLE to add function-based column defaults + late FKs
--   7.  Triggers
--   8.  Indexes (not declared inline)
--   9.  RLS policies
--   10. Seed / reference data
--   11. Scheduled jobs (pg_cron)
-- =============================================================================


-- =============================================================================
-- 1. Extensions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pgsodium";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";


-- =============================================================================
-- 2. Helper functions (no table references — safe to create before tables)
-- =============================================================================

-- Auto-update updated_at on row modification.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Validator for required_contact_fields JSONB (used later by widget config CHECK).
CREATE OR REPLACE FUNCTION public.is_valid_contact_fields(val jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT jsonb_typeof(val) = 'array'
    AND bool_and(elem IN ('name', 'email', 'phone', 'location'))
  FROM jsonb_array_elements_text(val) AS t(elem)
  UNION ALL
  SELECT jsonb_typeof(val) = 'array' AND jsonb_array_length(val) = 0
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(val))
  LIMIT 1;
$$;


-- =============================================================================
-- 3. Reference / lookup tables (no FK dependencies)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.languages (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  code        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_languages_code UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS public.countries (
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

CREATE TABLE IF NOT EXISTS public.states (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country_id  bigint      NOT NULL REFERENCES public.countries(id),
  code        text,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_statuses (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_statuses_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.support_types (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_support_types_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.model_tiers (
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

CREATE TABLE IF NOT EXISTS public.project_statuses (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_project_statuses_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.agent_types (
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

CREATE TABLE IF NOT EXISTS public.agent_statuses (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_agent_statuses_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.notification_types (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_notification_types_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.document_db_file_purposes (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_purpose  text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_document_db_file_purposes UNIQUE (file_purpose)
);

CREATE TABLE IF NOT EXISTS public.document_db_file_allowed_extensions (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_extension  text        NOT NULL,
  file_for        uuid        NOT NULL REFERENCES public.document_db_file_purposes(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_document_db_file_allowed_extensions UNIQUE (file_extension, file_for)
);

CREATE TABLE IF NOT EXISTS public.database_types (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_database_types_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.databases (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier        text        NOT NULL,
  name              text        NOT NULL,
  database_type_id  uuid        NOT NULL REFERENCES public.database_types(id),
  is_active         boolean     NOT NULL DEFAULT TRUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_databases_identifier UNIQUE (identifier)
);

CREATE TABLE IF NOT EXISTS public.database_export_layouts (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  format      text        NOT NULL,
  platform    text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_database_export_layouts_format_platform UNIQUE (format, platform)
);

CREATE TABLE IF NOT EXISTS public.document_allowed_extensions (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  extension   text        NOT NULL,
  type_name   text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_document_allowed_extensions_extension UNIQUE (extension)
);

CREATE TABLE IF NOT EXISTS public.urls (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url_key     text        NOT NULL,
  url_value   text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT TRUE,
  is_deleted  boolean     NOT NULL DEFAULT FALSE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_urls_url_key UNIQUE (url_key)
);

CREATE TABLE IF NOT EXISTS public.worker_models (
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


-- =============================================================================
-- 4. Core tables (FK dependency order)
-- =============================================================================

-- Users mirror auth.users; country FK is added later (after countries exist).
CREATE TABLE IF NOT EXISTS public.users (
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

-- Settings: language_id default added later (needs get_default_language_id()).
CREATE TABLE IF NOT EXISTS public.settings (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  language_id           uuid        NOT NULL REFERENCES public.languages(id),
  timezone              text                 DEFAULT 'UTC',
  email_notifications   boolean     NOT NULL DEFAULT TRUE,
  in_app_notifications  boolean     NOT NULL DEFAULT TRUE,
  is_deleted            boolean     NOT NULL DEFAULT FALSE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_settings_user UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.cookie_consents (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  analytics   boolean     NOT NULL DEFAULT TRUE,
  marketing   boolean     NOT NULL DEFAULT TRUE,
  is_deleted  boolean     NOT NULL DEFAULT FALSE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_cookie_consents_user UNIQUE (user_id)
);

-- Models (referenced by plans.default_model_id FK — added later).
CREATE TABLE IF NOT EXISTS public.models (
  id                        uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                      text          NOT NULL,
  display_name              text          NOT NULL,
  model_tier_id             uuid          NOT NULL REFERENCES public.model_tiers(id),
  provider_name             text          NOT NULL,
  provider_url              text,
  model_identifier          text          NOT NULL,
  input_cost_per_1m_tokens  numeric(10,4),
  output_cost_per_1m_tokens numeric(10,4),
  max_context_tokens        integer,
  description               text,
  is_active                 boolean       NOT NULL DEFAULT TRUE,
  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT uq_models_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.plans (
  id                              uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                            text          NOT NULL,
  index                           integer       NOT NULL,
  max_projects_per_org            integer       NOT NULL,
  max_agents_per_project          integer       NOT NULL,
  monthly_execution_limit         bigint        NOT NULL,
  rate_limit_rps                  integer       NOT NULL,
  concurrency_limit               integer       NOT NULL,
  max_model_tier_index            integer       NOT NULL,
  default_model_id                uuid,
  support_type_id                 uuid          NOT NULL REFERENCES public.support_types(id),
  has_sla                         boolean       NOT NULL DEFAULT FALSE,
  queue_priority                  integer       NOT NULL DEFAULT 0,
  max_document_storage_mb_per_org integer       NOT NULL DEFAULT 100,
  overage_enabled                 boolean       NOT NULL DEFAULT FALSE,
  overage_cost_per_1k             numeric(10,4),
  is_active                       boolean       NOT NULL DEFAULT TRUE,
  created_at                      timestamptz   NOT NULL DEFAULT now(),
  updated_at                      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT uq_plans_name  UNIQUE (name),
  CONSTRAINT uq_plans_index UNIQUE (index)
);

CREATE TABLE IF NOT EXISTS public.plan_prices (
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

-- Organizations: plan_id default added later (needs get_default_plan_id()).
CREATE TABLE IF NOT EXISTS public.organizations (
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
  plan_id         uuid        NOT NULL REFERENCES public.plans(id),
  is_deleted      boolean     NOT NULL DEFAULT FALSE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_organizations_slug UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS public.organization_members (
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

CREATE TABLE IF NOT EXISTS public.projects (
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

CREATE TABLE IF NOT EXISTS public.project_api_keys (
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

CREATE TABLE IF NOT EXISTS public.agents (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                        text        NOT NULL,
  display_name                text        NOT NULL,
  type_id                     uuid        NOT NULL REFERENCES public.agent_types(id),
  status_id                   uuid        NOT NULL REFERENCES public.agent_statuses(id),
  default_model_id            uuid        NOT NULL REFERENCES public.models(id),
  system_instruction          text        NOT NULL,
  description                 text,
  icon_url                    text,
  version                     text        NOT NULL DEFAULT '1.0.0',
  config_schema               jsonb,
  is_public                   boolean     NOT NULL DEFAULT FALSE,
  requires_document_embedding boolean     NOT NULL DEFAULT FALSE,
  is_deleted                  boolean     NOT NULL DEFAULT FALSE,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_agents_name_version UNIQUE (name, version)
);

CREATE TABLE IF NOT EXISTS public.project_agents (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  agent_id          uuid        NOT NULL REFERENCES public.agents(id),
  status_id         uuid        NOT NULL REFERENCES public.agent_statuses(id),
  model_id          uuid                 REFERENCES public.models(id),
  user_instruction  text,
  config            jsonb,
  greeting          text,
  custom_agent_name text,
  is_deleted        boolean     NOT NULL DEFAULT FALSE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_project_agents UNIQUE (project_id, agent_id)
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                        uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id           uuid        NOT NULL REFERENCES public.organizations(id),
  plan_id                   uuid        NOT NULL REFERENCES public.plans(id),
  plan_price_id             uuid                 REFERENCES public.plan_prices(id),
  status                    text        NOT NULL DEFAULT 'active',
  payment_gateway           text,
  stripe_subscription_id    text,
  razorpay_subscription_id  text,
  current_period_start      timestamptz NOT NULL DEFAULT now(),
  current_period_end        timestamptz NOT NULL,
  cancel_at_period_end      boolean     NOT NULL DEFAULT FALSE,
  canceled_at               timestamptz,
  trial_start               timestamptz,
  trial_end                 timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_subscription_status CHECK (
    status IN ('trialing', 'active', 'past_due', 'canceled', 'paused', 'incomplete')
  ),
  CONSTRAINT chk_subscription_gateway CHECK (
    payment_gateway IS NULL OR payment_gateway IN ('stripe', 'razorpay')
  )
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id                  uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid          NOT NULL REFERENCES public.organizations(id),
  subscription_id     uuid          NOT NULL REFERENCES public.subscriptions(id),
  status              text          NOT NULL DEFAULT 'draft',
  currency            text          NOT NULL,
  subtotal            numeric(12,2) NOT NULL DEFAULT 0,
  overage_amount      numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount          numeric(12,2) NOT NULL DEFAULT 0,
  total               numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid         numeric(12,2) NOT NULL DEFAULT 0,
  period_start        timestamptz   NOT NULL,
  period_end          timestamptz   NOT NULL,
  due_date            timestamptz,
  paid_at             timestamptz,
  stripe_invoice_id   text,
  razorpay_invoice_id text,
  hosted_invoice_url  text,
  pdf_url             text,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_invoice_status CHECK (
    status IN ('draft', 'open', 'paid', 'void', 'uncollectible')
  )
);

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id),
  payment_gateway   text        NOT NULL,
  gateway_method_id text        NOT NULL,
  type              text        NOT NULL,
  last_four         text,
  brand             text,
  exp_month         integer,
  exp_year          integer,
  is_default        boolean     NOT NULL DEFAULT FALSE,
  is_active         boolean     NOT NULL DEFAULT TRUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_payment_method_gateway CHECK (payment_gateway IN ('stripe', 'razorpay'))
);

CREATE TABLE IF NOT EXISTS public.payments (
  id                 uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id    uuid          NOT NULL REFERENCES public.organizations(id),
  invoice_id         uuid                   REFERENCES public.invoices(id),
  payment_method_id  uuid                   REFERENCES public.payment_methods(id),
  amount             numeric(12,2) NOT NULL,
  currency           text          NOT NULL,
  status             text          NOT NULL DEFAULT 'pending',
  payment_gateway    text          NOT NULL,
  gateway_payment_id text,
  gateway_response   jsonb,
  failure_reason     text,
  paid_at            timestamptz,
  refunded_at        timestamptz,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_payment_status CHECK (
    status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded')
  ),
  CONSTRAINT chk_payment_gateway CHECK (payment_gateway IN ('stripe', 'razorpay'))
);

-- agent_executions (partitioned by created_at)
CREATE TABLE IF NOT EXISTS public.agent_executions (
  id                    uuid          NOT NULL DEFAULT gen_random_uuid(),
  project_agent_id      uuid          NOT NULL,
  organization_id       uuid          NOT NULL,
  conversation_id       uuid,
  model_id              uuid          NOT NULL,
  tokens_input          integer       NOT NULL DEFAULT 0,
  tokens_output         integer       NOT NULL DEFAULT 0,
  latency_ms            integer,
  status                text          NOT NULL,
  error_code            text,
  metadata              jsonb,
  input_token_cost_usd  numeric(12,6),
  output_token_cost_usd numeric(12,6),
  total_cost_usd        numeric(12,6),
  created_at            timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_execution_status CHECK (
    status IN ('success', 'error', 'timeout', 'rate_limited')
  )
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS public.agent_executions_2026_03 PARTITION OF public.agent_executions
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS public.agent_executions_2026_04 PARTITION OF public.agent_executions
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS public.agent_executions_2026_05 PARTITION OF public.agent_executions
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS public.agent_executions_2026_06 PARTITION OF public.agent_executions
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE IF NOT EXISTS public.usage_daily_rollups (
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

CREATE TABLE IF NOT EXISTS public.visitor_contacts (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id      uuid        NOT NULL REFERENCES public.projects(id),
  name            text,
  email           text,
  phone           text,
  extracted_data  jsonb,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversations (
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

-- messages (partitioned by created_at)
CREATE TABLE IF NOT EXISTS public.messages (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL,
  role            text        NOT NULL,
  content         text        NOT NULL,
  tokens_used     integer,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_message_role CHECK (role IN ('visitor', 'agent', 'system'))
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS public.messages_2026_03 PARTITION OF public.messages
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS public.messages_2026_04 PARTITION OF public.messages
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS public.messages_2026_05 PARTITION OF public.messages
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS public.messages_2026_06 PARTITION OF public.messages
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE IF NOT EXISTS public.documents (
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
  is_db_schema_file boolean     NOT NULL DEFAULT FALSE,
  is_db_data_file   boolean     NOT NULL DEFAULT FALSE,
  is_deleted        boolean     NOT NULL DEFAULT FALSE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_document_status CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  CONSTRAINT chk_documents_db_file_flags CHECK (NOT (is_db_schema_file AND is_db_data_file))
);

CREATE TABLE IF NOT EXISTS public.document_chunks (
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

CREATE TABLE IF NOT EXISTS public.document_processing_jobs (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid        NOT NULL REFERENCES public.organizations(id),
  project_id          uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id         uuid        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
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
  completed_at        timestamptz,
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

CREATE TABLE IF NOT EXISTS public.embedding_usage_events (
  id              uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid          NOT NULL REFERENCES public.organizations(id),
  project_id      uuid          NOT NULL REFERENCES public.projects(id),
  document_id     uuid          NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  job_id          uuid                   REFERENCES public.document_processing_jobs(id) ON DELETE SET NULL,
  worker_model_id uuid          NOT NULL REFERENCES public.worker_models(id),
  tokens_input    bigint        NOT NULL DEFAULT 0,
  cost_usd        numeric(12,6) NOT NULL DEFAULT 0,
  metadata        jsonb,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_embedding_usage_tokens CHECK (tokens_input >= 0),
  CONSTRAINT chk_embedding_usage_cost CHECK (cost_usd >= 0)
);

CREATE TABLE IF NOT EXISTS public.document_database_schemas (
  id                        uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id           uuid        NOT NULL REFERENCES public.organizations(id),
  project_agent_id          uuid        NOT NULL REFERENCES public.project_agents(id),
  document_id               uuid        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  source_type_id            uuid        NOT NULL REFERENCES public.document_db_file_purposes(id),
  database_id               uuid                 REFERENCES public.databases(id),
  database_export_layout_id uuid                 REFERENCES public.database_export_layouts(id),
  database_name             text        NOT NULL,
  schema_sql                text        NOT NULL,
  schema_snapshot           jsonb,
  table_count               integer     NOT NULL DEFAULT 0,
  checksum_sha256           text,
  status                    text        NOT NULL DEFAULT 'ready',
  is_deleted                boolean     NOT NULL DEFAULT FALSE,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_document_database_schemas_document UNIQUE (document_id),
  CONSTRAINT chk_document_database_schemas_status
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  CONSTRAINT chk_document_database_schemas_table_count CHECK (table_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.document_database_table_data (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schema_id          uuid        NOT NULL REFERENCES public.document_database_schemas(id) ON DELETE CASCADE,
  organization_id    uuid        NOT NULL REFERENCES public.organizations(id),
  project_agent_id   uuid        NOT NULL REFERENCES public.project_agents(id),
  document_id        uuid        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  schema_name        text        NOT NULL DEFAULT 'public',
  table_name         text        NOT NULL,
  table_data         jsonb       NOT NULL,
  row_count_estimate bigint      NOT NULL DEFAULT 0,
  payload_bytes      bigint,
  checksum_sha256    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_document_database_table_data UNIQUE (schema_id, schema_name, table_name),
  CONSTRAINT chk_document_database_table_data_row_count CHECK (row_count_estimate >= 0),
  CONSTRAINT chk_document_database_table_data_payload_bytes CHECK (payload_bytes IS NULL OR payload_bytes >= 0)
);

CREATE TABLE IF NOT EXISTS public.database_connections (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid        NOT NULL REFERENCES public.organizations(id),
  project_agent_id     uuid        NOT NULL REFERENCES public.project_agents(id) ON DELETE CASCADE,
  database_type_id     uuid        NOT NULL REFERENCES public.database_types(id),
  database_id          uuid                 REFERENCES public.databases(id),
  display_name         text        NOT NULL,
  host                 text        NOT NULL,
  port                 integer     NOT NULL DEFAULT 3306,
  database_name        text        NOT NULL,
  username             text        NOT NULL,
  ssl_mode             text        NOT NULL DEFAULT 'required',
  status               text        NOT NULL DEFAULT 'pending',
  query_mode           text        NOT NULL DEFAULT 'template_only',
  last_tested_at       timestamptz,
  last_error           text,
  last_introspected_at timestamptz,
  is_deleted           boolean     NOT NULL DEFAULT FALSE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_database_connections_port       CHECK (port > 0 AND port <= 65535),
  CONSTRAINT chk_database_connections_ssl_mode   CHECK (ssl_mode IN ('disable', 'preferred', 'required', 'verify_ca', 'verify_identity')),
  CONSTRAINT chk_database_connections_status     CHECK (status IN ('pending', 'connected', 'failed', 'disconnected')),
  CONSTRAINT chk_database_connections_query_mode CHECK (query_mode IN ('generated', 'template_preferred', 'template_only'))
);

CREATE TABLE IF NOT EXISTS public.database_connection_secrets (
  connection_id   uuid        NOT NULL PRIMARY KEY REFERENCES public.database_connections(id) ON DELETE CASCADE,
  password_value  text        NOT NULL,
  ssl_ca_pem      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.database_connection_schemas (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id   uuid        NOT NULL REFERENCES public.database_connections(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id),
  schema_snapshot jsonb       NOT NULL,
  table_count     integer     NOT NULL DEFAULT 0,
  snapshot_kind   text        NOT NULL DEFAULT 'relational',
  entity_count    integer     NOT NULL DEFAULT 0,
  status          text        NOT NULL DEFAULT 'ready',
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_database_connection_schemas_connection UNIQUE (connection_id),
  CONSTRAINT chk_database_connection_schemas_status        CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  CONSTRAINT chk_database_connection_schemas_table_count   CHECK (table_count >= 0),
  CONSTRAINT chk_database_connection_schemas_snapshot_kind CHECK (snapshot_kind IN ('relational', 'document')),
  CONSTRAINT chk_database_connection_schemas_entity_count  CHECK (entity_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.database_connection_query_templates (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id),
  connection_id     uuid        NOT NULL REFERENCES public.database_connections(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  description       text        NOT NULL,
  sql_text          text        NOT NULL,
  query_kind        text        NOT NULL DEFAULT 'sql',
  query_body        jsonb,
  card_config       jsonb,
  parameter_schema  jsonb,
  is_active         boolean     NOT NULL DEFAULT TRUE,
  sort_order        integer     NOT NULL DEFAULT 0,
  is_deleted        boolean     NOT NULL DEFAULT FALSE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_db_conn_query_templates_name_nonempty
    CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT chk_db_conn_query_templates_description_nonempty
    CHECK (char_length(btrim(description)) > 0),
  CONSTRAINT chk_db_conn_query_templates_sort_order
    CHECK (sort_order >= 0),
  CONSTRAINT chk_db_conn_query_templates_query_kind
    CHECK (query_kind IN ('sql', 'mongo_json')),
  CONSTRAINT chk_db_conn_query_templates_sql_kind_body
    CHECK (
      query_kind <> 'sql'
      OR (
        char_length(btrim(sql_text)) > 0
        AND sql_text ~* '^\s*(select|with)\y'
      )
    ),
  CONSTRAINT chk_db_conn_query_templates_mongo_kind_body
    CHECK (
      query_kind <> 'mongo_json'
      OR (
        btrim(sql_text) = ''
        AND query_body IS NOT NULL
        AND jsonb_typeof(query_body) = 'object'
      )
    ),
  CONSTRAINT chk_db_conn_query_templates_card_config_object
    CHECK (card_config IS NULL OR jsonb_typeof(card_config) = 'object')
);

CREATE TABLE IF NOT EXISTS public.notifications (
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

-- audit_logs (partitioned by created_at)
CREATE TABLE IF NOT EXISTS public.audit_logs (
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

CREATE TABLE IF NOT EXISTS public.audit_logs_2026_03 PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS public.audit_logs_2026_04 PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS public.audit_logs_2026_05 PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS public.audit_logs_2026_06 PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE IF NOT EXISTS public.project_agent_widget_configs (
  project_agent_id        uuid        PRIMARY KEY REFERENCES public.project_agents(id) ON DELETE CASCADE,
  icon_mode               text        NOT NULL DEFAULT 'lucide',
  lucide_icon             text        NOT NULL DEFAULT 'user-round',
  custom_icon_url         text,
  required_contact_fields jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at              timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT project_agent_widget_configs_icon_mode_check
    CHECK (icon_mode IN ('lucide', 'custom_url')),
  CONSTRAINT project_agent_widget_configs_lucide_icon_check
    CHECK (lucide_icon IN (
      'user-round', 'message-circle', 'bot', 'sparkles', 'circle-help',
      'message-square', 'send', 'headset', 'life-buoy', 'badge-help',
      'info', 'mail', 'phone', 'megaphone', 'bell', 'rocket',
      'shield-check', 'user', 'at-sign', 'book-open'
    )),
  CONSTRAINT project_agent_widget_configs_custom_url_required
    CHECK (
      (icon_mode = 'custom_url' AND custom_icon_url IS NOT NULL AND btrim(custom_icon_url) <> '')
      OR icon_mode = 'lucide'
    ),
  CONSTRAINT project_agent_widget_configs_required_contact_fields_valid
    CHECK (public.is_valid_contact_fields(required_contact_fields))
);


-- =============================================================================
-- 5. Functions that reference tables (must run after tables exist)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_default_plan_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT id FROM public.plans WHERE index = 0 AND is_active = TRUE LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_default_language_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT id FROM public.languages WHERE code = 'en' AND is_active = TRUE LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
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

CREATE OR REPLACE FUNCTION public.has_org_role(org_id uuid, required_role text)
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
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

CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role, joined_at)
  VALUES (NEW.id, NEW.owner_id, 'owner', now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.rollup_daily_usage(target_date date DEFAULT CURRENT_DATE - INTERVAL '1 day')
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
    execution_count        = EXCLUDED.execution_count,
    successful_executions  = EXCLUDED.successful_executions,
    failed_executions      = EXCLUDED.failed_executions,
    total_tokens_input     = EXCLUDED.total_tokens_input,
    total_tokens_output    = EXCLUDED.total_tokens_output,
    total_latency_ms       = EXCLUDED.total_latency_ms,
    updated_at             = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(1536),
  p_project_agent_id uuid,
  match_count integer DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_index integer,
  content text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    dc.metadata,
    (1 - (dc.embedding <=> query_embedding))::double precision AS similarity
  FROM public.document_chunks dc
  WHERE dc.project_agent_id = p_project_agent_id
  ORDER BY dc.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(match_count, 50));
$$;

COMMENT ON FUNCTION public.match_document_chunks IS
  'Cosine distance similarity search on document_chunks for a project_agent instance.';

GRANT EXECUTE ON FUNCTION public.match_document_chunks(vector(1536), uuid, integer) TO service_role;


-- =============================================================================
-- 6. Late FKs + function-based column defaults
-- =============================================================================

-- Users.country_id FK (countries must exist at seed time).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_users_country'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT fk_users_country FOREIGN KEY (country_id) REFERENCES public.countries(id);
  END IF;
END $$;

-- Plans.default_model_id FK (models must exist).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plans_default_model_id_fkey'
      AND conrelid = 'public.plans'::regclass
  ) THEN
    ALTER TABLE public.plans
      ADD CONSTRAINT plans_default_model_id_fkey
      FOREIGN KEY (default_model_id) REFERENCES public.models(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Function-backed column defaults (now that the functions exist).
ALTER TABLE public.settings
  ALTER COLUMN language_id SET DEFAULT public.get_default_language_id();

ALTER TABLE public.organizations
  ALTER COLUMN plan_id SET DEFAULT public.get_default_plan_id();


-- =============================================================================
-- 7. Triggers
-- =============================================================================

-- Auto-update updated_at on every public.* table that has an updated_at column.
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT format('%I.%I', c.table_schema, c.table_name)
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.column_name = 'updated_at'
      AND c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_updated_at ON %s', tbl
    );
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', tbl
    );
  END LOOP;
END $$;

-- Create user profile on auth signup.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create org member when organization is created.
DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;
CREATE TRIGGER on_organization_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_organization();


-- =============================================================================
-- 8. Indexes
-- =============================================================================

-- Core Identity
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email    ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_country         ON public.users (country_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_users_active          ON public.users (id) WHERE is_deleted = FALSE;

-- Geography
CREATE UNIQUE INDEX IF NOT EXISTS idx_countries_iso2 ON public.countries (iso2);
CREATE UNIQUE INDEX IF NOT EXISTS idx_countries_iso3 ON public.countries (iso3);
CREATE INDEX IF NOT EXISTS idx_states_country        ON public.states (country_id) WHERE is_active = TRUE;

-- User Preferences
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user         ON public.settings (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cookie_consents_user  ON public.cookie_consents (user_id);

-- Organization & Teams
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations (slug);
CREATE INDEX IF NOT EXISTS idx_organizations_owner       ON public.organizations (owner_id)  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_organizations_plan        ON public.organizations (plan_id)   WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_organizations_country     ON public.organizations (country_id) WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_unique ON public.organization_members (organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user          ON public.organization_members (user_id)         WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_org_members_org           ON public.organization_members (organization_id) WHERE is_deleted = FALSE;

-- Plans & Models
CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_name          ON public.plans (name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_index         ON public.plans (index);
CREATE INDEX IF NOT EXISTS idx_plans_default_model_id     ON public.plans (default_model_id) WHERE default_model_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_prices_unique  ON public.plan_prices (plan_id, currency, billing_interval);
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_tiers_name    ON public.model_tiers (name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_models_name         ON public.models (name);
CREATE INDEX IF NOT EXISTS idx_models_tier                ON public.models (model_tier_id) WHERE is_active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_models_name  ON public.worker_models (name);
CREATE INDEX IF NOT EXISTS idx_worker_models_provider     ON public.worker_models (provider_name) WHERE is_active = TRUE;

-- Projects
CREATE INDEX IF NOT EXISTS idx_projects_org        ON public.projects (organization_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_projects_status     ON public.projects (status_id)       WHERE is_deleted = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_domain ON public.projects (domain) WHERE domain IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_api_keys_hash ON public.project_api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_project_api_keys_project     ON public.project_api_keys (project_id) WHERE is_active = TRUE;

-- Agents
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_name_version ON public.agents (name, version);
CREATE INDEX IF NOT EXISTS idx_agents_type                ON public.agents (type_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_agents_public              ON public.agents (id) WHERE is_public = TRUE AND is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_agents_requires_document_embedding
  ON public.agents (id) WHERE is_deleted = FALSE AND requires_document_embedding = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_agents_unique ON public.project_agents (project_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_project_agents_project       ON public.project_agents (project_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_project_agents_agent         ON public.project_agents (agent_id)   WHERE is_deleted = FALSE;

-- Subscriptions & Billing
CREATE INDEX IF NOT EXISTS idx_subscriptions_org      ON public.subscriptions (organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active   ON public.subscriptions (organization_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe   ON public.subscriptions (stripe_subscription_id)   WHERE stripe_subscription_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_razorpay ON public.subscriptions (razorpay_subscription_id) WHERE razorpay_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_org          ON public.invoices (organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON public.invoices (subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status       ON public.invoices (status) WHERE status IN ('open', 'draft');
CREATE INDEX IF NOT EXISTS idx_invoices_period       ON public.invoices (organization_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_payments_org      ON public.payments (organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice  ON public.payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_gateway  ON public.payments (gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_methods_org ON public.payment_methods (organization_id) WHERE is_active = TRUE;

-- Usage Tracking
CREATE INDEX IF NOT EXISTS idx_agent_executions_project_agent ON public.agent_executions (project_agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_executions_org           ON public.agent_executions (organization_id,  created_at);
CREATE INDEX IF NOT EXISTS idx_agent_executions_conversation  ON public.agent_executions (conversation_id)  WHERE conversation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_rollups_unique ON public.usage_daily_rollups (project_id, date);
CREATE INDEX IF NOT EXISTS idx_usage_rollups_org_date      ON public.usage_daily_rollups (organization_id, date);

CREATE INDEX IF NOT EXISTS idx_embedding_usage_events_org_created     ON public.embedding_usage_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_embedding_usage_events_project_created ON public.embedding_usage_events (project_id,      created_at DESC);
CREATE INDEX IF NOT EXISTS idx_embedding_usage_events_document        ON public.embedding_usage_events (document_id);
CREATE INDEX IF NOT EXISTS idx_embedding_usage_events_job             ON public.embedding_usage_events (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_embedding_usage_events_worker_model    ON public.embedding_usage_events (worker_model_id);

-- Conversations & Visitors
CREATE INDEX IF NOT EXISTS idx_conversations_project_agent ON public.conversations (project_agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_visitor       ON public.conversations (visitor_contact_id) WHERE visitor_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_session       ON public.conversations (session_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation       ON public.messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_visitor_contacts_project       ON public.visitor_contacts (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitor_contacts_email  ON public.visitor_contacts (project_id, email) WHERE email IS NOT NULL;

-- Knowledge Base
CREATE INDEX IF NOT EXISTS idx_documents_project_agent ON public.documents (project_agent_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_documents_org           ON public.documents (organization_id)  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_documents_status        ON public.documents (status) WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_document_chunks_document      ON public.document_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_project_agent ON public.document_chunks (project_agent_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON public.document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_org_created ON public.document_processing_jobs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_document    ON public.document_processing_jobs (document_id);
CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_poll        ON public.document_processing_jobs (status, run_after) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_lease       ON public.document_processing_jobs (lease_expires_at)   WHERE status = 'processing';

-- Database-files / export layouts
CREATE INDEX IF NOT EXISTS idx_document_db_file_allowed_extensions_file_for
  ON public.document_db_file_allowed_extensions (file_for);

CREATE INDEX IF NOT EXISTS idx_document_database_schemas_org          ON public.document_database_schemas (organization_id)         WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_document_database_schemas_project_agent ON public.document_database_schemas (project_agent_id)       WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_document_database_schemas_source_type  ON public.document_database_schemas (source_type_id);
CREATE INDEX IF NOT EXISTS idx_document_database_schemas_status       ON public.document_database_schemas (status)                  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_document_database_schemas_database_id  ON public.document_database_schemas (database_id)             WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_document_database_schemas_export_layout ON public.document_database_schemas (database_export_layout_id) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_document_database_table_data_schema         ON public.document_database_table_data (schema_id);
CREATE INDEX IF NOT EXISTS idx_document_database_table_data_org            ON public.document_database_table_data (organization_id);
CREATE INDEX IF NOT EXISTS idx_document_database_table_data_project_agent  ON public.document_database_table_data (project_agent_id);

CREATE INDEX IF NOT EXISTS idx_databases_type           ON public.databases (database_type_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_databases_active         ON public.databases (is_active);

CREATE INDEX IF NOT EXISTS idx_database_export_layouts_active ON public.database_export_layouts (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_database_export_layouts_format ON public.database_export_layouts (format);

-- Live DB connections
CREATE UNIQUE INDEX IF NOT EXISTS uq_database_connections_pa_display_active
  ON public.database_connections (project_agent_id, display_name) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_database_connections_org            ON public.database_connections (organization_id)  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_database_connections_project_agent  ON public.database_connections (project_agent_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_database_connections_status         ON public.database_connections (status)           WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_database_connection_schemas_org                 ON public.database_connection_schemas (organization_id);
CREATE INDEX IF NOT EXISTS idx_database_connection_schemas_connection          ON public.database_connection_schemas (connection_id);
CREATE INDEX IF NOT EXISTS idx_database_connection_schemas_snapshot_kind       ON public.database_connection_schemas (snapshot_kind);
CREATE INDEX IF NOT EXISTS idx_database_connection_schemas_entity_count        ON public.database_connection_schemas (entity_count);
CREATE INDEX IF NOT EXISTS idx_database_connection_schemas_org_snapshot_kind   ON public.database_connection_schemas (organization_id, snapshot_kind);

CREATE UNIQUE INDEX IF NOT EXISTS uq_db_conn_query_templates_connection_name_active
  ON public.database_connection_query_templates (connection_id, lower(name)) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_db_conn_query_templates_org             ON public.database_connection_query_templates (organization_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_db_conn_query_templates_connection      ON public.database_connection_query_templates (connection_id)   WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_db_conn_query_templates_active          ON public.database_connection_query_templates (connection_id, is_active) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_db_conn_query_templates_connection_kind ON public.database_connection_query_templates (connection_id, query_kind) WHERE is_deleted = FALSE;

-- URLs
CREATE INDEX IF NOT EXISTS idx_urls_active_not_deleted
  ON public.urls (url_key) WHERE is_active = TRUE AND is_deleted = FALSE;

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user   ON public.notifications (user_id, created_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications (user_id) WHERE is_read = FALSE AND is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_org    ON public.notifications (organization_id) WHERE organization_id IS NOT NULL AND is_deleted = FALSE;

-- Audit
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor  ON public.audit_logs (actor_id,        created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org    ON public.audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action, created_at DESC);

-- Widget config
CREATE INDEX IF NOT EXISTS idx_project_agent_widget_configs_icon_mode
  ON public.project_agent_widget_configs (icon_mode);


-- =============================================================================
-- 9. RLS policies
-- =============================================================================

-- ----- 9.1 Users -----
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile"   ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users can read own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ----- 9.2 Settings & Cookie Consents -----
ALTER TABLE public.settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own settings"   ON public.settings;
DROP POLICY IF EXISTS "Users can update own settings" ON public.settings;
DROP POLICY IF EXISTS "Users can read own consents"   ON public.cookie_consents;
DROP POLICY IF EXISTS "Users can update own consents" ON public.cookie_consents;

CREATE POLICY "Users can read own settings"   ON public.settings        FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.settings        FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can read own consents"   ON public.cookie_consents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own consents" ON public.cookie_consents FOR UPDATE USING (auth.uid() = user_id);

-- ----- 9.3 Organizations -----
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read their org"           ON public.organizations;
DROP POLICY IF EXISTS "Authenticated users can create orgs"  ON public.organizations;
DROP POLICY IF EXISTS "Admins can update org"                ON public.organizations;
DROP POLICY IF EXISTS "Owner can delete org"                 ON public.organizations;

CREATE POLICY "Members can read their org"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (is_org_member(id));

CREATE POLICY "Authenticated users can create orgs"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Admins can update org"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (has_org_role(id, 'admin'));

CREATE POLICY "Owner can delete org"
  ON public.organizations FOR DELETE
  TO authenticated
  USING (has_org_role(id, 'owner'));

-- ----- 9.4 Organization Members -----
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can see co-members"                     ON public.organization_members;
DROP POLICY IF EXISTS "Admins can add members"                         ON public.organization_members;
DROP POLICY IF EXISTS "Owner can insert self membership on new org"    ON public.organization_members;
DROP POLICY IF EXISTS "Admins can update members"                      ON public.organization_members;
DROP POLICY IF EXISTS "Admins can remove members"                      ON public.organization_members;

CREATE POLICY "Members can see co-members"
  ON public.organization_members FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can add members"
  ON public.organization_members FOR INSERT
  TO authenticated
  WITH CHECK (has_org_role(organization_id, 'admin'));

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
  TO authenticated
  USING (has_org_role(organization_id, 'admin'));

CREATE POLICY "Admins can remove members"
  ON public.organization_members FOR DELETE
  TO authenticated
  USING (has_org_role(organization_id, 'admin'));

-- ----- 9.5 Projects -----
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can create projects"    ON public.projects;
DROP POLICY IF EXISTS "Admins can update projects"    ON public.projects;
DROP POLICY IF EXISTS "Admins can delete projects"    ON public.projects;

CREATE POLICY "Org members can read projects" ON public.projects FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "Admins can create projects"    ON public.projects FOR INSERT WITH CHECK (has_org_role(organization_id, 'admin'));
CREATE POLICY "Admins can update projects"    ON public.projects FOR UPDATE USING     (has_org_role(organization_id, 'admin'));
CREATE POLICY "Admins can delete projects"    ON public.projects FOR DELETE USING     (has_org_role(organization_id, 'admin'));

-- ----- 9.6 Project API Keys -----
ALTER TABLE public.project_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage API keys" ON public.project_api_keys;

CREATE POLICY "Admins can manage API keys"
  ON public.project_api_keys FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND has_org_role(p.organization_id, 'admin')
  ));

-- ----- 9.7 Agents (public catalog) -----
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read public agents" ON public.agents;

CREATE POLICY "Anyone can read public agents"
  ON public.agents FOR SELECT
  USING (is_public = TRUE AND is_deleted = FALSE);

-- ----- 9.8 Project Agents -----
ALTER TABLE public.project_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read project agents" ON public.project_agents;
DROP POLICY IF EXISTS "Admins can manage project agents"    ON public.project_agents;

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

-- ----- 9.9 Billing -----
ALTER TABLE public.subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read subscriptions"       ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can read invoices"            ON public.invoices;
DROP POLICY IF EXISTS "Admins can read payments"            ON public.payments;
DROP POLICY IF EXISTS "Admins can read payment methods"     ON public.payment_methods;
DROP POLICY IF EXISTS "Admins can manage payment methods"   ON public.payment_methods;
DROP POLICY IF EXISTS "Admins can update payment methods"   ON public.payment_methods;

CREATE POLICY "Admins can read subscriptions"     ON public.subscriptions    FOR SELECT USING (has_org_role(organization_id, 'admin'));
CREATE POLICY "Admins can read invoices"          ON public.invoices         FOR SELECT USING (has_org_role(organization_id, 'admin'));
CREATE POLICY "Admins can read payments"          ON public.payments         FOR SELECT USING (has_org_role(organization_id, 'admin'));
CREATE POLICY "Admins can read payment methods"   ON public.payment_methods  FOR SELECT USING (has_org_role(organization_id, 'admin'));
CREATE POLICY "Admins can manage payment methods" ON public.payment_methods  FOR INSERT WITH CHECK (has_org_role(organization_id, 'admin'));
CREATE POLICY "Admins can update payment methods" ON public.payment_methods  FOR UPDATE USING     (has_org_role(organization_id, 'admin'));

-- ----- 9.10 RAG core -----
ALTER TABLE public.conversations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_contacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_allowed_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_processing_jobs   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read conversations"      ON public.conversations;
DROP POLICY IF EXISTS "Org members can read messages"           ON public.messages;
DROP POLICY IF EXISTS "Org members can read visitor contacts"   ON public.visitor_contacts;
DROP POLICY IF EXISTS "Org members can read documents"          ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can read document allowed extensions" ON public.document_allowed_extensions;
DROP POLICY IF EXISTS "Admins can manage documents"             ON public.documents;
DROP POLICY IF EXISTS "Admins can update documents"             ON public.documents;
DROP POLICY IF EXISTS "Admins can delete documents"             ON public.documents;
DROP POLICY IF EXISTS "Org members can read chunks"             ON public.document_chunks;
DROP POLICY IF EXISTS "Admins can delete chunks"                ON public.document_chunks;
DROP POLICY IF EXISTS "Org members can read document processing jobs" ON public.document_processing_jobs;
DROP POLICY IF EXISTS "Admins can enqueue document processing jobs"   ON public.document_processing_jobs;
DROP POLICY IF EXISTS "Admins can update document processing jobs"    ON public.document_processing_jobs;
DROP POLICY IF EXISTS "Admins can delete document processing jobs"    ON public.document_processing_jobs;

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
  ON public.documents FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "Authenticated users can read document allowed extensions"
  ON public.document_allowed_extensions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage documents" ON public.documents FOR INSERT WITH CHECK (has_org_role(organization_id, 'admin'));
CREATE POLICY "Admins can update documents" ON public.documents FOR UPDATE USING     (has_org_role(organization_id, 'admin'));
CREATE POLICY "Admins can delete documents" ON public.documents FOR DELETE USING     (has_org_role(organization_id, 'admin'));

CREATE POLICY "Org members can read chunks"
  ON public.document_chunks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id AND is_org_member(d.organization_id)
  ));

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

-- ----- 9.11 Database-file tables -----
ALTER TABLE public.document_db_file_purposes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_db_file_allowed_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_database_schemas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_database_table_data        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_types                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.databases                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_export_layouts             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read document db file purposes"            ON public.document_db_file_purposes;
DROP POLICY IF EXISTS "Authenticated users can read document db file allowed extensions"  ON public.document_db_file_allowed_extensions;
DROP POLICY IF EXISTS "Org members can read database schemas"     ON public.document_database_schemas;
DROP POLICY IF EXISTS "Admins can insert database schemas"        ON public.document_database_schemas;
DROP POLICY IF EXISTS "Admins can update database schemas"        ON public.document_database_schemas;
DROP POLICY IF EXISTS "Admins can delete database schemas"        ON public.document_database_schemas;
DROP POLICY IF EXISTS "Org members can read database table data"  ON public.document_database_table_data;
DROP POLICY IF EXISTS "Admins can insert database table data"     ON public.document_database_table_data;
DROP POLICY IF EXISTS "Admins can update database table data"     ON public.document_database_table_data;
DROP POLICY IF EXISTS "Admins can delete database table data"     ON public.document_database_table_data;
DROP POLICY IF EXISTS "Authenticated users can read database types"   ON public.database_types;
DROP POLICY IF EXISTS "Authenticated users can read databases"        ON public.databases;
DROP POLICY IF EXISTS "Authenticated users can read active database export layouts" ON public.database_export_layouts;

CREATE POLICY "Authenticated users can read document db file purposes"
  ON public.document_db_file_purposes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read document db file allowed extensions"
  ON public.document_db_file_allowed_extensions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Org members can read database schemas"
  ON public.document_database_schemas FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "Admins can insert database schemas"
  ON public.document_database_schemas FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id
        AND d.organization_id = organization_id
        AND d.project_agent_id = project_agent_id
        AND d.is_deleted = FALSE
    )
  );

CREATE POLICY "Admins can update database schemas"
  ON public.document_database_schemas FOR UPDATE
  USING (has_org_role(organization_id, 'admin'))
  WITH CHECK (has_org_role(organization_id, 'admin'));

CREATE POLICY "Admins can delete database schemas"
  ON public.document_database_schemas FOR DELETE
  USING (has_org_role(organization_id, 'admin'));

CREATE POLICY "Org members can read database table data"
  ON public.document_database_table_data FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "Admins can insert database table data"
  ON public.document_database_table_data FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    AND EXISTS (
      SELECT 1 FROM public.document_database_schemas s
      WHERE s.id = schema_id
        AND s.organization_id = organization_id
        AND s.project_agent_id = project_agent_id
        AND s.is_deleted = FALSE
    )
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id
        AND d.organization_id = organization_id
        AND d.project_agent_id = project_agent_id
        AND d.is_db_data_file = TRUE
        AND d.is_deleted = FALSE
    )
  );

CREATE POLICY "Admins can update database table data"
  ON public.document_database_table_data FOR UPDATE
  USING (has_org_role(organization_id, 'admin'))
  WITH CHECK (has_org_role(organization_id, 'admin'));

CREATE POLICY "Admins can delete database table data"
  ON public.document_database_table_data FOR DELETE
  USING (has_org_role(organization_id, 'admin'));

CREATE POLICY "Authenticated users can read database types"
  ON public.database_types FOR SELECT TO authenticated USING (is_active = TRUE);

CREATE POLICY "Authenticated users can read databases"
  ON public.databases FOR SELECT TO authenticated USING (is_active = TRUE);

CREATE POLICY "Authenticated users can read active database export layouts"
  ON public.database_export_layouts FOR SELECT TO authenticated USING (is_active = TRUE);

-- ----- 9.12 Live DB connections -----
ALTER TABLE public.database_connections             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_connection_secrets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_connection_schemas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_connection_query_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read database connections"   ON public.database_connections;
DROP POLICY IF EXISTS "Admins can insert database connections"      ON public.database_connections;
DROP POLICY IF EXISTS "Admins can update database connections"      ON public.database_connections;
DROP POLICY IF EXISTS "Admins can delete database connections"      ON public.database_connections;

DROP POLICY IF EXISTS "Org members can read database connection schemas" ON public.database_connection_schemas;
DROP POLICY IF EXISTS "Admins can insert database connection schemas"    ON public.database_connection_schemas;
DROP POLICY IF EXISTS "Admins can update database connection schemas"    ON public.database_connection_schemas;
DROP POLICY IF EXISTS "Admins can delete database connection schemas"    ON public.database_connection_schemas;

DROP POLICY IF EXISTS "Org members can read database connection query templates" ON public.database_connection_query_templates;
DROP POLICY IF EXISTS "Admins can insert database connection query templates"    ON public.database_connection_query_templates;
DROP POLICY IF EXISTS "Admins can update database connection query templates"    ON public.database_connection_query_templates;
DROP POLICY IF EXISTS "Admins can delete database connection query templates"    ON public.database_connection_query_templates;

CREATE POLICY "Org members can read database connections"
  ON public.database_connections FOR SELECT
  USING (is_org_member(organization_id) AND is_deleted = FALSE);

CREATE POLICY "Admins can insert database connections"
  ON public.database_connections FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    AND EXISTS (
      SELECT 1 FROM public.project_agents pa
      JOIN public.projects p ON p.id = pa.project_id
      WHERE pa.id = project_agent_id
        AND p.organization_id = organization_id
        AND pa.is_deleted = FALSE
        AND p.is_deleted = FALSE
    )
  );

CREATE POLICY "Admins can update database connections"
  ON public.database_connections FOR UPDATE
  USING (has_org_role(organization_id, 'admin'))
  WITH CHECK (has_org_role(organization_id, 'admin'));

CREATE POLICY "Admins can delete database connections"
  ON public.database_connections FOR DELETE
  USING (has_org_role(organization_id, 'admin'));

-- database_connection_secrets: no authenticated policies (service_role only, bypasses RLS).

CREATE POLICY "Org members can read database connection schemas"
  ON public.database_connection_schemas FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can insert database connection schemas"
  ON public.database_connection_schemas FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    AND EXISTS (
      SELECT 1 FROM public.database_connections c
      WHERE c.id = connection_id
        AND c.organization_id = organization_id
        AND c.is_deleted = FALSE
    )
  );

CREATE POLICY "Admins can update database connection schemas"
  ON public.database_connection_schemas FOR UPDATE
  USING (has_org_role(organization_id, 'admin'))
  WITH CHECK (has_org_role(organization_id, 'admin'));

CREATE POLICY "Admins can delete database connection schemas"
  ON public.database_connection_schemas FOR DELETE
  USING (has_org_role(organization_id, 'admin'));

CREATE POLICY "Org members can read database connection query templates"
  ON public.database_connection_query_templates FOR SELECT
  USING (is_org_member(organization_id) AND is_deleted = FALSE);

CREATE POLICY "Admins can insert database connection query templates"
  ON public.database_connection_query_templates FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    AND EXISTS (
      SELECT 1 FROM public.database_connections c
      WHERE c.id = connection_id
        AND c.organization_id = organization_id
        AND c.is_deleted = FALSE
    )
  );

CREATE POLICY "Admins can update database connection query templates"
  ON public.database_connection_query_templates FOR UPDATE
  USING (has_org_role(organization_id, 'admin'))
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    AND EXISTS (
      SELECT 1 FROM public.database_connections c
      WHERE c.id = connection_id
        AND c.organization_id = organization_id
        AND c.is_deleted = FALSE
    )
  );

CREATE POLICY "Admins can delete database connection query templates"
  ON public.database_connection_query_templates FOR DELETE
  USING (has_org_role(organization_id, 'admin'));

-- ----- 9.13 Notifications -----
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications"     ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications"   ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications"   ON public.notifications;

CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (organization_id IS NULL OR is_org_member(organization_id))
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id
          AND p.is_deleted = FALSE
          AND is_org_member(p.organization_id)
      )
    )
    AND (
      agent_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.agents a
        WHERE a.id = agent_id AND a.is_deleted = FALSE
      )
    )
  );

-- ----- 9.14 Lookup / reference tables (public SELECT) -----
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
    EXECUTE format('DROP POLICY IF EXISTS "Public read access" ON %s', tbl);
    EXECUTE format('CREATE POLICY "Public read access" ON %s FOR SELECT USING (true)', tbl);
  END LOOP;
END $$;

-- ----- 9.15 Audit Logs, Usage, Embedding Usage, Worker Models -----
ALTER TABLE public.audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_executions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_daily_rollups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embedding_usage_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_models           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read org audit logs"              ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can read executions"                  ON public.agent_executions;
DROP POLICY IF EXISTS "Members can read usage"                      ON public.usage_daily_rollups;
DROP POLICY IF EXISTS "Members can read embedding usage events"     ON public.embedding_usage_events;
DROP POLICY IF EXISTS "Authenticated users can read active worker models" ON public.worker_models;
DROP POLICY IF EXISTS "Service role can manage worker models"       ON public.worker_models;

CREATE POLICY "Admins can read org audit logs"
  ON public.audit_logs FOR SELECT USING (has_org_role(organization_id, 'admin'));

CREATE POLICY "Admins can read executions"
  ON public.agent_executions FOR SELECT USING (has_org_role(organization_id, 'admin'));

CREATE POLICY "Members can read usage"
  ON public.usage_daily_rollups FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "Members can read embedding usage events"
  ON public.embedding_usage_events FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "Authenticated users can read active worker models"
  ON public.worker_models FOR SELECT TO authenticated USING (is_active = TRUE);

CREATE POLICY "Service role can manage worker models"
  ON public.worker_models FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ----- 9.16 URLs -----
ALTER TABLE public.urls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read urls" ON public.urls;
CREATE POLICY "Authenticated users can read urls"
  ON public.urls FOR SELECT TO authenticated USING (TRUE);

-- ----- 9.17 Project Agent Widget Configs -----
ALTER TABLE public.project_agent_widget_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read project agent widget configs" ON public.project_agent_widget_configs;
DROP POLICY IF EXISTS "Admins can insert project agent widget configs"    ON public.project_agent_widget_configs;
DROP POLICY IF EXISTS "Admins can update project agent widget configs"    ON public.project_agent_widget_configs;

CREATE POLICY "Org members can read project agent widget configs"
  ON public.project_agent_widget_configs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.project_agents pa
    JOIN public.projects p ON p.id = pa.project_id
    WHERE pa.id = project_agent_id
      AND pa.is_deleted = FALSE
      AND p.is_deleted = FALSE
      AND is_org_member(p.organization_id)
  ));

CREATE POLICY "Admins can insert project agent widget configs"
  ON public.project_agent_widget_configs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.project_agents pa
    JOIN public.projects p ON p.id = pa.project_id
    WHERE pa.id = project_agent_id
      AND pa.is_deleted = FALSE
      AND p.is_deleted = FALSE
      AND has_org_role(p.organization_id, 'admin')
  ));

CREATE POLICY "Admins can update project agent widget configs"
  ON public.project_agent_widget_configs FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.project_agents pa
    JOIN public.projects p ON p.id = pa.project_id
    WHERE pa.id = project_agent_id
      AND pa.is_deleted = FALSE
      AND p.is_deleted = FALSE
      AND has_org_role(p.organization_id, 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.project_agents pa
    JOIN public.projects p ON p.id = pa.project_id
    WHERE pa.id = project_agent_id
      AND pa.is_deleted = FALSE
      AND p.is_deleted = FALSE
      AND has_org_role(p.organization_id, 'admin')
  ));

-- ----- 9.18 Supabase Storage buckets -----
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

-- documents-storage
DROP POLICY IF EXISTS "Org members can read documents storage"   ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete documents storage" ON storage.objects;

CREATE POLICY "Org members can read documents storage"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents-storage' AND is_org_member(split_part(name, '/', 1)::uuid));

CREATE POLICY "Org members can upload documents storage"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents-storage' AND is_org_member(split_part(name, '/', 1)::uuid));

CREATE POLICY "Org members can update documents storage"
  ON storage.objects FOR UPDATE
  USING      (bucket_id = 'documents-storage' AND is_org_member(split_part(name, '/', 1)::uuid))
  WITH CHECK (bucket_id = 'documents-storage' AND is_org_member(split_part(name, '/', 1)::uuid));

CREATE POLICY "Org members can delete documents storage"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents-storage' AND is_org_member(split_part(name, '/', 1)::uuid));

-- documents-dump
DROP POLICY IF EXISTS "Org members can read documents dump"   ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload documents dump" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update documents dump" ON storage.objects;

CREATE POLICY "Org members can read documents dump"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents-dump' AND is_org_member(split_part(name, '/', 1)::uuid));

CREATE POLICY "Org members can upload documents dump"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents-dump' AND is_org_member(split_part(name, '/', 1)::uuid));

CREATE POLICY "Org members can update documents dump"
  ON storage.objects FOR UPDATE
  USING      (bucket_id = 'documents-dump' AND is_org_member(split_part(name, '/', 1)::uuid))
  WITH CHECK (bucket_id = 'documents-dump' AND is_org_member(split_part(name, '/', 1)::uuid));

-- database-files-storage
DROP POLICY IF EXISTS "Org members can read database files storage"   ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload database files storage" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update database files storage" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete database files storage" ON storage.objects;

CREATE POLICY "Org members can read database files storage"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'database-files-storage' AND is_org_member(split_part(name, '/', 1)::uuid));

CREATE POLICY "Org members can upload database files storage"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'database-files-storage' AND is_org_member(split_part(name, '/', 1)::uuid));

CREATE POLICY "Org members can update database files storage"
  ON storage.objects FOR UPDATE
  USING      (bucket_id = 'database-files-storage' AND is_org_member(split_part(name, '/', 1)::uuid))
  WITH CHECK (bucket_id = 'database-files-storage' AND is_org_member(split_part(name, '/', 1)::uuid));

CREATE POLICY "Org members can delete database files storage"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'database-files-storage' AND is_org_member(split_part(name, '/', 1)::uuid));

-- database-files-dump
DROP POLICY IF EXISTS "Org members can read database files dump"   ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload database files dump" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update database files dump" ON storage.objects;

CREATE POLICY "Org members can read database files dump"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'database-files-dump' AND is_org_member(split_part(name, '/', 1)::uuid));

CREATE POLICY "Org members can upload database files dump"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'database-files-dump' AND is_org_member(split_part(name, '/', 1)::uuid));

CREATE POLICY "Org members can update database files dump"
  ON storage.objects FOR UPDATE
  USING      (bucket_id = 'database-files-dump' AND is_org_member(split_part(name, '/', 1)::uuid))
  WITH CHECK (bucket_id = 'database-files-dump' AND is_org_member(split_part(name, '/', 1)::uuid));

-- widget-assets (public bucket; anyone can read, admins can write).
INSERT INTO storage.buckets (id, name, public)
VALUES ('widget-assets', 'widget-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can read widget assets"    ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload widget assets"  ON storage.objects;
DROP POLICY IF EXISTS "Admins can update widget assets"  ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete widget assets"  ON storage.objects;

CREATE POLICY "Public can read widget assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'widget-assets');

CREATE POLICY "Admins can upload widget assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'widget-assets'
    AND has_org_role(split_part(name, '/', 1)::uuid, 'admin')
  );

CREATE POLICY "Admins can update widget assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'widget-assets'
    AND has_org_role(split_part(name, '/', 1)::uuid, 'admin')
  )
  WITH CHECK (
    bucket_id = 'widget-assets'
    AND has_org_role(split_part(name, '/', 1)::uuid, 'admin')
  );

CREATE POLICY "Admins can delete widget assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'widget-assets'
    AND has_org_role(split_part(name, '/', 1)::uuid, 'admin')
  );


-- =============================================================================
-- 10. Seed / reference data
-- =============================================================================

-- Languages
INSERT INTO public.languages (name, code) VALUES
  ('English', 'en'),
  ('Hindi', 'hi'),
  ('Spanish', 'es'),
  ('French', 'fr'),
  ('German', 'de'),
  ('Japanese', 'ja'),
  ('Portuguese', 'pt'),
  ('Chinese (Simplified)', 'zh')
ON CONFLICT (code) DO NOTHING;

-- Organization Statuses
INSERT INTO public.organization_statuses (name) VALUES
  ('active'), ('suspended'), ('paused')
ON CONFLICT (name) DO NOTHING;

-- Project Statuses
INSERT INTO public.project_statuses (name) VALUES
  ('active'), ('paused'), ('archived')
ON CONFLICT (name) DO NOTHING;

-- Agent Statuses
INSERT INTO public.agent_statuses (name) VALUES
  ('active'), ('inactive'), ('maintenance'), ('deprecated')
ON CONFLICT (name) DO NOTHING;

-- Support Types
INSERT INTO public.support_types (name) VALUES
  ('community'), ('email'), ('priority'), ('dedicated')
ON CONFLICT (name) DO NOTHING;

-- Notification Types
INSERT INTO public.notification_types (name) VALUES
  ('billing'), ('agent_alert'), ('system'), ('security'), ('usage_warning')
ON CONFLICT (name) DO NOTHING;

-- Document allowed extensions (upload whitelist)
INSERT INTO public.document_allowed_extensions (extension, type_name) VALUES
  ('pdf',   'PDF'),
  ('txt',   'Text'),
  ('doc',   'Document'),
  ('docx',  'Document'),
  ('md',    'Markdown'),
  ('json',  'JSON'),
  ('xml',   'XML'),
  ('yaml',  'YAML'),
  ('log',   'LOG'),
  ('rtf',   'Rich Text'),
  ('pages', 'Apple Pages'),
  ('odt',   'OpenDocument Text')
ON CONFLICT (extension) DO NOTHING;

-- Model Tiers
INSERT INTO public.model_tiers (name, min_plan_index, description) VALUES
  ('basic',    0, 'Available on all plans (e.g., GPT-4o Mini, Claude Haiku, Gemini Flash)'),
  ('standard', 1, 'Plus and above (e.g., GPT-4o, Claude Sonnet, Gemini Pro)'),
  ('advanced', 2, 'Pro and above (e.g., GPT-4.1, Claude Opus, Gemini Ultra)'),
  ('premium',  3, 'Enterprise only (fine-tuned models, dedicated capacity)')
ON CONFLICT (name) DO NOTHING;

-- Agent Types
INSERT INTO public.agent_types (name, display_name, description) VALUES
  ('rag',            'RAG Assistant',   'Retrieval-Augmented Generation agent that answers questions using uploaded documents'),
  ('chatbot',        'Chatbot',         'General-purpose conversational agent'),
  ('lead_qualifier', 'Lead Qualifier',  'Agent that qualifies leads by asking targeted questions'),
  ('form_filler',    'Smart Form',      'Replaces static forms with a conversational data collection agent')
ON CONFLICT (name) DO NOTHING;

-- Plans
INSERT INTO public.plans (
  name, index,
  max_projects_per_org, max_agents_per_project,
  monthly_execution_limit, rate_limit_rps, concurrency_limit,
  max_model_tier_index, support_type_id, has_sla,
  queue_priority, max_document_storage_mb_per_org,
  overage_enabled, overage_cost_per_1k
) VALUES
  ('Free',       0, 1,   2,    5000, 2,  1, 0, (SELECT id FROM public.support_types WHERE name = 'community'), FALSE, 0, 100,   FALSE, NULL),
  ('Plus',       1, 5,   5,   50000, 10, 5, 1, (SELECT id FROM public.support_types WHERE name = 'email'),     FALSE, 1, 1024,  TRUE,  0.5000),
  ('Pro',        2, 20,  15, 400000, 50, 20, 2, (SELECT id FROM public.support_types WHERE name = 'priority'), FALSE, 2, 10240, TRUE,  0.2500),
  ('Enterprise', 3, -1, -1,     -1, 200, 50, 3, (SELECT id FROM public.support_types WHERE name = 'dedicated'),TRUE,  3, 102400, TRUE, 0.1000)
ON CONFLICT (name) DO NOTHING;

-- Plan Prices (USD + INR, monthly + yearly)
INSERT INTO public.plan_prices (plan_id, currency, billing_interval, amount) VALUES
  ((SELECT id FROM public.plans WHERE name = 'Free'), 'USD', 'monthly',    0.00),
  ((SELECT id FROM public.plans WHERE name = 'Free'), 'INR', 'monthly',    0.00),
  ((SELECT id FROM public.plans WHERE name = 'Plus'), 'USD', 'monthly',   25.00),
  ((SELECT id FROM public.plans WHERE name = 'Plus'), 'USD', 'yearly',   240.00),
  ((SELECT id FROM public.plans WHERE name = 'Plus'), 'INR', 'monthly', 2000.00),
  ((SELECT id FROM public.plans WHERE name = 'Plus'), 'INR', 'yearly', 19200.00),
  ((SELECT id FROM public.plans WHERE name = 'Pro'),  'USD', 'monthly',  100.00),
  ((SELECT id FROM public.plans WHERE name = 'Pro'),  'USD', 'yearly',   960.00),
  ((SELECT id FROM public.plans WHERE name = 'Pro'),  'INR', 'monthly', 8000.00),
  ((SELECT id FROM public.plans WHERE name = 'Pro'),  'INR', 'yearly', 76800.00)
ON CONFLICT (plan_id, currency, billing_interval) DO NOTHING;

-- Models (LLM catalog, incl. Gemini 2.0 Flash + Gemini 3 Pro).
INSERT INTO public.models (
  name, display_name, model_tier_id,
  provider_name, provider_url, model_identifier,
  input_cost_per_1m_tokens, output_cost_per_1m_tokens,
  max_context_tokens, description
) VALUES
  -- OpenAI
  ('gpt-4o-mini',      'GPT-4o Mini',      (SELECT id FROM public.model_tiers WHERE name = 'basic'),
    'openai',    'https://openai.com',       'gpt-4o-mini',     0.1500, 0.6000, 128000,  'Fast small model'),
  ('gpt-4o',           'GPT-4o',           (SELECT id FROM public.model_tiers WHERE name = 'standard'),
    'openai',    'https://openai.com',       'gpt-4o',          2.5000, 10.0000, 128000, 'Flagship model'),
  ('gpt-4.1',          'GPT-4.1',          (SELECT id FROM public.model_tiers WHERE name = 'advanced'),
    'openai',    'https://openai.com',       'gpt-4.1',         2.0000, 8.0000, 1047576, 'Advanced reasoning model'),

  -- Google Gemini
  ('gemini-1.5-flash', 'Gemini 1.5 Flash', (SELECT id FROM public.model_tiers WHERE name = 'basic'),
    'google',    'https://ai.google.dev',    'gemini-1.5-flash', NULL, NULL, NULL, 'Fast low-latency model'),
  ('gemini-1.5-pro',   'Gemini 1.5 Pro',   (SELECT id FROM public.model_tiers WHERE name = 'standard'),
    'google',    'https://ai.google.dev',    'gemini-1.5-pro',   NULL, NULL, NULL, 'High quality model'),
  ('gemini-2.0-flash', 'Gemini 2.0 Flash', (SELECT id FROM public.model_tiers WHERE name = 'basic'),
    'google',    'https://ai.google.dev',    'gemini-2.0-flash', NULL, NULL, NULL, 'Fast low-latency model (2.0 generation)'),
  ('gemini-3-pro',     'Gemini 3 Pro',     (SELECT id FROM public.model_tiers WHERE name = 'advanced'),
    'google',    'https://ai.google.dev',    'gemini-3-pro',     NULL, NULL, NULL, 'High-quality Gemini 3 Pro model'),

  -- Anthropic
  ('claude-haiku',     'Claude Haiku',     (SELECT id FROM public.model_tiers WHERE name = 'basic'),
    'anthropic', 'https://www.anthropic.com', 'claude-haiku-4-20250514',  0.8000, 4.0000, 200000, 'Fast affordable model'),
  ('claude-sonnet',    'Claude Sonnet',    (SELECT id FROM public.model_tiers WHERE name = 'standard'),
    'anthropic', 'https://www.anthropic.com', 'claude-sonnet-4-20250514', 3.0000, 15.0000, 200000, 'Balanced model'),
  ('claude-opus',      'Claude Opus',      (SELECT id FROM public.model_tiers WHERE name = 'advanced'),
    'anthropic', 'https://www.anthropic.com', 'claude-opus-4-20250514',  15.0000, 75.0000, 200000, 'Most capable model')
ON CONFLICT (name) DO UPDATE SET
  display_name              = EXCLUDED.display_name,
  model_tier_id             = EXCLUDED.model_tier_id,
  provider_name             = EXCLUDED.provider_name,
  provider_url              = EXCLUDED.provider_url,
  model_identifier          = EXCLUDED.model_identifier,
  input_cost_per_1m_tokens  = EXCLUDED.input_cost_per_1m_tokens,
  output_cost_per_1m_tokens = EXCLUDED.output_cost_per_1m_tokens,
  max_context_tokens        = EXCLUDED.max_context_tokens,
  description               = EXCLUDED.description;

-- Database-file lookups
INSERT INTO public.document_db_file_purposes (file_purpose) VALUES
  ('db-schema-file'),
  ('data-file')
ON CONFLICT (file_purpose) DO NOTHING;

INSERT INTO public.document_db_file_allowed_extensions (file_extension, file_for) VALUES
  ('sql',  (SELECT id FROM public.document_db_file_purposes WHERE file_purpose = 'db-schema-file')),
  ('json', (SELECT id FROM public.document_db_file_purposes WHERE file_purpose = 'data-file'))
ON CONFLICT (file_extension, file_for) DO NOTHING;

-- Database types & products
INSERT INTO public.database_types (name, is_active) VALUES
  ('Relational',          TRUE),
  ('Non-Relational',      TRUE),
  ('WordPress Relational',TRUE)
ON CONFLICT (name) DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO public.databases (identifier, name, database_type_id, is_active) VALUES
  ('postgresql', 'PostgreSQL', (SELECT id FROM public.database_types WHERE name = 'Relational'            LIMIT 1), TRUE),
  ('mysql',      'MySQL',      (SELECT id FROM public.database_types WHERE name = 'Relational'            LIMIT 1), TRUE),
  ('mongodb',    'MongoDB',    (SELECT id FROM public.database_types WHERE name = 'Non-Relational'        LIMIT 1), TRUE),
  ('wp-mysql',   'MySQL',      (SELECT id FROM public.database_types WHERE name = 'WordPress Relational'  LIMIT 1), TRUE),
  ('wp-mariadb', 'MariaDB',    (SELECT id FROM public.database_types WHERE name = 'WordPress Relational'  LIMIT 1), TRUE)
ON CONFLICT (identifier) DO UPDATE SET
  name             = EXCLUDED.name,
  database_type_id = EXCLUDED.database_type_id,
  is_active        = EXCLUDED.is_active,
  updated_at       = now();

-- Database export layouts
INSERT INTO public.database_export_layouts (format, platform, is_active) VALUES
  ('json', 'generic',    TRUE),
  ('sql',  'mysql',      TRUE),
  ('json', 'phpmyadmin', TRUE)
ON CONFLICT (format, platform) DO NOTHING;

-- URLs (widget script source — update per environment).
INSERT INTO public.urls (url_key, url_value, is_active, is_deleted) VALUES
  ('rag_agent_widget_script_src', 'http://10.85.142.106:3000/scripts/rag-agent-widget.js', TRUE, FALSE)
ON CONFLICT (url_key) DO UPDATE SET
  url_value  = EXCLUDED.url_value,
  is_active  = EXCLUDED.is_active,
  is_deleted = EXCLUDED.is_deleted,
  updated_at = now();


-- =============================================================================
-- 11. Scheduled jobs (pg_cron)
-- =============================================================================
-- Only jobs whose target function is defined here are scheduled.
-- Partition rotation jobs from the spec reference functions
-- (create_next_month_partitions / archive_old_partitions) that are not
-- defined in this repo — add them in a follow-up migration before scheduling.

SELECT cron.schedule(
  'rollup-daily-usage',
  '15 0 * * *',
  $$SELECT public.rollup_daily_usage()$$
);


-- =============================================================================
-- End of consolidated schema.
-- =============================================================================
