import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FilterSelect, type FilterSelectGroup } from './FilterSelect';
import { DateNav } from './DateNav';
import { SOURCES } from '@/lib/sources.config';
import { TAGS } from '@/lib/tags.config';
import type { AvailableFacets } from '@/lib/db';

const PRIORITY_OPTIONS = [
  { value: 'high', label: '🔴 높음' },
  { value: 'medium', label: '🟡 보통' },
  { value: 'low', label: '⚪ 참고' },
];

const TIER_OPTIONS = [
  { value: '1', label: 'Tier 1 (공공기관)' },
  { value: '2', label: 'Tier 2 (종합/경제지)' },
  { value: '3', label: 'Tier 3 (전문지)' },
];

const TIER_GROUP_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Tier 1 · 공공기관',
  2: 'Tier 2 · 종합/경제지',
  3: 'Tier 3 · 전문지',
};

/** keeps only options whose value is in `available` -- hides dropdown choices that would return zero
 *  results. The currently selected value is always kept even if it isn't in `available`, so a filter
 *  combination that zeroes out its own selection still shows what's selected instead of silently
 *  reverting to "all". */
function filterGroups(groups: FilterSelectGroup[], available: Set<string>, currentValue?: string): FilterSelectGroup[] {
  return groups
    .map((g) => ({ ...g, options: g.options.filter((o) => available.has(o.value) || o.value === currentValue) }))
    .filter((g) => g.options.length > 0);
}

export function FilterBar({
  tier,
  priority,
  sourceId,
  currentDate,
  latestDate,
  isAllTime,
  tag,
  search,
  facets,
}: {
  tier?: number;
  priority?: string;
  sourceId?: string;
  currentDate: string;
  latestDate: string;
  isAllTime: boolean;
  tag?: string;
  search?: string;
  facets: AvailableFacets;
}) {
  const priorityGroups = filterGroups([{ options: PRIORITY_OPTIONS }], new Set(facets.priorities), priority);
  const tierGroups = filterGroups([{ options: TIER_OPTIONS }], new Set(facets.tiers.map(String)), tier ? String(tier) : undefined);
  const sourceGroups = filterGroups(
    ([1, 2, 3] as const).map((t) => ({
      label: TIER_GROUP_LABELS[t],
      options: SOURCES.filter((s) => s.tier === t).map((s) => ({ value: s.id, label: s.name })),
    })),
    new Set(facets.sourceIds),
    sourceId,
  );
  const tagGroups = filterGroups([{ options: TAGS.map((t) => ({ value: t.tag, label: t.tag })) }], new Set(facets.tags), tag);

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">수집일</span>
        <DateNav currentDate={currentDate} latestDate={latestDate} isAllTime={isAllTime} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect paramName="priority" currentValue={priority} allLabel="전체 우선순위" groups={priorityGroups} className="w-[160px]" />
        <FilterSelect paramName="tier" currentValue={tier ? String(tier) : undefined} allLabel="전체 티어" groups={tierGroups} className="w-[170px]" />
        <FilterSelect paramName="sourceId" currentValue={sourceId} allLabel="전체 출처" groups={sourceGroups} className="w-[190px]" />
        <FilterSelect paramName="tag" currentValue={tag} allLabel="전체 태그" groups={tagGroups} className="w-[160px]" />
      </div>
      <form method="get" className="flex flex-wrap items-center gap-2">
        {!isAllTime && currentDate !== latestDate && <input type="hidden" name="date" value={currentDate} />}
        {isAllTime && <input type="hidden" name="date" value="all-time" />}
        {tier && <input type="hidden" name="tier" value={tier} />}
        {priority && <input type="hidden" name="priority" value={priority} />}
        {sourceId && <input type="hidden" name="sourceId" value={sourceId} />}
        {tag && <input type="hidden" name="tag" value={tag} />}
        <Input name="search" defaultValue={search ?? ''} placeholder="검색어 (제목·본문)" className="w-[200px]" />
        <Button type="submit">조회</Button>
      </form>
      <p className="text-muted-foreground text-xs">
        추출 기준: 키워드에 매칭된 기사에 태그와 우선순위를 부여합니다 (공공기관 자료는 매칭 여부와 무관하게 모두 수집). 정렬
        기준: 우선순위 높은 순 → 최신순. 검색은 제목과 본문을 함께 찾습니다.
      </p>
    </div>
  );
}
