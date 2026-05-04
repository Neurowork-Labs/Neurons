/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */

'use client';

import type { NotificationListItem } from '@/lib/notifications/notification-types';

export async function fetchNotificationsViaApi(): Promise<
  { ok: true; items: NotificationListItem[] } | { ok: false; message: string }
> {
  const res = await fetch('/api/notifications', { credentials: 'include' });
  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; items?: NotificationListItem[]; message?: string }
    | null;
  if (!res.ok || !json?.ok || !Array.isArray(json.items)) {
    return { ok: false, message: json?.message || 'Could not load notifications.' };
  }
  return { ok: true, items: json.items };
}

export async function markNotificationReadViaApi(
  notificationId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
    credentials: 'include',
  });
  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; message?: string }
    | null;
  if (!res.ok || !json?.ok) {
    return { ok: false, message: json?.message || 'Could not update notification.' };
  }
  return { ok: true };
}
