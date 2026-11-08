// Explicit release-time task. Never runs on visitor navigation or during ordinary builds.
import { writeFile } from 'node:fs/promises';
const [apiBase, output] = process.argv.slice(2);
if (!apiBase || !output) throw new Error('Usage: node scripts/snapshot-public-catalog.mjs https://api.example.com /path/catalog.json');
const base = new URL(apiBase.endsWith('/') ? apiBase : apiBase + '/');
if (!['http:', 'https:'].includes(base.protocol)) throw new Error('HTTP API required');
const ids = new Set();
let total;
for (let page = 1; ; page++) {
  if (page > 1000) throw new Error('Catalog exceeds safety bound');
  const url = new URL('products/', base);
  url.search = new URLSearchParams({ page: String(page), per_page: '100', locale: 'pt-PT' }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Catalog request failed: HTTP ${response.status}`);
  const result = await response.json();
  if (!Array.isArray(result.items) || result.page !== page || !Number.isSafeInteger(result.total_pages) || result.total_pages < 0 || !Number.isSafeInteger(result.total)) throw new Error('Invalid pagination metadata');
  total ??= result.total;
  if (total !== result.total) throw new Error('Catalog changed during snapshot; retry while publishing is paused');
  for (const item of result.items) {
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || ids.has(item.id)) throw new Error('Invalid or duplicate product ID');
    ids.add(item.id);
  }
  if (page >= result.total_pages) break;
}
if (ids.size !== total) throw new Error('Incomplete catalog; retry snapshot');
await writeFile(output, JSON.stringify({ capturedAt: new Date().toISOString(), productIds: [...ids] }, null, 2) + '\n');
console.log(`Verified ${ids.size} public product URLs; wrote ${output}`);
