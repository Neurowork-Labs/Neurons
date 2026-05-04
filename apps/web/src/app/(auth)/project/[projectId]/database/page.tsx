/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { ProjectTabShell } from '@/components/projects/project-tab-shell';
import { ProjectDatabaseView } from '@/components/project-database/project-database-view';

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectDatabasePage({ params }: PageProps) {
  const { projectId } = await params;
  return (
    <ProjectTabShell title="Database" fullWidthTabContent matchOrganizationMainPadding>
      <ProjectDatabaseView projectId={projectId} />
    </ProjectTabShell>
  );
}
