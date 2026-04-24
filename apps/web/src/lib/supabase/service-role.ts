/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseServiceRoleConfigured(): boolean {
  return Boolean(supabaseUrl?.trim() && serviceKey?.trim());
}

export function getSupabaseServiceRoleClient() {
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
