export function PriorityBadge({ score }: { score: number }) {
  const { emoji, label } =
    score >= 3 ? { emoji: '🔴', label: '높음' } : score >= 1 ? { emoji: '🟡', label: '보통' } : { emoji: '⚪', label: '참고' };
  return <span title={`매칭 태그 ${score}개`}>{emoji} {label}</span>;
}
