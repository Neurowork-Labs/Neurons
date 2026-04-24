/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { toast } from 'sonner';

export async function copyToClipboardWithToast(
  text: string,
  options?: { successMessage?: string; errorMessage?: string },
): Promise<void> {
  const successMessage = options?.successMessage ?? 'Copied to clipboard';
  const errorMessage = options?.errorMessage ?? 'Could not copy';
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error(errorMessage);
  }
}
