/*
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

export const WIDGET_LAUNCHER_ICON_MODES = ['lucide', 'custom_url'] as const;
export type WidgetLauncherIconMode = (typeof WIDGET_LAUNCHER_ICON_MODES)[number];

export const WIDGET_LUCIDE_ICON_KEYS = [
  'user-round',
  'message-circle',
  'bot',
  'sparkles',
  'circle-help',
  'message-square',
  'send',
  'headset',
  'life-buoy',
  'badge-help',
  'info',
  'mail',
  'phone',
  'megaphone',
  'bell',
  'rocket',
  'shield-check',
  'user',
  'at-sign',
  'book-open',
] as const;
export type WidgetLucideIconKey = (typeof WIDGET_LUCIDE_ICON_KEYS)[number];

export const WIDGET_LUCIDE_ICON_OPTIONS: Array<{ value: WidgetLucideIconKey; label: string }> = [
  { value: 'user-round', label: 'User Round' },
  { value: 'message-circle', label: 'Message Circle' },
  { value: 'bot', label: 'Bot' },
  { value: 'sparkles', label: 'Sparkles' },
  { value: 'circle-help', label: 'Circle Help' },
  { value: 'message-square', label: 'Message Square' },
  { value: 'send', label: 'Send' },
  { value: 'headset', label: 'Headset' },
  { value: 'life-buoy', label: 'Life Buoy' },
  { value: 'badge-help', label: 'Badge Help' },
  { value: 'info', label: 'Info' },
  { value: 'mail', label: 'Mail' },
  { value: 'phone', label: 'Phone' },
  { value: 'megaphone', label: 'Megaphone' },
  { value: 'bell', label: 'Bell' },
  { value: 'rocket', label: 'Rocket' },
  { value: 'shield-check', label: 'Shield Check' },
  { value: 'user', label: 'User' },
  { value: 'at-sign', label: 'At Sign' },
  { value: 'book-open', label: 'Book Open' },
];

export type WidgetLauncherIconConfig = {
  mode: WidgetLauncherIconMode;
  lucideIcon: WidgetLucideIconKey;
  customIconUrl: string | null;
};

export const DEFAULT_WIDGET_LAUNCHER_ICON: WidgetLauncherIconConfig = {
  mode: 'lucide',
  lucideIcon: 'user-round',
  customIconUrl: null,
};

const MAX_CUSTOM_ICON_URL_LENGTH = 512;

/** Maximum file size for uploaded custom widget icons (100 KB). */
export const MAX_WIDGET_ICON_FILE_SIZE_BYTES = 100 * 1024;

const ALLOWED_WIDGET_ICON_MIME_TYPES = new Set([
  'image/svg+xml',
  'image/png',
  'image/webp',
  'image/jpeg',
]);

const ALLOWED_WIDGET_ICON_EXTENSIONS = new Set([
  'svg',
  'png',
  'webp',
  'jpg',
  'jpeg',
]);

export function validateWidgetIconFile(
  file: { name: string; size: number; type: string },
): { ok: true } | { ok: false; message: string } {
  const size = Number(file.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, message: 'Icon file is empty.' };
  }
  if (size > MAX_WIDGET_ICON_FILE_SIZE_BYTES) {
    return { ok: false, message: 'Icon file must be under 100 KB.' };
  }

  const ext = String(file.name ?? '')
    .split('.')
    .pop()
    ?.toLowerCase()
    ?.trim();
  if (!ext || !ALLOWED_WIDGET_ICON_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      message: 'Icon file must be .svg, .png, .webp, .jpg, or .jpeg.',
    };
  }

  const mime = String(file.type ?? '').toLowerCase().trim();
  if (mime && !ALLOWED_WIDGET_ICON_MIME_TYPES.has(mime)) {
    return {
      ok: false,
      message: 'Icon file type is not allowed. Use SVG, PNG, WebP, or JPEG.',
    };
  }

  return { ok: true };
}

export type WidgetLauncherIconConfigInput = {
  mode?: unknown;
  lucideIcon?: unknown;
  customIconUrl?: unknown;
} | null | undefined;

function isWidgetLucideIconKey(value: string): value is WidgetLucideIconKey {
  return (WIDGET_LUCIDE_ICON_KEYS as readonly string[]).includes(value);
}

export function normalizeWidgetLauncherIconConfig(
  raw: WidgetLauncherIconConfigInput,
): WidgetLauncherIconConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WIDGET_LAUNCHER_ICON };
  const modeRaw = String(raw.mode ?? '').trim().toLowerCase();
  const mode: WidgetLauncherIconMode =
    modeRaw === 'custom_url' ? 'custom_url' : 'lucide';
  const lucideRaw = String(raw.lucideIcon ?? '').trim().toLowerCase();
  const lucideIcon: WidgetLucideIconKey = isWidgetLucideIconKey(lucideRaw)
    ? lucideRaw
    : DEFAULT_WIDGET_LAUNCHER_ICON.lucideIcon;
  const customIconUrl = String(raw.customIconUrl ?? '').trim() || null;
  return {
    mode,
    lucideIcon,
    customIconUrl,
  };
}

export function validateWidgetLauncherIconConfig(
  raw: WidgetLauncherIconConfigInput,
): { ok: true; value: WidgetLauncherIconConfig } | { ok: false; message: string } {
  const normalized = normalizeWidgetLauncherIconConfig(raw);
  if (normalized.mode === 'lucide') {
    return {
      ok: true,
      value: {
        mode: 'lucide',
        lucideIcon: normalized.lucideIcon,
        customIconUrl: null,
      },
    };
  }

  const customUrl = String(normalized.customIconUrl ?? '').trim();
  if (!customUrl) {
    return { ok: false, message: 'Custom icon URL is required.' };
  }
  if (customUrl.length > MAX_CUSTOM_ICON_URL_LENGTH) {
    return { ok: false, message: 'Custom icon URL is too long.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(customUrl);
  } catch {
    return { ok: false, message: 'Custom icon URL must be a valid URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, message: 'Custom icon URL must use HTTPS.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return { ok: false, message: 'Custom icon URL must be publicly accessible.' };
  }

  if (!/\.(svg|png|webp|jpg|jpeg)$/i.test(parsed.pathname)) {
    return {
      ok: false,
      message: 'Custom icon URL must end with .svg, .png, .webp, .jpg, or .jpeg.',
    };
  }

  return {
    ok: true,
    value: {
      mode: 'custom_url',
      lucideIcon: normalized.lucideIcon,
      customIconUrl: parsed.toString(),
    },
  };
}

export function widgetLauncherIconConfigEquals(
  a: WidgetLauncherIconConfig,
  b: WidgetLauncherIconConfig,
): boolean {
  return (
    a.mode === b.mode &&
    a.lucideIcon === b.lucideIcon &&
    (a.customIconUrl ?? null) === (b.customIconUrl ?? null)
  );
}
