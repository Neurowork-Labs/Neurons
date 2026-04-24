/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { ProjectConnectedAgentsView } from '@/components/connected-agents/project-connected-agents-view';

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectConnectedAgentsPage({ params }: PageProps) {
  const { projectId } = await params;
  return <ProjectConnectedAgentsView projectId={projectId} />;
}
