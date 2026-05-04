/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */

import { NextResponse } from 'next/server';

import { markNotificationReadForCurrentUser } from '@/lib/notifications/list-notifications-for-current-user';

type RouteContext = {
  params: Promise<{ notificationId: string }>;
};

export async function PATCH(_request: Request, context: RouteContext) {
  const { notificationId } = await context.params;
  const result = await markNotificationReadForCurrentUser(notificationId);
  if (!result.ok) {
    const status =
      result.message === 'Unauthorized' ? 401 : result.message.includes('Missing') ? 400 : 400;
    return NextResponse.json({ ok: false, message: result.message }, { status });
  }
  return NextResponse.json({ ok: true });
}
