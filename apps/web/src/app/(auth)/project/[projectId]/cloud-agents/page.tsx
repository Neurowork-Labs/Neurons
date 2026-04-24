/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { ProjectCloudAgentsView } from '@/components/cloud-agents/project-cloud-agents-view';

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectCloudAgentsPage({ params }: PageProps) {
  const { projectId } = await params;
  return <ProjectCloudAgentsView projectId={projectId} />;
}
