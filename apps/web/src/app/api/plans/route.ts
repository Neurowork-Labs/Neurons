/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextResponse } from 'next/server';

import { listActivePlans } from '@/lib/plans/list-active-plans';

export async function GET() {
  const result = await listActivePlans();
  return NextResponse.json(result, { status: result.ok ? 200 : 401 });
}
