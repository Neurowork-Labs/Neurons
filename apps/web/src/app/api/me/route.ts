/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { NextResponse } from 'next/server';

import { getMe } from '@/lib/dashboard/get-me';

export async function GET() {
  const result = await getMe();
  return NextResponse.json(result, { status: result.ok ? 200 : 401 });
}

