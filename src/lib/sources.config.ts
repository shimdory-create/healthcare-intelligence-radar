export type SourceTier = 1 | 2 | 3;
export type FetchMethod = 'rss' | 'google_news_rss';
export type Reliability = 'stable' | 'experimental';

export interface SourceConfig {
  id: string;
  name: string;
  rssUrl: string;
  tier: SourceTier;
  reliability: Reliability;
  fetchMethod: FetchMethod;
  requiresBrowserUA?: boolean;
}

export const SOURCES: SourceConfig[] = [
  // Tier 1 — 공공기관
  { id: 'fsc', name: '금융위원회', rssUrl: 'http://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111', tier: 1, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'mohw', name: '보건복지부', rssUrl: 'https://www.mohw.go.kr/rss/board.es?mid=a10503000000&bid=0027', tier: 1, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'mfds', name: '식품의약품안전처', rssUrl: 'http://www.mfds.go.kr/www/rss/brd.do?brdId=ntc0021', tier: 1, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'hira', name: '건강보험심사평가원', rssUrl: 'https://www.hira.or.kr/cms/inform/02/news.xml', tier: 1, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'khidi', name: '한국보건산업진흥원', rssUrl: 'https://www.khidi.or.kr/rss?menuId=MENU00100', tier: 1, reliability: 'stable', fetchMethod: 'rss' },

  // Tier 2 — 종합/경제지
  { id: 'yna', name: '연합뉴스', rssUrl: 'https://www.yna.co.kr/rss/economy.xml', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'chosun', name: '조선일보', rssUrl: 'https://www.chosun.com/arc/outboundfeeds/rss/category/economy/?outputType=xml', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'donga', name: '동아일보', rssUrl: 'http://rss.donga.com/economy.xml', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'hani', name: '한겨레', rssUrl: 'https://www.hani.co.kr/rss/economy', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'hankyung', name: '한국경제', rssUrl: 'https://www.hankyung.com/feed/economy', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'mk', name: '매일경제', rssUrl: 'https://www.mk.co.kr/rss/30100041/', tier: 2, reliability: 'stable', fetchMethod: 'rss', requiresBrowserUA: true },
  { id: 'herald', name: '헤럴드경제', rssUrl: 'https://biz.heraldcorp.com/rss/google/economy', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'edaily', name: '이데일리', rssUrl: 'https://rss.edaily.co.kr/economy_news.xml', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'sedaily', name: '서울경제', rssUrl: 'https://www.sedaily.com/rss/economy', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'joongang', name: '중앙일보', rssUrl: 'https://news.google.com/rss/search?q=site:joongang.co.kr+when:1d&hl=ko&gl=KR&ceid=KR:ko', tier: 2, reliability: 'experimental', fetchMethod: 'google_news_rss' },

  // Tier 3 — 헬스케어 전문지
  { id: 'docdocdoc', name: '청년의사', rssUrl: 'https://www.docdocdoc.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'hitnews', name: '히트뉴스', rssUrl: 'https://www.hitnews.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'rapportian', name: '라포르시안', rssUrl: 'http://www.rapportian.com/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'kormedi', name: '코메디닷컴', rssUrl: 'https://kormedi.com/feed', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'bosa', name: '의학신문', rssUrl: 'http://www.bosa.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'monews', name: '메디칼업저버', rssUrl: 'http://www.monews.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'pharmnews', name: '팜뉴스', rssUrl: 'https://www.pharmnews.com/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'healthchosun', name: '헬스조선', rssUrl: 'https://health.chosun.com/site/data/rss/rss.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
];
