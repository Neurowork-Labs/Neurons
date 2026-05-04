/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { ProjectApiKeysView } from '@/components/project-api-keys/project-api-keys-view';

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectApiKeysPage({ params }: PageProps) {
  const { projectId } = await params;
  return <ProjectApiKeysView projectId={projectId} />;
}
