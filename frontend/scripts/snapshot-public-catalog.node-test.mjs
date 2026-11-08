import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const execute = promisify(execFile);
const script = fileURLToPath(new URL('./snapshot-public-catalog.mjs', import.meta.url));
async function fixture(testCase, run) {
  const folder = await mkdtemp(join(tmpdir(), 'bonefree-catalog-'));
  const calls = [];
  const server = http.createServer((req, res) => {
    const page = Number(new URL(req.url, 'http://localhost').searchParams.get('page'));
    calls.push(page); res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(testCase(page)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run({ output: join(folder, 'catalog.json'), url: `http://127.0.0.1:${server.address().port}`, calls }); }
  finally { await new Promise(resolve => server.close(resolve)); await rm(folder, { recursive: true, force: true }); }
}
test('captures every page of a verified catalog once', async () => {
  await fixture(page => ({ items: Array.from({ length: page === 3 ? 5 : 100 }, (_, i) => ({ id: (page - 1) * 100 + i + 1 })), page, total: 205, total_pages: 3 }), async ({ url, output, calls }) => {
    await execute(process.execPath, [script, url, output]);
    const result = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(result.productIds.length, 205);
    assert.deepEqual(calls, [1, 2, 3]);
    assert.ok(Date.parse(result.capturedAt));
  });
});
test('rejects duplicates, incomplete pages and catalog changes', async () => {
  for (const response of [
    page => ({ items: [{ id: 1 }], page, total: 2, total_pages: 2 }),
    page => ({ items: [], page, total: 2, total_pages: 1 }),
    page => ({ items: [{ id: page }], page, total: page === 1 ? 2 : 3, total_pages: 2 }),
  ]) await fixture(response, async ({ url, output }) => {
    await assert.rejects(execute(process.execPath, [script, url, output]));
    await assert.rejects(readFile(output));
  });
});
