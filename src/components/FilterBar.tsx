export function FilterBar({ tier, tag, search }: { tier?: number; tag?: string; search?: string }) {
  return (
    <form method="get" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
      <select name="tier" defaultValue={tier ?? ''}>
        <option value="">전체 티어</option>
        <option value="1">Tier 1 (공공기관)</option>
        <option value="2">Tier 2 (종합/경제지)</option>
        <option value="3">Tier 3 (전문지)</option>
      </select>
      <input name="tag" defaultValue={tag ?? ''} placeholder="태그 (예: GLP-1)" />
      <input name="search" defaultValue={search ?? ''} placeholder="검색어" />
      <button type="submit">필터 적용</button>
    </form>
  );
}
