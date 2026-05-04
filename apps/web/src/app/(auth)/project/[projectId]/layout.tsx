/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type { ReactNode } from 'react';

import { ProjectLayoutView } from '@/components/projects/project-layout-view';

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
};

export default async function ProjectRouteLayout({ children, params }: LayoutProps) {
  const { projectId } = await params;
  return <ProjectLayoutView projectId={projectId}>{children}</ProjectLayoutView>;
}
