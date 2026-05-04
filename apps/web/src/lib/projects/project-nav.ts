/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Blocks,
  Box,
  Cloud,
  Database,
  FileText,
  House,
  KeyRound,
  Lightbulb,
  List,
  Network,
  Settings,
  Workflow,
} from 'lucide-react';

export type ProjectSidebarLinkItem = {
  type: 'link';
  label: string;
  href: string;
  Icon: LucideIcon;
};

export type ProjectSidebarDividerItem = {
  type: 'divider';
};

export type ProjectSidebarEntry = ProjectSidebarLinkItem | ProjectSidebarDividerItem;

export function getProjectSidebarEntries(projectId: string): ProjectSidebarEntry[] {
  const base = `/project/${encodeURIComponent(projectId)}`;
  return [
    { type: 'link', label: 'Project Overview', href: base, Icon: House },
    { type: 'link', label: 'Agents Cloud', href: `${base}/cloud-agents`, Icon: Cloud },
    { type: 'divider' },
    {
      type: 'link',
      label: 'Connected Agents',
      href: `${base}/connected-agents`,
      Icon: Network,
    },
    { type: 'link', label: 'Agent Flow', href: `${base}/agent-flow`, Icon: Workflow },
    { type: 'link', label: 'Database', href: `${base}/database`, Icon: Database },
    { type: 'link', label: 'Storage', href: `${base}/storage`, Icon: Box },
    { type: 'link', label: 'API Keys', href: `${base}/api-keys`, Icon: KeyRound },
    { type: 'divider' },
    { type: 'link', label: 'Analytics', href: `${base}/analytics`, Icon: BarChart3 },
    { type: 'divider' },
    { type: 'link', label: 'Logs', href: `${base}/logs`, Icon: List },
    { type: 'link', label: 'API Docs', href: `${base}/api-docs`, Icon: FileText },
    { type: 'link', label: 'Integrations', href: `${base}/integrations`, Icon: Blocks },
    { type: 'link', label: 'Advisors', href: `${base}/advisors`, Icon: Lightbulb },
    { type: 'divider' },
    {
      type: 'link',
      label: 'Project Settings',
      href: `${base}/settings`,
      Icon: Settings,
    },
  ];
}
