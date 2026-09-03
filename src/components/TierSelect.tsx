'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TIER_LABELS: Record<string, string> = {
  all: '전체 티어',
  '1': 'Tier 1 (공공기관)',
  '2': 'Tier 2 (종합/경제지)',
  '3': 'Tier 3 (전문지)',
};

export function TierSelect({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === 'all') {
      params.delete('tier');
    } else {
      params.set('tier', value);
    }
    params.delete('page'); // changing the filter resets pagination
    router.push(`/?${params.toString()}`);
  }

  return (
    <Select value={defaultValue} onValueChange={handleChange}>
      <SelectTrigger className="w-[170px]">
        <SelectValue placeholder="전체 티어">{TIER_LABELS[defaultValue]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">전체 티어</SelectItem>
        <SelectItem value="1">Tier 1 (공공기관)</SelectItem>
        <SelectItem value="2">Tier 2 (종합/경제지)</SelectItem>
        <SelectItem value="3">Tier 3 (전문지)</SelectItem>
      </SelectContent>
    </Select>
  );
}
