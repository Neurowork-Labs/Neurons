/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChartSpline, GripHorizontal, Info, Link, Plug } from 'lucide-react';

import { ProjectSnippetPanel } from '@/components/projects/project-snippet-panel';
import { projectDomainToOpenUrl } from '@/lib/projects/project-domain-url';
import {
  formatProjectStatusLabel,
  projectStatusTagClassName,
} from '@/lib/projects/project-status-label';
import { cn } from '@/lib/utils';

function ProjectOverviewMetricBlock(
  props:
    | {
        variant: 'domain';
        domainVerified: boolean;
        ariaLabel: string;
      }
    | {
        variant: 'neutralMetric';
        Icon: LucideIcon;
        label: string;
        value: string | number;
        ariaLabel: string;
      },
) {
  if (props.variant === 'domain') {
    const { domainVerified, ariaLabel } = props;
    return (
      <div className="flex items-center gap-3" role="status" aria-label={ariaLabel}>
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-200 dark:bg-neutral-700"
          aria-hidden
        >
          <GripHorizontal
            className={cn(
              'h-8 w-8',
              domainVerified
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400',
            )}
            aria-hidden
          />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5 leading-snug">
          <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400 sm:text-xs">
            DOMAIN STATUS
          </span>
          <span className="text-sm font-semibold tracking-tight text-neutral-900 sm:text-base dark:text-neutral-100">
            {domainVerified ? 'Verified' : 'Not Verified'}
          </span>
        </div>
      </div>
    );
  }

  const { Icon, label, value, ariaLabel } = props;
  return (
    <div className="flex items-center gap-3" role="status" aria-label={ariaLabel}>
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-200 dark:bg-neutral-700"
        aria-hidden
      >
        <Icon
          className="h-6 w-6 text-neutral-600 dark:text-neutral-300"
          aria-hidden
        />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 leading-snug">
        <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400 sm:text-xs">
          {label}
        </span>
        <span
          className={cn(
            'text-sm font-semibold tracking-tight text-neutral-900 sm:text-base dark:text-neutral-100',
            typeof value === 'number' && 'tabular-nums',
          )}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

type ProjectTabShellProps = {
  title: string;
  /** Rendered inline at the end of the title row (e.g. info control next to the heading). */
  titleAccessory?: ReactNode;
  /** Tailwind gap class between title text and `titleAccessory` (default `gap-2`). */
  titleAccessoryGapClassName?: string;
  /** Optional line below the title (e.g. settings page subtitle). */
  subtitle?: string | null;
  /** When set, a colored status pill is shown to the right of the title (e.g. on Project Overview). */
  statusName?: string | null;
  /** Project domain line below the title (plug icon + domain). */
  domain?: string | null;
  /**
   * When set, shows a 2×2 metrics grid below the domain row (domain status, agents count, placeholders).
   */
  domainVerified?: boolean;
  /** Used with `domainVerified` for the agents-connected cell. Defaults to 0. */
  agentsConnectedCount?: number;
  /** Total `agent_executions` for this project. Defaults to 0. */
  totalExecutionsCount?: number;
  /** Organization plan support tier label (`support_types.name`). */
  planSupportTypeLabel?: string;
  /** Optional code block shown to the right of the title/domain on large screens. */
  snippetText?: string | null;
  /**
   * When true, children are not wrapped in the default muted small-text container
   * (use for full-width tab tooling and grids).
   */
  fullWidthTabContent?: boolean;
  /**
   * When true, main top padding matches the organization Projects page (`pt-8 sm:pt-10`)
   * instead of the default project tab offset (`sm:pt-40`).
   */
  matchOrganizationMainPadding?: boolean;
  children?: ReactNode;
};

export function ProjectTabShell({
  title,
  titleAccessory,
  titleAccessoryGapClassName,
  subtitle,
  statusName,
  domain,
  domainVerified,
  agentsConnectedCount = 0,
  totalExecutionsCount = 0,
  planSupportTypeLabel = '—',
  snippetText,
  fullWidthTabContent = false,
  matchOrganizationMainPadding = false,
  children,
}: ProjectTabShellProps) {
  const showStatus =
    statusName != null &&
    String(statusName).trim() !== '' &&
    String(statusName).trim() !== '—';

  const domainTrimmed = domain != null ? String(domain).trim() : '';
  const showDomain = domainTrimmed.length > 0;

  const snippetTrimmed = snippetText != null ? String(snippetText) : '';
  const showSnippet = snippetTrimmed.length > 0;

  const subtitleTrimmed = subtitle != null ? String(subtitle).trim() : '';
  const showSubtitle = subtitleTrimmed.length > 0;

  const supportDisplay =
    planSupportTypeLabel != null && String(planSupportTypeLabel).trim() !== ''
      ? String(planSupportTypeLabel).trim()
      : '—';

  return (
    <main
      className={cn(
        'mx-auto w-full max-w-[90rem] flex-1 px-4 pb-6 pt-8 sm:px-6',
        matchOrganizationMainPadding ? 'sm:pt-10' : 'sm:pt-40',
      )}
    >
      <div
        className={
          showSnippet
            ? 'flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10'
            : undefined
        }
      >
        <div className="min-w-0 flex-1">
          <div className="inline-flex max-w-full flex-wrap items-center gap-2 sm:gap-3">
            <h1
              className={cn(
                'flex min-w-0 max-w-[min(100%,42rem)] items-center text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl',
                titleAccessory != null ? titleAccessoryGapClassName ?? 'gap-2' : undefined,
              )}
            >
              <span className="min-w-0 truncate">{title}</span>
              {titleAccessory != null ? (
                <span className="inline-flex shrink-0 items-center">{titleAccessory}</span>
              ) : null}
            </h1>
            {showStatus ? (
              <span
                className={projectStatusTagClassName(statusName)}
                title={formatProjectStatusLabel(statusName)}
              >
                {formatProjectStatusLabel(statusName)}
              </span>
            ) : null}
          </div>
          {showSubtitle ? (
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{subtitleTrimmed}</p>
          ) : null}
          {showDomain ? (
            <div
              className="mt-2 flex max-w-full items-center gap-2"
              aria-label="Project domain"
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-200 dark:bg-neutral-700"
                aria-hidden
              >
                <Plug className="h-4 w-4 rotate-90 text-neutral-600 dark:text-neutral-300" aria-hidden />
              </span>
              <a
                href={projectDomainToOpenUrl(domainTrimmed)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-base font-medium text-neutral-800 underline-offset-2 transition hover:text-orange-600 hover:underline dark:text-neutral-200 dark:hover:text-orange-400"
              >
                {domainTrimmed}
              </a>
            </div>
          ) : null}
          {typeof domainVerified === 'boolean' ? (
            <div
              className="mt-10 grid grid-cols-1 gap-x-10 gap-y-10 sm:mt-20 sm:grid-cols-2"
              aria-label="Project overview metrics"
            >
              <ProjectOverviewMetricBlock
                variant="domain"
                domainVerified={domainVerified}
                ariaLabel={
                  domainVerified
                    ? 'Domain status: verified'
                    : 'Domain status: not verified'
                }
              />
              <ProjectOverviewMetricBlock
                variant="neutralMetric"
                Icon={Link}
                label="AGENTS CONNECTED"
                value={agentsConnectedCount}
                ariaLabel={`${agentsConnectedCount} agents connected to this project`}
              />
              <ProjectOverviewMetricBlock
                variant="neutralMetric"
                Icon={ChartSpline}
                label="TOTAL EXECUTIONS"
                value={totalExecutionsCount}
                ariaLabel={`${totalExecutionsCount} total agent executions for this project`}
              />
              <ProjectOverviewMetricBlock
                variant="neutralMetric"
                Icon={Info}
                label="SUPPORT"
                value={supportDisplay}
                ariaLabel={`Support tier: ${supportDisplay}`}
              />
            </div>
          ) : null}
        </div>
        {showSnippet ? (
          <ProjectSnippetPanel content={snippetTrimmed} />
        ) : null}
      </div>
      {children != null ? (
        fullWidthTabContent ? (
          <div className="mt-6">{children}</div>
        ) : (
          <div className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">{children}</div>
        )
      ) : null}
    </main>
  );
}
