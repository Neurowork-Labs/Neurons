/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextRequest, NextResponse } from 'next/server';

import { manualSignUp } from '@/lib/auth/manual-signup';

type SignUpRequestBody = {
  email?: string;
  password?: string;
  confirmPassword?: string;
  firstName?: string;
  lastName?: string;
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

async function parseSignUpBody(
  request: NextRequest,
): Promise<
  Required<
    Pick<
      SignUpRequestBody,
      'email' | 'password' | 'confirmPassword' | 'firstName' | 'lastName'
    >
  > & { isJson: boolean }
> {
  const contentType = request.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  if (isJson) {
    const body = (await request.json()) as SignUpRequestBody;
    return {
      email: body.email ?? '',
      password: body.password ?? '',
      confirmPassword: body.confirmPassword ?? '',
      firstName: body.firstName ?? '',
      lastName: body.lastName ?? '',
      isJson: true,
    };
  }

  const formData = await request.formData();
  return {
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
    isJson: false,
  };
}

export async function POST(request: NextRequest) {
  const { email, password, confirmPassword, firstName, lastName, isJson } =
    await parseSignUpBody(request);

  const result = await manualSignUp({
    email,
    password,
    confirmPassword,
    firstName,
    lastName,
  });

  if (isJson) {
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (!result.ok) {
    return NextResponse.redirect(
      buildRedirectUrl(request, '/auth/signup', result.message),
      { status: 303 },
    );
  }

  return NextResponse.redirect(
    buildRedirectUrl(request, '/auth', result.message),
    {
      status: 303,
    },
  );
}
