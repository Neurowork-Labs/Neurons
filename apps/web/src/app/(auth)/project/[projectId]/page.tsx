/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

'use client';

import { useProjectPageMeta } from '@/components/projects/project-page-context';
import { ProjectTabShell } from '@/components/projects/project-tab-shell';
import { PROJECT_OVERVIEW_SNIPPET_PLACEHOLDER } from '@/lib/projects/project-overview-snippet-placeholder';

export default function ProjectOverviewPage() {
  const {
    projectTitle,
    statusName,
    domain,
    isDomainVerified,
    agentsConnectedCount,
    totalExecutionsCount,
    planSupportTypeLabel,
  } = useProjectPageMeta();

  return (
    <ProjectTabShell
      title={projectTitle}
      statusName={statusName}
      domain={domain}
      domainVerified={isDomainVerified}
      agentsConnectedCount={agentsConnectedCount}
      totalExecutionsCount={totalExecutionsCount}
      planSupportTypeLabel={planSupportTypeLabel}
      snippetText={PROJECT_OVERVIEW_SNIPPET_PLACEHOLDER}
    />
  );
}
