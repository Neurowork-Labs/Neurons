/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */

import type { NotificationListItem } from '@/lib/notifications/notification-types';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export type { NotificationListItem };

const PAGE_SIZE = 50;

export async function listNotificationsForCurrentUser(): Promise<
  { ok: true; items: NotificationListItem[] } | { ok: false; message: string }
> {
  const supabase = await getSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) return { ok: false, message: authError.message };
  if (!auth.user) return { ok: false, message: 'Unauthorized' };

  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, body, action_url, created_at, is_read')
    .eq('user_id', auth.user.id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (error) return { ok: false, message: error.message };

  type Row = {
    id: string;
    title?: string | null;
    body?: string | null;
    action_url?: string | null;
    created_at?: string | null;
    is_read?: boolean | null;
  };

  const items: NotificationListItem[] = (data ?? []).map((row: Row) => ({
    id: row.id,
    title: String(row.title ?? ''),
    body: row.body != null ? String(row.body) : null,
    actionUrl: row.action_url != null ? String(row.action_url) : null,
    createdAt: String(row.created_at ?? ''),
    isRead: Boolean(row.is_read),
  }));

  return { ok: true, items };
}

export async function markNotificationReadForCurrentUser(
  notificationId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const id = String(notificationId ?? '').trim();
  if (!id) return { ok: false, message: 'Missing notification id.' };

  const supabase = await getSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) return { ok: false, message: authError.message };
  if (!auth.user) return { ok: false, message: 'Unauthorized' };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: now })
    .eq('id', id)
    .eq('user_id', auth.user.id);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
