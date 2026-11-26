/**
 * First-load bundle size check (Phase 5.1).
 *
 * Inputs: a finished `npm run build` (dist/.vite/manifest.json and dist/index.html).
 *         Optional `--limit-kb <n>` (default 500, in kB = 1000 bytes, as Vite reports sizes).
 * Output: the JS chunks the first load of index.html needs (the entry chunk and everything it
 *         imports statically), their sizes, and PASS or FAIL. Exit code 1 on FAIL.
 * Fails when:
 *  - the first-load JS is over the limit;
 *  - the LAFEA standalone controller is in the first load (it must stay a lazy chunk);
 *  - dist/index.html does not load the entry chunk the manifest names.
 */
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = 'dist';
const ENTRY = 'index.html';
const limitArg = process.argv.indexOf('--limit-kb');
const LIMIT_KB = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 500;
if (!Number.isFinite(LIMIT_KB) || LIMIT_KB <= 0) {
  console.error('bundle-size-check: --limit-kb needs a positive number.');
  process.exit(2);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(DIST, '.vite', 'manifest.json'), 'utf8'));
} catch (error) {
  console.error(`bundle-size-check: cannot read ${DIST}/.vite/manifest.json. Run "npm run build" first. (${error.message})`);
  process.exit(2);
}

const entry = manifest[ENTRY];
if (!entry?.isEntry) {
  console.error(`bundle-size-check: the manifest has no "${ENTRY}" entry.`);
  process.exit(2);
}

// Walk the static import graph from the entry; dynamic imports are not part of the first load.
const firstLoad = new Map();
(function visit(key) {
  const chunk = manifest[key];
  if (!chunk || firstLoad.has(chunk.file)) return;
  firstLoad.set(chunk.file, chunk);
  for (const imported of chunk.imports ?? []) visit(imported);
})(ENTRY);

const failures = [];
const html = readFileSync(join(DIST, ENTRY), 'utf8');
if (!html.includes(entry.file)) failures.push(`${DIST}/${ENTRY} does not load the entry chunk ${entry.file}.`);

const rows = [...firstLoad.values()]
  .filter((chunk) => chunk.file.endsWith('.js'))
  .map((chunk) => {
    const path = join(DIST, chunk.file);
    return { file: chunk.file, bytes: statSync(path).size, gzip: gzipSync(readFileSync(path)).length };
  })
  .sort((a, b) => b.bytes - a.bytes);

for (const row of rows) {
  if (/standalone-controller/.test(row.file)) {
    failures.push(`The LAFEA standalone controller (${row.file}) is in the first load; it must be loaded with import().`);
  }
}

const kB = (bytes) => (bytes / 1000).toFixed(2);
const total = rows.reduce((sum, row) => sum + row.bytes, 0);
const totalGzip = rows.reduce((sum, row) => sum + row.gzip, 0);
console.log(`First-load JS for ${ENTRY} (entry + static imports):`);
for (const row of rows) console.log(`  ${kB(row.bytes).padStart(10)} kB  (gzip ${kB(row.gzip).padStart(8)} kB)  ${row.file}`);
console.log(`  ${kB(total).padStart(10)} kB  (gzip ${kB(totalGzip).padStart(8)} kB)  total; limit ${LIMIT_KB} kB`);

if (total > LIMIT_KB * 1000) failures.push(`First-load JS is ${kB(total)} kB, over the ${LIMIT_KB} kB limit.`);

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log('PASS: first-load JS is within the limit and LAFEA is lazy-loaded.');
