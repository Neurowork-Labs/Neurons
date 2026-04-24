/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { SignIn } from '@/components/auth/sign-in';

type AuthPageProps = {
  searchParams: Promise<{
    message?: string;
    reason?: string;
    next?: string;
  }>;
};

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const params = await searchParams;
  return (
    <SignIn
      message={params.message}
      reason={params.reason}
      next={params.next}
    />
  );
}