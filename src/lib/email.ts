import type { ArticleRow, PriorityCounts } from './db';
import { sourceDisplayName } from './sourceLookup';

const RESEND_API_URL = 'https://api.resend.com/emails';

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

function priorityLabel(score: number): string {
  if (score >= 3) return '🔴 높음';
  if (score >= 1) return '🟡 보통';
  return '⚪ 참고';
}

export function buildDigestHtml(
  articles: ArticleRow[],
  counts: PriorityCounts,
  dateLabel: string,
  dashboardUrl: string,
): string {
  const rows = articles
    .map(
      (a) => `
    <tr>
      <td style="padding:6px 8px;white-space:nowrap;font-size:13px;">${priorityLabel(a.score)}</td>
      <td style="padding:6px 8px;white-space:nowrap;font-size:13px;color:#666;">${escapeHtml(sourceDisplayName(a.sourceId))}</td>
      <td style="padding:6px 8px;font-size:14px;"><a href="${escapeHtml(a.url)}" style="color:#111;text-decoration:none;">${escapeHtml(a.title)}</a></td>
    </tr>`,
    )
    .join('');

  return `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="margin-bottom:4px;">헬스케어 심텔리전스 레이더</h2>
      <p style="color:#666;margin-top:0;font-size:13px;">${dateLabel} 수집 · 총 ${counts.total}건 (🔴 높음 ${counts.high} · 🟡 보통 ${counts.medium} · ⚪ 참고 ${counts.low})</p>
      <p style="margin:8px 0 16px;font-size:13px;"><a href="${escapeHtml(dashboardUrl)}" style="color:#111;">대시보드에서 전체 보기 →</a></p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>`;
}

export function resolveDashboardUrl(): string {
  if (process.env.EMAIL_DASHBOARD_URL) return process.env.EMAIL_DASHBOARD_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}

/** sends the daily digest email; does nothing if there are no articles to report */
export async function sendDigestEmail(articles: ArticleRow[], counts: PriorityCounts, dateLabel: string): Promise<void> {
  if (articles.length === 0) return;

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.EMAIL_TO?.split(',')
    .map((addr) => addr.trim())
    .filter(Boolean);
  if (!apiKey || !to || to.length === 0) {
    throw new Error('RESEND_API_KEY or EMAIL_TO is not set');
  }

  const html = buildDigestHtml(articles, counts, dateLabel, resolveDashboardUrl());

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? 'Healthcare Radar <onboarding@resend.dev>',
      to,
      subject: `[헬스케어 심텔리전스 레이더] ${dateLabel} 수집 요약 (${counts.total}건)`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}
