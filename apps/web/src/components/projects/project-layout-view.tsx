/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Boxes, CircleUser, Globe } from 'lucide-react';

import { NeuronsLogo } from '../../components/brand/neurons-logo';
import { TopbarHelpButton } from '@/components/layout/topbar-help-button';
import { TopbarGlobalSearchButton } from '@/components/layout/topbar-global-search-button';
import { TopbarNotificationButton } from '@/components/layout/topbar-notification-button';
import { ProjectPageProvider } from '@/components/projects/project-page-context';
import { ProjectSidebar } from '@/components/projects/project-sidebar';
import { useProjectLayout } from '@/lib/projects/project-layout-logic';

function MenuDivider() {
  return <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" />;
}

type ProjectLayoutViewProps = {
  projectId: string;
  children: ReactNode;
};

export function ProjectLayoutView({ projectId, children }: ProjectLayoutViewProps) {
  const pathname = usePathname();
  const {
    email,
    menuOpen,
    setMenuOpen,
    menuRef,
    themePreference,
    onSelectTheme,
    onLogout,
    context,
    contextError,
    contextLoading,
    reloadContext,
  } = useProjectLayout(projectId);

  const orgName = context?.organization.name ?? '…';
  const planName = context?.limits.planName;
  const projectTitle = context?.project.title ?? '…';
  const orgId = context?.organization.id;
  const projectPathPrefix = `/project/${encodeURIComponent(projectId)}`;
  const tabSegment = pathname.startsWith(projectPathPrefix)
    ? pathname.slice(projectPathPrefix.length).replace(/^\/+/, '').split('/')[0] ?? ''
    : '';
  const loadingLabelByTab: Record<string, string> = {
    '': 'project overview',
    'connected-agents': 'connected agents',
    'cloud-agents': 'cloud agents',
    storage: 'storage',
    'api-keys': 'API keys',
    database: 'database',
    settings: 'settings',
    advisors: 'advisors',
    integrations: 'integrations',
    analytics: 'analytics',
    logs: 'logs',
    'api-docs': 'API docs',
    'agent-flow': 'agent flow',
  };
  const loadingTarget = loadingLabelByTab[tabSegment] ?? 'project';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f3f3f3] font-dm-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-[#f3f3f3] px-4 py-2 sm:px-6 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Link
            href="/dashboard"
            className="origin-left shrink-0 scale-75 rounded-md outline-none ring-offset-2 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:ring-offset-neutral-950"
            aria-label="Go to dashboard"
          >
            <NeuronsLogo />
          </Link>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-700 dark:text-neutral-200"
                aria-hidden
              >
                <Boxes className="h-5 w-5" />
              </div>
              <div className="flex min-w-0 items-center gap-2">
                {orgId != null ? (
                  <Link
                    href={`/org/${orgId}`}
                    className="truncate font-semibold text-neutral-900 dark:text-neutral-50"
                  >
                    {contextLoading ? '…' : orgName}
                  </Link>
                ) : (
                  <span className="truncate font-semibold text-neutral-900 dark:text-neutral-50">
                    {contextLoading ? '…' : orgName}
                  </span>
                )}
                {planName != null ? (
                  <span
                    className="inline-flex shrink-0 items-center rounded-md border border-neutral-300 bg-neutral-100 px-2 py-0.5 text-xs font-semibold tracking-tight text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    title="Organization plan"
                  >
                    {planName}
                  </span>
                ) : null}
              </div>
            </div>

            <span
              className="shrink-0 text-neutral-400 dark:text-neutral-500"
              aria-hidden
            >
              /
            </span>

            <div className="flex min-w-0 items-center gap-2">
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-700 dark:text-neutral-200"
                aria-hidden
              >
                <Globe className="h-5 w-5" />
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  href={`/project/${encodeURIComponent(projectId)}`}
                  className="truncate font-semibold text-neutral-900 outline-none ring-offset-2 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:text-neutral-50 dark:ring-offset-neutral-950 dark:focus-visible:ring-neutral-500"
                  aria-label="Go to project overview"
                >
                  {contextLoading ? '…' : projectTitle}
                </Link>
                <span
                  className="inline-flex shrink-0 items-center rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold tracking-tight text-amber-950 dark:border-amber-600/80 dark:bg-amber-950/50 dark:text-amber-100"
                  title="Environment"
                >
                  PRODUCTION
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/dashboard/feedback"
            className="text-xs font-medium text-neutral-700 transition hover:text-neutral-900 sm:text-sm dark:text-neutral-300 dark:hover:text-neutral-100"
          >
            Feedback
          </Link>

          <TopbarGlobalSearchButton />

          <TopbarHelpButton />

          <TopbarNotificationButton />

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="cursor-pointer flex h-9 w-9 items-center justify-center rounded-full border border-black bg-black text-white transition hover:bg-neutral-900 dark:border-neutral-200 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Account menu"
            >
              <CircleUser className="h-5 w-5" />
            </button>

            {menuOpen ? (
              <div
                className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
                role="menu"
              >
                <div className="px-4 py-2">
                  <p className="break-all text-sm text-neutral-900 dark:text-neutral-50">
                    {email || '—'}
                  </p>
                </div>

                <MenuDivider />

                <div className="px-2 py-2">
                  <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Theme
                  </p>
                  {(
                    [
                      { key: 'dark' as const, label: 'Dark' },
                      { key: 'light' as const, label: 'Light' },
                      { key: 'system' as const, label: 'System' },
                    ] as const
                  ).map(({ key, label }) => {
                    const selected = themePreference === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="menuitem"
                        onClick={() => onSelectTheme(key)}
                        className="cursor-pointer flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-neutral-400 dark:border-neutral-600 ${
                            selected ? 'border-neutral-900 dark:border-neutral-200' : ''
                          }`}
                        >
                          {selected ? (
                            <span className="h-2 w-2 rounded-full bg-neutral-900 dark:bg-white" />
                          ) : null}
                        </span>
                        {label}
                      </button>
                    );
                  })}
                </div>

                <MenuDivider />

                <div className="p-2">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={onLogout}
                    className="cursor-pointer w-full rounded-lg px-2 py-2 text-left text-xs font-medium text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    Log out
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <ProjectSidebar projectId={projectId} />
        <div className="min-h-0 min-w-0 flex-1 overflow-auto pl-14">
          {contextError != null ? (
            <div className="mx-auto max-w-[90rem] px-4 py-10 sm:px-6">
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                {contextError}
              </p>
              <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
                <Link href="/dashboard" className="font-medium text-orange-500 hover:text-orange-600">
                  Back to organizations
                </Link>
              </p>
            </div>
          ) : contextLoading ? (
            <div className="mx-auto max-w-[90rem] px-4 py-10 text-sm text-neutral-500 sm:px-6">
              Loading {loadingTarget}…
            </div>
          ) : context == null ? (
            <div className="mx-auto max-w-[90rem] px-4 py-10 sm:px-6">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Unable to load this project.{' '}
                <button
                  type="button"
                  onClick={reloadContext}
                  className="font-medium text-orange-500 hover:text-orange-600"
                >
                  Retry
                </button>
                {' '}or{' '}
                <Link href="/dashboard" className="font-medium text-orange-500 hover:text-orange-600">
                  go back to organizations
                </Link>.
              </p>
            </div>
          ) : (
            <ProjectPageProvider
              projectTitle={context.project.title}
              statusName={context.project.statusName}
              domain={context.project.domain}
              isDomainVerified={context.project.isDomainVerified}
              agentsConnectedCount={context.agentsConnectedCount}
              totalExecutionsCount={context.totalExecutionsCount}
              planSupportTypeLabel={context.planSupportTypeLabel}
            >
              {children}
            </ProjectPageProvider>
          )}
        </div>
      </div>
    </div>
  );
}
