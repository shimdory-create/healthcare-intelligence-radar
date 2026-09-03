import { NextRequest, NextResponse } from 'next/server';
import { getCollectionDatesInMonth } from '@/lib/db';

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

/** dates within one KST calendar month that have collected articles, for the date-picker calendar */
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month');
  if (!month || !MONTH_PATTERN.test(month)) {
    return NextResponse.json({ error: 'invalid or missing month (expected YYYY-MM)' }, { status: 400 });
  }

  const dates = await getCollectionDatesInMonth(month);
  return NextResponse.json({ dates });
}
