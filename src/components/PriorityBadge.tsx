import { Badge } from '@/components/ui/badge';

export function PriorityBadge({ score }: { score: number }) {
  if (score >= 3) {
    return (
      <Badge variant="destructive" title={`관련도 점수 ${score}`}>
        🔴 높음
      </Badge>
    );
  }
  if (score >= 1) {
    return (
      <Badge
        variant="outline"
        title={`관련도 점수 ${score}`}
        className="border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        🟡 보통
      </Badge>
    );
  }
  return (
    <Badge variant="outline" title={`관련도 점수 ${score}`}>
      ⚪ 참고
    </Badge>
  );
}
