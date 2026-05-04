/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { ProjectStorageView } from '@/components/storage/project-storage-view';

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectStoragePage({ params }: PageProps) {
  const { projectId } = await params;
  return <ProjectStorageView projectId={projectId} />;
}
