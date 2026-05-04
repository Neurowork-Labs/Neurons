/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { OrganizationProjectsDashboardView } from '@/components/dashboard/organization-projects-dashboard-view';

type PageProps = {
  params: Promise<{ organizationId: string }>;
};

export default async function OrganizationProjectsPage({ params }: PageProps) {
  const { organizationId } = await params;
  return <OrganizationProjectsDashboardView organizationId={organizationId} />;
}
