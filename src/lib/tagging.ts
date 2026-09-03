import { TAGS, type TagDefinition } from './tags.config';

export interface TagMatchResult {
  tags: string[];
  score: number;
}

export function matchTags(text: string, tagDefs: TagDefinition[] = TAGS): TagMatchResult {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const def of tagDefs) {
    // strip known false-positive substrings (e.g. "암호화" for the "암" keyword)
    // before matching, so a genuine mention elsewhere in the same text still counts
    let searchText = lower;
    for (const exclude of def.excludeKeywords ?? []) {
      searchText = searchText.split(exclude.toLowerCase()).join('');
    }
    const hit = def.keywords.some((kw) => searchText.includes(kw.toLowerCase()));
    if (hit) matched.push(def.tag);
  }
  return { tags: matched, score: matched.length };
}
