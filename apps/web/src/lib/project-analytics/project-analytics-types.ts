export type ProjectAnalyticsConnectedAgentOption = {
  projectAgentId: string;
  displayName: string;
};

export type ProjectAnalyticsFiltersApiResult =
  | {
      ok: true;
      connectedAgents: ProjectAnalyticsConnectedAgentOption[];
    }
  | {
      ok: false;
      message: string;
      code?: 'FORBIDDEN' | 'NOT_FOUND';
    };

export type ProjectAnalyticsVisitorLocation = {
  latitude: number;
  longitude: number;
  country: string | null;
  state: string | null;
  city: string | null;
} | null;

export type ProjectAnalyticsVisitorRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  location: ProjectAnalyticsVisitorLocation;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
};

export type ProjectAnalyticsVisitorsApiResult =
  | {
      ok: true;
      visitors: ProjectAnalyticsVisitorRow[];
    }
  | {
      ok: false;
      message: string;
      code?: 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST';
    };

export type ProjectAnalyticsConversationMessage = {
  id: string;
  role: 'visitor' | 'agent' | 'system';
  content: string;
  createdAt: string | null;
  suggestions: string[];
};

export type ProjectAnalyticsVisitorConversationApiResult =
  | {
      ok: true;
      conversationId: string;
      messages: ProjectAnalyticsConversationMessage[];
    }
  | {
      ok: false;
      message: string;
      code?: 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST';
    };
