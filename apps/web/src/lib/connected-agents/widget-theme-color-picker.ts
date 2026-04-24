/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

import { normalizeWidgetThemeColor } from '@/lib/connected-agents/widget-theme-color-config';

export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

function clamp8(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function rgbColorToHex(color: RgbColor): string {
  const toHex = (value: number) => clamp8(value).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

export function hexToRgbColor(raw: unknown): RgbColor | null {
  const normalized = normalizeWidgetThemeColor(raw);
  if (!normalized) return null;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  if ([r, g, b].some((v) => !Number.isFinite(v))) return null;
  return { r, g, b };
}
