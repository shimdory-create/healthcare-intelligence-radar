'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** noon avoids DST/boundary edge cases when converting a bare calendar date to a Date */
function toDateObj(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00+09:00`);
}

/** 'en-CA' formats as YYYY-MM-DD; forcing the KST timezone keeps this aligned with our KST calendar dates */
function toDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function monthKey(d: Date): string {
  return toDateStr(d).slice(0, 7);
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
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => toDateObj(currentDate));
  const [availableByMonth, setAvailableByMonth] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    setMonth(toDateObj(currentDate));
  }, [currentDate]);

  useEffect(() => {
    const key = monthKey(month);
    if (availableByMonth[key]) return;
    let cancelled = false;
    fetch(`/api/collection-dates?month=${key}`)
      .then((res) => res.json())
      .then((data: { dates: string[] }) => {
        if (cancelled) return;
        setAvailableByMonth((prev) => ({ ...prev, [key]: new Set(data.dates) }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [month, availableByMonth]);

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

  const availableSet = availableByMonth[monthKey(month)];

  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" size="sm" onClick={() => navigateToDate(addDays(currentDate, -1))}>
        ◀
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button type="button" variant="outline" size="sm" className="w-[150px] justify-center font-normal">
              {toDateObj(currentDate).toLocaleDateString('ko-KR', {
                timeZone: 'Asia/Seoul',
                month: 'long',
                day: 'numeric',
                weekday: 'short',
              })}
            </Button>
          }
        />
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            showOutsideDays={false}
            selected={toDateObj(currentDate)}
            month={month}
            onMonthChange={setMonth}
            disabled={(date) => {
              const ds = toDateStr(date);
              if (ds > latestDate) return true;
              if (!availableSet) return false; // month not loaded yet -- don't block interaction
              return !availableSet.has(ds);
            }}
            modifiers={{ hasData: (date) => availableSet?.has(toDateStr(date)) ?? false }}
            modifiersClassNames={{ hasData: 'font-bold text-primary' }}
            onSelect={(date) => {
              if (!date) return;
              navigateToDate(toDateStr(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
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
