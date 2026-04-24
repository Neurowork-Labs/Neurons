/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type ProjectPageContextValue = {
  projectTitle: string;
  statusName: string;
  domain: string | null;
  isDomainVerified: boolean;
  agentsConnectedCount: number;
  totalExecutionsCount: number;
  planSupportTypeLabel: string;
};

const ProjectPageContext = createContext<ProjectPageContextValue | null>(null);

export function ProjectPageProvider({
  projectTitle,
  statusName,
  domain,
  isDomainVerified,
  agentsConnectedCount,
  totalExecutionsCount,
  planSupportTypeLabel,
  children,
}: {
  projectTitle: string;
  statusName: string;
  domain: string | null;
  isDomainVerified: boolean;
  agentsConnectedCount: number;
  totalExecutionsCount: number;
  planSupportTypeLabel: string;
  children: ReactNode;
}) {
  return (
    <ProjectPageContext.Provider
      value={{
        projectTitle,
        statusName,
        domain,
        isDomainVerified,
        agentsConnectedCount,
        totalExecutionsCount,
        planSupportTypeLabel,
      }}
    >
      {children}
    </ProjectPageContext.Provider>
  );
}

export function useProjectPageMeta(): ProjectPageContextValue {
  const v = useContext(ProjectPageContext);
  if (v == null) {
    throw new Error('useProjectPageMeta must be used within a project route layout.');
  }
  return v;
}
