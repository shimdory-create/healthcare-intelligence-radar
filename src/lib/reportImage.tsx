import React from 'react';
import { ImageResponse } from 'next/og';
import type { ReportSection } from './report';

export async function buildReportImage(sections: ReportSection[]): Promise<Buffer> {
  const response = new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: '800px', padding: '32px', backgroundColor: '#ffffff', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, justifyContent: 'center', marginBottom: 24 }}>
          Healthcare Market Intelligence
        </div>
        {sections.map((section, i) => (
          <div key={section.title} style={{ display: 'flex', flexDirection: 'column', marginBottom: 20 }}>
            <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {i + 1}. {section.title}
            </div>
            {section.items.map((item) => (
              <div key={item.headline} style={{ display: 'flex', flexDirection: 'column', marginBottom: 10, paddingLeft: 12 }}>
                <div style={{ display: 'flex', fontSize: 15, fontWeight: 700 }}>□ {item.headline}</div>
                {item.bullets.slice(0, 2).map((bullet, bi) => (
                  <div key={bi} style={{ display: 'flex', fontSize: 13, color: '#333333', paddingLeft: 16 }}>
                    - {bullet.text}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    ),
    { width: 800, height: 1000 },
  );

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
