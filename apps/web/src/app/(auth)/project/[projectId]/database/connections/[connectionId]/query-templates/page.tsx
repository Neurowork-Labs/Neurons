/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { ProjectQueryTemplatesView } from '@/components/project-database/project-query-templates-view';

type PageProps = {
  params: Promise<{ projectId: string; connectionId: string }>;
};

export default async function ProjectQueryTemplatesPage({ params }: PageProps) {
  const { projectId, connectionId } = await params;
  return <ProjectQueryTemplatesView projectId={projectId} connectionId={connectionId} />;
}
