# Healthcare Intelligence Radar

A personal RSS news-monitoring tool that collects and tags healthcare/insurance
industry news from 23 Korean government, press, and trade sources, then
surfaces it in a simple dashboard.

## Running locally

```bash
npm install
cp .env.local.example .env.local   # then fill in real values
npm run dev
```

## Deployment gotchas

- **Use the Supabase Transaction Pooler, not the direct connection.** The
  direct connection (port 5432) can fail DNS resolution on networks without
  IPv6 support. Use the pooler connection string (port 6543) instead — see
  `.env.local.example`.
- **The pooler requires `prepare: false`.** PgBouncer in transaction-mode
  pooling doesn't reliably support prepared statements, so the postgres.js
  client in `src/lib/db.ts` disables them.
- **The cron collection route needs a long `maxDuration` and per-source
  timeouts.** Pulling from 23 real RSS sources can be slow and some feeds
  hang; the route sets `maxDuration = 300` and each fetch uses
  `AbortSignal.timeout(...)` so a single slow or hanging source can't stall
  the whole run.

## Further detail

See the full spec and plan docs:
- [`docs/superpowers/specs/2026-09-03-healthcare-intelligence-radar-design.md`](docs/superpowers/specs/2026-09-03-healthcare-intelligence-radar-design.md)
- [`docs/superpowers/plans/2026-09-03-healthcare-intelligence-radar.md`](docs/superpowers/plans/2026-09-03-healthcare-intelligence-radar.md)
