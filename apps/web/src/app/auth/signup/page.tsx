/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { SignUp } from '@/components/auth/sign-up';

type SignUpPageProps = {
  searchParams: Promise<{
    message?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  return <SignUp message={params.message} />;
}