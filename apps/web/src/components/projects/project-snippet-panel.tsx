/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

type ProjectSnippetPanelProps = {
  content: string;
  className?: string;
};

export function ProjectSnippetPanel({ content, className }: ProjectSnippetPanelProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success('Content copied.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      toast.error('Could not copy to clipboard.');
    }
  }, [content]);

  return (
    <div
      className={cn(
        'relative w-full lg:max-w-3xl lg:shrink-0 lg:-mt-20',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => void onCopy()}
        className="cursor-pointer absolute right-1.5 top-1.5 z-20 flex h-11 w-11 items-center justify-center rounded-md text-neutral-600 transition hover:bg-neutral-200/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-100"
        aria-label={copied ? 'Copied' : 'Copy to clipboard'}
      >
        {copied ? (
          <Check className="h-5 w-5" aria-hidden />
        ) : (
          <Copy className="h-5 w-5" aria-hidden />
        )}
      </button>
      <div className="relative overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
        <div
          className="pointer-events-none absolute inset-0 bg-neutral-100 dark:bg-neutral-950"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle_at_center,rgb(0_0_0/0.065)_1px,transparent_1px)] [background-size:14px_14px] dark:[background-image:radial-gradient(circle_at_center,rgb(255_255_255/0.1)_1px,transparent_1px)]"
          aria-hidden
        />
        <pre className="relative z-[1] min-h-[30rem] max-h-[min(54rem,80vh)] overflow-auto border-0 bg-transparent p-4 pb-4 pl-4 pr-4 pt-14 text-left text-sm leading-relaxed text-neutral-900 dark:text-neutral-100">
          <code className="font-mono whitespace-pre text-[13px] text-neutral-800 dark:text-neutral-100">
            {content}
          </code>
        </pre>
      </div>
    </div>
  );
}
