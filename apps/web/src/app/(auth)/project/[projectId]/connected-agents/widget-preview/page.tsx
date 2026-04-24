/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

import { ProjectConnectedAgentWidgetPreviewView } from '@/components/connected-agents/project-connected-agent-widget-preview-view';

type PageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ projectAgentId?: string }>;
};

export default async function ProjectConnectedAgentWidgetPreviewPage({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const { projectAgentId = '' } = await searchParams;
  return (
    <ProjectConnectedAgentWidgetPreviewView
      projectId={projectId}
      projectAgentId={String(projectAgentId ?? '')}
    />
  );
}
