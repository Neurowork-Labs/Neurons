/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTopbarNotifications } from '@/lib/notifications/use-topbar-notifications';

export function TopbarNotificationButton() {
  const router = useRouter();
  const {
    open,
    onOpenChange,
    notifications,
    hasUnread,
    loading,
    loadError,
    markNotificationAsRead,
  } = useTopbarNotifications();

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {hasUnread ? (
          <span
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-neutral-900"
            aria-label="Unread notifications"
          />
        ) : null}
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="font-plus-jakarta-sans !flex !h-[min(82vh,46rem)] !max-h-[min(82vh,46rem)] max-w-[calc(100%-1.5rem)] flex-col gap-0 border-neutral-200 bg-white p-0 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-2xl"
          showCloseButton={false}
        >
          <DialogHeader className="shrink-0 border-b border-neutral-200 px-5 pb-4 pt-5 dark:border-neutral-800">
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">
              Notifications
            </DialogTitle>
          </DialogHeader>

          {loadError ? (
            <div className="shrink-0 px-5 pb-4 text-sm text-red-600 dark:text-red-400">{loadError}</div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {loading && notifications.length === 0 ? (
              <div className="px-5 py-8 text-sm text-neutral-600 dark:text-neutral-400">
                Loading…
              </div>
            ) : null}

            {!loading && notifications.length === 0 && !loadError ? (
              <div className="px-5 py-8 text-sm text-neutral-600 dark:text-neutral-400">
                No notifications yet.
              </div>
            ) : null}

            {notifications.length > 0 ? (
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => {
                      void markNotificationAsRead(notification.id);
                      const url = notification.actionUrl?.trim();
                      if (url && url.startsWith('/')) {
                        onOpenChange(false);
                        router.push(url);
                      }
                    }}
                    className="flex w-full cursor-pointer items-start gap-3 px-5 py-4 text-left transition hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center pt-0.5">
                      {!notification.isRead ? (
                        <span
                          className="h-2.5 w-2.5 rounded-full bg-emerald-500"
                          aria-label="Unread"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                        {notification.title}
                      </span>
                      <span className="mt-0.5 block text-sm text-neutral-700 dark:text-neutral-300">
                        {notification.message}
                      </span>
                      <span className="mt-2 block text-xs text-neutral-500 dark:text-neutral-400">
                        {notification.createdAtLabel}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
