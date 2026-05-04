/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { signOutViaApi } from '@/lib/auth/auth-api-client';
import { getMeViaApi, type MeApiResult } from '@/lib/dashboard/dashboard-api-client';
import { fetchProjectContextViaApi } from '@/lib/projects/project-api-client';
import type { ProjectContextPayload } from '@/lib/projects/project-types';
import {
  applyThemePreferenceToDocument,
  readStoredThemePreference,
  writeStoredThemePreference,
  type ThemePreference,
} from '@/lib/theme/theme-preference';

export function useProjectLayout(projectId: string) {
  const [me, setMe] = useState<MeApiResult | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    if (typeof window === 'undefined') return 'system';
    return readStoredThemePreference() ?? 'system';
  });

  const [context, setContext] = useState<ProjectContextPayload | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(true);

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

  const loadContext = useCallback(async () => {
    setContextLoading(true);
    setContextError(null);
    setContext(null);
    try {
      const res = await fetchProjectContextViaApi(projectId);
      if (!res.ok) {
        setContext(null);
        const msg = res.message || 'Could not load project.';
        setContextError(msg);
        toast.error(msg);
        setContextLoading(false);
        return;
      }
      setContext({
        organization: res.organization,
        limits: res.limits,
        project: res.project,
        agentsConnectedCount: res.agentsConnectedCount,
        totalExecutionsCount: res.totalExecutionsCount,
        planSupportTypeLabel: res.planSupportTypeLabel,
      });
      setContextLoading(false);
    } catch {
      setContextError(null);
      toast.error(
        'Unable to load this project. Please check your connection and try again.',
      );
      setContextLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadContext();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadContext]);

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

  return {
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
    reloadContext: loadContext,
  };
}
