import { createHash } from 'crypto';

export interface GeminiArticleInput {
  id: number;
  title: string;
  snippet: string;
}

export interface GeminiAnalysisItem {
  articleId: number;
  relevant: boolean;
  summary: string;
  implications: string[];
  watchPoint: string;
}

/** the exact model id is env-configurable (GEMINI_MODEL) rather than hardcoded, since Google
 *  regularly retires free-tier model versions on a matter of months */
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const RESPONSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      article_id: { type: 'integer' },
      relevant: { type: 'boolean' },
      summary: { type: 'string' },
      implications: { type: 'array', items: { type: 'string' } },
      watch_point: { type: 'string' },
    },
    required: ['article_id', 'relevant', 'summary', 'implications', 'watch_point'],
  },
};

export function contentHash(title: string, snippet: string): string {
  return createHash('sha256').update(`${title}\n${snippet}`).digest('hex');
}

function buildPrompt(articles: GeminiArticleInput[]): string {
  const list = articles
    .map((a) => `- id=${a.id}: ${a.title}\n  ${a.snippet.slice(0, 300)}`)
    .join('\n');
  return `당신은 보험사 헬스케어 사업팀의 뉴스 분석 보조입니다. 아래 기사 각각을 보험사 헬스케어 사업 관점에서 분석하세요.

${list}

각 기사에 대해 다음 필드를 포함한 JSON 배열로만 응답하세요 (다른 텍스트 없이):
- article_id: 위 목록의 id 값 그대로
- relevant: 보험사 헬스케어 사업과 실제 관련 있는지 (true/false)
- summary: 핵심 변화를 한국어 2~3문장으로 요약
- implications: 보험사 헬스케어 관점 시사점 1~2개
- watch_point: 향후 확인할 사항 1개

불필요하게 길게 쓰지 마세요.`;
}

/** sends up to ~10 articles in a single Gemini request and returns per-article analysis.
 *  Throws on any failure (missing key, quota, network, malformed response) -- callers must
 *  catch this and fall back to the rule-based system; AI analysis is always optional. */
export async function analyzeArticles(articles: GeminiArticleInput[]): Promise<GeminiAnalysisItem[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(articles) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Gemini response missing content');

  const parsed = JSON.parse(text) as Array<{
    article_id: number;
    relevant: boolean;
    summary: string;
    implications: string[];
    watch_point: string;
  }>;

  return parsed.map((p) => ({
    articleId: p.article_id,
    relevant: p.relevant,
    summary: p.summary,
    implications: p.implications,
    watchPoint: p.watch_point,
  }));
}
