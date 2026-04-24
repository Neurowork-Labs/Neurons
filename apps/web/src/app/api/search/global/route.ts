/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { NextResponse } from 'next/server';

import { searchGlobalForCurrentUser } from '@/lib/global-search/global-search-server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const result = await searchGlobalForCurrentUser(q);

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  if (result.code === 'UNAUTHORIZED') {
    return NextResponse.json(result, { status: 401 });
  }

  return NextResponse.json(result, { status: 400 });
}
