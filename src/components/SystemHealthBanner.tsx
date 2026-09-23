import Link from 'next/link';
import type { SystemHealthIssue } from '@/lib/systemHealth';

/** renders nothing when there are no issues -- deliberately quiet by default so it never adds
 *  noise to a normal day. Only appears at all when something actually needs attention, which
 *  is the whole point: a glance at the dashboard should be enough to tell if the unattended
 *  pipeline is still healthy, without needing to check /monitoring proactively. */
export function SystemHealthBanner({ issues }: { issues: SystemHealthIssue[] }) {
  if (issues.length === 0) return null;

  const hasCritical = issues.some((i) => i.severity === 'critical');

  return (
    <div
      className={
        hasCritical
          ? 'mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm dark:border-red-800 dark:bg-red-950'
          : 'mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950'
      }
    >
      <p className={hasCritical ? 'font-semibold text-red-800 dark:text-red-200' : 'font-semibold text-amber-800 dark:text-amber-200'}>
        ⚠️ 시스템 상태 확인 필요
      </p>
      <ul className="mt-1 list-inside list-disc space-y-0.5 text-red-700 dark:text-red-300">
        {issues.map((issue, i) => (
          <li key={i} className={issue.severity === 'warning' ? 'text-amber-700 dark:text-amber-300' : undefined}>
            {issue.message}
          </li>
        ))}
      </ul>
      <Link href="/monitoring" className="mt-2 inline-block text-xs underline">
        자세히 보기 →
      </Link>
    </div>
  );
}
