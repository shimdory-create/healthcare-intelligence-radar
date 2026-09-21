import { NextRequest, NextResponse } from 'next/server';
import { analyzeDeep } from '@/lib/gemini';

// TEMPORARY diagnostic route -- calls analyzeDeep directly with a fixed sample text to surface
// the RAW error from the new headline_source/sub_bullet-note schema (analyzeCandidatesDeep
// swallows the actual error message into a generic 'gemini-failed' skip reason). Delete after
// confirming.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await analyzeDeep(
      '삼성생명, 디지털 전용 건강보험 출시',
      '삼성생명이 20일 건강관리 리워드를 결합한 디지털 전용 건강보험을 출시했다고 밝혔다. 이 상품은 모바일 애플리케이션을 통해서만 가입할 수 있으며, 가입자가 건강관리 목표를 달성할 경우 최대 67만원의 보험료 할인 혜택을 받을 수 있다. 삼성생명 관계자는 이번 상품이 젊은 세대의 건강관리 습관을 유도하기 위한 것이라고 설명했다.',
    );
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) },
      { status: 500 },
    );
  }
}
