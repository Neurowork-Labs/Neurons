/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { ProjectTabShell } from '@/components/projects/project-tab-shell';

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectAgentFlowPage({ params }: PageProps) {
  await params;
  return (
    <ProjectTabShell title="Agent Flow">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Define how agents connect and run in sequence for this project. More tools will appear here
        in a future update.
      </p>
    </ProjectTabShell>
  );
}
