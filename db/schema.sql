create table if not exists sources (
  id text primary key,
  name text not null,
  rss_url text not null,
  tier smallint not null,
  reliability text not null default 'stable',
  fetch_method text not null default 'rss'
);

create table if not exists articles (
  id serial primary key,
  source_id text not null references sources(id),
  title text not null,
  url text not null unique,
  title_norm text not null,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  content_snippet text,
  tags text[] not null default '{}',
  score int not null default 0
);

create index if not exists idx_articles_title_norm_published on articles (title_norm, published_at);
create index if not exists idx_articles_published_at on articles (published_at desc);

insert into sources (id, name, rss_url, tier, reliability, fetch_method) values
  ('fsc', '금융위원회', 'http://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111', 1, 'stable', 'rss'),
  ('mohw', '보건복지부', 'https://www.mohw.go.kr/rss/board.es?mid=a10503000000&bid=0027', 1, 'stable', 'rss'),
  ('mfds', '식품의약품안전처', 'http://www.mfds.go.kr/www/rss/brd.do?brdId=ntc0021', 1, 'stable', 'rss'),
  ('hira', '건강보험심사평가원', 'https://www.hira.or.kr/cms/inform/02/news.xml', 1, 'stable', 'rss'),
  ('khidi', '한국보건산업진흥원', 'https://www.khidi.or.kr/rss?menuId=MENU00100', 1, 'stable', 'rss'),
  ('yna', '연합뉴스', 'https://www.yna.co.kr/rss/economy.xml', 2, 'stable', 'rss'),
  ('chosun', '조선일보', 'https://www.chosun.com/arc/outboundfeeds/rss/category/economy/?outputType=xml', 2, 'stable', 'rss'),
  ('donga', '동아일보', 'http://rss.donga.com/economy.xml', 2, 'stable', 'rss'),
  ('hani', '한겨레', 'https://www.hani.co.kr/rss/economy', 2, 'stable', 'rss'),
  ('hankyung', '한국경제', 'https://www.hankyung.com/feed/economy', 2, 'stable', 'rss'),
  ('mk', '매일경제', 'https://www.mk.co.kr/rss/30100041/', 2, 'stable', 'rss'),
  ('herald', '헤럴드경제', 'https://biz.heraldcorp.com/rss/google/economy', 2, 'stable', 'rss'),
  ('edaily', '이데일리', 'https://rss.edaily.co.kr/economy_news.xml', 2, 'stable', 'rss'),
  ('sedaily', '서울경제', 'https://www.sedaily.com/rss/economy', 2, 'stable', 'rss'),
  ('joongang', '중앙일보', 'https://news.google.com/rss/search?q=site:joongang.co.kr+when:1d&hl=ko&gl=KR&ceid=KR:ko', 2, 'experimental', 'google_news_rss'),
  ('docdocdoc', '청년의사', 'https://www.docdocdoc.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('hitnews', '히트뉴스', 'https://www.hitnews.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('rapportian', '라포르시안', 'http://www.rapportian.com/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('kormedi', '코메디닷컴', 'https://kormedi.com/feed', 3, 'stable', 'rss'),
  ('bosa', '의학신문', 'http://www.bosa.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('monews', '메디칼업저버', 'http://www.monews.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('pharmnews', '팜뉴스', 'https://www.pharmnews.com/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('healthchosun', '헬스조선', 'https://health.chosun.com/site/data/rss/rss.xml', 3, 'stable', 'rss')
on conflict (id) do update set
  name = excluded.name,
  rss_url = excluded.rss_url,
  tier = excluded.tier,
  reliability = excluded.reliability,
  fetch_method = excluded.fetch_method;
