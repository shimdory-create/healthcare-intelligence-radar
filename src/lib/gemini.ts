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
일라이 릴리, 노보노디스크, 화이자, 머크, 존슨앤드존슨 등 대형 글로벌 제약사와 관련된 뉴스(신약 개발, 투자, 파트너십,
실적, 사업 전략 등)는 보험사가 주요 모니터링 대상으로 삼고 있으므로 low로 판정하지 말고 최소 medium 이상으로 판정하세요.
이미 시행 중인 제도의 이용률·청구건수 등 실적·현황을 보도하는 통계성 기사는 제도 자체가 바뀌는 것이 아니므로
high로 판정하지 말고 medium 이하로 판정하세요.
실손보험료 산정, 청구 절차, 보장 한도 변경 등 순수 보험 상품·행정 성격의 기사는 보험 실무에는 중요할 수 있어도
헬스케어 서비스나 의료 산업 자체에 직접적인 변화를 주지 않으면 high로 판정하지 말고 medium 이하로 판정하세요.
마운자로, 위고비 등 GLP-1 비만치료제 관련 규제·정책 동향(오남용우려의약품 지정, 급여 기준, 처방 제한 등)은
사업 영향도가 크므로 low나 medium으로 판정하지 말고 high로 판정하세요.
예방접종 대상·혈청형 등 방역 전략의 방향에 영향을 줄 수 있는 역학적 논의는 단순 정보성 기사가 아니므로
low로 판정하지 말고 최소 medium 이상으로 판정하세요.
특허 등록, 기술이전 등 지적재산권 확보 소식은 실질적인 사업 성과이므로 low로 판정하지 말고
최소 medium 이상으로 판정하세요.
implications는 그럴듯하게 지어내지 말고, 실제로 근거가 있을 때만 작성하세요.
불필요하게 길게 쓰지 마세요.`;
}

async function callGemini(prompt: string, schema: object): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
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
  return JSON.parse(text);
}

/** sends up to ~10 articles in a single Gemini request and returns per-article analysis.
 *  Throws on any failure (missing key, quota, network, malformed response) -- callers must
 *  catch this and fall back to the rule-based system; AI analysis is always optional. */
export async function analyzeArticles(articles: GeminiArticleInput[]): Promise<GeminiAnalysisItem[]> {
  const parsed = (await callGemini(buildPrompt(articles), RESPONSE_SCHEMA)) as Array<{
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

export interface DeepAnalysisResult {
  category: '국내 보험·제도' | '국내 산업' | 'Global';
  note: string | null;
  bullets: { text: string; subBullets: string[] }[];
}

const DEEP_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['국내 보험·제도', '국내 산업', 'Global'] },
    note: { type: 'string' },
    bullets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          sub_bullets: { type: 'array', items: { type: 'string' } },
        },
        required: ['text', 'sub_bullets'],
      },
    },
  },
  required: ['category', 'note', 'bullets'],
};

function buildDeepPrompt(title: string, fullText: string): string {
  return `당신은 보험사 헬스케어 사업팀의 "Healthcare Market Intelligence" 보고서를 작성하는 애널리스트입니다.
아래 기사 전문을 읽고, 사내 보고서에 쓸 수 있도록 사실 위주로 정리하세요.

제목: ${title}

본문:
${fullText.slice(0, 6000)}

다음 필드를 포함한 JSON 객체 하나로만 응답하세요 (다른 텍스트 없이):
- category: 이 기사가 속할 분류를 아래 세 가지 중 하나로 판정
  - "국내 보험·제도": 국내 보험사·건강보험·정부 제도/정책 관련
  - "국내 산업": 국내 제약사·의료기기·헬스케어 기업의 사업 활동
  - "Global": 해외 기업·해외 규제기관(FDA 등) 관련
- note: 기사에 나온 전문용어나 낯선 약어에 대한 한 줄 설명. 없으면 빈 문자열("")
- bullets: 핵심 사실을 나열한 배열. 각 항목은:
  - text: 구체적인 수치·날짜·기관명·조건을 포함한 사실 한 문장
  - sub_bullets: text를 뒷받침하는 더 세부적인 사실들 (없으면 빈 배열 [])

지어내지 말고, 본문에 실제로 나온 내용만 사용하세요. 불필요하게 길게 쓰지 마세요.`;
}

/** deep, fact-dense analysis of a single article's full text for the Market Intelligence
 *  report -- distinct from analyzeArticles' short daily-digest summary. Throws on any
 *  failure; callers (reportAnalysis.ts) catch per-candidate and fall back to the existing
 *  short summary rather than dropping the article or failing the whole report. */
export async function analyzeDeep(title: string, fullText: string): Promise<DeepAnalysisResult> {
  const parsed = (await callGemini(buildDeepPrompt(title, fullText), DEEP_RESPONSE_SCHEMA)) as {
    category: DeepAnalysisResult['category'];
    note: string;
    bullets: { text: string; sub_bullets: string[] }[];
  };

  return {
    category: parsed.category,
    note: parsed.note || null,
    bullets: parsed.bullets.map((b) => ({ text: b.text, subBullets: b.sub_bullets })),
  };
}
