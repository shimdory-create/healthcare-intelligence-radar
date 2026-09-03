import { SOURCES } from './sources.config';

const SOURCE_NAME_BY_ID: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.id, s.name]));

export function sourceDisplayName(sourceId: string): string {
  return SOURCE_NAME_BY_ID[sourceId] ?? sourceId;
}
