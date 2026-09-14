/** @type {import('next').NextConfig} */
const nextConfig = {
  // jsdom (used by articleExtract.ts for the report feature) pulls in a transitive
  // dependency chain (html-encoding-sniffer -> @exodus/bytes) that ships an ESM-only
  // file required via CJS require() -- Next's server bundler doesn't handle that
  // interop and it broke ONLY in the real Vercel runtime (never surfaced locally in
  // `next build`, `next dev`, or Vitest). Marking jsdom external makes Next leave it
  // as a native `require()` at runtime instead of bundling/transforming it, which
  // resolves the interop mismatch. See docs/superpowers/plans/2026-09-14-market-intelligence-report.md.
  serverExternalPackages: ['jsdom'],
};
export default nextConfig;
