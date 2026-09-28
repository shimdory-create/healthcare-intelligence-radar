// Fails (exit 1) if `npm audit --json` reports a high/critical advisory that isn't already in
// .github/npm-audit-allowlist.json. Run monthly from keepalive.yml so a NEW vulnerability
// (beyond the one already reviewed and deliberately deferred) doesn't sit unnoticed for months
// with nobody manually re-running npm audit.
import { readFileSync } from 'node:fs';

const [, , auditPath, allowlistPath] = process.argv;
const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
const allowlist = new Set(JSON.parse(readFileSync(allowlistPath, 'utf8')).accepted);

const found = new Set();
for (const vuln of Object.values(audit.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via === 'object' && via.url && (via.severity === 'high' || via.severity === 'critical')) {
      found.add(via.url.split('/').pop());
    }
  }
}

const unknown = [...found].filter((id) => !allowlist.has(id));
if (unknown.length > 0) {
  console.error('New high/critical vulnerabilities not in the allowlist:', unknown.join(', '));
  console.error('Review each at https://github.com/advisories/<id> -- if still fine to defer, add it to');
  console.error('.github/npm-audit-allowlist.json with a reason; otherwise fix it.');
  process.exit(1);
}
console.log(`OK -- ${found.size} known high/critical advisor${found.size === 1 ? 'y' : 'ies'}, all allowlisted.`);
