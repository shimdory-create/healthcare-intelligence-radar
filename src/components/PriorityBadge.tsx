import { Badge } from '@/components/ui/badge';
import type { PriorityBand } from '@/lib/priority';

export function PriorityBadge({ priority, aiJudged }: { priority: PriorityBand; aiJudged: boolean }) {
  const title = aiJudged ? 'AI 판정' : '키워드 기반 (AI 미분석)';
  if (priority === 'high') {
    return (
      <Badge variant="destructive" title={title}>
        🔴 높음
      </Badge>
    );
  }
  if (priority === 'medium') {
    return (
      <Badge
        variant="outline"
        title={title}
        className="border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        🟡 보통
      </Badge>
    );
  }
  return (
    <Badge variant="outline" title={title}>
      ⚪ 참고
    </Badge>
  );
}
