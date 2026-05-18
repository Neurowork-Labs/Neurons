/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type { ReactNode } from 'react';

import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';

type DashboardWithSidebarLayoutProps = {
  /** Full-width bar above the sidebar + main row. Omit when the page has no top bar. */
  header?: ReactNode;
  children: ReactNode;
};

/**
 * Top bar spans the full viewport width. Below it, the sidebar sits in a layer that
 * overlays the main area when expanded (main width does not shrink).
 */
export function DashboardWithSidebarLayout({
  header,
  children,
}: DashboardWithSidebarLayoutProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f3f3f3] font-plus-jakarta-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      {header != null ? (
        <div className="relative z-40 w-full shrink-0">{header}</div>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        <DashboardSidebar />
        {/* `pl-14` must match collapsed sidebar width (`w-14`) in `dashboard-sidebar.tsx`. */}
        <div className="min-h-0 min-w-0 flex-1 overflow-auto pl-14">
          {children}
        </div>
      </div>
    </div>
  );
}
