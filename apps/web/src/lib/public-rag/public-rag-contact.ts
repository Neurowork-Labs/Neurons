/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

import {
  normalizeWidgetRequiredContactFields,
  wasLocationPermissionRequested,
} from '@/lib/connected-agents/widget-contact-fields-config';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type PublicRagContactBody = {
  projectAgentId: string;
  visitorId: string;
  contact?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  metadata?: unknown;
};

export type PublicRagContactResult =
  | { ok: true; visitorId: string }
  | { ok: false; message: string; code?: 'BAD_REQUEST' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d\s().-]{7,20}$/;

async function ensureVisitorContact(
  projectId: string,
  visitorId: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: existing, error: findErr } = await supabase
    .from('visitor_contacts')
    .select('id')
    .eq('project_id', projectId)
    .contains('extracted_data', { ae_visitor_id: visitorId })
    .maybeSingle();
  if (findErr) return { ok: false, message: findErr.message };
  if (existing?.id) return { ok: true, id: String(existing.id) };

  const { data: created, error: insErr } = await supabase
    .from('visitor_contacts')
    .insert({
      project_id: projectId,
      extracted_data: { ae_visitor_id: visitorId },
    })
    .select('id')
    .single();
  if (insErr) return { ok: false, message: insErr.message };
  return { ok: true, id: String(created!.id) };
}

function normalizeContactValue(value: unknown): string | null {
  const v = String(value ?? '').trim();
  return v ? v : null;
}

function sanitizeMetadata(raw: unknown): Record<string, unknown> {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const browserName = normalizeContactValue(input.browser_name);
  const osName = normalizeContactValue(input.operating_system_name);
  const locationRaw = input.location;

  let location: { latitude: number | string; longitude: number | string } | null = null;
  if (locationRaw && typeof locationRaw === 'object' && !Array.isArray(locationRaw)) {
    const rawLat = (locationRaw as Record<string, unknown>).latitude;
    const rawLng = (locationRaw as Record<string, unknown>).longitude;
    if (rawLat === 'blocked' && rawLng === 'blocked') {
      location = { latitude: 'blocked', longitude: 'blocked' };
    } else {
      const lat = Number(rawLat);
      const lng = Number(rawLng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        location = { latitude: lat, longitude: lng };
      }
    }
  }

  const out: Record<string, unknown> = {};
  if (browserName) out.browser_name = browserName;
  if (osName) out.operating_system_name = osName;
  if (location) out.location = location;
  if (input.location_permission_requested === true) {
    out.location_permission_requested = true;
  }
  out.source = 'rag_widget_contact_form';
  return out;
}

export async function capturePublicRagContact(
  ctx: { projectId: string },
  body: PublicRagContactBody,
): Promise<PublicRagContactResult> {
  const projectAgentId = String(body.projectAgentId ?? '').trim();
  const visitorId = String(body.visitorId ?? '').trim();
  if (!projectAgentId || !visitorId) {
    return { ok: false, message: 'Missing required fields.', code: 'BAD_REQUEST' };
  }

  const contactInput = body.contact ?? {};
  const name = normalizeContactValue(contactInput.name);
  const email = normalizeContactValue(contactInput.email)?.toLowerCase() ?? null;
  const phone = normalizeContactValue(contactInput.phone);
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, message: 'Invalid email format.', code: 'BAD_REQUEST' };
  }
  if (phone && !PHONE_RE.test(phone)) {
    return { ok: false, message: 'Invalid phone format.', code: 'BAD_REQUEST' };
  }

  const supabase = getSupabaseServiceRoleClient();
  const { data: pa, error: paErr } = await supabase
    .from('project_agents')
    .select('id')
    .eq('id', projectAgentId)
    .eq('project_id', ctx.projectId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (paErr) return { ok: false, message: paErr.message };
  if (!pa) return { ok: false, message: 'Invalid project agent.', code: 'BAD_REQUEST' };

  const { data: widgetCfg, error: widgetCfgErr } = await supabase
    .from('project_agent_widget_configs')
    .select('required_contact_fields')
    .eq('project_agent_id', projectAgentId)
    .maybeSingle();
  if (widgetCfgErr) return { ok: false, message: widgetCfgErr.message };

  const requiredFields = normalizeWidgetRequiredContactFields(
    widgetCfg?.required_contact_fields ?? null,
  );

  const ensured = await ensureVisitorContact(ctx.projectId, visitorId);
  if (!ensured.ok) return { ok: false, message: ensured.message };
  const visitorContactId = ensured.id;

  const { data: existing, error: existingErr } = await supabase
    .from('visitor_contacts')
    .select('metadata')
    .eq('id', visitorContactId)
    .maybeSingle();
  if (existingErr) return { ok: false, message: existingErr.message };

  const existingMeta =
    existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const sanitizedNew = sanitizeMetadata(body.metadata);
  const mergedForValidation = { ...existingMeta, ...sanitizedNew };

  const submittedValues: Record<string, string | null> = { name, email, phone };
  if (requiredFields.length > 0) {
    const missing = requiredFields.filter((f) => {
      if (f === 'location') return !wasLocationPermissionRequested(mergedForValidation);
      return !submittedValues[f]?.trim();
    });
    if (missing.length > 0) {
      return {
        ok: false,
        message: `Missing required contact fields: ${missing.join(', ')}.`,
        code: 'BAD_REQUEST',
      };
    }
  }

  const metadata = mergedForValidation;

  const updates: Record<string, unknown> = { metadata };
  if (name) updates.name = name;
  if (email) updates.email = email;
  if (phone) updates.phone = phone;

  const { error: updateErr } = await supabase
    .from('visitor_contacts')
    .update(updates)
    .eq('id', visitorContactId);
  if (updateErr) return { ok: false, message: updateErr.message };

  return { ok: true, visitorId };
}
