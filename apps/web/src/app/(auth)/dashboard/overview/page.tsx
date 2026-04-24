/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import { DashboardWithSidebarLayout } from '@/components/dashboard/dashboard-with-sidebar-layout';

export default function DashboardOverviewPage() {
  return (
    <DashboardWithSidebarLayout>
      <div className="p-6 sm:p-8">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Overview content will live here. Use the sidebar to open Organizations or other
            sections.
          </p>
        </div>
      </div>
    </DashboardWithSidebarLayout>
  );
}
