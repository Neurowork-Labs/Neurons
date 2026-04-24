import type {
  ProjectAnalyticsVisitorLocation,
  ProjectAnalyticsVisitorsApiResult,
} from '@/lib/project-analytics/project-analytics-types';
import {
  batchReverseGeocode,
  makeCoordKey,
} from '@/lib/project-analytics/reverse-geocode';
import { listProjectConnectedAgentsCatalogForCurrentUser } from '@/lib/projects/list-project-connected-agents-catalog';
import { getSupabaseServerClient } from '@/lib/supabase/server';

type ConversationVisitorRow = {
  id: string;
  visitor_contact_id: string | null;
};

type VisitorContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  metadata: unknown | null;
  created_at: string | null;
};

type MessageRow = {
  conversation_id: string;
  role: string;
  created_at: string | null;
};

function extractLocation(metadata: unknown): { latitude: number; longitude: number } | null {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const loc = (metadata as Record<string, unknown>).location;
  if (loc == null || typeof loc !== 'object' || Array.isArray(loc)) return null;

  const raw = loc as Record<string, unknown>;
  if (raw.latitude === 'blocked' || raw.longitude === 'blocked') return null;

  const lat = Number(raw.latitude);
  const lng = Number(raw.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { latitude: lat, longitude: lng };
}

export async function listProjectAnalyticsVisitorsForCurrentUser(input: {
  projectId: string;
  projectAgentId: string;
}): Promise<ProjectAnalyticsVisitorsApiResult> {
  const projectId = String(input.projectId ?? '').trim();
  const projectAgentId = String(input.projectAgentId ?? '').trim();

  if (!projectId || !projectAgentId) {
    return { ok: false, message: 'Missing project agent id.', code: 'BAD_REQUEST' };
  }

  const catalog = await listProjectConnectedAgentsCatalogForCurrentUser(projectId);
  if (!catalog.ok) return catalog;

  const selectedAgent = catalog.agents.find((agent) => agent.projectAgentId === projectAgentId);
  if (!selectedAgent) {
    return { ok: false, message: 'Connected agent not found in this project.', code: 'NOT_FOUND' };
  }

  const supabase = await getSupabaseServerClient();

  const { data: visitorRows, error: visitorError } = await supabase
    .from('visitor_contacts')
    .select('id, name, email, phone, metadata, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (visitorError) {
    return { ok: false, message: visitorError.message };
  }

  if (!visitorRows || visitorRows.length === 0) {
    return { ok: true, visitors: [] };
  }

  const { data: conversationRows, error: conversationError } = await supabase
    .from('conversations')
    .select('id, visitor_contact_id')
    .eq('project_agent_id', projectAgentId)
    .order('created_at', { ascending: false });

  if (conversationError) {
    return { ok: false, message: conversationError.message };
  }

  const conversationIds = (conversationRows ?? [])
    .map((row) => (row as ConversationVisitorRow).id)
    .filter((id): id is string => Boolean(id));

  const firstByVisitor = new Map<string, string | null>();
  const lastByVisitor = new Map<string, string | null>();

  if (conversationIds.length > 0) {
    const { data: messageRows, error: messageError } = await supabase
      .from('messages')
      .select('conversation_id, role, created_at')
      .in('conversation_id', conversationIds)
      .eq('role', 'visitor')
      .order('created_at', { ascending: true });

    if (messageError) {
      return { ok: false, message: messageError.message };
    }

    const conversationById = new Map(
      (conversationRows ?? []).map((row) => {
        const typed = row as ConversationVisitorRow;
        return [typed.id, typed.visitor_contact_id];
      }),
    );

    for (const row of messageRows ?? []) {
      const message = row as MessageRow;
      const visitorId = conversationById.get(message.conversation_id);
      if (!visitorId) continue;

      if (!firstByVisitor.has(visitorId)) {
        firstByVisitor.set(visitorId, message.created_at);
      }
      lastByVisitor.set(visitorId, message.created_at);
    }
  }

  const coordPairs: { latitude: number; longitude: number }[] = [];
  const visitorCoords = new Map<string, { latitude: number; longitude: number }>();

  for (const row of visitorRows) {
    const visitor = row as VisitorContactRow;
    const coords = extractLocation(visitor.metadata);
    if (coords) {
      visitorCoords.set(visitor.id, coords);
      coordPairs.push(coords);
    }
  }

  const geocoded = coordPairs.length > 0
    ? await batchReverseGeocode(coordPairs)
    : new Map();

  return {
    ok: true,
    visitors: (visitorRows ?? []).map((row) => {
      const visitor = row as VisitorContactRow;
      const coords = visitorCoords.get(visitor.id);
      let location: ProjectAnalyticsVisitorLocation = null;

      if (coords) {
        const key = makeCoordKey(coords.latitude, coords.longitude);
        const geo = geocoded.get(key);
        location = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          country: geo?.country ?? null,
          state: geo?.state ?? null,
          city: geo?.city ?? null,
        };
      }

      return {
        id: visitor.id,
        name: visitor.name,
        email: visitor.email,
        phone: visitor.phone,
        location,
        firstMessageAt: firstByVisitor.get(visitor.id) ?? null,
        lastMessageAt: lastByVisitor.get(visitor.id) ?? null,
      };
    }),
  };
}
