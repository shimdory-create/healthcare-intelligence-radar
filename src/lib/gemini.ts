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
삼성서울병원, 강북삼성병원 관련 뉴스는 low로 판정하지 말고 최소 medium 이상으로 판정하세요.
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
      // 45s, not 30s -- found live 2026-09-21 right after adding headline_source and
      // per-sub_bullet notes: the larger nested responseSchema measurably increased Gemini's
      // generation time (observed 6.8s/14.7s/31s across 3 back-to-back real calls for the
      // same prompt, the last one tripping the old 30s timeout). This constant is shared by
      // every callGemini caller (1차 분류, 심층분석, 같은사건 통합), all of which already
      // treat a timeout as a soft per-item failure (isolated batch/candidate skip, never
      // blocks the whole run), so raising it is a pure latency buffer with no downside.
      signal: AbortSignal.timeout(45000),
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
  /** report-style headline, rewritten by Gemini rather than reusing the source article's own
   *  (news-style) title -- see buildDeepPrompt's headline rules. */
  headline: string;
  /** term-glossary note for a word that appears in the headline itself but not in any bullet
   *  (e.g. "PoC", "소송금융") -- without this, such a term never gets explained anywhere,
   *  since a bullet's own note is restricted to terms literally present in that bullet's
   *  text. Same whitelist/no-fabrication rules as a bullet's note. Null when nothing applies. */
  headlineNote: string | null;
  /** citation for the specific named report/analysis this article's content is based on (e.g.
   *  "금융분야 인공지능 가이드라인 개정과 보험산업의 대응 과제 (보험연구원 9.21일)") -- a
   *  DIFFERENT concept from headlineNote: this isn't explaining a term, it's naming the
   *  underlying source document. Seen in the 기획실 benchmark doc (2026-09-21); most articles
   *  don't cite a specific named report, so this is null far more often than headlineNote is.
   *  Deliberately not subject to dropOrphanedNote's literal-term-in-text guard, since it's not
   *  a "term: definition" pair to begin with. */
  headlineSource: string | null;
  /** each bullet carries its own optional term-glossary note (rendered directly under that
   *  bullet, not off in a fixed slot under the headline) so a note always sits next to the
   *  term it's explaining, whichever bullet that happens to be. Each sub_bullet can likewise
   *  carry its own note (2026-09-21, matching the 기획실 benchmark doc's pattern of annotating
   *  a specific term/date inside a sub-bullet, e.g. "* '26.7.28 발생" right after a named
   *  event) -- same dropOrphanedNote guard, checked against that sub_bullet's own text. */
  bullets: { text: string; note: string | null; subBullets: { text: string; note: string | null }[] }[];
  /** background/context info about a company or institution named in the article (e.g. a past
   *  certification, an unrelated business line) -- rendered with a "※ " prefix after the
   *  item's bullets, distinct from a bullet's own term-glossary note. Null when nothing
   *  applies. */
  background: string | null;
  /** true when the article is supplementary/FYI rather than core news -- e.g. an online-buzz
   *  or celebrity-mention piece with no direct product/policy/pricing impact. Rendered as a
   *  "(참고)" prefix on the headline rather than a separate section. Distinct from isRelevant:
   *  this means "relevant but secondary," not "irrelevant." */
  isReference: boolean;
  /** false when the article has no business relevance to insurance/healthcare at all (a job
   *  posting, an individual's award, routine internal-administration news) -- report.ts drops
   *  such candidates entirely, the same as a candidate with no deep result. This is the gate
   *  the multi-outlet promotion path (getReportCandidates' outlet-count rule) otherwise lacks
   *  entirely; analyzeArticles' 1차 priority prompt already judges relevance for the 'high'
   *  path, so this doubles as a second check there too. */
  isRelevant: boolean;
}

const DEEP_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['국내 보험·제도', '국내 산업', 'Global'] },
    headline: { type: 'string' },
    headline_note: { type: 'string' },
    headline_source: { type: 'string' },
    bullets: {
      type: 'array',
      maxItems: 2,
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          note: { type: 'string' },
          // 2 is the normal cap; 5 covers the exception case (see buildDeepPrompt's sub_bullets
          // rule) where a single announcement bundles several distinct components worth listing
          sub_bullets: {
            type: 'array',
            maxItems: 5,
            items: {
              type: 'object',
              properties: { text: { type: 'string' }, note: { type: 'string' } },
              required: ['text', 'note'],
            },
          },
        },
        required: ['text', 'note', 'sub_bullets'],
      },
    },
    background: { type: 'string' },
    is_reference: { type: 'boolean' },
    is_relevant: { type: 'boolean' },
  },
  required: [
    'category',
    'headline',
    'headline_note',
    'headline_source',
    'bullets',
    'background',
    'is_reference',
    'is_relevant',
  ],
};

function buildDeepPrompt(title: string, fullText: string): string {
  return `당신은 보험사 헬스케어 사업팀의 "Healthcare Market Intelligence" 보고서를 작성하는 애널리스트입니다.
아래 기사 전문을 읽고, 임원에게 그대로 보고할 수 있는 수준으로 핵심만 압축해서 정리하세요.

**분량 규칙 (반드시 준수 -- 보고서 전체 분량을 좌우하는 가장 중요한 규칙):**
- 요약이 최우선 목표. bullets와 sub_bullets는 최대 2개까지 쓸 수 있다는 것이지, 2개를 채우라는 뜻이 아님 -- 중복 없이 핵심이 다 담기면 1개로 끝내는 것이 더 좋은 결과.
- 개수를 채우려고 사소한 내용을 억지로 추가하지 말 것. "더 쓸 내용이 있는가"가 아니라 "이게 없으면 판단이 안 서는가"로 필요성을 판단.
- **매번 bullets 2개 × sub_bullets 2개로 꽉 채우는 습관을 경계할 것** (실제 사고 사례: 여러 보고서 항목이 하나같이 2×2로 채워져 있었는데, 대부분 실제로는 bullets 1개로 충분한 내용이었음). 예를 들어 기사 핵심이 "A서비스 출시, 주요 기능은 B·C"뿐인데 bullets를 2개("경쟁사 동향", "업계 반응")로 억지로 나누고 각각에 sub_bullets 2개씩(합 4개)을 채우는 것은 잘못된 예 -- 이 경우 bullets 1개("A서비스 출시, 주요 기능 B·C")로 끝내는 것이 맞음. bullets를 2개로 나누는 것은 서로 다른 두 개의 독립적 판단/결론이 실제로 있을 때만.
- 두괄식: 가장 중요한 결론/판단을 bullets[0]에 먼저 쓰고, 나머지는 그걸 뒷받침하는 순서로.
- 한 bullet(또는 sub_bullet)에는 메시지 하나만 담을 것 -- 여러 사실을 쉼표로 나열해 욱여넣지 말 것.
- bullets의 text는 "주요 내용·판단·결정사항" 수준으로 (세부 수치 나열이 아니라 그래서 무엇이 어떻게 됐는지), sub_bullets는 그 판단을 뒷받침하는 근거·수치·사례 수준으로.

**문체 규칙 (headline, bullets의 text/note/sub_bullets에 모두 적용):**
- 완전한 문장이 아니라 압축된 개조식으로 작성. "~습니다/~합니다/~했다/~이다/~함/~임/~됨" 등 문장 종결 어미를 쓰지 말고, 명사(구)로 끝낼 것.
- 조사(을/를/이/가/은/는)는 자연스러운 범위에서 생략하고 명사구 중심으로 압축.
- 기관명 약칭은 아래 목록에 있는 것만 사용, 그리고 이 목록에 있는 약칭은 이미 널리 알려진 것이므로 note로 따로 설명하지 말 것: 건강보험심사평가원→심평원, 국민건강보험공단→건보공단, 식품의약품안전처→식약처, 보건복지부→복지부, 질병관리청→질병청. 그 외 기관·위원회·협회명(예: 건강보험정책심의위원회)은 임의로 줄여쓰지 말 것 -- 본문에 이미 약칭으로 나와 있으면 그대로 쓰되, 그 약칭이 처음 등장하는 bullet의 note에 전체 명칭을 반드시 병기.
- 수치 비교·추이는 기호로 압축: 순서/추이는 화살표(→), 증감은 %↑ / %↓, 비교 기준은 괄호나 "–"로 병기.
- 날짜는 숫자로 간결하게 (예: "9월 11일" 대신 "9.11" 또는 문맥상 자연스러우면 "11일").
- 예외·단서를 말할 때는 "단, ~" 형태로 문장을 시작.

문체 예시 (아래와 같은 압축도로 작성, 내용은 예시일 뿐 실제 기사 내용만 사용):
- "심평원, 11일 제약업계 대상 재평가 설명회 개최"
- "36주차(8.30-9.5) 의사환자 1,000명당 25.3명 – 유행기준(12.9명)의 약 2배, 전년동기(6.6명) 대비 3.8배"
- "FLUNITY-HD 임상(약 46만명): 표준용량 대비 예방효과 24%↑, 독감 입원율 31.9%↓"
- "일정: 가산 입증자료 제출(~10월) → 제외대상 목록 공지(추석 전) → 시행목표(내년 4월 1일)"
- "단, 국가별 현지 인수심사 및 보험금 청구 기능은 유지"

제목: ${title}

본문:
${fullText.slice(0, 6000)}

다음 필드를 포함한 JSON 객체 하나로만 응답하세요 (다른 텍스트 없이):
- category: 이 기사가 속할 분류를 아래 세 가지 중 하나로 판정
  - "국내 보험·제도": 국내 보험사·건강보험·정부 제도/정책 관련
  - "국내 산업": 국내 제약사·의료기기·헬스케어 기업의 사업 활동
  - "Global": 해외 기업·해외 규제기관(FDA 등) 관련 -- **"Global"로 판정한 경우, headline 또는
    bullets[0]에 어느 국가·지역 소식인지 반드시 명시할 것** (예: "美 FDA, ~", "英 NICE, ~", "중국
    ~", "유럽연합, ~"). 국가 표기가 빠지면 독자가 해외 어디 사례인지 알 수 없음 (실제 사고 사례:
    국가명 없이 기관명만 적어 어느 나라 소식인지 불분명했던 경우 있었음).
- headline: 기사 원제목을 그대로 쓰지 말고, 위 문체 규칙에 따라 핵심 사실 1~2개를 "·" 또는 쉼표로 묶어 압축한 보고서용 제목으로 새로 작성 (예: "심평원, 재평가 설명회 개최·제외 품목은 68% 가산 배제"). **bullets[0]의 text를 단어만 바꿔 반복하지 말 것** -- headline은 "무엇이 있었는지"를 압축하고, bullets[0]은 거기 없는 구체적 판단·수치·대상을 담아야 함. 잘못된 예:
  - headline "심평원, 제7차 암질환심의위원회 결과 공개·브렌랩주 등 급여기준 설정" 인데 bullets[0].text가 "심평원, 제7차 암질환심의위원회에서 항암제 급여기준 심의 결과 발표"처럼 같은 내용을 다른 표현으로 되풀이 -- 이 경우 bullets[0]에는 실제 급여기준이 정해진/정해지지 않은 약제명처럼 headline에 없는 세부 내용이 들어가야 함
  - headline "질병청, 코로나19 예방접종 필수 전환·10월 12일부터 고위험군 대상 순차 시행" 인데 bullets[0].text가 "코로나19 예방접종을 임시에서 필수 예방접종으로 전환하고 10월 12일부터 고위험군 대상 순차 시행"처럼 거의 같은 문장을 반복 -- 이 경우 bullets[0]에는 접종 백신 종류·물량, 동시접종 권고처럼 headline에 없는 세부 내용이 들어가야 함 (실제 사고 사례: 그런 내용이 bullets[1]에 있었는데 bullets[0]에 들어갔어야 했음)
- headline_note: headline에 실제로 등장하는 전문용어·낯선 약어(예: "PoC", "소송금융") 또는 생소한 기업·법인·기관명(예: "Allianz Partners", "파라메타")에 대한 한 줄 설명, "용어: 설명" 형식. bullets의 note와 같은 규칙 -- **headline에 문자 그대로 등장하는 용어만 설명할 것. 기사 주제와 관련은 있지만 headline이나 어느 bullet에도 실제로 쓰이지 않은 배경지식 용어는 설명하지 말 것.** 잘못된 예(실제 사고 사례): headline이 "SK바이오팜, 퍼스트바이오 파킨슨병 후보물질 도입·오픈이노베이션 가동"이고 bullets 어디에도 "DMT"라는 단어가 없는데 headline_note에 "DMT: 질병의 진행 자체를 늦추는 질병조절치료제"라고 설명 -- 파킨슨병 신약과 관련은 있는 배경지식이지만 headline/bullets 어디에도 "DMT"라는 단어 자체가 없으므로 이 경우 headline_note는 빈 문자열이어야 함. 화이트리스트 약칭이나 이미 널리 알려진 용어/기업명도 설명하지 말 것. headline에 설명이 필요한 용어가 없으면 빈 문자열("")
- headline_source: headline_note와 다른 개념 -- 용어 설명이 아니라, **이 기사 내용이 특정 기관의 명시적으로 이름 붙은 보고서·자료에 근거한 경우에만** 그 자료명을 인용. 형식은 "자료명 (발행처·날짜)", 예: "금융분야 인공지능 가이드라인 개정과 보험산업의 대응 과제 (보험연구원 9.21일)". 기사가 단순히 어떤 사건·발표를 보도하는 것이고 특정 이름 붙은 보고서를 근거로 삼은 게 아니면 반드시 빈 문자열("") -- 대부분의 기사는 여기 해당하므로 빈 문자열이 기본값. 본문에 "OOO 보고서에 따르면", "OOO가 발표한 자료에서" 처럼 명시적으로 특정 자료를 인용하는 경우에만 채울 것.
- **note 중복 설명 금지 (headline_note, bullets[].note, sub_bullets[].note 모두 해당):** 같은 아이템 안에서 어떤 용어를 이미 어딘가의 note에서 설명했다면, 뒤에 나오는 note에서 같은 용어를 또 설명하지 말 것 -- 그 용어가 여러 bullet/sub_bullet의 text에 반복해서 등장하더라도, 설명은 **최초 등장하는 note 한 곳에만** 달고 나머지는 빈 문자열(""). 잘못된 예(실제 사고 사례): "KCD"라는 용어가 bullets[0]과 sub_bullets 양쪽에 등장했는데, bullets[0].note에 "KCD: 질병코드"라고 이미 설명해놓고 sub_bullets의 note에도 똑같이 "KCD: 질병코드"를 또 씀 -- 이 경우 sub_bullets의 note는 빈 문자열이어야 함. 또한 이미 문맥상 자명하거나(예: "삼성 가족 대표 건강보험"처럼 이름 자체가 내용을 설명하는 상품명) 본문의 다른 부분에서 이미 풀어 쓴 내용을 note에서 다시 설명하는 것도 피할 것 -- note는 "낯설어서 모르면 이해가 안 되는 용어"에만 쓰고, 이미 이해 가능한 내용을 또 설명하는 용도가 아님.
- bullets: 최대 2개 (상한선일 뿐 목표 아님 -- 1개로 충분하면 1개만). 각 항목은:
  - text: 위 문체·분량 규칙을 따른, 핵심 판단·결정사항 한 줄 (두괄식 첫 번째가 가장 중요)
  - note: 이 bullet의 text에 실제로 등장하는 전문용어·낯선 약어(화이트리스트 외 기관 약칭 포함) 또는 생소한 기업·법인명에 대한 한 줄 설명, "용어: 설명" 형식. **이 bullet의 text에 나오지 않는 용어는 절대 설명하지 말 것** (본문에는 있었지만 압축 과정에서 text에 안 들어간 용어라면 note도 비워둘 것). 화이트리스트 약칭이나 이미 널리 알려진 용어/기업명도 설명하지 말고, 해당 없으면 빈 문자열(""). 예: 화이트리스트에 있는 "심평원"을 note에 "심평원: 건강보험심사평가원"처럼 설명하는 것은 잘못된 예 -- 화이트리스트 약칭(심평원/건보공단/식약처/복지부/질병청)은 note를 반드시 빈 문자열("")로 둘 것
  - sub_bullets: text를 뒷받침하는 근거·수치·사례, 보통 최대 2개 (상한선, 필요한 만큼만) -- **단, 하나의 발표/출시에 서로 다른 개별 구성요소(하위 서비스, 세부 상품 등)가 여러 개 묶여 있고 그 각각을 나열하는 것 자체가 핵심 정보인 경우(예: 하나의 통합 솔루션이 5개의 개별 서비스로 구성)엔 예외적으로 5개까지 나열 가능**. 그 외 일반적인 경우는 여전히 2개 이내로 압축. 같은 문체 규칙 적용 (없으면 빈 배열 []). **서로 다른 사실을 담을 것** -- 같은 판단을 다른 평가지표·다른 표현으로 나열하지 말고, 내용이 겹치면 하나로 합칠 것. **이 예외는 상품/서비스 "출시·발표" 기사에만 적용** -- 국회·정부의 법률안·안건 의결처럼 여러 항목을 단순 열거하는 기사(예: "보건복지위, 법률안 88건 의결")는 예외 대상이 아님, 2개 이내로 가장 중요한 항목만 압축할 것. 잘못된 예: 의결된 법률안이 여러 건이라고 해서 각 법률안을 sub_bullets에 3개 이상 나열 -- 이 경우 헬스케어 사업에 실질적 영향이 큰 1~2건만 골라 담을 것. 각 sub_bullet은 객체 {text, note}: text는 위 규칙 그대로, note는 **이 sub_bullet의 text에 실제로 등장하는** 전문용어·낯선 약어·생소한 기업명 또는 발생 날짜에 대한 한 줄 설명("용어: 설명" 형식, bullet의 note와 같은 규칙, 해당 없으면 빈 문자열""). **서로 다른 사건에 각각 다른 날짜/용어를 달아야 하면, 한 sub_bullet에 몰아넣지 말고 사건별로 sub_bullet을 나눠서 각자의 note에 달 것** -- 예: "A지진(날짜1)과 B호우(날짜2)로 손해 증가"처럼 한 문장에 두 사건을 합치면 note를 하나만 달 수 있어 한쪽 날짜를 잃음; "A지진으로 손해 증가"(note: "날짜1 발생")와 "B호우로 추가 손해"(note: "날짜2 발생")처럼 sub_bullet 두 개로 나눌 것
- background: 기사에 등장하는 기업·기관의 배경 정보(과거 인증·승인 이력, 관련 사업 영역 등) 중 본문에 직접 나온 것이 있으면 한 줄로. 날짜가 있으면 괄호로 병기 (예: "'25.3월"). **bullets/sub_bullets에 이미 나온 사실을 반복하지 말 것** -- 거기 없는 추가 맥락일 때만 의미가 있음. 없으면 없는 대로 두는 게 기본값 -- 이해에 꼭 필요한 경우에만 채우고, 그렇지 않으면 빈 문자열("")
  예: sub_bullets에 이미 "국내 최초 국제건강성과측정기구 인증 획득('25.4월)"이 있는데 background에 똑같이 "국내 최초 국제건강성과측정기구 인증 획득('25.4월)"을 또 쓰는 것은 잘못된 예 -- 이 경우 background는 빈 문자열("")이어야 함
- is_reference: 핵심 뉴스가 아니라 참고용 부가 정보이면 true. 예: 화제성/커뮤니티·SNS 반응 기사, 유명인 언급, 직접적인 제도·가격·사업 영향은 없고 배경 정보 성격인 경우. 제도 변화·가격 결정·신제품 출시·규제 조치처럼 실질적 영향이 있으면 false
- is_relevant: 이 기사가 보험사 헬스케어 사업 관점에서 조금이라도 관련이 있으면 true, 전혀 무관하면 false. is_reference와 다른 개념 -- is_reference는 "관련은 있지만 부차적"이고, is_relevant=false는 "애초에 사업과 아무 상관 없음". 아래는 이 보고서에 실제로 잘못 포함됐던 사례이니 반드시 false로 판정할 것:
  - "OO기관 하반기 신규직원 OOO명 모집" 같은 채용 공고
  - "OOO 전공의, OO학회 최우수상 수상" 같은 개인 수상·인사 소식
  일반적으로: 채용/인사/개인 수상, 단순 행사 개최 예고(내용 없이 일정만), 기관 내부 행정(민원 처리 개선 등)처럼 보험사의 상품·서비스·정책 판단에 아무 영향을 주지 않는 기사는 매체 수와 무관하게 false. 반대로 제도·가격·신제품·임상·규제처럼 실제로 무언가가 바뀌거나 영향을 주는 내용이면 true.

지어내지 말고, 본문에 실제로 나온 내용만 사용하세요. 불필요하게 길게 쓰지 마세요.`;
}

/** every note follows a "용어: 설명" format (enforced by the prompt) -- if the term before the
 *  colon doesn't actually appear in the text the note is attached to, the note is explaining
 *  something never written into the visible copy. Found live 2026-09-18: a headline_note
 *  "DMT: 질병의 진행 자체를 늦추는 질병조절치료제" sat under a headline ("SK바이오팜, 퍼스트바이오
 *  파킨슨병 후보물질 도입·오픈이노베이션 가동") that never used the word "DMT" anywhere -- Gemini
 *  added background knowledge relevant to the article's topic without surfacing the term itself
 *  into any bullet or the headline. The prompt rule already said not to do this; prompt rules
 *  alone are a probabilistic improvement at best (see the style guide's §2.3/§2.9 history), so
 *  this drops the note deterministically instead of just asking nicely. */
function dropOrphanedNote(note: string | null, text: string): string | null {
  if (!note) return null;
  const term = note.split(':')[0]?.trim();
  if (!term) return note;
  return text.includes(term) ? note : null;
}

/** deep, fact-dense analysis of a single article's full text for the Market Intelligence
 *  report -- distinct from analyzeArticles' short daily-digest summary. Throws on any
 *  failure; callers (reportAnalysis.ts) catch per-candidate and simply omit that candidate
 *  from the report rather than failing the whole run. */
export async function analyzeDeep(title: string, fullText: string): Promise<DeepAnalysisResult> {
  const parsed = (await callGemini(buildDeepPrompt(title, fullText), DEEP_RESPONSE_SCHEMA)) as {
    category: DeepAnalysisResult['category'];
    headline: string;
    headline_note: string;
    headline_source: string;
    bullets: { text: string; note: string; sub_bullets: { text: string; note: string }[] }[];
    background: string;
    is_reference: boolean;
    is_relevant: boolean;
  };

  return {
    category: parsed.category,
    headline: parsed.headline,
    headlineNote: dropOrphanedNote(parsed.headline_note || null, parsed.headline),
    // not orphan-guarded -- this is a source citation, not a "term: definition" pair, so
    // checking whether its text appears literally in the headline would be meaningless
    headlineSource: parsed.headline_source || null,
    bullets: parsed.bullets.map((b) => ({
      text: b.text,
      note: dropOrphanedNote(b.note || null, b.text),
      subBullets: b.sub_bullets.map((sb) => ({
        text: sb.text,
        note: dropOrphanedNote(sb.note || null, sb.text),
      })),
    })),
    background: parsed.background || null,
    isReference: parsed.is_reference,
    isRelevant: parsed.is_relevant,
  };
}

const CONSOLIDATE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    groups: { type: 'array', items: { type: 'array', items: { type: 'integer' } } },
  },
  required: ['groups'],
};

/** finds report candidates that describe the SAME real-world event/story but survived exact
 *  title-based duplicate detection (getReportCandidates' distinct-outlet grouping) because
 *  each outlet phrased its own headline differently. Found live 2026-09-21: a GLP-1/위고비
 *  시력상실(vision loss) lawsuit story appeared as three separate report items (one 6-outlet
 *  "다수매체 보도" group, one 2-outlet group, and one standalone `high` item covering the FDA
 *  angle) because none of their raw titles matched closely enough for the exact-match dedup;
 *  same underlying gap let two same-outlet 삼성생명 health-insurance articles ("Care+ 출시" /
 *  "라인업 완료") both survive as separate items. Runs on the AI-rewritten headlines (already
 *  compressed to the core fact, so more consistent across outlets than raw titles) rather than
 *  original article titles. Deliberately conservative -- only groups items that are the same
 *  specific event, never merely the same general topic (an over-eager grouping would silently
 *  drop distinct stories). Never throws -- a failure here must not block the report; callers
 *  get an empty result and every candidate stays ungrouped. */
export async function consolidateSimilarStories(
  items: { id: number; headline: string }[],
): Promise<number[][]> {
  if (items.length < 2) return [];

  const list = items.map((i) => `id=${i.id}: ${i.headline}`).join('\n');
  const prompt = `아래는 오늘 리포트 후보 기사들의 (재작성된) 헤드라인 목록이다. 서로 다른 id지만 **같은 구체적 사건·발표를 다루는 것들**을 그룹으로 묶어라.

${list}

규칙:
- 같은 사건이어야 그룹으로 묶는다 -- 매체마다 표현이 달라도 같은 발표/사건/소송/조사를 가리키면 같은 그룹 (예: "위고비 맞고 시력 잃었다" 소송을 다룬 여러 매체의 서로 다른 헤드라인은 한 그룹).
- 단순히 주제·기업·산업이 같을 뿐 서로 다른 개별 사건이면 절대 묶지 말 것 (예: 같은 기업의 서로 다른 신제품 발표 두 건은 별개 그룹).
- 확신이 없으면 묶지 말 것 -- 잘못 묶어서 서로 다른 소식을 하나로 합치는 것이, 놓치고 안 묶는 것보다 더 나쁘다.
- 2개 이상 id가 같은 사건인 그룹만 출력. 그룹에 속하지 않는 id는 출력하지 않는다.

출력: groups (각 그룹은 id 배열)`;

  try {
    const parsed = (await callGemini(prompt, CONSOLIDATE_RESPONSE_SCHEMA)) as { groups: number[][] };
    const validIds = new Set(items.map((i) => i.id));
    return parsed.groups
      .map((g) => g.filter((id) => validIds.has(id)))
      .filter((g) => g.length >= 2);
  } catch {
    return [];
  }
}
