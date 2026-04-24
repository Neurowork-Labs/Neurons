/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { getProjectSidebarEntries } from '@/lib/projects/project-nav';
import { cn } from '@/lib/utils';

function normalizePath(p: string) {
  if (p.length > 1 && p.endsWith('/')) return p.slice(0, -1);
  return p;
}

type ProjectSidebarProps = {
  projectId: string;
};

export function ProjectSidebar({ projectId }: ProjectSidebarProps) {
  const pathnameRaw = usePathname();
  const pathname = normalizePath(pathnameRaw || '');
  const entries = getProjectSidebarEntries(projectId);

  const basePath = normalizePath(`/project/${projectId}`);

  return (
    <aside className="group absolute left-0 top-0 z-30 flex h-full w-14 flex-col overflow-x-hidden border-r border-neutral-200 bg-white py-4 shadow-none transition-[width,box-shadow] duration-200 ease-out hover:w-64 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-950 dark:hover:shadow-black/40">
      <nav className="flex flex-1 flex-col gap-0.5 px-1.5" aria-label="Project">
        {entries.map((entry, index) => {
          if (entry.type === 'divider') {
            return (
              <div
                key={`project-nav-divider-${index}`}
                role="separator"
                aria-hidden
                className="mx-1 my-1 h-px shrink-0 bg-neutral-200 dark:bg-neutral-800"
              />
            );
          }

          const { href, label, Icon } = entry;
          const itemPath = normalizePath(href);
          const isOverview = itemPath === basePath;
          const isActive = isOverview
            ? pathname === basePath
            : pathname === itemPath || pathname.startsWith(`${itemPath}/`);

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-w-0 w-full items-stretch rounded-lg text-sm font-medium transition-colors duration-100',
                isActive
                  ? 'bg-neutral-100 text-neutral-950 dark:bg-neutral-800/90 dark:text-white'
                  : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white',
              )}
            >
              <span className="flex w-full max-w-14 shrink-0 items-center justify-center py-2">
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
              </span>
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
