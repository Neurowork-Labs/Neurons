/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

export function slugifyOrganizationName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

