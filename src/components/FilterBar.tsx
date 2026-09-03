import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FilterSelect } from './FilterSelect';
import { DateNav } from './DateNav';
import { SOURCES } from '@/lib/sources.config';

const TIER_GROUPS = [
  {
    options: [
      { value: '1', label: 'Tier 1 (공공기관)' },
      { value: '2', label: 'Tier 2 (종합/경제지)' },
      { value: '3', label: 'Tier 3 (전문지)' },
    ],
  },
];

const PRIORITY_GROUPS = [
  {
    options: [
      { value: 'high', label: '🔴 높음' },
      { value: 'medium', label: '🟡 보통' },
      { value: 'low', label: '⚪ 참고' },
      { value: 'all', label: '전체 (참고 포함)' },
    ],
  },
];

const TIER_GROUP_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Tier 1 · 공공기관',
  2: 'Tier 2 · 종합/경제지',
  3: 'Tier 3 · 전문지',
};

const SOURCE_GROUPS = ([1, 2, 3] as const).map((tier) => ({
  label: TIER_GROUP_LABELS[tier],
  options: SOURCES.filter((s) => s.tier === tier).map((s) => ({ value: s.id, label: s.name })),
}));

export function FilterBar({
  tier,
  priority,
  sourceId,
  currentDate,
  latestDate,
  isAllTime,
  tag,
  search,
}: {
  tier?: number;
  priority?: string;
  sourceId?: string;
  currentDate: string;
  latestDate: string;
  isAllTime: boolean;
  tag?: string;
  search?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">수집일</span>
        <DateNav currentDate={currentDate} latestDate={latestDate} isAllTime={isAllTime} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect paramName="tier" currentValue={tier ? String(tier) : undefined} allLabel="전체 티어" groups={TIER_GROUPS} className="w-[170px]" />
        <FilterSelect paramName="priority" currentValue={priority} allLabel="참고 제외 (기본)" groups={PRIORITY_GROUPS} className="w-[160px]" />
        <FilterSelect paramName="sourceId" currentValue={sourceId} allLabel="전체 출처" groups={SOURCE_GROUPS} className="w-[190px]" />
        <form method="get" className="flex flex-wrap items-center gap-2">
          {!isAllTime && currentDate !== latestDate && <input type="hidden" name="date" value={currentDate} />}
          {isAllTime && <input type="hidden" name="date" value="all-time" />}
          {tier && <input type="hidden" name="tier" value={tier} />}
          {priority && <input type="hidden" name="priority" value={priority} />}
          {sourceId && <input type="hidden" name="sourceId" value={sourceId} />}
          <Input name="tag" defaultValue={tag ?? ''} placeholder="태그 (예: GLP-1)" className="w-[180px]" />
          <Input name="search" defaultValue={search ?? ''} placeholder="검색어" className="w-[200px]" />
          <Button type="submit">조회</Button>
        </form>
      </div>
    </div>
  );
}
