import { describe, it, expect } from 'vitest';
import { scoreToPriority } from '@/lib/priority';

describe('scoreToPriority', () => {
  it('maps 3+ to high', () => {
    expect(scoreToPriority(3)).toBe('high');
    expect(scoreToPriority(5)).toBe('high');
  });

  it('maps 1-2 to medium', () => {
    expect(scoreToPriority(1)).toBe('medium');
    expect(scoreToPriority(2)).toBe('medium');
  });

  it('maps 0 to low', () => {
    expect(scoreToPriority(0)).toBe('low');
  });
});
