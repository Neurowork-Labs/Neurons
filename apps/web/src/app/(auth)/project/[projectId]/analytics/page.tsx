/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { ProjectAnalyticsView } from '@/components/project-analytics/project-analytics-view';

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectAnalyticsPage({ params }: PageProps) {
  const { projectId } = await params;
  return <ProjectAnalyticsView projectId={projectId} />;
}
