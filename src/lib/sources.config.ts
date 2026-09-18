export type SourceTier = 1 | 2 | 3;
export type FetchMethod = 'rss' | 'google_news_rss' | 'html_scrape';
export type Reliability = 'stable' | 'experimental';

/** CSS selectors describing one board/list page's repeating item structure -- see scrape.ts. */
export interface ScrapeSelectors {
  /** selects each repeating list-item element on the page */
  item: string;
  /** selects the title text, relative to `item` */
  title: string;
  /** selects the anchor whose href is the article URL, relative to `item`. Defaults to `item`
   *  itself if it's an <a>, else the first <a> inside it. */
  link?: string;
  /** for boards where the list "link" is really a JS onclick handler
   *  (href="javascript:void(0);" onclick="fn_goView('123789',...)") rather than a real href
   *  -- seen live on klia.or.kr. `pattern` is matched against the link element's `onclick`
   *  attribute; its first capture group is the article id, passed to `urlTemplate` to build
   *  the real (GET-able) article URL. Only used when the resolved href is missing or a
   *  `javascript:` pseudo-URL. */
  onclick?: { pattern: RegExp; urlTemplate: (id: string) => string };
  /** selects a date string, relative to `item`. Optional -- some board pages don't show one
   *  per row, in which case the article falls back to collection time (same as an RSS item
   *  with no parseable pubDate). */
  date?: string;
}

export interface ScrapeConfig {
  /** the board/list page to fetch -- not a feed endpoint, just the page a human would browse */
  url: string;
  selectors: ScrapeSelectors;
  /** parses this site's own date-string format into a Date, or null if unparseable. Every
   *  site formats its list-page dates differently (with/without year, dots vs dashes,
   *  relative "3시간 전" text, ...) -- there's no standard the way RSS's pubDate has one, so
   *  each scraped source supplies its own. */
  parseDate?: (raw: string) => Date | null;
}

export interface SourceConfig {
  id: string;
  name: string;
  /** required for fetchMethod 'rss'/'google_news_rss'. Scrape sources use `scrape.url`
   *  instead -- optional here so a scrape-only source doesn't need a meaningless placeholder. */
  rssUrl?: string;
  tier: SourceTier;
  reliability: Reliability;
  fetchMethod: FetchMethod;
  requiresBrowserUA?: boolean;
  /** required for fetchMethod 'html_scrape' -- see scrape.ts */
  scrape?: ScrapeConfig;
}

export const SOURCES: SourceConfig[] = [
  // Tier 1 — 공공기관
  { id: 'fsc', name: '금융위원회', rssUrl: 'http://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111', tier: 1, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'mohw', name: '보건복지부', rssUrl: 'https://www.mohw.go.kr/rss/board.es?mid=a10503000000&bid=0027', tier: 1, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'mfds', name: '식품의약품안전처', rssUrl: 'http://www.mfds.go.kr/www/rss/brd.do?brdId=ntc0021', tier: 1, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'hira', name: '건강보험심사평가원', rssUrl: 'https://www.hira.or.kr/cms/inform/02/news.xml', tier: 1, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'khidi', name: '한국보건산업진흥원', rssUrl: 'https://www.khidi.or.kr/rss?menuId=MENU00100', tier: 1, reliability: 'stable', fetchMethod: 'rss' },
  {
    id: 'nhis',
    name: '국민건강보험공단',
    tier: 1,
    reliability: 'stable',
    fetchMethod: 'html_scrape',
    scrape: {
      url: 'https://www.nhis.or.kr/nhis/together/wbhaea01600m01.do',
      selectors: { item: 'tbody tr', title: 'td.a-l a.a-link', date: 'td:nth-of-type(4)' },
      parseDate: (raw) => {
        const m = raw.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
        if (!m) return null;
        return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`);
      },
    },
  },
  {
    id: 'kdca',
    name: '질병관리청',
    tier: 1,
    reliability: 'stable',
    fetchMethod: 'html_scrape',
    scrape: {
      // this "보도자료(전체)" page's table is actually a site-wide recent-posts widget mixed
      // across several sub-boards (press releases, procurement notices, recruitment, regional
      // center notices, ...), not a clean single board -- no cleaner canonical list URL exists
      // (multiple bare /bbs/kdca/{id}/artclList.do board endpoints tried, all return 0 items;
      // RSS confirmed unsupported via /bbs/kdca/{id}/rssList.do). Accepting the occasional
      // off-topic item since KDCA is a whitelisted tier-1 institution and this is still the
      // most complete feed available.
      url: 'https://www.kdca.go.kr/kdca/2847/subview.do',
      selectors: {
        item: 'tbody tr',
        title: 'td.td-title a',
        // every row's link is href="javascript:jf_viewArtcl('kdca','41','312672')" -- board id
        // in the call is always the literal '41' regardless of the item's real sub-board, but
        // '41' turns out to be a working universal router (verified live: /bbs/kdca/41/{id}/
        // artclView.do resolves to the correct article for a row whose real board is 42/43/...)
        onclick: { pattern: /jf_viewArtcl\('kdca',\s*'\d+',\s*'(\d+)'\)/, urlTemplate: (id) => `/bbs/kdca/41/${id}/artclView.do?layout=unknown` },
        date: 'td.td-date',
      },
      parseDate: (raw) => {
        const m = raw.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
        if (!m) return null;
        return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`);
      },
    },
  },

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
  { id: 'ajunews', name: '아주경제', rssUrl: 'https://www.ajunews.com/rss/economy.xml', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'kmib', name: '국민일보', rssUrl: 'https://www.kmib.co.kr/rss/data/kmibRssAll.xml', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'mt', name: '머니투데이', rssUrl: 'https://rss.mt.co.kr/mt_news.xml', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'newsis', name: '뉴시스', rssUrl: 'https://www.newsis.com/RSS/economy.xml', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'einfomax', name: '연합인포맥스', rssUrl: 'https://news.einfomax.co.kr/rss/allArticle.xml', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'sisajournale', name: '시사저널e', rssUrl: 'https://www.sisajournal-e.com/rss/allArticle.xml', tier: 2, reliability: 'stable', fetchMethod: 'rss' },

  // Tier 3 — 헬스케어/보험 전문지
  { id: 'docdocdoc', name: '청년의사', rssUrl: 'https://www.docdocdoc.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'hitnews', name: '히트뉴스', rssUrl: 'https://www.hitnews.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'rapportian', name: '라포르시안', rssUrl: 'http://www.rapportian.com/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'kormedi', name: '코메디닷컴', rssUrl: 'https://kormedi.com/feed', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'bosa', name: '의학신문', rssUrl: 'http://www.bosa.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'monews', name: '메디칼업저버', rssUrl: 'http://www.monews.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'pharmnews', name: '팜뉴스', rssUrl: 'https://www.pharmnews.com/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'healthchosun', name: '헬스조선', rssUrl: 'https://health.chosun.com/site/data/rss/rss.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'medipana', name: '메디파나뉴스', rssUrl: 'https://www.medipana.com/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'doctorsnews', name: '의협신문', rssUrl: 'https://www.doctorsnews.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'kpanews', name: '약사공론', rssUrl: 'https://www.kpanews.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'insweek', name: '보험신보', rssUrl: 'https://www.insweek.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  {
    id: 'kiri',
    name: '보험연구원',
    tier: 3,
    reliability: 'stable',
    fetchMethod: 'html_scrape',
    scrape: {
      url: 'https://www.kiri.or.kr/community/materialList.do',
      selectors: { item: 'table.list_tb tbody tr', title: 'td:nth-of-type(2) a', date: 'td:nth-of-type(4)' },
      parseDate: (raw) => {
        const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`);
      },
    },
  },
  {
    id: 'klia',
    name: '생명보험협회',
    tier: 3,
    reliability: 'stable',
    fetchMethod: 'html_scrape',
    scrape: {
      url: 'https://www.klia.or.kr/board/2/list.do',
      selectors: {
        item: 'tbody tr',
        title: 'td.title a',
        onclick: { pattern: /fn_goView\('(\d+)'/, urlTemplate: (id) => `/board/2/view.do?boardNo=${id}` },
        date: 'td:nth-of-type(4)',
      },
      parseDate: (raw) => {
        const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`);
      },
    },
  },
  {
    id: 'knia',
    name: '손해보험협회',
    tier: 3,
    reliability: 'stable',
    fetchMethod: 'html_scrape',
    scrape: {
      url: 'https://www.knia.or.kr/data/news',
      selectors: { item: 'tbody tr', title: 'td.title a', date: 'td:nth-of-type(3)' },
      parseDate: (raw) => {
        const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`);
      },
    },
  },
  {
    id: 'dailypharm',
    name: '데일리팜',
    tier: 3,
    reliability: 'stable',
    fetchMethod: 'html_scrape',
    scrape: {
      url: 'https://www.dailypharm.com/user/news?group=%EC%A2%85%ED%95%A9',
      selectors: { item: 'li a[href*="/user/news/"]', title: '.lin_title', date: '.lin_data div:first-child' },
      parseDate: (raw) => {
        const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
        if (!m) return null;
        return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`);
      },
    },
  },
];
