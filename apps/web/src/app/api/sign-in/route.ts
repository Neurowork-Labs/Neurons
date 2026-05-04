/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { NextRequest, NextResponse } from 'next/server';

import { manualSignIn } from '@/lib/auth/manual-signin';

type SignInRequestBody = {
  email?: string;
  password?: string;
};

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

async function parseSignInBody(
  request: NextRequest,
): Promise<Required<SignInRequestBody> & { isJson: boolean }> {
  const contentType = request.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  if (isJson) {
    const body = (await request.json()) as SignInRequestBody;
    return {
      email: body.email ?? '',
      password: body.password ?? '',
      isJson: true,
    };
  }

  const formData = await request.formData();
  return {
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    isJson: false,
  };
}

export async function POST(request: NextRequest) {
  const { email, password, isJson } = await parseSignInBody(request);
  const result = await manualSignIn({ email, password });

  if (isJson) {
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (!result.ok) {
    return NextResponse.redirect(
      buildRedirectUrl(request, '/auth', result.message),
      { status: 303 },
    );
  }

  return NextResponse.redirect(buildRedirectUrl(request, '/dashboard'), {
    status: 303,
  });
}
