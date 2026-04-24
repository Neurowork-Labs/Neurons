/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

'use client';

import { format } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { NotificationListItem } from '@/lib/notifications/notification-types';
import {
  fetchNotificationsViaApi,
  markNotificationReadViaApi,
} from '@/lib/notifications/notifications-api-client';

export type TopbarNotificationRow = {
  id: string;
  title: string;
  message: string;
  createdAtLabel: string;
  isRead: boolean;
  actionUrl: string | null;
};

function formatCreatedLabel(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'MMM d, h:mm a');
}

function mapItems(items: NotificationListItem[]): TopbarNotificationRow[] {
  return items.map((n) => ({
    id: n.id,
    title: n.title,
    message: n.body?.trim() ? n.body : '—',
    createdAtLabel: formatCreatedLabel(n.createdAt),
    isRead: n.isRead,
    actionUrl: n.actionUrl,
  }));
}

const POLL_MS = 45_000;

export function useTopbarNotifications() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<TopbarNotificationRow[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await fetchNotificationsViaApi();
    if (!res.ok) {
      setLoadError(res.message);
      setLoading(false);
      return;
    }
    setNotifications(mapItems(res.items));
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    const t = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, refresh]);

  const hasUnread = useMemo(
    () => notifications.some((notification) => !notification.isRead),
    [notifications],
  );

  async function markNotificationAsRead(notificationId: string) {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === notificationId ? { ...notification, isRead: true } : notification,
      ),
    );
    const res = await markNotificationReadViaApi(notificationId);
    if (!res.ok) {
      void refresh();
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
  }

  return {
    open,
    onOpenChange,
    notifications,
    hasUnread,
    loading,
    loadError,
    markNotificationAsRead,
    refresh,
  };
}
