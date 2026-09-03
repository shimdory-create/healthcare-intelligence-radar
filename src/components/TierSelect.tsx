'use client';

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TIER_LABELS: Record<string, string> = {
  all: '전체 티어',
  '1': 'Tier 1 (공공기관)',
  '2': 'Tier 2 (종합/경제지)',
  '3': 'Tier 3 (전문지)',
};

export function TierSelect({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <input type="hidden" name="tier" value={value === 'all' ? '' : value} />
      <Select value={value} onValueChange={(v) => setValue(v as string)}>
        <SelectTrigger className="w-[170px]">
          <SelectValue placeholder="전체 티어">{TIER_LABELS[value]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체 티어</SelectItem>
          <SelectItem value="1">Tier 1 (공공기관)</SelectItem>
          <SelectItem value="2">Tier 2 (종합/경제지)</SelectItem>
          <SelectItem value="3">Tier 3 (전문지)</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}
