import { describe, it, expect } from 'vitest';
import { matchTags } from '@/lib/tagging';
import type { TagDefinition } from '@/lib/tags.config';

const testTags: TagDefinition[] = [
  { tag: 'GLP-1', keywords: ['GLP-1', '위고비', '삭센다'] },
  { tag: '시니어', keywords: ['시니어', '고령자'] },
];

describe('matchTags', () => {
  it('matches a tag whose keyword appears in the text', () => {
    const result = matchTags('위고비 처방 확대 논의', testTags);
    expect(result.tags).toEqual(['GLP-1']);
    expect(result.score).toBe(1);
  });

  it('matches multiple tags and scores by count', () => {
    const result = matchTags('시니어 대상 GLP-1 비만치료제 급여화 검토', testTags);
    expect(result.tags.sort()).toEqual(['GLP-1', '시니어'].sort());
    expect(result.score).toBe(2);
  });

  it('returns empty tags and zero score when nothing matches', () => {
    const result = matchTags('오늘의 날씨 예보', testTags);
    expect(result.tags).toEqual([]);
    expect(result.score).toBe(0);
  });

  it('matching is case-insensitive for latin keywords', () => {
    const result = matchTags('glp-1 관련 소식', testTags);
    expect(result.tags).toEqual(['GLP-1']);
  });

  it('uses the default TAGS dictionary when none is passed', () => {
    const result = matchTags('국민건강보험공단 언더라이팅 데이터 활용');
    expect(result.tags).toContain('언더라이팅');
  });

  it('excludeKeywords prevents a known false-positive substring from matching', () => {
    const cancerTag: TagDefinition[] = [{ tag: '암', keywords: ['암'], excludeKeywords: ['암호'] }];
    const result = matchTags('티빙, 접속키 암호화 안해…계정 정보 유출', cancerTag);
    expect(result.tags).toEqual([]);
  });

  it('excludeKeywords does not suppress a genuine match elsewhere in the same text', () => {
    const cancerTag: TagDefinition[] = [{ tag: '암', keywords: ['암'], excludeKeywords: ['암호'] }];
    const result = matchTags('암호화 기술 도입 논의 중, 암 환자 치료비 지원 확대', cancerTag);
    expect(result.tags).toEqual(['암']);
  });
});
