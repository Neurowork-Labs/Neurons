/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { ProjectSettingsView } from '@/components/project-settings/project-settings-view';

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectSettingsPage({ params }: PageProps) {
  const { projectId } = await params;
  return <ProjectSettingsView projectId={projectId} />;
}
