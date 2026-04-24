/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

/**
 * Human-readable public API key prefix so keys are recognizable in logs and support tickets.
 * `aepk` = Neurons Public Key. The full secret adds high-entropy random material after this.
 * `key_prefix` in DB is the first 8 characters of the full key (per schema) for list views.
 */
export const PROJECT_API_KEY_SECRET_PREFIX = 'aepk_';
