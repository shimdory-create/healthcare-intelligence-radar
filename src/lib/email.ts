import type { ArticleRow, PriorityCounts, AiAnalysis, DuplicateRef } from './db';
import { sourceDisplayName, TIER_LABELS } from './sourceLookup';
import { PRIORITY_LABELS } from './priority';

const RESEND_API_URL = 'https://api.resend.com/emails';

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

function publishedLabel(publishedAt: Date | null): string {
  if (!publishedAt) return '날짜 미상';
  return publishedAt.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function tagsHtml(tags: string[]): string {
  if (tags.length === 0) return '';
  const pills = tags
    .map((t) => `<span style="display:inline-block;font-size:11px;color:#666;border:1px solid #e5e5e5;border-radius:5px;padding:1px 6px;margin:4px 0 0 4px;">${escapeHtml(t)}</span>`)
    .join('');
  return `<div style="text-align:right;">${pills}</div>`;
}

function implicationsHtml(implications: string[]): string {
  if (implications.length === 0) return '';
  const items = implications.map((point) => `<li>${escapeHtml(point)}</li>`).join('');
  return `<ul style="margin:4px 0 0;padding-left:16px;font-size:12px;color:#666;">${items}</ul>`;
}

function duplicatesHtml(duplicates: DuplicateRef[]): string {
  if (duplicates.length === 0) return '';
  const links = duplicates
    .map((d) => `<a href="${escapeHtml(d.url)}" style="color:#999;text-decoration:underline;">${escapeHtml(sourceDisplayName(d.sourceId))}</a>`)
    .join(', ');
  return `<p style="margin:4px 0 0;font-size:11px;color:#999;">같은 소식: ${links}</p>`;
}

export function buildDigestHtml(
  articles: ArticleRow[],
  counts: PriorityCounts,
  dateLabel: string,
  dashboardUrl: string,
  analysesById: Map<number, AiAnalysis> = new Map(),
  duplicatesById: Map<number, DuplicateRef[]> = new Map(),
): string {
  const cards = articles
    .map((a) => {
      const analysis = analysesById.get(a.id);
      return `
    <div style="border:1px solid #e5e5e5;border-radius:8px;padding:10px 12px;margin:0 0 8px;">
      <p style="margin:0 0 4px;font-size:12px;color:#666;">${PRIORITY_LABELS[a.priority]} · ${TIER_LABELS[a.tier]} · ${escapeHtml(sourceDisplayName(a.sourceId))} · ${publishedLabel(a.publishedAt)}</p>
      <a href="${escapeHtml(a.url)}" style="font-size:14px;font-weight:600;color:#111;text-decoration:none;">${escapeHtml(a.title)}</a>
      ${analysis ? `<p style="margin:4px 0 0;font-size:12px;color:#666;line-height:1.5;">${escapeHtml(analysis.summary)}</p>` : ''}
      ${analysis ? implicationsHtml(analysis.implications) : ''}
      ${analysis?.watchPoint ? `<p style="margin:4px 0 0;font-size:11px;color:#999;">Watch: ${escapeHtml(analysis.watchPoint)}</p>` : ''}
      ${duplicatesHtml(duplicatesById.get(a.id) ?? [])}
      ${tagsHtml(a.tags)}
    </div>`;
    })
    .join('');

  return `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:16px;background:#ffffff;color:#111;">
      <h2 style="margin-bottom:4px;">헬스케어 레이더</h2>
      <p style="color:#666;margin-top:0;font-size:13px;">${dateLabel} 수집 · 총 ${counts.total}건 (🔴 높음 ${counts.high} · 🟡 보통 ${counts.medium} · ⚪ 참고 ${counts.low})</p>
      <p style="margin:8px 0 16px;font-size:13px;"><a href="${escapeHtml(dashboardUrl)}" style="color:#111;">대시보드에서 전체 보기 →</a></p>
      <p style="margin:0 0 16px;font-size:11px;color:#999;line-height:1.5;">
        추출 기준: 키워드에 매칭된 기사만 수집 (공공기관/Tier 1 자료는 매칭 여부와 무관하게 모두 수집)<br />
        정렬 기준: 우선순위 높은 순 → 최신순<br />
        우선순위 기준: AI가 보험사 헬스케어 관점 실제 업무 관련성으로 판정 (AI 미분석 시 매칭 태그 개수로 잠정 판정)
      </p>
      ${cards}
    </div>`;
}

export function resolveDashboardUrl(): string {
  if (process.env.EMAIL_DASHBOARD_URL) return process.env.EMAIL_DASHBOARD_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}

/** sends the daily digest email; does nothing if there are no articles to report */
export async function sendDigestEmail(
  articles: ArticleRow[],
  counts: PriorityCounts,
  dateLabel: string,
  analysesById: Map<number, AiAnalysis> = new Map(),
  duplicatesById: Map<number, DuplicateRef[]> = new Map(),
): Promise<void> {
  if (articles.length === 0) return;

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.EMAIL_TO?.split(',')
    .map((addr) => addr.trim())
    .filter(Boolean);
  if (!apiKey || !to || to.length === 0) {
    throw new Error('RESEND_API_KEY or EMAIL_TO is not set');
  }

  const html = buildDigestHtml(articles, counts, dateLabel, resolveDashboardUrl(), analysesById, duplicatesById);

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? 'Healthcare Radar <onboarding@resend.dev>',
      to,
      subject: `[헬스케어 레이더] ${dateLabel} 수집 요약 (${counts.total}건)`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}
