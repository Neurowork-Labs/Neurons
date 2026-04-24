# Neurons — Revenue Model & Billing Design (Iteration 3)

> Organization-level subscription with usage-based overage  
> Dual payment gateway: Stripe (international) + Razorpay (India)  
> Last updated: 2026-03-20

---

## Table of Contents

1. [Plan Tiers Overview](#1-plan-tiers-overview)
2. [Detailed Plan Comparison](#2-detailed-plan-comparison)
3. [Model Tier Access Matrix](#3-model-tier-access-matrix)
4. [Pricing Structure](#4-pricing-structure)
5. [Usage-Based Billing & Overage](#5-usage-based-billing--overage)
6. [Payment Gateway Logic](#6-payment-gateway-logic)
7. [Subscription Lifecycle](#7-subscription-lifecycle)
8. [Billing Cycle & Invoicing](#8-billing-cycle--invoicing)
9. [Free Plan Restrictions](#9-free-plan-restrictions)
10. [Enterprise Plan Handling](#10-enterprise-plan-handling)
11. [Database Tables Involved](#11-database-tables-involved)

---

## 1. Plan Tiers Overview

Neurons follows a **4-tier organization-level subscription** model. Every organization subscribes to exactly one plan. Billing, usage limits, and invoices are scoped to the organization. Usage is tracked per project but aggregated to the organization for billing.

| Plan | Target audience | Monthly price (USD) |
|------|----------------|:-------------------:|
| **Free** | Hobbyists, evaluators | $0 |
| **Plus** | Small businesses, early startups | $25 |
| **Pro** | Growth-stage companies | $100 |
| **Enterprise** | Large organizations, custom needs | Custom |

---

## 2. Detailed Plan Comparison

| Feature | Free | Plus | Pro | Enterprise |
|---------|:----:|:----:|:---:|:----------:|
| **Projects per organization** | 1 | 5 | 20 | Unlimited |
| **Agents per project** | 2 | 5 | 15 | Unlimited |
| **Monthly agent executions** (total per org) | 5,000 | 50,000 | 400,000 | Custom |
| **Rate limit** (requests/sec per org) | 2 | 10 | 50 | Custom |
| **Concurrency limit** (parallel jobs per org) | 1 | 5 | 20 | 50+ |
| **LLM access** | Basic models | Standard models | Advanced models | Premium models |
| **Document storage** (RAG) | 100 MB | 1 GB | 10 GB | Custom |
| **Support** | Community | Email | Priority | Dedicated |
| **SLA** | No | No | No | Yes |
| **Queue priority** | 0 (Lowest) | 1 (Medium) | 2 (High) | 3 (Highest) |
| **Overage billing** | Not available (hard cap) | Available | Available | Custom |
| **Overage rate** (per 1,000 executions) | — | $0.50 | $0.25 | Custom |
| **Queue type** | Shared (crowded) | Shared (better lane) | Priority queue | Dedicated queue |
| **Resource allocation** | Minimal shared CPU | Moderate shared pool | High shared pool | Dedicated / isolated |
| **Processing behavior** | Delayed during load | Stable, occasional delay | Fast, low latency | Near real-time |

### How limits work

- **Projects per organization:** Hard limit enforced at project creation. Attempting to exceed returns an error.
- **Agents per project:** Hard limit enforced when linking agents to projects.
- **Monthly executions:** Soft limit for Plus/Pro (overage charges apply). Hard limit for Free (blocked after limit).
- **Rate limit:** Enforced at the API gateway layer (e.g., Redis-backed rate limiter). Returns HTTP 429 when exceeded.
- **Concurrency limit:** Enforced by the job queue. Additional requests are queued, not dropped.

---

## 3. Model Tier Access Matrix

LLM models are grouped into tiers. Higher plans can access all tiers at or below their level.

| Model Tier | `min_plan_index` | Accessible by | Example Models |
|------------|:----------------:|---------------|----------------|
| **Basic** | 0 | Free, Plus, Pro, Enterprise | GPT-4o Mini, Claude Haiku, Gemini Flash |
| **Standard** | 1 | Plus, Pro, Enterprise | GPT-4o, Claude Sonnet, Gemini Pro |
| **Advanced** | 2 | Pro, Enterprise | GPT-4.1, Claude Opus, Gemini Ultra |
| **Premium** | 3 | Enterprise only | Fine-tuned models, dedicated capacity, early access models |

**Access check logic:**
```
user_plan.index >= model.model_tier.min_plan_index
```

If a project_agent overrides the default model with `project_agents.model_id`, the application must validate that the organization's plan grants access to that model's tier before saving.

---

## 4. Pricing Structure

### 4.1 Multi-Currency Support

| Plan | USD/month | USD/year | INR/month | INR/year |
|------|:---------:|:--------:|:---------:|:--------:|
| Free | $0 | $0 | ₹0 | ₹0 |
| Plus | $25 | $240 (20% off) | ₹2,000 | ₹19,200 (20% off) |
| Pro | $100 | $960 (20% off) | ₹8,000 | ₹76,800 (20% off) |
| Enterprise | Custom | Custom | Custom | Custom |

- Yearly billing offers a **20% discount** over monthly.
- INR pricing is set independently (not a direct FX conversion) to optimize for the Indian market.
- Additional currencies can be added to the `plan_prices` table as needed.

### 4.2 `plan_prices` Table Entries

Each row in `public.plan_prices` maps a plan + currency + billing interval to a specific amount and payment gateway price ID:

| plan | currency | billing_interval | amount | stripe_price_id | razorpay_plan_id |
|------|:--------:|:----------------:|-------:|:---------------:|:----------------:|
| Free | USD | monthly | 0.00 | — | — |
| Free | INR | monthly | 0.00 | — | — |
| Plus | USD | monthly | 25.00 | `price_plus_usd_mo` | — |
| Plus | USD | yearly | 240.00 | `price_plus_usd_yr` | — |
| Plus | INR | monthly | 2000.00 | — | `plan_plus_inr_mo` |
| Plus | INR | yearly | 19200.00 | — | `plan_plus_inr_yr` |
| Pro | USD | monthly | 100.00 | `price_pro_usd_mo` | — |
| Pro | USD | yearly | 960.00 | `price_pro_usd_yr` | — |
| Pro | INR | monthly | 8000.00 | — | `plan_pro_inr_mo` |
| Pro | INR | yearly | 76800.00 | — | `plan_pro_inr_yr` |

Free plan rows exist for completeness but have no gateway IDs.

---

## 5. Usage-Based Billing & Overage

### 5.1 How Usage Is Tracked

```
                  ┌──────────────────┐
                  │  Agent Execution  │  (real-time, per request)
                  │  (API call)       │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ agent_executions  │  Raw log table (append-only, partitioned)
                  │                  │  Retained 90 days
                  └────────┬─────────┘
                           │  pg_cron daily job
                           ▼
                  ┌──────────────────┐
                  │usage_daily_rollups│  Aggregated per project per day
                  │                  │  Retained indefinitely
                  └────────┬─────────┘
                           │  Billing query at period end
                           ▼
                  ┌──────────────────┐
                  │    invoices       │  Monthly invoice with overage
                  └──────────────────┘
```

1. **Every agent execution** writes a row to `agent_executions` with `project_agent_id`, `organization_id`, token counts, latency, and status.
2. A **daily `pg_cron` job** rolls up the previous day's executions into `usage_daily_rollups` (one row per project per day).
3. At **billing period end**, the system sums all rollups for the organization within the period to calculate total usage and any overage.

### 5.2 Overage Calculation

```
monthly_usage       = SUM(usage_daily_rollups.execution_count) for the org in the billing period
included_executions = plans.monthly_execution_limit
overage_executions  = MAX(0, monthly_usage - included_executions)
overage_cost        = CEIL(overage_executions / 1000) × plans.overage_cost_per_1k
```

| Plan | Included executions | Overage rate (per 1K) | Example: 75,000 executions |
|------|:-------------------:|:---------------------:|:--------------------------:|
| Free | 5,000 | Not available (hard cap) | Blocked after 5,000 |
| Plus | 50,000 | $0.50 | 25K overage → 25 × $0.50 = **$12.50 overage** |
| Pro | 400,000 | $0.25 | No overage |
| Enterprise | Custom | Custom | Custom |

### 5.3 Overage on Invoices

The monthly invoice includes:

```
┌─────────────────────────────────────────────────┐
│ Invoice #INV-2026-03-001                        │
│ Organization: Acme Corp                         │
│ Period: Mar 1, 2026 – Mar 31, 2026              │
├─────────────────────────────────────────────────┤
│ Subtotal (Plus plan - monthly)        $25.00    │
│                                                 │
│ Usage breakdown:                                │
│   Project A: 30,000 executions                  │
│   Project B: 20,000 executions                  │
│   Project C: 25,000 executions                  │
│   ─────────────────────────────                 │
│   Total: 75,000 executions                      │
│   Included: 50,000                              │
│   Overage: 25,000 × $0.50/1K =       $12.50    │
│                                                 │
│ Tax (GST 18% — India)                 $6.75     │
│ ────────────────────────────────────────────     │
│ Total                                 $44.25    │
└─────────────────────────────────────────────────┘
```

### 5.4 Free Plan Hard Cap Enforcement

When a Free-plan organization reaches its monthly execution limit:

1. The API returns HTTP 429 with a clear error message: `"Monthly execution limit reached. Upgrade your plan to continue."`
2. The dashboard shows a **usage warning banner** when at 80% usage and a **hard block banner** at 100%.
3. A notification is sent to the organization owner/admins.
4. No data is lost — the agent simply stops responding to new requests until the next billing period or the org upgrades.

### 5.5 Usage Tracking per Project (Billed per Organization)

Usage is tracked at the **project level** for transparency, but billing is always at the **organization level**. This means:

- Dashboard shows a breakdown: "Project A used 30K, Project B used 20K."
- The invoice totals all projects: "75K total for the org."
- Users can identify which projects consume the most and optimize accordingly.

The `usage_daily_rollups` table always stores `project_id` AND `organization_id`, enabling both per-project breakdowns and org-level aggregations.

---

## 6. Payment Gateway Logic

### 6.1 Gateway Selection

```
IF user.country.iso2 == 'IN'
    → Show Razorpay checkout
    → Currency: INR
    → Methods: UPI, Cards, Net Banking, Wallets
ELSE
    → Show Stripe checkout
    → Currency: USD (or user's local currency if supported)
    → Methods: Cards, SEPA, etc.
```

**Determination flow:**

1. Check `organizations.country_id` → `countries.iso2`.
2. If not set, fall back to `users.country_id` → `countries.iso2`.
3. If still not set, default to Stripe (USD).

### 6.2 Gateway-Specific Integration

#### Stripe (Non-Indian Users)

| Stripe concept | Neurons table | Column |
|---|---|---|
| Customer | `organizations` | `stripe_customer_id` (add to org or store in subscriptions) |
| Subscription | `subscriptions` | `stripe_subscription_id` |
| Price | `plan_prices` | `stripe_price_id` |
| PaymentIntent | `payments` | `gateway_payment_id` |
| PaymentMethod | `payment_methods` | `gateway_method_id` |
| Invoice | `invoices` | `stripe_invoice_id` |

**Webhook events to handle:**

| Event | Action |
|-------|--------|
| `customer.subscription.created` | Create `subscriptions` row, update `organizations.plan_id` |
| `customer.subscription.updated` | Update subscription status/plan |
| `customer.subscription.deleted` | Mark subscription as `canceled` |
| `invoice.created` | Create `invoices` row with `status = 'draft'` |
| `invoice.finalized` | Update invoice `status = 'open'` |
| `invoice.paid` | Update invoice `status = 'paid'`, create `payments` row |
| `invoice.payment_failed` | Create `payments` row with `status = 'failed'`, update invoice `status = 'open'` |
| `payment_intent.succeeded` | Update corresponding `payments.status = 'succeeded'` |
| `charge.refunded` | Update `payments.status = 'refunded'` |

#### Razorpay (Indian Users)

| Razorpay concept | Neurons table | Column |
|---|---|---|
| Customer | `organizations` | — (use org email / phone) |
| Subscription | `subscriptions` | `razorpay_subscription_id` |
| Plan | `plan_prices` | `razorpay_plan_id` |
| Payment | `payments` | `gateway_payment_id` |
| Token | `payment_methods` | `gateway_method_id` |
| Invoice | `invoices` | `razorpay_invoice_id` |

**Webhook events to handle:**

| Event | Action |
|-------|--------|
| `subscription.activated` | Create/update `subscriptions` row |
| `subscription.charged` | Create `invoices` + `payments` rows |
| `subscription.pending` | Update subscription status to `past_due` |
| `subscription.halted` | Update subscription status to `paused`, pause org |
| `subscription.cancelled` | Mark subscription as `canceled` |
| `payment.authorized` | Create `payments` row with `status = 'processing'` |
| `payment.captured` | Update `payments.status = 'succeeded'` |
| `payment.failed` | Update `payments.status = 'failed'` |
| `refund.processed` | Update `payments.status = 'refunded'` |

### 6.3 Handling Overage with Payment Gateways

Since overage is usage-based and calculated at period end:

**Stripe approach:**
- Use Stripe's **usage-based billing** with metered billing items, OR
- At period end, add an **invoice item** for overage before the invoice is finalized.
- Recommended: Use `invoice.created` webhook → calculate overage → add invoice item via Stripe API → let Stripe finalize.

**Razorpay approach:**
- Razorpay subscriptions don't natively support metered billing.
- At period end, create a **one-time payment link** or **invoice** for the overage amount.
- The subscription covers the base plan; overage is billed separately.

---

## 7. Subscription Lifecycle

### 7.1 State Machine

```
                ┌───────────┐
   Signup ──────▶  Free     │  (auto-created, no payment)
                │  (active) │
                └─────┬─────┘
                      │ Upgrade
                      ▼
                ┌───────────┐     payment succeeds     ┌───────────┐
   Checkout ────▶ incomplete├──────────────────────────▶│  active   │
                └───────────┘     payment fails        └─────┬─────┘
                                       │                     │
                                       ▼                     │ payment fails on renewal
                                  (retry / abandon)         │
                                                             ▼
                                                       ┌───────────┐
                                                       │ past_due  │
                                                       └─────┬─────┘
                                                             │
                                          ┌──────────────────┤
                                          │                  │
                                   payment succeeds    grace period expires
                                          │                  │
                                          ▼                  ▼
                                    ┌───────────┐      ┌───────────┐
                                    │  active   │      │  paused   │
                                    └───────────┘      └─────┬─────┘
                                                             │
                                                        user cancels
                                                             │
                                                             ▼
                                                       ┌───────────┐
                                                       │ canceled  │
                                                       └───────────┘
```

### 7.2 Subscription Transitions

| From | To | Trigger | Actions |
|------|----|---------|---------|
| — | `active` (Free) | User creates org | Auto-create subscription with Free plan |
| `active` (Free) | `incomplete` | User initiates upgrade | Redirect to payment checkout |
| `incomplete` | `active` | Payment succeeds | Update plan_id on org, activate features |
| `incomplete` | — (abandoned) | Payment fails / timeout | No subscription change, stay on Free |
| `active` | `active` | Plan upgrade (Plus → Pro) | Pro-rate current period, update plan |
| `active` | `active` (downgrade pending) | Plan downgrade (Pro → Plus) | Set `cancel_at_period_end = TRUE`, apply new plan at next period |
| `active` | `past_due` | Renewal payment fails | Send email, show warning in dashboard |
| `past_due` | `active` | Retry payment succeeds | Clear warnings |
| `past_due` | `paused` | Grace period (7 days) expires | Pause all org projects, show upgrade prompt |
| `paused` | `active` | Payment succeeds | Resume org projects |
| `active`/`paused` | `canceled` | User cancels | Effective at period end. Downgrade to Free plan. |
| `canceled` | `active` (Free) | Period ends | Org reverts to Free plan |

### 7.3 What happens when a subscription is paused

When an organization's subscription is paused (due to non-payment):

1. All projects in the organization are set to `paused` status.
2. Deployed agents stop responding to API requests (return HTTP 402).
3. Data is **not deleted** — it's preserved for 90 days.
4. The dashboard shows a prominent banner with options to update payment or downgrade.
5. After 90 days of no resolution, a warning email is sent. Data deletion happens after 180 days (with prior notification).

---

## 8. Billing Cycle & Invoicing

### 8.1 Monthly Billing Cycle

```
Day 1: Billing period starts
        └─ Agent executions tracked continuously
        └─ Daily rollups aggregated by pg_cron

Day 28-31: Period end approaches
        └─ System calculates usage for the period
        └─ Creates invoice in 'draft' status
        └─ Adds overage line item if applicable

Day 31 (period end):
        └─ Invoice finalized ('open')
        └─ Payment charged via Stripe/Razorpay
        └─ New period starts immediately

If payment fails:
        └─ Invoice stays 'open'
        └─ Subscription moves to 'past_due'
        └─ Retry every 2 days for up to 3 attempts
        └─ After 7 days: subscription 'paused'
```

### 8.2 Yearly Billing Cycle

- The full yearly amount is charged upfront.
- Overage is still calculated monthly and billed as separate invoices.
- If the yearly subscriber exceeds monthly execution limits, overage invoices are generated monthly.

### 8.3 Invoice Generation Flow

```sql
-- Pseudocode for invoice generation (runs at period end)

-- 1. Calculate total usage for the period
SELECT SUM(execution_count) AS total_executions
FROM usage_daily_rollups
WHERE organization_id = $org_id
  AND date BETWEEN $period_start AND $period_end;

-- 2. Get plan limits
SELECT monthly_execution_limit, overage_cost_per_1k, overage_enabled
FROM plans
WHERE id = (SELECT plan_id FROM subscriptions WHERE organization_id = $org_id AND status = 'active');

-- 3. Calculate overage
overage_executions = MAX(0, total_executions - monthly_execution_limit)
overage_cost = CEIL(overage_executions / 1000.0) * overage_cost_per_1k

-- 4. Create invoice
INSERT INTO invoices (organization_id, subscription_id, currency, subtotal, overage_amount, total, period_start, period_end)
VALUES ($org_id, $sub_id, $currency, $plan_price, $overage_cost, $plan_price + $overage_cost, $period_start, $period_end);

-- 5. Trigger payment via gateway
```

---

## 9. Free Plan Restrictions

### 9.1 Core Restriction: One Active Free Organization

A user can create **only one organization** on the Free plan. If a user tries to create more:

**Enforcement logic:**
```
on_create_organization(user_id, plan_id):
    if plan_id == FREE_PLAN_ID:
        existing_free_orgs = SELECT COUNT(*) FROM organizations
            WHERE owner_id = user_id
            AND plan_id = FREE_PLAN_ID
            AND is_deleted = FALSE;
        if existing_free_orgs >= 1:
            RAISE ERROR 'You can only have one Free-plan organization. Upgrade to create more.';
```

Users can have **multiple paid organizations** — e.g., one Plus org and one Pro org.

### 9.2 Free Plan Limitations Summary

| Limitation | Behavior |
|---|---|
| 1 organization max | Error on second org creation |
| 1 project per org | Error on project creation |
| 2 agents per project | Error when linking 3rd agent |
| 5,000 executions/month | Hard cap — agents stop responding |
| 100 MB document storage | Error on upload when exceeded |
| Basic models only | Error if selecting Standard/Advanced/Premium model |
| No overage | Cannot pay for additional usage |
| Community support only | No email/priority support |
| Lowest queue priority | Requests processed last during high load |
| 1 concurrent job | Additional requests queued |

### 9.3 Upgrade Prompts

The system shows upgrade prompts when:
- User hits 80% of any limit (warning)
- User hits 100% of any limit (blocking)
- User tries to access a feature not in their plan (e.g., advanced model)

These prompts display a comparison of current plan vs. the next tier, with a clear "Upgrade" CTA.

---

## 10. Enterprise Plan Handling

Enterprise customers require special handling since their plans are custom-negotiated.

### 10.1 Custom Plan Creation

For each Enterprise customer, create a custom row in `public.plans`:

```sql
INSERT INTO plans (
  name, index,
  max_projects_per_org, max_agents_per_project,
  monthly_execution_limit, rate_limit_rps, concurrency_limit,
  max_model_tier_index, support_type_id, has_sla,
  queue_priority, max_document_storage_mb_per_org,
  overage_enabled, overage_cost_per_1k
) VALUES (
  'Enterprise - Acme Corp', 3,
  -1, -1,        -- unlimited
  2000000, 200, 100,
  3, $dedicated_support_id, TRUE,
  3, 100000,     -- 100 GB
  TRUE, 0.10     -- custom overage rate
);
```

Alternatively, use the standard Enterprise plan row with limits set to `-1` (unlimited) and handle custom billing outside the automated system.

### 10.2 Enterprise Billing

- Enterprise subscriptions are typically **annual contracts** billed via **wire transfer / ACH / NEFT**.
- Overage may or may not apply depending on the contract.
- Invoices are generated by the system but may require manual approval.
- The `payment_gateway` on their subscription can be `NULL` or a custom value if handled outside Stripe/Razorpay.

---

## 11. Database Tables Involved

### 11.1 Full Billing Data Model

```
public.plans
    │
    ├──── public.plan_prices          (multi-currency pricing)
    │
    ├──── (default_model_id) ──► public.models   (optional: default LLM when agent has no model_id)
    │
    ├──── public.organizations        (plan_id = current plan)
    │         │
    │         ├──── public.subscriptions      (billing state, gateway IDs)
    │         │         │
    │         │         └──── public.invoices  (monthly invoices)
    │         │                   │
    │         │                   └──── public.payments  (payment attempts)
    │         │
    │         └──── public.payment_methods     (stored cards/UPI)
    │
    └──── public.model_tiers          (plan → tier access mapping)
              │
              └──── public.models     (model → tier membership)

public.worker_models                 (worker-only model catalog, e.g. embeddings)
```

### 11.2 Usage Tracking Data Model

```
public.project_agents
    │
    └──── public.agent_executions     (raw per-execution log)
              │
              └──── [pg_cron rollup]
                        │
                        └──── public.usage_daily_rollups  (daily aggregate)
                                    │
                                    └──── [billing query at period end]
                                                │
                                                └──── public.invoices (overage line)

public.documents
    │
    └──── public.document_processing_jobs
              │
              └──── public.embedding_usage_events (append-only embedding token/cost usage)
```

### 11.3 Key Queries

**Get current plan for an organization:**
```sql
SELECT p.*
FROM public.plans p
JOIN public.organizations o ON o.plan_id = p.id
WHERE o.id = $org_id;
```

**Get active subscription:**
```sql
SELECT s.*, pp.amount, pp.currency
FROM public.subscriptions s
JOIN public.plan_prices pp ON pp.id = s.plan_price_id
WHERE s.organization_id = $org_id
  AND s.status = 'active';
```

**Check if org has exceeded monthly limit:**
```sql
SELECT
  COALESCE(SUM(udr.execution_count), 0) AS total_used,
  p.monthly_execution_limit AS limit,
  CASE
    WHEN p.monthly_execution_limit = -1 THEN FALSE
    ELSE COALESCE(SUM(udr.execution_count), 0) >= p.monthly_execution_limit
  END AS is_exceeded
FROM public.organizations o
JOIN public.plans p ON p.id = o.plan_id
LEFT JOIN public.usage_daily_rollups udr
  ON udr.organization_id = o.id
  AND udr.date >= date_trunc('month', now())
  AND udr.date < date_trunc('month', now()) + INTERVAL '1 month'
WHERE o.id = $org_id
GROUP BY p.monthly_execution_limit;
```

**Get per-project usage breakdown for current month:**
```sql
SELECT
  pr.title AS project_name,
  COALESCE(SUM(udr.execution_count), 0) AS executions,
  COALESCE(SUM(udr.total_tokens_input + udr.total_tokens_output), 0) AS total_tokens
FROM public.projects pr
LEFT JOIN public.usage_daily_rollups udr
  ON udr.project_id = pr.id
  AND udr.date >= date_trunc('month', now())
  AND udr.date < date_trunc('month', now()) + INTERVAL '1 month'
WHERE pr.organization_id = $org_id
  AND pr.is_deleted = FALSE
GROUP BY pr.id, pr.title
ORDER BY executions DESC;
```

**Calculate overage for invoice generation:**
```sql
WITH monthly_usage AS (
  SELECT COALESCE(SUM(execution_count), 0) AS total_executions
  FROM public.usage_daily_rollups
  WHERE organization_id = $org_id
    AND date >= $period_start
    AND date < $period_end
),
plan_limits AS (
  SELECT monthly_execution_limit, overage_cost_per_1k, overage_enabled
  FROM public.plans
  WHERE id = $plan_id
)
SELECT
  mu.total_executions,
  pl.monthly_execution_limit,
  GREATEST(0, mu.total_executions - pl.monthly_execution_limit) AS overage_executions,
  CASE
    WHEN pl.overage_enabled THEN
      CEIL(GREATEST(0, mu.total_executions - pl.monthly_execution_limit) / 1000.0) * pl.overage_cost_per_1k
    ELSE 0
  END AS overage_cost
FROM monthly_usage mu, plan_limits pl;
```

---

## Summary

| Aspect | Design Decision |
|--------|----------------|
| Billing entity | Organization |
| Plan tiers | Free, Plus, Pro, Enterprise |
| Pricing | Multi-currency (USD, INR), monthly + yearly |
| Usage tracking | Per-project (agent_executions → daily rollups) |
| Billing aggregation | Per-organization (sum all projects) |
| Overage | Usage-based, calculated at period end |
| Free plan | Hard caps, no overage, 1 org limit |
| Payment (India) | Razorpay (UPI, cards, net banking) |
| Payment (International) | Stripe (cards, SEPA, etc.) |
| Gateway detection | Based on `organizations.country_id` → `countries.iso2` |
| Invoice generation | Automated monthly via pg_cron + gateway webhooks |
| Subscription state | Managed via `subscriptions` table + gateway webhooks |
| Enterprise | Custom plans, manual billing support |
