import { describe, it, expect } from 'vitest';
import { buildReportImage } from '@/lib/reportImage';

describe('buildReportImage', () => {
  it('renders a non-empty PNG buffer for a minimal report', async () => {
    const sections = [
      { title: '국내 산업', items: [{ headline: '테스트 헤드라인', note: null, bullets: [{ text: '사실 1', subBullets: [] }] }] },
    ];

    const buffer = await buildReportImage(sections);

    expect(buffer.length).toBeGreaterThan(0);
    // PNG files always start with this 8-byte magic number
    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('renders without throwing when there are no sections', async () => {
    const buffer = await buildReportImage([]);
    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });
});
