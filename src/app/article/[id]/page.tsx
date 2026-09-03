import { notFound } from 'next/navigation';
import { getArticleById } from '@/lib/db';

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await getArticleById(Number(id));
  if (!article) notFound();

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1>{article.title}</h1>
      <p>
        {article.sourceId} · {article.publishedAt ? article.publishedAt.toLocaleString('ko-KR') : '날짜 미상'}
      </p>
      <p>태그: {article.tags.join(', ') || '없음'}</p>
      {article.snippet && <p>{article.snippet}</p>}
      <a href={article.url} target="_blank" rel="noreferrer">
        원문 보기
      </a>
    </main>
  );
}
