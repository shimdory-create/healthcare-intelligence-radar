import { SOURCES } from './sources.config';

const SOURCE_NAME_BY_ID: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.id, s.name]));

export function sourceDisplayName(sourceId: string): string {
  return SOURCE_NAME_BY_ID[sourceId] ?? sourceId;
}

export const TIER_LABELS: Record<1 | 2 | 3, string> = {
  1: '공공기관',
  2: '종합/경제지',
  3: '전문지',
};
