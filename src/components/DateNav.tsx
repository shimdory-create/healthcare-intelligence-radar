'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DateNav({
  currentDate,
  latestDate,
  isAllTime,
}: {
  currentDate: string;
  latestDate: string;
  isAllTime: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigateToDate(date: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!date || date === latestDate) {
      params.delete('date');
    } else {
      params.set('date', date);
    }
    params.delete('page');
    router.push(`/?${params.toString()}`);
  }

  function navigateAllTime() {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', 'all-time');
    params.delete('page');
    router.push(`/?${params.toString()}`);
  }

  if (isAllTime) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">전체 기간</span>
        <Button type="button" variant="outline" size="sm" onClick={() => navigateToDate(null)}>
          최신으로
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" size="sm" onClick={() => navigateToDate(addDays(currentDate, -1))}>
        ◀
      </Button>
      <input
        type="date"
        value={currentDate}
        max={latestDate}
        onChange={(e) => e.target.value && navigateToDate(e.target.value)}
        className="border-input h-8 rounded-lg border bg-transparent px-2 text-sm"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={currentDate >= latestDate}
        onClick={() => navigateToDate(addDays(currentDate, 1))}
      >
        ▶
      </Button>
      {currentDate !== latestDate && (
        <Button type="button" variant="secondary" size="sm" onClick={() => navigateToDate(null)}>
          최신
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={navigateAllTime}>
        전체 기간
      </Button>
    </div>
  );
}
