import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const results: Record<string, string> = {};

  const tryImport = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      results[name] = 'ok';
    } catch (err) {
      results[name] = `error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`;
    }
  };

  await tryImport('reportCandidates', () => import('@/lib/reportCandidates'));
  await tryImport('articleExtract', () => import('@/lib/articleExtract'));
  await tryImport('reportAnalysis', () => import('@/lib/reportAnalysis'));
  await tryImport('report', () => import('@/lib/report'));
  await tryImport('reportImage', () => import('@/lib/reportImage'));
  await tryImport('reportSchedule', () => import('@/lib/reportSchedule'));

  // also try actually calling buildReportDocx / buildReportImage with trivial input,
  // since a bundling issue might only surface when the WASM/native pieces are used
  await tryImport('buildReportDocx-call', async () => {
    const { buildReportDocx } = await import('@/lib/report');
    await buildReportDocx([], 'test', 'test');
  });
  await tryImport('buildReportImage-call', async () => {
    const { buildReportImage } = await import('@/lib/reportImage');
    await buildReportImage([]);
  });
  await tryImport('extractArticleText-call', async () => {
    const { extractArticleText } = await import('@/lib/articleExtract');
    await extractArticleText('https://example.com');
  });

  return NextResponse.json(results);
}
