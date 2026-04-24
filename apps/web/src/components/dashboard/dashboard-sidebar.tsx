/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

'use client';

/**
 * Sidebar layout tuning (edit classes on the `<aside>` below):
 * - Speed: `duration-75` | `duration-100` | `duration-150` | `duration-200`.
 * - Expanded width: `hover:w-64` etc. Must stay wider than icon column + label space.
 * - `nav` uses `px-1.5` so row highlights don’t touch the sidebar edges (collapsed + expanded).
 * - Icon cell: `w-full max-w-14` so it caps at the main `pl-14` rail when wide, and shrinks
 *   with the inset nav when the aside is `w-14`.
 * - Label column: `group-hover:-ml-2` pulls text closer to the icon when expanded (tweak
 *   `-ml-1` / `-ml-3` if you want less or more overlap).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import { useMemo } from 'react';
import {
  BarChart3,
  CreditCard,
  FolderKanban,
  Settings,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';

type SidebarLinkEntry = {
  kind: 'link';
  label: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
  active: boolean;
};

type SidebarDividerEntry = {
  kind: 'divider';
};

type SidebarEntry = SidebarLinkEntry | SidebarDividerEntry;

function normalizePath(p: string) {
  if (p.length > 1 && p.endsWith('/')) return p.slice(0, -1);
  return p;
}

export function DashboardSidebar() {
  const pathnameRaw = usePathname();
  const pathname = normalizePath(pathnameRaw || '');

  const entries = useMemo<SidebarEntry[]>(() => {
    const orgMatch = pathname.match(/^\/org\/([^/]+)/);
    const orgId = orgMatch?.[1];
    const base = orgId ? `/org/${orgId}` : '/dashboard';

    const projectsHref = orgId ? base : '/dashboard';
    const projectsActive = orgId
      ? pathname === base
      : pathname === '/dashboard';

    return [
      {
        kind: 'link',
        label: 'Projects',
        href: projectsHref,
        Icon: FolderKanban,
        active: projectsActive,
      },
      {
        kind: 'link',
        label: 'Team',
        href: `${base}/team`,
        Icon: Users,
        active: pathname === `${base}/team`,
      },
      { kind: 'divider' },
      {
        kind: 'link',
        label: 'Usage',
        href: `${base}/usage`,
        Icon: BarChart3,
        active: pathname === `${base}/usage`,
      },
      {
        kind: 'link',
        label: 'Billing',
        href: `${base}/billing`,
        Icon: CreditCard,
        active: pathname === `${base}/billing`,
      },
      { kind: 'divider' },
      {
        kind: 'link',
        label: 'Organization Settings',
        href: `${base}/settings`,
        Icon: Settings,
        active: pathname === `${base}/settings`,
      },
    ];
  }, [pathname]);

  return (
    <aside className="group absolute left-0 top-0 z-30 flex h-full w-14 flex-col overflow-x-hidden border-r border-neutral-200 bg-white py-4 shadow-none transition-[width,box-shadow] duration-200 ease-out hover:w-64 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-950 dark:hover:shadow-black/40">
      <nav className="flex flex-1 flex-col gap-0.5 px-1.5">
        {entries.map((entry, index) => {
          if (entry.kind === 'divider') {
            return (
              <div
                key={`org-nav-divider-${index}`}
                role="separator"
                aria-hidden
                className="mx-1 my-1 h-px shrink-0 bg-neutral-200 dark:bg-neutral-800"
              />
            );
          }

          const { href, label, Icon, active } = entry;
          return (
            <Link
              key={`${href}-${label}`}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-w-0 w-full items-stretch rounded-lg text-sm font-medium transition-colors duration-100',
                active
                  ? 'bg-neutral-100 text-neutral-950 dark:bg-neutral-800/90 dark:text-white'
                  : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white',
              )}
            >
              {/* Up to w-14; shares narrow nav width when collapsed so icon stays centered */}
              <span className="flex w-full max-w-14 shrink-0 items-center justify-center py-2">
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
              </span>
              {/* Remaining width only when aside is expanded; clipped when w-14 */}
              <span className="ml-0 flex min-w-0 flex-1 basis-0 items-center overflow-hidden py-2 pr-1.5 opacity-0 transition-[margin,opacity] duration-100 ease-out group-hover:-ml-2 group-hover:opacity-100">
                <span className="truncate">{label}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
