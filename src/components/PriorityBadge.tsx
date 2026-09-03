import { Badge } from '@/components/ui/badge';

export function PriorityBadge({ score }: { score: number }) {
  if (score >= 3) {
    return (
      <Badge variant="destructive" title={`매칭 태그 ${score}개`}>
        🔴 높음
      </Badge>
    );
  }
  if (score >= 1) {
    return (
      <Badge
        variant="outline"
        title={`매칭 태그 ${score}개`}
        className="border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        🟡 보통
      </Badge>
    );
  }
  return (
    <Badge variant="outline" title={`매칭 태그 ${score}개`}>
      ⚪ 참고
    </Badge>
  );
}
