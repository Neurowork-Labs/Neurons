/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { NextRequest, NextResponse } from 'next/server';

import { signOut } from '@/lib/auth/sign-out';

function buildRedirectUrl(
  request: NextRequest,
  pathname: string,
  message?: string,
): string {
  const url = new URL(pathname, request.url);

  if (message) {
    url.searchParams.set('message', message);
  }

  return url.toString();
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const result = await signOut();

  if (isJson) {
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  return NextResponse.redirect(
    buildRedirectUrl(request, '/auth', result.message),
    { status: 303 },
  );
}
