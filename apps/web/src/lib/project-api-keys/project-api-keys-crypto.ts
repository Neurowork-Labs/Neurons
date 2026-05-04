/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { createHash, randomBytes } from 'node:crypto';

import { PROJECT_API_KEY_SECRET_PREFIX } from '@/lib/project-api-keys/project-api-keys-constants';

export function generateRawProjectApiKey(): string {
  return `${PROJECT_API_KEY_SECRET_PREFIX}${randomBytes(24).toString('base64url')}`;
}

export function hashProjectApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

export function keyPrefixFromPlaintext(plaintext: string): string {
  const s = String(plaintext ?? '');
  return s.length >= 8 ? s.slice(0, 8) : s.padEnd(8, '•');
}
