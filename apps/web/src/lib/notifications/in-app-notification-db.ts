/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const notificationTypeIdCache = new Map<string, string>();

export async function getNotificationTypeIdByName(
  supabase: SupabaseClient,
  name: string,
): Promise<string | null> {
  const key = name.trim().toLowerCase();
  const hit = notificationTypeIdCache.get(key);
  if (hit) return hit;

  const { data, error } = await supabase
    .from('notification_types')
    .select('id')
    .eq('name', name)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data?.id) return null;
  notificationTypeIdCache.set(key, data.id as string);
  return data.id as string;
}

export type InAppNotificationInsert = {
  userId: string;
  organizationId: string | null;
  projectId: string | null;
  agentId: string | null;
  typeName: 'billing' | 'agent_alert' | 'system' | 'security' | 'usage_warning';
  title: string;
  body: string | null;
  actionUrl: string | null;
};

/** Session client: requires RLS policy allowing the user to insert their own rows. */
export async function insertInAppNotificationForUser(
  supabase: SupabaseClient,
  row: InAppNotificationInsert,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const typeId = await getNotificationTypeIdByName(supabase, row.typeName);
  if (!typeId) {
    return { ok: false, message: 'Notification type not found.' };
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: row.userId,
      organization_id: row.organizationId,
      project_id: row.projectId,
      agent_id: row.agentId,
      type_id: typeId,
      title: row.title,
      body: row.body,
      action_url: row.actionUrl,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    return { ok: false, message: error?.message ?? 'Could not create notification.' };
  }

  return { ok: true, id: data.id as string };
}
