/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

'use client';

import Link from 'next/link';
import { Boxes, CircleUser, Plus, RefreshCw, Search } from 'lucide-react';

import { NeuronsLogo } from '@/components/brand/neurons-logo';
import { TopbarHelpButton } from '@/components/layout/topbar-help-button';
import { TopbarGlobalSearchButton } from '@/components/layout/topbar-global-search-button';
import { TopbarNotificationButton } from '@/components/layout/topbar-notification-button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  formatOrgStatusLabel,
  organizationStatusTagClassName,
  type NewOrganizationFormState,
  type OrganizationStatusFilterOption,
  useOrganizationsDashboard,
} from '@/lib/organizations/organizations-dashboard-logic';
import type { OrganizationListItem } from '@/lib/organizations/organization-types';
import type { ActivePlanOption } from '@/lib/plans/plans-api-client';
import {
  primaryCtaDialogButtonClassName,
  primaryCtaToolbarButtonClassName,
} from '@/lib/ui/primary-cta-button';

function MenuDivider() {
  return <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" />;
}

export function OrganizationsDashboardView() {
  const {
    email,
    organizations,
    listLoading,
    onRefreshOrganizations,
    orgStatusFilter,
    setOrgStatusFilter,
    organizationStatusFilterOptions,
    loadError,
    setCreateDialogOpen,
    createDialogRendered,
    createDialogVisible,
    isCreatingOrganization,
    plans,
    plansLoading,
    newOrgForm,
    setNewOrgForm,
    search,
    setSearch,
    menuOpen,
    setMenuOpen,
    menuRef,
    freeOrgPauseConfirmNames,
    setFreeOrgPauseConfirmNames,
    themePreference,
    onSelectTheme,
    onLogout,
    filteredOrgs,
    onCreateOrganizationSubmit,
    onConfirmPausePreviousFreeOrgs,
  } = useOrganizationsDashboard();

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f3f3] font-dm-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <header className="flex items-center justify-between gap-4 border-b border-neutral-200 bg-[#f3f3f3] px-4 py-2 sm:px-6 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex min-w-0 items-center gap-1">
          <Link
            href="/dashboard"
            className="origin-left scale-75 -mr-2 shrink-0 rounded-md outline-none ring-offset-2 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-neutral-400 sm:-mr-3 dark:ring-offset-neutral-950"
            aria-label="Go to dashboard"
          >
            <NeuronsLogo />
          </Link>
          <div className="flex min-w-0 items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400 sm:text-sm">
            <span className="truncate text-sm font-semibold text-neutral-900 sm:text-lg dark:text-neutral-50">
              Neurons
            </span>
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
              onClick={() => setMenuOpen((open: boolean) => !open)}
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

      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 pb-6 pt-8 sm:px-6 sm:pt-20">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
          Your Organizations
        </h1>

        <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 w-full sm:flex-1 sm:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for an organization"
              className="h-9 w-full rounded-lg border border-neutral-300 bg-white pl-10 pr-4 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-500"
              aria-label="Search organizations"
            />
          </div>
          <Select
            value={orgStatusFilter}
            onValueChange={setOrgStatusFilter}
            disabled={listLoading || organizations.length === 0}
          >
            <SelectTrigger
              size="sm"
              className="h-9 min-h-9 w-full cursor-pointer py-0 sm:w-[11rem] sm:shrink-0"
            >
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              {organizationStatusFilterOptions.map((opt: OrganizationStatusFilterOption) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            disabled={listLoading}
            onClick={() => void onRefreshOrganizations()}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            aria-label="Refresh organizations"
          >
            <RefreshCw
              className={`h-4 w-4 ${listLoading ? 'animate-spin' : ''}`}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={() => setCreateDialogOpen(true)}
            className={primaryCtaToolbarButtonClassName}
          >
            <Plus className="h-4 w-4" />
            New organization
          </button>
        </div>

        {loadError ? (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {loadError}
          </p>
        ) : null}

        <div
          className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          role="list"
        >
          {!listLoading && filteredOrgs.length === 0 && !loadError ? (
            <p
              className="col-span-full py-10 text-center text-sm text-neutral-600 dark:text-neutral-400"
              role="status"
            >
              {organizations.length === 0
                ? 'No organizations yet. Create one to get started.'
                : 'No organizations match your search or status filter.'}
            </p>
          ) : null}

          {!listLoading
            ? filteredOrgs.map((org: OrganizationListItem) => (
            <Link
              key={org.id}
              href={`/org/${org.id}`}
              role="listitem"
              className="group block cursor-pointer rounded-2xl border border-neutral-200 bg-white p-4 outline-none transition-all duration-200 ease-out hover:-translate-y-1 hover:border-neutral-300 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f3f3f3] dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:focus-visible:ring-neutral-500 dark:focus-visible:ring-offset-neutral-950 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-200 text-neutral-700 transition-transform duration-200 group-hover:scale-105 dark:bg-neutral-800 dark:text-neutral-200">
                  <Boxes className="h-6 w-6" aria-hidden />
                </div>
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-neutral-900 transition-colors group-hover:text-neutral-950 dark:text-neutral-50 dark:group-hover:text-white">
                      {org.name}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {org.planName} · {org.projectCount}{' '}
                      {org.projectCount === 1 ? 'project' : 'projects'}
                    </p>
                  </div>
                  <span
                    className={organizationStatusTagClassName(org.statusName)}
                    title={formatOrgStatusLabel(org.statusName)}
                  >
                    {formatOrgStatusLabel(org.statusName)}
                  </span>
                </div>
              </div>
            </Link>
              ))
            : null}
        </div>
      </main>

      {createDialogRendered ? (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 transition-opacity duration-200 ease-out ${
            createDialogVisible ? 'opacity-100' : 'opacity-0'
          }`}
          role="presentation"
          onClick={() => setCreateDialogOpen(false)}
        >
          <div
            className={`w-full max-w-2xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl transition-all duration-200 ease-out dark:border-neutral-800 dark:bg-neutral-900 ${
              createDialogVisible
                ? 'translate-y-0 scale-100 opacity-100'
                : 'translate-y-2 scale-[0.98] opacity-0'
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-org-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
              <h2
                id="create-org-title"
                className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50"
              >
                Create a new organization
              </h2>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Organizations are a way to group your projects. Each organization
                can be configured with different team members and billing settings.
              </p>
            </div>

            <form onSubmit={onCreateOrganizationSubmit}>
              <div className="px-6 py-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Organization name *
                    </span>
                    <input
                      value={newOrgForm.name}
                      onChange={(e) =>
                        setNewOrgForm((prev: NewOrganizationFormState) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      required
                      className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
                      placeholder="Neurons Labs"
                    />
                  </label>

                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Slug (optional)
                    </span>
                    <input
                      value={newOrgForm.slug}
                      onChange={(e) =>
                        setNewOrgForm((prev: NewOrganizationFormState) => ({
                          ...prev,
                          slug: e.target.value,
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
                      placeholder="neurons-labs"
                    />
                  </label>

                  <div className="space-y-1 sm:col-span-2">
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Organization plan *
                    </span>
                    <Select
                      value={newOrgForm.planId || undefined}
                      onValueChange={(planId) =>
                        setNewOrgForm((prev: NewOrganizationFormState) => ({
                          ...prev,
                          planId,
                        }))
                      }
                      disabled={plansLoading || plans.length === 0}
                    >
                      <SelectTrigger className="cursor-pointer w-full">
                        <SelectValue
                          placeholder={
                            plansLoading
                              ? 'Loading plans…'
                              : plans.length === 0
                                ? 'No plans available'
                                : 'Select a plan'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4}>
                        {plans.map((p: ActivePlanOption) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Billing is organization-level; subscription records are created when
                      checkout is implemented.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-neutral-200 px-6 py-4 dark:border-neutral-800">
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateDialogOpen(false)}
                    className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isCreatingOrganization || plansLoading || plans.length === 0
                    }
                    className={primaryCtaDialogButtonClassName}
                  >
                    {isCreatingOrganization ? 'Creating…' : 'Create Organization'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {freeOrgPauseConfirmNames ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="free-org-pause-title"
          aria-describedby="free-org-pause-desc"
        >
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <h3
              id="free-org-pause-title"
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-50"
            >
              Pause your current free organization?
            </h3>
            <p
              id="free-org-pause-desc"
              className="mt-2 text-sm text-neutral-600 dark:text-neutral-400"
            >
              You can only have one active organization on the free plan. If you continue,
              your existing free organization will be set to{' '}
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                Paused
              </span>
              {freeOrgPauseConfirmNames.length > 0 ? (
                <>
                  :{' '}
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    {freeOrgPauseConfirmNames.join(', ')}
                  </span>
                </>
              ) : null}
              . You can still create this new free organization.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setFreeOrgPauseConfirmNames(null)}
                className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCreatingOrganization}
                onClick={() => void onConfirmPausePreviousFreeOrgs()}
                className={primaryCtaDialogButtonClassName}
              >
                {isCreatingOrganization ? 'Working…' : 'Yes, pause and create'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
