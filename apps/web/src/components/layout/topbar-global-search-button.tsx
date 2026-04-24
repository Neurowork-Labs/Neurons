/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { searchGlobalViaApi } from '@/lib/global-search/global-search-api-client';
import type { GlobalSearchItem, GlobalSearchPayload } from '@/lib/global-search/global-search-types';

const searchSectionOrder: Array<{ key: keyof GlobalSearchPayload; label: string }> = [
  { key: 'organizations', label: 'Organizations' },
  { key: 'projects', label: 'Projects' },
  { key: 'storageFiles', label: 'Storage files' },
  { key: 'connectedAgents', label: 'Connected agents' },
  { key: 'cloudAgents', label: 'Agents Cloud' },
  { key: 'apiKeys', label: 'API keys' },
];

function emptySearchPayload(): GlobalSearchPayload {
  return {
    organizations: [],
    projects: [],
    storageFiles: [],
    connectedAgents: [],
    cloudAgents: [],
    apiKeys: [],
  };
}

type SearchSectionProps = {
  title: string;
  items: GlobalSearchItem[];
  onSelect: () => void;
};

function SearchSection({ title, items, onSelect }: SearchSectionProps) {
  if (items.length === 0) return null;
  return (
    <section className="divide-y divide-neutral-200 dark:divide-neutral-800">
      <header className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {title}
      </header>
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          onClick={onSelect}
          className="block px-5 py-3 transition hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
        >
          <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            {item.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-neutral-600 dark:text-neutral-300">
            {item.subtitle}
          </p>
        </Link>
      ))}
    </section>
  );
}

export function TopbarGlobalSearchButton() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GlobalSearchPayload>(emptySearchPayload());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    async function run() {
      if (!debouncedQuery) {
        setResults(emptySearchPayload());
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const res = await searchGlobalViaApi(debouncedQuery);
      if (cancelled) return;
      if (!res.ok) {
        setResults(emptySearchPayload());
        setError(res.message || 'Could not search.');
        setLoading(false);
        return;
      }
      setResults(res.results);
      setLoading(false);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open]);

  const totalResults = useMemo(
    () =>
      searchSectionOrder.reduce(
        (sum, section) => sum + (results[section.key]?.length ?? 0),
        0,
      ),
    [results],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 min-w-[12rem] cursor-pointer items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 text-sm text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
        aria-label="Open global search"
        title="Global search"
      >
        <Search className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-400" />
        <span className="truncate text-left">Search</span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery('');
            setDebouncedQuery('');
            setResults(emptySearchPayload());
            setError(null);
            setLoading(false);
          }
        }}
      >
        <DialogContent
          className="font-dm-sans flex h-[74vh] w-full max-w-[calc(100%-1.5rem)] flex-col overflow-hidden border-neutral-200 bg-white p-0 dark:border-neutral-800 dark:bg-neutral-900 sm:h-[78vh] sm:max-w-3xl"
          showCloseButton={false}
        >
          <DialogHeader className="px-5 pt-5">
            <DialogTitle className="sr-only">Global search</DialogTitle>
            <div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects, organizations, files, agents, API keys..."
                  className="h-10 w-full rounded-lg border border-transparent bg-transparent pl-10 pr-4 text-sm text-neutral-900 outline-none transition focus:border-transparent dark:border-transparent dark:bg-transparent dark:text-neutral-50 dark:focus:border-transparent"
                />
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-neutral-200 dark:border-neutral-800">
            {query.trim() === '' ? (
              <div />
            ) : loading ? (
              <p className="px-5 py-8 text-sm text-neutral-600 dark:text-neutral-400">
                Searching...
              </p>
            ) : error != null ? (
              <p className="px-5 py-8 text-sm text-red-700 dark:text-red-300">{error}</p>
            ) : totalResults === 0 ? (
              <p className="px-5 py-8 text-sm text-neutral-600 dark:text-neutral-400">
                No results found for{' '}
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  &quot;{query.trim()}&quot;
                </span>
                .
              </p>
            ) : (
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {searchSectionOrder.map((section) => (
                  <SearchSection
                    key={section.key}
                    title={section.label}
                    items={results[section.key]}
                    onSelect={() => setOpen(false)}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
