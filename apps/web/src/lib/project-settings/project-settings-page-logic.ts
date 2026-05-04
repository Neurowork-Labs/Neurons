/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */
'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectSettingsPayload } from '@/lib/project-settings/project-settings-types';
import {
  fetchProjectSettingsViaApi,
  patchProjectSettingsViaApi,
  softDeleteProjectViaApi,
} from '@/lib/project-settings/project-settings-api-client';

export function useProjectSettingsPage(projectId: string) {
  const router = useRouter();
  const [settings, setSettings] = useState<ProjectSettingsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');

  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await fetchProjectSettingsViaApi(projectId);
    if (!res.ok) {
      setSettings(null);
      setLoadError(res.message || 'Could not load project settings.');
      setLoading(false);
      return;
    }
    setSettings(res.settings);
    setDraftTitle(res.settings.title);
    setDraftDescription(res.settings.description ?? '');
    setLoadError(null);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const dirty =
    settings != null &&
    (draftTitle.trim() !== settings.title.trim() ||
      (draftDescription.trim() || '') !== (settings.description ?? '').trim());

  const onDiscard = useCallback(() => {
    if (settings == null) return;
    setDraftTitle(settings.title);
    setDraftDescription(settings.description ?? '');
  }, [settings]);

  const onSave = useCallback(async () => {
    if (settings == null) return;
    const title = draftTitle.trim();
    if (!title) {
      toast.error('Project title is required.');
      return;
    }
    setSaving(true);
    const descTrim = draftDescription.trim();
    const res = await patchProjectSettingsViaApi(projectId, {
      title,
      description: descTrim === '' ? null : descTrim,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.message || 'Could not save settings.');
      return;
    }
    setSettings(res.settings);
    setDraftTitle(res.settings.title);
    setDraftDescription(res.settings.description ?? '');
    toast.success('Settings saved.');
    router.refresh();
  }, [draftDescription, draftTitle, projectId, router, settings]);

  const openDeleteDialog = useCallback(() => {
    setDeleteConfirmTitle('');
    setDeleteDialogOpen(true);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    if (deleting) return;
    setDeleteDialogOpen(false);
    setDeleteConfirmTitle('');
  }, [deleting]);

  const onConfirmDelete = useCallback(async () => {
    if (settings == null) return;
    setDeleting(true);
    const res = await softDeleteProjectViaApi(projectId, deleteConfirmTitle);
    setDeleting(false);
    if (!res.ok) {
      if (res.code === 'TITLE_MISMATCH') {
        toast.error(res.message);
      } else {
        toast.error(res.message || 'Could not delete project.');
      }
      return;
    }
    toast.success('Project deleted.');
    setDeleteDialogOpen(false);
    router.push(`/org/${encodeURIComponent(settings.organizationId)}`);
  }, [deleteConfirmTitle, projectId, router, settings]);

  const deleteNameMatches =
    settings != null && deleteConfirmTitle.trim() === settings.title.trim();

  return {
    settings,
    loadError,
    loading,
    draftTitle,
    setDraftTitle,
    draftDescription,
    setDraftDescription,
    saving,
    dirty,
    onDiscard,
    onSave,
    deleteDialogOpen,
    deleteConfirmTitle,
    setDeleteConfirmTitle,
    openDeleteDialog,
    closeDeleteDialog,
    onConfirmDelete,
    deleting,
    deleteNameMatches,
  };
}
