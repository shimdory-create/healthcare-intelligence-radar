import { createHash } from 'crypto';
import type { PriorityBand } from './priority';

export interface GeminiArticleInput {
  id: number;
  title: string;
  snippet: string;
}

export interface GeminiAnalysisItem {
  articleId: number;
  priority: PriorityBand;
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
      priority: { type: 'string', enum: ['high', 'medium', 'low'] },
      summary: { type: 'string' },
      implications: { type: 'array', items: { type: 'string' } },
      watch_point: { type: 'string' },
    },
    required: ['article_id', 'priority', 'summary', 'implications', 'watch_point'],
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
- priority: 보험사 헬스케어 사업 관점에서의 중요도를 다음 세 단계 중 하나로 판정
  - "high": 오늘 반드시 확인해야 할 만큼 사업/정책에 직접 영향 있음 -- 구체적인 제도 변화, 급여/가격 결정, 신상품·서비스 출시, 규제 조치처럼 실제로 무언가가 바뀌는 경우만 해당
  - "medium": 참고할 가치는 있으나 당장 급하지 않음
  - "low": 키워드는 관련되어 보이지만 실제로는 무관하거나 사업적 함의가 거의 없음
- summary: 핵심 변화를 한국어 2~3문장으로 요약
- implications: 보험사 헬스케어 관점 시사점 1~2개
- watch_point: 향후 확인할 사항 1개

단순히 키워드가 많이 등장했다고 priority를 높이지 마세요 -- 실제 사업 관련성으로 판단하세요.
위원회/협의체 출범, 조직 개편, 간담회 개최처럼 구체적인 제도·가격·보장 변화 없이 절차 진행이나 의지 표명에 그치는
발표성 뉴스는 아무리 관련 키워드가 많아도 high로 판정하지 말고 medium 이하로 판정하세요.
개인정보 유출, 해킹 등 일반 보안사고는 보험사 헬스케어 사업과 직접 연관이 없으면 low로 판정하세요.
협회/기관의 내부 행정 업무(민원 처리, 광고 심의, 전산 인프라 개선 등) 자동화·개선 소식은 보험사의 실제 상품이나
서비스에 직접적인 변화를 가져오지 않으면 high로 판정하지 말고 medium 이하로 판정하세요.
implications는 그럴듯하게 지어내지 말고, 실제로 근거가 있을 때만 작성하세요.
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
    priority: PriorityBand;
    summary: string;
    implications: string[];
    watch_point: string;
  }>;

  return parsed.map((p) => ({
    articleId: p.article_id,
    priority: p.priority,
    summary: p.summary,
    implications: p.implications,
    watchPoint: p.watch_point,
  }));
}
