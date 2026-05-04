/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
 */

'use client';

import type { Dispatch, FormEvent, RefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { signOutViaApi } from '@/lib/auth/auth-api-client';
import { getMeViaApi, type MeApiResult } from '@/lib/dashboard/dashboard-api-client';
import {
  createOrganizationViaApi,
  fetchOrganizationsViaApi,
} from '@/lib/organizations/organizations-api-client';
import type { OrganizationListItem } from '@/lib/organizations/organization-types';
import {
  fetchActivePlansViaApi,
  type ActivePlanOption,
} from '@/lib/plans/plans-api-client';
import { ALL_STATUSES_FILTER_VALUE } from '@/lib/dashboard/dashboard-list-filters';
import {
  applyThemePreferenceToDocument,
  readStoredThemePreference,
  writeStoredThemePreference,
  type ThemePreference,
} from '@/lib/theme/theme-preference';

export type NewOrganizationFormState = {
  name: string;
  slug: string;
  planId: string;
};

export type OrganizationStatusFilterOption = {
  value: string;
  label: string;
};

export type UseOrganizationsDashboardReturn = {
  email: string;
  organizations: OrganizationListItem[];
  listLoading: boolean;
  onRefreshOrganizations: () => Promise<void>;
  orgStatusFilter: string;
  setOrgStatusFilter: Dispatch<SetStateAction<string>>;
  organizationStatusFilterOptions: OrganizationStatusFilterOption[];
  loadError: string | null;
  createDialogOpen: boolean;
  setCreateDialogOpen: Dispatch<SetStateAction<boolean>>;
  createDialogRendered: boolean;
  createDialogVisible: boolean;
  isCreatingOrganization: boolean;
  plans: ActivePlanOption[];
  plansLoading: boolean;
  newOrgForm: NewOrganizationFormState;
  setNewOrgForm: Dispatch<SetStateAction<NewOrganizationFormState>>;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  menuOpen: boolean;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  menuRef: RefObject<HTMLDivElement | null>;
  freeOrgPauseConfirmNames: string[] | null;
  setFreeOrgPauseConfirmNames: Dispatch<SetStateAction<string[] | null>>;
  themePreference: ThemePreference;
  onSelectTheme: (pref: ThemePreference) => void;
  onLogout: () => Promise<void>;
  filteredOrgs: OrganizationListItem[];
  onCreateOrganizationSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onConfirmPausePreviousFreeOrgs: () => Promise<void>;
};

export function formatOrgStatusLabel(status: string) {
  if (!status || status === '—') return status;
  const s = status.trim();
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function organizationStatusTagClassName(statusRaw: string): string {
  const key = statusRaw.trim().toLowerCase();
  const base =
    'inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-semibold tracking-tight';

  switch (key) {
    case 'active':
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/55 dark:text-emerald-100`;
    case 'paused':
      return `${base} border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-100`;
    case 'suspended':
      return `${base} border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/45 dark:text-red-100`;
    case 'archived':
      return `${base} border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100`;
    default:
      if (!key || key === '—') {
        return `${base} border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800/90 dark:text-neutral-300`;
      }
      return `${base} border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800/70 dark:bg-violet-950/50 dark:text-violet-100`;
  }
}

export function useOrganizationsDashboard(): UseOrganizationsDashboardReturn {
  const [me, setMe] = useState<MeApiResult | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orgStatusFilter, setOrgStatusFilter] = useState(ALL_STATUSES_FILTER_VALUE);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogRendered, setCreateDialogRendered] = useState(false);
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [isCreatingOrganization, setIsCreatingOrganization] = useState(false);
  const [plans, setPlans] = useState<ActivePlanOption[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [newOrgForm, setNewOrgForm] = useState<NewOrganizationFormState>({
    name: '',
    slug: '',
    planId: '',
  });
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [freeOrgPauseConfirmNames, setFreeOrgPauseConfirmNames] = useState<
    string[] | null
  >(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    if (typeof window === 'undefined') return 'system';
    return readStoredThemePreference() ?? 'system';
  });

  const menuRef = useRef<HTMLDivElement>(null);

  const applyTheme = useCallback((pref: ThemePreference) => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyThemePreferenceToDocument(pref, prefersDark);
  }, []);

  useEffect(() => {
    applyTheme(themePreference);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const pref = readStoredThemePreference() ?? 'system';
      applyTheme(pref);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [applyTheme, themePreference]);

  const loadDashboardData = useCallback(async () => {
    setListLoading(true);
    const [meRes, orgRes] = await Promise.all([
      getMeViaApi(),
      fetchOrganizationsViaApi(),
    ]);
    setMe(meRes);
    if (!orgRes.ok) {
      setLoadError(orgRes.message);
      setOrganizations([]);
      setListLoading(false);
      return;
    }
    setLoadError(null);
    setOrganizations(orgRes.organizations);
    setListLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadDashboardData();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDashboardData]);

  useEffect(() => {
    if (createDialogOpen) {
      setFreeOrgPauseConfirmNames(null);
      setCreateDialogRendered(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setCreateDialogVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setCreateDialogVisible(false);
    setFreeOrgPauseConfirmNames(null);
    const t = window.setTimeout(() => setCreateDialogRendered(false), 200);
    return () => window.clearTimeout(t);
  }, [createDialogOpen]);

  useEffect(() => {
    if (!createDialogRendered) return;
    let cancelled = false;
    setPlansLoading(true);
    (async () => {
      const res = await fetchActivePlansViaApi();
      if (cancelled) return;
      if (res.ok) {
        setPlans(res.plans);
        setNewOrgForm((prev) => ({
          ...prev,
          planId: prev.planId || (res.plans[0]?.id ?? ''),
        }));
      } else {
        toast.error(res.message || 'Could not load plans.');
        setPlans([]);
      }
      setPlansLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [createDialogRendered]);

  useEffect(() => {
    if (!createDialogRendered) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setCreateDialogOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [createDialogRendered]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const email = me?.ok ? me.email : '';

  const organizationStatusFilterOptions = useMemo((): OrganizationStatusFilterOption[] => {
    const map = new Map<string, string>();
    for (const o of organizations) {
      const k = o.statusName.trim().toLowerCase();
      if (k && k !== '—') {
        if (!map.has(k)) map.set(k, o.statusName.trim());
      }
    }
    const sorted = [...map.keys()].sort();
    return [
      { value: ALL_STATUSES_FILTER_VALUE, label: 'All Statuses' },
      ...sorted.map((k) => ({
        value: k,
        label: formatOrgStatusLabel(map.get(k) ?? k),
      })),
    ];
  }, [organizations]);

  const filteredOrgs = useMemo(() => {
    let rows = organizations;
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (o) =>
          o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q),
      );
    }
    if (orgStatusFilter !== ALL_STATUSES_FILTER_VALUE) {
      rows = rows.filter(
        (o) => o.statusName.trim().toLowerCase() === orgStatusFilter,
      );
    }
    return rows;
  }, [organizations, search, orgStatusFilter]);

  function onSelectTheme(pref: ThemePreference) {
    setThemePreference(pref);
    writeStoredThemePreference(pref);
    applyTheme(pref);
  }

  async function onLogout() {
    await signOutViaApi();
    window.location.href = '/auth';
  }

  async function submitCreateOrganization(
    confirmPausePreviousFreeOrganizations?: boolean,
  ) {
    if (isCreatingOrganization) return;

    if (!newOrgForm.planId) {
      toast.error('Please select an organization plan.');
      return;
    }

    setIsCreatingOrganization(true);
    try {
      const result = await createOrganizationViaApi({
        name: newOrgForm.name,
        slug: newOrgForm.slug || undefined,
        planId: newOrgForm.planId,
        confirmPausePreviousFreeOrganizations,
      });

      if (!result.ok) {
        if (result.code === 'FREE_ORG_LIMIT') {
          setFreeOrgPauseConfirmNames(result.previousOrganizationNames ?? []);
          return;
        }
        toast.error(result.message || 'Unable to create organization.');
        return;
      }

      toast.success(result.message || 'Organization created successfully.');
      setCreateDialogOpen(false);
      setFreeOrgPauseConfirmNames(null);
      setNewOrgForm({
        name: '',
        slug: '',
        planId: '',
      });
      await loadDashboardData();
    } catch {
      toast.error('Something went wrong while creating organization.');
    } finally {
      setIsCreatingOrganization(false);
    }
  }

  async function onCreateOrganizationSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await submitCreateOrganization();
  }

  async function onConfirmPausePreviousFreeOrgs() {
    await submitCreateOrganization(true);
  }

  return {
    email,
    organizations,
    listLoading,
    onRefreshOrganizations: loadDashboardData,
    orgStatusFilter,
    setOrgStatusFilter,
    organizationStatusFilterOptions,
    loadError,
    createDialogOpen,
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
  };
}
