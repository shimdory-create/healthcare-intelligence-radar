import { TAGS, type TagDefinition } from './tags.config';

export interface TagMatchResult {
  tags: string[];
  score: number;
}

export function matchTags(text: string, tagDefs: TagDefinition[] = TAGS): TagMatchResult {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const def of tagDefs) {
    const hit = def.keywords.some((kw) => lower.includes(kw.toLowerCase()));
    if (hit) matched.push(def.tag);
  }
  return { tags: matched, score: matched.length };
}
