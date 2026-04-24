/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const QUOTA_THRESHOLD = 0.9;

const recentlyNotified = new Map<string, number>();
const DEDUP_MS = 60 * 60 * 1000; // suppress duplicate alerts for 1 hour

/**
 * Counts agent_executions for the org in the current calendar month, compares
 * against the plan's monthly_execution_limit, and fires an in-app notification
 * to the org owner when >= 90 % of the quota is consumed.
 *
 * Runs async / best-effort — never blocks the chat response.
 */
export async function checkExecutionQuota(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<void> {
  try {
    const now = Date.now();
    const lastNotified = recentlyNotified.get(organizationId) ?? 0;
    if (now - lastNotified < DEDUP_MS) return;

    const { data: org } = await supabase
      .from('organizations')
      .select('plan_id, owner_id')
      .eq('id', organizationId)
      .maybeSingle();

    if (!org?.plan_id || !org?.owner_id) return;

    const { data: plan } = await supabase
      .from('plans')
      .select('monthly_execution_limit, name')
      .eq('id', org.plan_id)
      .maybeSingle();

    if (!plan) return;
    const limit = Number(plan.monthly_execution_limit);
    if (limit <= 0) return; // unlimited (Enterprise = -1)

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { count, error } = await supabase
      .from('agent_executions')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', monthStart.toISOString());

    if (error || count === null) return;

    const usage = count / limit;
    if (usage < QUOTA_THRESHOLD) return;

    recentlyNotified.set(organizationId, now);

    const pct = Math.round(usage * 100);
    const remaining = Math.max(limit - count, 0);

    const typeRes = await supabase
      .from('notification_types')
      .select('id')
      .eq('name', 'usage_warning')
      .eq('is_active', true)
      .maybeSingle();

    if (!typeRes.data?.id) return;

    await supabase.from('notifications').insert({
      user_id: org.owner_id,
      organization_id: organizationId,
      project_id: null,
      agent_id: null,
      type_id: typeRes.data.id,
      title: 'Agent execution quota almost reached',
      body: `Your "${String(plan.name)}" plan has used ${pct}% of its monthly execution limit (${count.toLocaleString()} / ${limit.toLocaleString()}). Only ${remaining.toLocaleString()} executions remain this month. Consider upgrading your plan to avoid interruptions.`,
      action_url: null,
    });
  } catch {
    // Best-effort: never break the chat flow
  }
}
