import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TierSelect } from './TierSelect';

export function FilterBar({ tier, tag, search }: { tier?: number; tag?: string; search?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <TierSelect defaultValue={tier ? String(tier) : 'all'} />
      <form method="get" className="flex flex-wrap items-center gap-2">
        {tier && <input type="hidden" name="tier" value={tier} />}
        <Input name="tag" defaultValue={tag ?? ''} placeholder="태그 (예: GLP-1)" className="w-[180px]" />
        <Input name="search" defaultValue={search ?? ''} placeholder="검색어" className="w-[200px]" />
        <Button type="submit">조회</Button>
      </form>
    </div>
  );
}
