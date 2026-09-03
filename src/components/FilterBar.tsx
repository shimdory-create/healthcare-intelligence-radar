import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TierSelect } from './TierSelect';

export function FilterBar({ tier, tag, search }: { tier?: number; tag?: string; search?: string }) {
  return (
    <form method="get" className="mb-6 flex flex-wrap items-center gap-2">
      <TierSelect defaultValue={tier ? String(tier) : 'all'} />
      <Input name="tag" defaultValue={tag ?? ''} placeholder="태그 (예: GLP-1)" className="w-[180px]" />
      <Input name="search" defaultValue={search ?? ''} placeholder="검색어" className="w-[200px]" />
      <Button type="submit">필터 적용</Button>
    </form>
  );
}
