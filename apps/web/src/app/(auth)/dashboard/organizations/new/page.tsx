/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import Link from 'next/link';

import { DashboardWithSidebarLayout } from '@/components/dashboard/dashboard-with-sidebar-layout';

export default function NewOrganizationPage() {
  return (
    <DashboardWithSidebarLayout>
      <main className="min-h-screen bg-[#f3f3f3] px-4 py-10 font-dm-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
        <div className="mx-auto max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-2xl font-semibold tracking-tight">New organization</h1>
          <p className="mt-3 text-neutral-600 dark:text-neutral-400">
            Organization creation will be implemented next. For now, return to the dashboard
            to view existing organizations.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block text-sm font-medium text-orange-500 hover:text-orange-600"
          >
            ← Back to Organizations
          </Link>
        </div>
      </main>
    </DashboardWithSidebarLayout>
  );
}
