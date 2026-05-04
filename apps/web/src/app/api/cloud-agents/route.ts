/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { NextResponse } from 'next/server';

import { listPublicCloudAgentsCatalog } from '@/lib/cloud-agents/list-public-cloud-agents-catalog';

export async function GET() {
  const result = await listPublicCloudAgentsCatalog();

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  const status = result.message === 'Unauthorized' ? 401 : 400;
  return NextResponse.json(result, { status });
}
