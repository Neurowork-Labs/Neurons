/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import { useRef, useMemo, useState } from 'react';
import { AtSign, BadgeHelp, Bell, BookOpen, Bot, Check, ChevronDown, CircleHelp, Copy, Globe, GlobeOff, Headset, Info, LifeBuoy, Mail, Megaphone, MessageCircle, MessageSquare, Phone, RefreshCw, Rocket, Search, Send, ShieldCheck, Sparkles, Upload, User, UserRound } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProjectTabShell } from '@/components/projects/project-tab-shell';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { copyToClipboardWithToast } from '@/lib/cloud-agents/copy-to-clipboard-with-toast';
import {
  cloudAgentVersionTagClassName,
  formatAgentVersionForCard,
} from '@/lib/cloud-agents/cloud-agent-version-tag';
import { formatAgentTimestamp } from '@/lib/cloud-agents/cloud-agent-detail-format';
import {
  updateConnectedAgentViaApi,
  uploadWidgetIconViaApi,
} from '@/lib/connected-agents/connected-agents-api-client';
import {
  buildWidgetScriptValue,
  maskPrefix,
  maskProjectAgentId,
} from '@/lib/connected-agents/connected-agents-script';
import { normalizeConnectedAgentModelIdForDraft } from '@/lib/connected-agents/connected-agents-model-draft';
import {
  WIDGET_CONTACT_FIELD_OPTIONS,
  normalizeWidgetRequiredContactFields,
  widgetRequiredContactFieldsEqual,
  type WidgetContactFieldKey,
} from '@/lib/connected-agents/widget-contact-fields-config';
import {
  DEFAULT_WIDGET_LAUNCHER_ICON,
  WIDGET_LUCIDE_ICON_OPTIONS,
  type WidgetLucideIconKey,
  type WidgetLauncherIconMode,
  normalizeWidgetLauncherIconConfig,
  validateWidgetLauncherIconConfig,
  validateWidgetIconFile,
  widgetLauncherIconConfigEquals,
} from '@/lib/connected-agents/widget-launcher-icon-config';
import {
  ensureWidgetThemeColor,
  normalizeWidgetThemeColor,
  validateWidgetThemeColor,
} from '@/lib/connected-agents/widget-theme-color-config';
import {
  hexToRgbColor,
  rgbColorToHex,
} from '@/lib/connected-agents/widget-theme-color-picker';
import { readProjectApiKeyPlaintextForCopy } from '@/lib/project-api-keys/project-api-key-client-store';
import { useProjectConnectedAgentsPage } from '@/lib/connected-agents/connected-agents-page-logic';
import { primaryCtaDialogButtonClassName } from '@/lib/ui/primary-cta-button';
import { cn } from '@/lib/utils';

type ProjectConnectedAgentsViewProps = {
  projectId: string;
};

function renderLauncherLucideIcon(icon: WidgetLucideIconKey) {
  if (icon === 'message-circle') return <MessageCircle className="h-4 w-4" aria-hidden />;
  if (icon === 'bot') return <Bot className="h-4 w-4" aria-hidden />;
  if (icon === 'sparkles') return <Sparkles className="h-4 w-4" aria-hidden />;
  if (icon === 'circle-help') return <CircleHelp className="h-4 w-4" aria-hidden />;
  if (icon === 'message-square') return <MessageSquare className="h-4 w-4" aria-hidden />;
  if (icon === 'send') return <Send className="h-4 w-4" aria-hidden />;
  if (icon === 'headset') return <Headset className="h-4 w-4" aria-hidden />;
  if (icon === 'life-buoy') return <LifeBuoy className="h-4 w-4" aria-hidden />;
  if (icon === 'badge-help') return <BadgeHelp className="h-4 w-4" aria-hidden />;
  if (icon === 'info') return <Info className="h-4 w-4" aria-hidden />;
  if (icon === 'mail') return <Mail className="h-4 w-4" aria-hidden />;
  if (icon === 'phone') return <Phone className="h-4 w-4" aria-hidden />;
  if (icon === 'megaphone') return <Megaphone className="h-4 w-4" aria-hidden />;
  if (icon === 'bell') return <Bell className="h-4 w-4" aria-hidden />;
  if (icon === 'rocket') return <Rocket className="h-4 w-4" aria-hidden />;
  if (icon === 'shield-check') return <ShieldCheck className="h-4 w-4" aria-hidden />;
  if (icon === 'user') return <User className="h-4 w-4" aria-hidden />;
  if (icon === 'at-sign') return <AtSign className="h-4 w-4" aria-hidden />;
  if (icon === 'book-open') return <BookOpen className="h-4 w-4" aria-hidden />;
  return <UserRound className="h-4 w-4" aria-hidden />;
}

function safePrettyJson(value: unknown): string {
  if (value == null) return '{}';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeJsonForCompare(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function collectObjectKeyPaths(value: unknown, prefix = ''): Set<string> {
  const keys = new Set<string>();

  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      const nextPrefix = prefix ? `${prefix}.${k}` : k;
      keys.add(nextPrefix);
      if (isPlainObject(v) || Array.isArray(v)) {
        for (const childKeys of [collectObjectKeyPaths(v, nextPrefix)]) {
          for (const ck of childKeys) keys.add(ck);
        }
      }
    }
    return keys;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      for (const childKey of collectObjectKeyPaths(item, prefix)) keys.add(childKey);
    }
    return keys;
  }

  return keys;
}

export function ProjectConnectedAgentsView({ projectId }: ProjectConnectedAgentsViewProps) {
  const {
    agents,
    filteredAgents,
    loadError,
    loading,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    statusFilterOptions,
    modelOptions,
    planDefaultModelId,
    planDefaultModelDisplayName,
    projectName,
    widgetScriptSrc,
    activeApiKeyPrefix,
    onRefresh,
    dialogAgent,
    setDialogAgent,
    closeAgentDialog,
    replaceAgentInList,
  } = useProjectConnectedAgentsPage(projectId);

  const [isSaving, setIsSaving] = useState(false);
  const [draftModelId, setDraftModelId] = useState<string | null>(null);
  const [draftCustomAgentName, setDraftCustomAgentName] = useState('');
  const [draftUserInstruction, setDraftUserInstruction] = useState('');
  const [draftGreeting, setDraftGreeting] = useState('');
  const [draftConfigText, setDraftConfigText] = useState('{}');
  const [draftWidgetIconMode, setDraftWidgetIconMode] = useState<WidgetLauncherIconMode>('lucide');
  const [draftWidgetLucideIcon, setDraftWidgetLucideIcon] = useState<WidgetLucideIconKey>(
    DEFAULT_WIDGET_LAUNCHER_ICON.lucideIcon,
  );
  const [draftWidgetCustomIconUrl, setDraftWidgetCustomIconUrl] = useState('');
  const [draftWidgetThemeColor, setDraftWidgetThemeColor] = useState(
    ensureWidgetThemeColor(null),
  );
  const [draftWidgetRequiredContactFields, setDraftWidgetRequiredContactFields] = useState<WidgetContactFieldKey[]>([]);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [contactFieldPopoverOpen, setContactFieldPopoverOpen] = useState(false);
  const [themeColorPopoverOpen, setThemeColorPopoverOpen] = useState(false);
  const iconFileInputRef = useRef<HTMLInputElement>(null);
  const [scriptCopied, setScriptCopied] = useState(false);

  function openDialog(agentId: string) {
    const next = agents.find((a) => a.projectAgentId === agentId);
    if (!next) return;
    setDialogAgent(next);
    setDraftModelId(
      normalizeConnectedAgentModelIdForDraft(next.modelId, planDefaultModelId),
    );
    setDraftCustomAgentName(next.customAgentName?.trim() || '');
    setDraftUserInstruction(next.userInstruction ?? '');
    setDraftGreeting(next.greeting ?? '');
    setDraftConfigText(safePrettyJson(next.config ?? next.configSchema));
    const iconConfig = normalizeWidgetLauncherIconConfig({
      mode: next.widgetLauncherIconMode,
      lucideIcon: next.widgetLauncherIconLucide,
      customIconUrl: next.widgetLauncherIconCustomUrl,
    });
    setDraftWidgetIconMode(iconConfig.mode);
    setDraftWidgetLucideIcon(iconConfig.lucideIcon);
    setDraftWidgetCustomIconUrl(iconConfig.customIconUrl ?? '');
    setDraftWidgetThemeColor(ensureWidgetThemeColor(next.widgetThemeColor));
    setDraftWidgetRequiredContactFields(agentContactFields(next.widgetRequiredContactFields));
  }

  function discardDialogEdits() {
    if (!dialogAgent) return;
    setDraftModelId(
      normalizeConnectedAgentModelIdForDraft(dialogAgent.modelId, planDefaultModelId),
    );
    setDraftCustomAgentName(dialogAgent.customAgentName?.trim() || '');
    setDraftUserInstruction(dialogAgent.userInstruction ?? '');
    setDraftGreeting(dialogAgent.greeting ?? '');
    setDraftConfigText(safePrettyJson(dialogAgent.config ?? dialogAgent.configSchema));
    const iconConfig = normalizeWidgetLauncherIconConfig({
      mode: dialogAgent.widgetLauncherIconMode,
      lucideIcon: dialogAgent.widgetLauncherIconLucide,
      customIconUrl: dialogAgent.widgetLauncherIconCustomUrl,
    });
    setDraftWidgetIconMode(iconConfig.mode);
    setDraftWidgetLucideIcon(iconConfig.lucideIcon);
    setDraftWidgetCustomIconUrl(iconConfig.customIconUrl ?? '');
    setDraftWidgetThemeColor(ensureWidgetThemeColor(dialogAgent.widgetThemeColor));
    setDraftWidgetRequiredContactFields(agentContactFields(dialogAgent.widgetRequiredContactFields));
  }

  const dirtyState = useMemo(() => {
    if (!dialogAgent) return { isDirty: false };

    const userInstructionDirty =
      (dialogAgent.userInstruction ?? '') !== draftUserInstruction;
    const greetingDirty = (dialogAgent.greeting ?? '') !== draftGreeting;
    const storedModelNorm = normalizeConnectedAgentModelIdForDraft(
      dialogAgent.modelId,
      planDefaultModelId,
    );
    const modelDirty = storedModelNorm !== (draftModelId ?? null);
    const customAgentNameDirty =
      (dialogAgent.customAgentName?.trim() || '') !== draftCustomAgentName.trim();
    const savedIconConfig = normalizeWidgetLauncherIconConfig({
      mode: dialogAgent.widgetLauncherIconMode,
      lucideIcon: dialogAgent.widgetLauncherIconLucide,
      customIconUrl: dialogAgent.widgetLauncherIconCustomUrl,
    });
    const draftIconConfig = normalizeWidgetLauncherIconConfig({
      mode: draftWidgetIconMode,
      lucideIcon: draftWidgetLucideIcon,
      customIconUrl: draftWidgetCustomIconUrl,
    });
    const widgetIconDirty = !widgetLauncherIconConfigEquals(savedIconConfig, draftIconConfig);
    const widgetThemeColorDirty =
      normalizeWidgetThemeColor(dialogAgent.widgetThemeColor) !==
      normalizeWidgetThemeColor(draftWidgetThemeColor);
    const requiredContactFieldsDirty = !widgetRequiredContactFieldsEqual(
      agentContactFields(dialogAgent.widgetRequiredContactFields),
      draftWidgetRequiredContactFields,
    );

    let configDirty = false;
    try {
      const parsed = JSON.parse(draftConfigText);
      const originalValue = dialogAgent.config ?? dialogAgent.configSchema ?? null;
      configDirty = normalizeJsonForCompare(parsed) !== normalizeJsonForCompare(originalValue);
    } catch {
      // If JSON is invalid, treat it as dirty; save will be blocked later.
      configDirty =
        draftConfigText.trim() !== safePrettyJson(dialogAgent.config ?? dialogAgent.configSchema);
    }

    return {
      isDirty:
        userInstructionDirty ||
        greetingDirty ||
        modelDirty ||
        customAgentNameDirty ||
        widgetIconDirty ||
        widgetThemeColorDirty ||
        requiredContactFieldsDirty ||
        configDirty,
    };
  }, [
    dialogAgent,
    draftConfigText,
    draftModelId,
    draftCustomAgentName,
    draftUserInstruction,
    draftGreeting,
    draftWidgetIconMode,
    draftWidgetLucideIcon,
    draftWidgetCustomIconUrl,
    draftWidgetThemeColor,
    draftWidgetRequiredContactFields,
    planDefaultModelId,
  ]);

  const discardButtonClasses = cn(
    'h-10 cursor-pointer rounded-lg border px-4 text-sm font-medium transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800',
    dirtyState.isDirty
      ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60'
      : 'border-neutral-300 text-neutral-700',
  );

  async function handleSave() {
    if (!dialogAgent) return;

    let parsedConfig: unknown = null;
    try {
      parsedConfig = JSON.parse(draftConfigText);
    } catch {
      toast.error('Config must be a valid JSON object.');
      return;
    }

    const defaultSchema = dialogAgent.configSchema ?? null;
    if (defaultSchema != null) {
      const isDefaultObj = isPlainObject(defaultSchema);
      const isUpdatedObj = isPlainObject(parsedConfig);
      if (isDefaultObj !== isUpdatedObj) {
        toast.error('CONFIGURATION must match the default schema shape.');
        return;
      }

      if (isDefaultObj && isUpdatedObj) {
        const defaultKeys = collectObjectKeyPaths(defaultSchema);
        const updatedKeys = collectObjectKeyPaths(parsedConfig);

        const same =
          defaultKeys.size === updatedKeys.size &&
          [...defaultKeys].every((k) => updatedKeys.has(k));

        if (!same) {
          toast.error('Invalid CONFIGURATION. Please review and try again.');
          return;
        }
      }
    }

    const isSameAsDefault =
      normalizeJsonForCompare(parsedConfig) === normalizeJsonForCompare(defaultSchema);
    const finalConfig = isSameAsDefault ? null : parsedConfig;
    const iconValidation = validateWidgetLauncherIconConfig({
      mode: draftWidgetIconMode,
      lucideIcon: draftWidgetLucideIcon,
      customIconUrl: draftWidgetCustomIconUrl,
    });
    if (!iconValidation.ok) {
      toast.error(iconValidation.message);
      return;
    }
    const themeColorValidation = validateWidgetThemeColor(draftWidgetThemeColor);
    if (!themeColorValidation.ok) {
      toast.error(themeColorValidation.message);
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateConnectedAgentViaApi(projectId, dialogAgent.projectAgentId, {
        statusId: dialogAgent.statusId, // status is read-only in this dialog
        modelId: draftModelId,
        userInstruction: draftUserInstruction.trim() ? draftUserInstruction : null,
        greeting: draftGreeting.trim() ? draftGreeting : null,
        customAgentName: draftCustomAgentName.trim() ? draftCustomAgentName.trim() : null,
        config: finalConfig,
        widgetLauncherIcon: iconValidation.value,
        widgetThemeColor: themeColorValidation.value,
        requiredContactFields: draftWidgetRequiredContactFields,
      });

      if (!res.ok) {
        toast.error(res.message || 'Could not update connected agent.');
        return;
      }

      replaceAgentInList(res.agent);
      toast.success(`${res.agent.displayName} updated in ${projectName || 'this project'}`);
      closeAgentDialog();
      void onRefresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleIconFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (iconFileInputRef.current) iconFileInputRef.current.value = '';
    if (!file || !dialogAgent) return;

    const fileCheck = validateWidgetIconFile({ name: file.name, size: file.size, type: file.type });
    if (!fileCheck.ok) {
      toast.error(fileCheck.message);
      return;
    }

    setIsUploadingIcon(true);
    try {
      const res = await uploadWidgetIconViaApi(projectId, dialogAgent.projectAgentId, file);
      if (!res.ok) {
        toast.error(res.message || 'Icon upload failed.');
        return;
      }
      setDraftWidgetIconMode('custom_url');
      setDraftWidgetCustomIconUrl(res.publicUrl);
      toast.success('Icon uploaded.');
    } finally {
      setIsUploadingIcon(false);
    }
  }

  async function copyGoToScript() {
    if (!dialogAgent) return;
    if (!widgetScriptSrc) {
      toast.error('Widget script source URL is not configured.');
      return;
    }
    if (!activeApiKeyPrefix) {
      toast.error('Create an API key first, then copy the script.');
      return;
    }
    const fullApiKey = readProjectApiKeyPlaintextForCopy(projectId);
    const apiKeyForCopy = fullApiKey || maskPrefix(activeApiKeyPrefix);
    const script = buildWidgetScriptValue({
      src: widgetScriptSrc,
      apiKey: apiKeyForCopy,
      projectAgentId: dialogAgent.projectAgentId,
    });
    if (!script) {
      toast.error('Could not build script.');
      return;
    }
    await navigator.clipboard.writeText(script);
    if (fullApiKey) {
      toast.success('Script copied.');
    } else {
      toast.warning(
        'Script copied with masked API key. Replace data-api-key with your full key, or create a new key to auto-cache it.',
      );
    }
    setScriptCopied(true);
    window.setTimeout(() => setScriptCopied(false), 2000);
  }

  const goToScriptDisplayValue =
    dialogAgent && widgetScriptSrc
      ? activeApiKeyPrefix
        ? buildWidgetScriptValue({
            src: widgetScriptSrc,
            apiKey: maskPrefix(activeApiKeyPrefix),
            projectAgentId: maskProjectAgentId(dialogAgent.projectAgentId),
          })
        : 'API key is not created for this project.'
      : 'Widget script source URL is not configured.';

  const widgetPreviewHref =
    dialogAgent != null
      ? `/project/${encodeURIComponent(projectId)}/connected-agents/widget-preview?projectAgentId=${encodeURIComponent(dialogAgent.projectAgentId)}`
      : '';

  function agentContactFields(
    value: unknown,
  ): WidgetContactFieldKey[] {
    return normalizeWidgetRequiredContactFields(value);
  }

  function toggleRequiredContactField(field: WidgetContactFieldKey) {
    setDraftWidgetRequiredContactFields((prev) => {
      if (prev.includes(field)) return prev.filter((x) => x !== field);
      return [...prev, field];
    });
  }

  const selectedContactFieldLabel =
    draftWidgetRequiredContactFields.length === 0
      ? 'None'
      : WIDGET_CONTACT_FIELD_OPTIONS.filter((opt) => draftWidgetRequiredContactFields.includes(opt.value))
          .map((opt) => opt.label)
          .join(', ');
  const themeColorRgb = hexToRgbColor(draftWidgetThemeColor) ?? hexToRgbColor(ensureWidgetThemeColor(null))!;

  function updateThemeColorChannel(channel: 'r' | 'g' | 'b', value: number) {
    const next = { ...themeColorRgb, [channel]: Number(value) };
    setDraftWidgetThemeColor(rgbColorToHex(next));
  }

  return (
    <>
      <ProjectTabShell
        title="Connected Agents"
        fullWidthTabContent
        matchOrganizationMainPadding
      >
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 w-full sm:flex-1 sm:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by agent name"
              className="h-9 w-full rounded-lg border border-neutral-300 bg-white pl-10 pr-4 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-500"
              aria-label="Search connected agents by name"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={setStatusFilter}
            disabled={loading && agents.length === 0}
          >
            <SelectTrigger
              size="sm"
              className="h-9 min-h-9 w-full cursor-pointer py-0 sm:w-[12rem] sm:shrink-0"
            >
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              {statusFilterOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onRefresh()}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            aria-label="Refresh connected agents"
          >
            <RefreshCw
              className={cn('h-4 w-4', loading ? 'animate-spin' : '')}
              aria-hidden
            />
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
          {!loading && !loadError && filteredAgents.length === 0 ? (
            <p
              className="col-span-full py-10 text-center text-sm text-neutral-600 dark:text-neutral-400"
              role="status"
            >
              {agents.length === 0
                ? 'No connected agents are available for this project yet.'
                : 'No agents match your search or status filter.'}
            </p>
          ) : null}

          {!loading && !loadError
            ? filteredAgents.map((agent) => (
                <button
                  key={agent.projectAgentId}
                  type="button"
                  role="listitem"
                  onClick={() => openDialog(agent.projectAgentId)}
                  className="group cursor-pointer rounded-2xl border border-neutral-200 bg-white p-4 text-left outline-none transition-all duration-200 ease-out hover:-translate-y-1 hover:border-neutral-300 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:focus-visible:ring-neutral-500 sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105',
                        agent.statusName === 'active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
                      )}
                    >
                      {agent.statusName === 'active' ? (
                        <Globe className="h-6 w-6" aria-hidden />
                      ) : (
                        <GlobeOff className="h-6 w-6" aria-hidden />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-base font-semibold text-neutral-900 transition-colors group-hover:text-neutral-950 dark:text-neutral-50 dark:group-hover:text-white">
                          {agent.displayName}
                        </p>
                        <span
                          className={cloudAgentVersionTagClassName()}
                          title={`Version ${agent.version}`}
                        >
                          {formatAgentVersionForCard(agent.version)}
                        </span>
                      </div>
                      <p
                        className="mt-0.5 truncate text-xs text-neutral-600 dark:text-neutral-300"
                        title={agent.name}
                      >
                        {agent.name}
                      </p>
                      {agent.description?.trim() ? (
                        <p className="mt-2 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">
                          {agent.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))
            : null}
        </div>
      </ProjectTabShell>

      <Dialog
        open={dialogAgent != null}
        onOpenChange={(open) => {
          if (!open) closeAgentDialog();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-plus-jakarta-sans flex max-h-[min(76vh,700px)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-[84rem]"
        >
          <div
            className={cn(
              'scrollbar-dialog min-h-0 flex-1 overflow-y-auto pr-1',
              contactFieldPopoverOpen && 'overflow-hidden',
            )}
          >
            <DialogHeader className="pr-12">
              <DialogTitle className="text-neutral-900 dark:text-neutral-50">
                {dialogAgent?.displayName ?? 'Connected agent'}
              </DialogTitle>
              {dialogAgent ? (
                <div className="border-b border-neutral-200 pb-3 dark:border-neutral-700">
                  <div className="flex min-w-0 max-w-full items-center gap-1.5">
                    <span
                      className="min-w-0 shrink truncate font-mono text-sm text-neutral-700 dark:text-neutral-300"
                      title={dialogAgent.name}
                    >
                      {dialogAgent.name}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void copyToClipboardWithToast(dialogAgent.name, {
                          successMessage: 'Agent name copied',
                        })
                      }
                      className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      aria-label="Copy agent name"
                    >
                      <Copy className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              ) : null}
            </DialogHeader>

            {dialogAgent ? (
              <div className="mt-4 space-y-5 pr-1">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    AGENT TYPE
                  </p>
                  <p className="mt-1.5 text-sm text-neutral-800 dark:text-neutral-200">
                    {dialogAgent.typeDisplayName}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    STATUS
                  </p>
                  <p className="mt-1.5 flex items-center gap-2 text-sm text-neutral-800 dark:text-neutral-200">
                    {dialogAgent.statusName === 'active' ? (
                      <Globe className="h-4 w-4 text-emerald-600 dark:text-emerald-300" aria-hidden />
                    ) : (
                      <GlobeOff className="h-4 w-4 text-red-600 dark:text-red-300" aria-hidden />
                    )}
                    <span className="capitalize">{dialogAgent.statusName || 'inactive'}</span>
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    CONNECTED
                  </p>
                  <p className="mt-1.5 text-sm text-neutral-800 dark:text-neutral-200">
                    {formatAgentTimestamp(dialogAgent.updatedAt)}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      MODEL
                    </p>
                    <Select
                      value={draftModelId ?? '__none__'}
                      onValueChange={(value) => setDraftModelId(value === '__none__' ? null : value)}
                    >
                      <SelectTrigger
                        size="sm"
                        className="mt-1.5 h-10 min-h-10 w-full cursor-pointer py-0"
                      >
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4}>
                        <SelectItem value="__none__">
                          {planDefaultModelDisplayName
                            ? `${planDefaultModelDisplayName} (default)`
                            : 'Use default model'}
                        </SelectItem>
                        {modelOptions.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      AGENT NAME
                    </p>
                    <input
                      value={draftCustomAgentName}
                      onChange={(e) => setDraftCustomAgentName(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500"
                      placeholder="Enter agent name"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        REQUIRED CONTACT FIELDS
                      </p>
                      <div className="group relative inline-flex">
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 cursor-default items-center justify-center rounded-full text-neutral-500 dark:text-neutral-400"
                          aria-label="Required contact fields info"
                        >
                          <Info className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <div className="pointer-events-none absolute left-1/2 top-full z-[120] mt-1 hidden w-64 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white p-2 text-xs text-neutral-700 shadow-lg group-hover:block dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
                          <ul className="list-disc space-y-1 pl-4">
                            <li>Selected fields are visible and mandatory in the widget form.</li>
                            <li>No selection means no contact form is shown in the widget.</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    <Popover open={contactFieldPopoverOpen} onOpenChange={setContactFieldPopoverOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="font-plus-jakarta-sans border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 mt-1.5 flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-left text-sm whitespace-nowrap text-neutral-900 shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                        >
                          <span className="truncate">{selectedContactFieldLabel}</span>
                          <ChevronDown className="size-4 opacity-50" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        side="bottom"
                        sideOffset={6}
                        className="font-plus-jakarta-sans z-[100] w-[var(--radix-popover-trigger-width)] min-w-[14rem] rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
                      >
                        <div
                          className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1 overscroll-contain"
                          onWheel={(e) => e.stopPropagation()}
                        >
                          {WIDGET_CONTACT_FIELD_OPTIONS.map((opt) => (
                            <label
                              key={opt.value}
                              className="font-plus-jakarta-sans focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-lg py-2 pr-2 pl-2 text-sm text-neutral-900 outline-hidden select-none hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
                            >
                              <input
                                type="checkbox"
                                checked={draftWidgetRequiredContactFields.includes(opt.value)}
                                onChange={() => toggleRequiredContactField(opt.value)}
                                className="peer sr-only"
                              />
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-neutral-400 bg-transparent text-transparent transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white dark:border-neutral-500 dark:peer-checked:border-emerald-600 dark:peer-checked:bg-emerald-600">
                                <Check className="h-3 w-3" aria-hidden />
                              </span>
                              <span className="truncate">{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      WIDGET TRIGGER ICON
                    </p>
                    <Select
                      value={draftWidgetIconMode === 'custom_url' ? 'custom_url' : draftWidgetLucideIcon}
                      onValueChange={(value) => {
                        if (value === 'custom_url') {
                          setDraftWidgetIconMode('custom_url');
                          return;
                        }
                        setDraftWidgetIconMode('lucide');
                        setDraftWidgetLucideIcon(value as WidgetLucideIconKey);
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        className="mt-1.5 h-10 min-h-10 w-full cursor-pointer py-0"
                      >
                        <SelectValue placeholder="Select icon" />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        sideOffset={4}
                        className="max-h-52 overflow-y-auto overscroll-contain"
                      >
                        {WIDGET_LUCIDE_ICON_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <span className="inline-flex items-center gap-2">
                              {renderLauncherLucideIcon(opt.value)}
                              <span>{opt.label}</span>
                            </span>
                          </SelectItem>
                        ))}
                        <SelectItem value="custom_url">
                          <span className="inline-flex items-center gap-2">
                            <Upload className="h-4 w-4" aria-hidden />
                            <span>Custom icon URL/Upload</span>
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div className={cn('md:col-span-3', draftWidgetIconMode !== 'custom_url' && 'opacity-60')}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      CUSTOM ICON URL
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        type="url"
                        value={draftWidgetCustomIconUrl}
                        disabled={draftWidgetIconMode !== 'custom_url'}
                        onChange={(e) => setDraftWidgetCustomIconUrl(e.target.value)}
                        className="h-10 flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-80 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500"
                        placeholder="https://cdn.example.com/widget-icon.svg"
                      />
                      <input
                        ref={iconFileInputRef}
                        type="file"
                        accept=".svg,.png,.webp,.jpg,.jpeg"
                        className="hidden"
                        onChange={(e) => void handleIconFileSelect(e)}
                      />
                      <button
                        type="button"
                        disabled={draftWidgetIconMode !== 'custom_url' || isUploadingIcon || !dialogAgent}
                        onClick={() => iconFileInputRef.current?.click()}
                        className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        title="Upload icon from your system"
                        aria-label="Upload custom icon"
                      >
                        <Upload className="h-4 w-4" aria-hidden />
                        {isUploadingIcon ? 'Uploading…' : 'Upload'}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      Paste a public HTTPS URL or upload an icon (.svg, .png, .webp, .jpg, .jpeg — max 100 KB).
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      WIDGET THEME COLOR
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        type="text"
                        value={draftWidgetThemeColor}
                        onChange={(e) => setDraftWidgetThemeColor(e.target.value)}
                        className="h-10 w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 font-mono text-sm uppercase text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500"
                        placeholder="#065F46"
                        aria-label="Widget theme color hex value"
                      />
                      <Popover open={themeColorPopoverOpen} onOpenChange={setThemeColorPopoverOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-neutral-300 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-950"
                            aria-label="Open widget theme color picker"
                          >
                            <span
                              className="block h-full w-full rounded-md"
                              style={{ backgroundColor: ensureWidgetThemeColor(draftWidgetThemeColor) }}
                            />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="end"
                          side="top"
                          sideOffset={8}
                          className="w-64 rounded-2xl p-3 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-bottom-1 data-[state=open]:slide-in-from-bottom-1"
                        >
                          <div
                            className="mb-3 h-12 w-full rounded-xl border border-neutral-200 dark:border-neutral-700"
                            style={{ backgroundColor: ensureWidgetThemeColor(draftWidgetThemeColor) }}
                          />
                          <div className="space-y-2">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                              Red: {themeColorRgb.r}
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={255}
                              value={themeColorRgb.r}
                              onChange={(e) => updateThemeColorChannel('r', Number(e.target.value))}
                              className="w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-neutral-300 dark:[&::-webkit-slider-runnable-track]:bg-neutral-600 [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-neutral-300 dark:[&::-moz-range-track]:bg-neutral-600 [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-red-500 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-red-500"
                            />
                            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                              Green: {themeColorRgb.g}
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={255}
                              value={themeColorRgb.g}
                              onChange={(e) => updateThemeColorChannel('g', Number(e.target.value))}
                              className="w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-neutral-300 dark:[&::-webkit-slider-runnable-track]:bg-neutral-600 [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-neutral-300 dark:[&::-moz-range-track]:bg-neutral-600 [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-emerald-500"
                            />
                            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                              Blue: {themeColorRgb.b}
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={255}
                              value={themeColorRgb.b}
                              onChange={(e) => updateThemeColorChannel('b', Number(e.target.value))}
                              className="w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-neutral-300 dark:[&::-webkit-slider-runnable-track]:bg-neutral-600 [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-neutral-300 dark:[&::-moz-range-track]:bg-neutral-600 [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-blue-500 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-blue-500"
                            />
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      This color is used for the widget&apos;s theme.
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    GO TO SCRIPT
                  </p>
                  <div className="relative mt-1.5">
                    <button
                      type="button"
                      onClick={() => void copyGoToScript()}
                      className="absolute right-2 top-2 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      aria-label={scriptCopied ? 'Copied script' : 'Copy script'}
                    >
                      {scriptCopied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                    </button>
                    <pre className="scrollbar-dialog max-h-[min(28vh,16rem)] min-h-[6rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-neutral-200 bg-neutral-50 p-4 pr-12 font-mono text-sm leading-relaxed text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200">
                      {goToScriptDisplayValue}
                    </pre>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    DEFAULT INSTRUCTION
                  </p>
                  <pre className="scrollbar-dialog mt-1.5 max-h-[min(28vh,16rem)] min-h-[6rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-neutral-200 bg-neutral-50 p-4 font-mono text-sm leading-relaxed text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200">
                    {dialogAgent.systemInstruction || '—'}
                  </pre>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    CUSTOM INSTRUCTION
                  </p>
                  <textarea
                    value={draftUserInstruction}
                    onChange={(e) => setDraftUserInstruction(e.target.value)}
                    className="mt-1.5 min-h-[7rem] w-full rounded-lg border border-neutral-300 bg-white p-3 font-mono text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500"
                  />
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    GREETING
                  </p>
                  <textarea
                    value={draftGreeting}
                    onChange={(e) => setDraftGreeting(e.target.value)}
                    className="mt-1.5 min-h-[7rem] w-full rounded-lg border border-neutral-300 bg-white p-3 font-mono text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500"
                  />
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    CONFIGURATION
                  </p>
                  <textarea
                    value={draftConfigText}
                    onChange={(e) => setDraftConfigText(e.target.value)}
                    className="mt-1.5 min-h-[10rem] w-full rounded-lg border border-neutral-300 bg-white p-3 font-mono text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500"
                  />
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    DESCRIPTION
                  </p>
                  <p className="mt-1.5 text-sm font-mono leading-relaxed text-neutral-800 dark:text-neutral-200">
                    {dialogAgent.description?.trim() ? dialogAgent.description : '—'}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {dialogAgent ? (
            <DialogFooter className="mt-4 shrink-0 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-between">
              <button
                type="button"
                disabled={isSaving}
                onClick={discardDialogEdits}
                className={cn(
                  discardButtonClasses,
                  !dirtyState.isDirty && 'invisible pointer-events-none',
                )}
              >
                Discard
              </button>
              <div className="flex items-center gap-2">
                {widgetPreviewHref ? (
                  <a
                    href={widgetPreviewHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    title="Open dashboard widget preview"
                  >
                    Visitor view
                  </a>
                ) : null}
                <button
                  type="button"
                  disabled={isSaving || !dialogAgent || !dirtyState.isDirty}
                  onClick={() => void handleSave()}
                  className={cn(
                    primaryCtaDialogButtonClassName,
                    'inline-flex h-10 items-center justify-center px-4',
                  )}
                >
                  {isSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
