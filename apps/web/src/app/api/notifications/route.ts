/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

import { NextResponse } from 'next/server';

import { listNotificationsForCurrentUser } from '@/lib/notifications/list-notifications-for-current-user';

export async function GET() {
  const result = await listNotificationsForCurrentUser();
  if (!result.ok) {
    const status = result.message === 'Unauthorized' ? 401 : 400;
    return NextResponse.json({ ok: false, message: result.message }, { status });
  }
  return NextResponse.json({ ok: true, items: result.items });
}
