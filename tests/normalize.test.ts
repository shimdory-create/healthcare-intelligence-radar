import { describe, it, expect } from 'vitest';
import { normalizeTitle } from '@/lib/normalize';

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
