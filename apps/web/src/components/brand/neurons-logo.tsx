/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { cn } from '@/lib/utils';

type NeuronsLogoProps = {
  className?: string;
};

/** Three-circle mark; scales with wrapper size via className overrides. */
export function NeuronsLogo({ className }: NeuronsLogoProps) {
  return (
    <div className={cn('relative h-8 w-16 shrink-0', className)} aria-hidden>
      <div className="absolute left-0 top-0 h-full w-1/2 rounded-full bg-emerald-700 dark:bg-emerald-600" />
      <div className="absolute left-1/4 top-0 h-full w-1/2 rounded-full bg-emerald-800 dark:bg-emerald-700" />
      <div className="absolute left-1/2 top-0 h-full w-1/2 rounded-full bg-emerald-950 dark:bg-emerald-900" />
    </div>
  );
}
