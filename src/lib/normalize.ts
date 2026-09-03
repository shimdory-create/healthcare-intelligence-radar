export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}
