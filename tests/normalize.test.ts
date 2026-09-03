import { describe, it, expect } from 'vitest';
import { normalizeTitle, isSameDay } from '@/lib/normalize';

describe('normalizeTitle', () => {
  it('lowercases and strips whitespace', () => {
    expect(normalizeTitle('GLP-1 처방 확대 논의')).toBe(normalizeTitle('glp-1  처방   확대  논의'));
  });

  it('strips punctuation', () => {
    expect(normalizeTitle('금융위, 헬스케어 규제 완화')).toBe(normalizeTitle('금융위 헬스케어 규제 완화'));
  });

  it('produces different output for genuinely different titles', () => {
    expect(normalizeTitle('금융위 헬스케어 규제 완화')).not.toBe(normalizeTitle('복지부 요양 정책 개편'));
  });
});

describe('isSameDay', () => {
  it('returns true for two timestamps on the same UTC calendar day', () => {
    expect(isSameDay(new Date('2026-09-03T01:00:00Z'), new Date('2026-09-03T23:00:00Z'))).toBe(true);
  });

  it('returns false for timestamps on different UTC calendar days', () => {
    expect(isSameDay(new Date('2026-09-03T23:59:00Z'), new Date('2026-09-04T00:01:00Z'))).toBe(false);
  });
});
