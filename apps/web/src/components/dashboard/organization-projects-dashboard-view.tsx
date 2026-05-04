/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import Link from 'next/link';
import { Boxes, CircleUser, Globe, Plus, RefreshCw, Search } from 'lucide-react';

import { NeuronsLogo } from '@/components/brand/neurons-logo';
import { TopbarHelpButton } from '@/components/layout/topbar-help-button';
import { TopbarGlobalSearchButton } from '@/components/layout/topbar-global-search-button';
import { TopbarNotificationButton } from '@/components/layout/topbar-notification-button';
import { DashboardWithSidebarLayout } from '@/components/dashboard/dashboard-with-sidebar-layout';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  formatProjectStatusLabel,
  projectStatusTagClassName,
  useOrganizationProjectsDashboard,
} from '@/lib/organizations/organization-projects-dashboard-logic';
import {
  primaryCtaDialogButtonClassName,
  primaryCtaToolbarButtonClassName,
} from '@/lib/ui/primary-cta-button';
import { cn } from '@/lib/utils';

function MenuDivider() {
  return <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" />;
}

function formatOrganizationStatusLabel(value: string): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return '—';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

type OrganizationProjectsDashboardViewProps = {
  organizationId: string;
};

export function OrganizationProjectsDashboardView({
  organizationId,
}: OrganizationProjectsDashboardViewProps) {
  const {
    email,
    menuOpen,
    setMenuOpen,
    menuRef,
    themePreference,
    onSelectTheme,
    onLogout,
    orgName,
    orgStatusName,
    limits,
    projects,
    filteredProjects,
    search,
    setSearch,
    projectsLoadError,
    projectsLoading,
    onRefreshProjects,
    projectStatusFilter,
    setProjectStatusFilter,
    projectStatusFilterOptions,
    onNewProjectClick,
    setCreateProjectDialogOpen,
    createProjectDialogRendered,
    createProjectDialogVisible,
    isCreatingProject,
    newProjectForm,
    setNewProjectForm,
    onCreateProjectSubmit,
  } = useOrganizationProjectsDashboard(organizationId);
  const normalizedOrgStatus = String(orgStatusName ?? '').trim().toLowerCase();
  const shouldShowOrgStatusBadge =
    normalizedOrgStatus !== '' && normalizedOrgStatus !== 'active' && normalizedOrgStatus !== '—';

  return (
    <DashboardWithSidebarLayout
      header={
        <header className="flex items-center justify-between gap-4 border-b border-neutral-200 bg-[#f3f3f3] px-4 py-2 sm:px-6 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex min-w-0 items-center gap-1">
            <Link
              href="/dashboard"
              className="origin-left shrink-0 scale-75 rounded-md outline-none ring-offset-2 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:ring-offset-neutral-950"
              aria-label="Go to dashboard"
            >
              <NeuronsLogo />
            </Link>
            <div className="flex min-w-0 items-center gap-2">
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-700 dark:text-neutral-200"
                aria-hidden
              >
                <Boxes className="h-5 w-5" />
              </div>
              <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
                <span className="truncate font-semibold text-neutral-900 dark:text-neutral-50">
                  {orgName || '…'}
                </span>
                {shouldShowOrgStatusBadge ? (
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-semibold tracking-tight',
                      'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
                    )}
                    title="Organization status"
                  >
                    {formatOrganizationStatusLabel(orgStatusName)}
                  </span>
                ) : null}
                {limits != null ? (
                  <span
                    className="inline-flex shrink-0 items-center rounded-md border border-neutral-300 bg-neutral-100 px-2 py-0.5 text-xs font-semibold tracking-tight text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    title="Organization plan"
                  >
                    {limits.planName}
                  </span>
                ) : null}
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
      }
    >
      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 pb-6 pt-8 sm:px-6 sm:pt-10">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
          Projects
        </h1>

        <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 w-full sm:flex-1 sm:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for a project"
              className="h-9 w-full rounded-lg border border-neutral-300 bg-white pl-10 pr-4 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-500"
              aria-label="Search projects"
            />
          </div>
          <Select
            value={projectStatusFilter}
            onValueChange={setProjectStatusFilter}
            disabled={projectsLoading || projects.length === 0}
          >
            <SelectTrigger
              size="sm"
              className="h-9 min-h-9 w-full cursor-pointer py-0 sm:w-[11rem] sm:shrink-0"
            >
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              {projectStatusFilterOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            disabled={projectsLoading}
            onClick={() => void onRefreshProjects()}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            aria-label="Refresh projects"
          >
            <RefreshCw
              className={`h-4 w-4 ${projectsLoading ? 'animate-spin' : ''}`}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={onNewProjectClick}
            className={primaryCtaToolbarButtonClassName}
          >
            <Plus className="h-4 w-4" />
            New project
          </button>
        </div>

        {projectsLoadError ? (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {projectsLoadError}
          </p>
        ) : null}

        <div
          className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          role="list"
        >
          {!projectsLoading && !projectsLoadError && filteredProjects.length === 0 ? (
            <p
              className="col-span-full py-10 text-center text-sm text-neutral-600 dark:text-neutral-400"
              role="status"
            >
              {projects.length === 0
                ? 'No projects yet. Create one to get started.'
                : 'No projects match your search or status filter.'}
            </p>
          ) : null}

          {!projectsLoading && !projectsLoadError
            ? filteredProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/project/${project.id}`}
                  role="listitem"
                  className="group block rounded-2xl border border-neutral-200 bg-white p-4 outline-none transition-all duration-200 ease-out hover:-translate-y-1 hover:border-neutral-300 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:focus-visible:ring-neutral-500 sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-200 text-neutral-700 transition-transform duration-200 group-hover:scale-105 dark:bg-neutral-800 dark:text-neutral-200">
                      <Globe className="h-6 w-6" aria-hidden />
                    </div>
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-neutral-900 transition-colors group-hover:text-neutral-950 dark:text-neutral-50 dark:group-hover:text-white">
                          {project.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">
                          {project.domain
                            ? project.domain
                            : project.description
                              ? project.description
                              : 'No domain'}
                        </p>
                      </div>
                      <span
                        className={projectStatusTagClassName(project.statusName)}
                        title={formatProjectStatusLabel(project.statusName)}
                      >
                        {formatProjectStatusLabel(project.statusName)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            : null}
        </div>
      </main>

      {createProjectDialogRendered ? (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 transition-opacity duration-200 ease-out ${
            createProjectDialogVisible ? 'opacity-100' : 'opacity-0'
          }`}
          role="presentation"
          onClick={() => setCreateProjectDialogOpen(false)}
        >
          <div
            className={`w-full max-w-2xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl transition-all duration-200 ease-out dark:border-neutral-800 dark:bg-neutral-900 ${
              createProjectDialogVisible
                ? 'translate-y-0 scale-100 opacity-100'
                : 'translate-y-2 scale-[0.98] opacity-0'
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
              <h2
                id="create-project-title"
                className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50"
              >
                Create a new project
              </h2>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Projects belong to this organization. Add a domain to verify ownership later
                using the verification token stored for this project.
              </p>
            </div>

            <form onSubmit={onCreateProjectSubmit}>
              <div className="px-6 py-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Title *
                    </span>
                    <input
                      value={newProjectForm.title}
                      onChange={(e) =>
                        setNewProjectForm((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                      required
                      className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
                      placeholder="Marketing site"
                    />
                  </label>

                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Domain *
                    </span>
                    <input
                      value={newProjectForm.domain}
                      onChange={(e) =>
                        setNewProjectForm((prev) => ({
                          ...prev,
                          domain: e.target.value,
                        }))
                      }
                      required
                      className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
                      placeholder="www.example.com"
                    />
                  </label>

                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Description (optional)
                    </span>
                    <textarea
                      value={newProjectForm.description}
                      onChange={(e) =>
                        setNewProjectForm((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      rows={3}
                      className="min-h-[5rem] w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
                      placeholder="What this project is for"
                    />
                  </label>
                </div>
              </div>

              <div className="border-t border-neutral-200 px-6 py-4 dark:border-neutral-800">
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateProjectDialogOpen(false)}
                    className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingProject}
                    className={primaryCtaDialogButtonClassName}
                  >
                    {isCreatingProject ? 'Creating…' : 'Create project'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </DashboardWithSidebarLayout>
  );
}
