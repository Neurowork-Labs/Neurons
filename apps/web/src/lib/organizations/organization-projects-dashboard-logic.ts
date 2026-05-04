/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { signOutViaApi } from '@/lib/auth/auth-api-client';
import { ALL_STATUSES_FILTER_VALUE } from '@/lib/dashboard/dashboard-list-filters';
import { getMeViaApi, type MeApiResult } from '@/lib/dashboard/dashboard-api-client';
import {
  createOrganizationProjectViaApi,
  fetchOrganizationProjectsViaApi,
} from '@/lib/organizations/organization-projects-api-client';
import type {
  OrganizationProjectListItem,
  OrganizationProjectsApiResult,
  OrganizationProjectsLimits,
} from '@/lib/organizations/organization-types';
import { isValidProjectDomain } from '@/lib/organizations/project-domain';
import {
  formatProjectStatusLabel,
  projectStatusTagClassName,
} from '@/lib/projects/project-status-label';
import {
  applyThemePreferenceToDocument,
  readStoredThemePreference,
  writeStoredThemePreference,
  type ThemePreference,
} from '@/lib/theme/theme-preference';

export { formatProjectStatusLabel, projectStatusTagClassName } from '@/lib/projects/project-status-label';

export function useOrganizationProjectsDashboard(organizationId: string) {
  const [me, setMe] = useState<MeApiResult | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    if (typeof window === 'undefined') return 'system';
    return readStoredThemePreference() ?? 'system';
  });

  const [orgName, setOrgName] = useState<string>('');
  const [orgStatusName, setOrgStatusName] = useState<string>('—');
  const [projects, setProjects] = useState<OrganizationProjectListItem[]>([]);
  const [limits, setLimits] = useState<OrganizationProjectsLimits | null>(null);
  const [projectsLoadError, setProjectsLoadError] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState(
    ALL_STATUSES_FILTER_VALUE,
  );
  const [createProjectDialogOpen, setCreateProjectDialogOpen] = useState(false);
  const [createProjectDialogRendered, setCreateProjectDialogRendered] =
    useState(false);
  const [createProjectDialogVisible, setCreateProjectDialogVisible] =
    useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectForm, setNewProjectForm] = useState({
    title: '',
    domain: '',
    description: '',
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getMeViaApi();
      if (!cancelled) setMe(result);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsLoadError(null);
    const res: OrganizationProjectsApiResult =
      await fetchOrganizationProjectsViaApi(organizationId);
    if (!res.ok) {
      setProjects([]);
      setLimits(null);
      setOrgName('');
      setOrgStatusName('—');
      setProjectsLoadError(res.message || 'Could not load projects.');
      setProjectsLoading(false);
      return;
    }
    setOrgName(res.organization.name);
    setOrgStatusName(res.organization.statusName);
    setProjects(res.projects);
    setLimits(res.limits);
    setProjectsLoading(false);
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadProjects();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProjects]);

  useEffect(() => {
    if (createProjectDialogOpen) {
      setCreateProjectDialogRendered(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setCreateProjectDialogVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setCreateProjectDialogVisible(false);
    const t = window.setTimeout(() => setCreateProjectDialogRendered(false), 200);
    return () => window.clearTimeout(t);
  }, [createProjectDialogOpen]);

  useEffect(() => {
    if (!createProjectDialogRendered) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setCreateProjectDialogOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [createProjectDialogRendered]);

  const email = me?.ok ? me.email : '';

  function onSelectTheme(pref: ThemePreference) {
    setThemePreference(pref);
    writeStoredThemePreference(pref);
    applyTheme(pref);
  }

  async function onLogout() {
    await signOutViaApi();
    window.location.href = '/auth';
  }

  const projectStatusFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      const k = p.statusName.trim().toLowerCase();
      if (k && k !== '—') {
        if (!map.has(k)) map.set(k, p.statusName.trim());
      }
    }
    const sorted = [...map.keys()].sort();
    return [
      { value: ALL_STATUSES_FILTER_VALUE, label: 'All Statuses' },
      ...sorted.map((k) => ({
        value: k,
        label: formatProjectStatusLabel(map.get(k) ?? k),
      })),
    ];
  }, [projects]);

  const filteredProjects = useMemo(() => {
    let rows = projects;
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.description?.toLowerCase().includes(q) ?? false) ||
          (p.domain?.toLowerCase().includes(q) ?? false) ||
          p.statusName.toLowerCase().includes(q),
      );
    }
    if (projectStatusFilter !== ALL_STATUSES_FILTER_VALUE) {
      rows = rows.filter(
        (p) => p.statusName.trim().toLowerCase() === projectStatusFilter,
      );
    }
    return rows;
  }, [projects, search, projectStatusFilter]);

  function onNewProjectClick() {
    if (limits == null) {
      toast.error('Load organization data before creating a project.');
      return;
    }
    if (orgStatusName.trim().toLowerCase() !== 'active') {
      toast.error('Projects can only be created when the organization is active.');
      return;
    }
    const { maxProjectsPerOrg, projectCount, planName } = limits;
    if (maxProjectsPerOrg !== -1 && projectCount >= maxProjectsPerOrg) {
      const cap =
        maxProjectsPerOrg === 1
          ? 'one project'
          : `up to ${maxProjectsPerOrg} projects`;
      toast.error(
        `Your ${planName} plan allows ${cap} per organization. Upgrade your plan to add more.`,
      );
      return;
    }
    setNewProjectForm({ title: '', domain: '', description: '' });
    setCreateProjectDialogOpen(true);
  }

  async function onCreateProjectSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isCreatingProject) return;

    const title = newProjectForm.title.trim();
    if (!title) {
      toast.error('Project title is required.');
      return;
    }

    const domainTrimmed = newProjectForm.domain.trim();
    if (!domainTrimmed) {
      toast.error('Please enter a domain for this project.');
      return;
    }
    if (!isValidProjectDomain(domainTrimmed)) {
      toast.error(
        'Enter a valid domain (e.g. example.com or app.example.com). No URL, path, or port.',
      );
      return;
    }

    setIsCreatingProject(true);
    try {
      const result = await createOrganizationProjectViaApi(organizationId, {
        title,
        domain: domainTrimmed,
        description: newProjectForm.description.trim() || undefined,
      });

      if (!result.ok) {
        if (
          result.code === 'PROJECT_LIMIT' ||
          result.code === 'DUPLICATE_DOMAIN' ||
          result.code === 'DUPLICATE_PROJECT' ||
          result.code === 'DOMAIN_REQUIRED' ||
          result.code === 'INVALID_DOMAIN'
        ) {
          toast.error(result.message);
        } else {
          toast.error(result.message || 'Unable to create project.');
        }
        return;
      }

      toast.success(result.message || 'Project created successfully.');
      setCreateProjectDialogOpen(false);
      setNewProjectForm({ title: '', domain: '', description: '' });
      await loadProjects();
    } catch {
      toast.error('Something went wrong while creating the project.');
    } finally {
      setIsCreatingProject(false);
    }
  }

  return {
    email,
    menuOpen,
    setMenuOpen,
    menuRef,
    themePreference,
    onSelectTheme,
    onLogout,
    orgName,
    orgStatusName,
    projects,
    limits,
    filteredProjects,
    search,
    setSearch,
    projectStatusFilter,
    setProjectStatusFilter,
    projectStatusFilterOptions,
    projectsLoadError,
    projectsLoading,
    onRefreshProjects: loadProjects,
    onNewProjectClick,
    createProjectDialogOpen,
    setCreateProjectDialogOpen,
    createProjectDialogRendered,
    createProjectDialogVisible,
    isCreatingProject,
    newProjectForm,
    setNewProjectForm,
    onCreateProjectSubmit,
    reloadProjects: loadProjects,
  };
}
