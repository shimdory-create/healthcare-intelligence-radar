import { TAGS, type TagDefinition } from './tags.config';

export interface TagMatchResult {
  tags: string[];
  score: number;
}

export function matchTags(text: string, tagDefs: TagDefinition[] = TAGS): TagMatchResult {
  const lower = text.toLowerCase();
  const matched: TagDefinition[] = [];
  for (const def of tagDefs) {
    // strip known false-positive substrings (e.g. "암호화" for the "암" keyword)
    // before matching, so a genuine mention elsewhere in the same text still counts
    let searchText = lower;
    for (const exclude of def.excludeKeywords ?? []) {
      searchText = searchText.split(exclude.toLowerCase()).join('');
    }
    const hit = def.keywords.some((kw) => searchText.includes(kw.toLowerCase()));
    if (hit) matched.push(def);
  }
  // Weak/generic tags (e.g. "보험", "플랫폼") false-positive on unrelated articles ("무역보험",
  // 부동산 "플랫폼" news). They still display as tags, but shouldn't promote priority unless at
  // least one specific tag also matched.
  const hasStrongMatch = matched.some((def) => !def.weak);
  const score = hasStrongMatch ? matched.length : 0;
  return { tags: matched.map((def) => def.tag), score };
}
