/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

export type AuthApiResult = {
  ok: boolean;
  message: string;
  redirectToDashboard?: boolean;
};

export async function signInViaApi(payload: {
  email: string;
  password: string;
}): Promise<AuthApiResult> {
  const res = await fetch('/api/sign-in', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as AuthApiResult;
  return data;
}

export async function signUpViaApi(payload: {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
}): Promise<AuthApiResult> {
  const res = await fetch('/api/sign-up', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as AuthApiResult;
  return data;
}

export async function signOutViaApi(): Promise<AuthApiResult> {
  const res = await fetch('/api/sign-out', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
  });

  const data = (await res.json()) as AuthApiResult;
  return data;
}

