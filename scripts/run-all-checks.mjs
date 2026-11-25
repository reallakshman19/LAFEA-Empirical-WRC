/**
 * Runs every inherited LAFEA / EMP1 / WRC node check in scripts/ and reports a summary.
 *
 * Selected: *-check.mjs, *-self-test.mjs, *-source-guard.mjs, *-falsifiers.mjs, and the
 * independent WRC hand-calculation scripts (*-handcalc.mjs, *-refreeze.mjs).
 * Checks listed in scripts/known-upstream-failures.json also fail (or time out) in the
 * upstream Advanced_Analysis repo at the extraction commit. They are skipped by default
 * and reported as KNOWN; pass --include-known to run them anyway.
 *
 * Usage: node scripts/run-all-checks.mjs [filter-substring] [--timeout=ms] [--include-known]
 * Writes reports/checks-summary.json. Exit code 1 if any non-known check fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const filter = args.find((a) => !a.startsWith('--')) ?? '';
const timeout = Number(args.find((a) => a.startsWith('--timeout='))?.split('=')[1] ?? 180000);
const includeKnown = args.includes('--include-known');
const PATTERN = /(?:-check|-self-test|-source-guard|-falsifiers|-handcalc|-refreeze)\.mjs$/u;
const knownFile = JSON.parse(fs.readFileSync('scripts/known-upstream-failures.json', 'utf8'));
const known = new Map(knownFile.scripts.map((entry) => [entry.name, entry]));

const scripts = fs.readdirSync('scripts')
  .filter((name) => PATTERN.test(name) && /lafea|emp1|wrc/iu.test(name) && name.includes(filter))
  .sort();

const results = [];
for (const name of scripts) {
  if (known.has(name) && !includeKnown) {
    results.push({ name, status: 'KNOWN', upstream: known.get(name).upstream });
    continue;
  }
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join('scripts', name)], {
    encoding: 'utf8', timeout, maxBuffer: 1 << 26,
  });
  const status = run.error?.code === 'ETIMEDOUT' ? 'TIMEOUT' : run.status === 0 ? 'PASS' : 'FAIL';
  const errorLines = `${run.stderr ?? ''}\n${run.stdout ?? ''}`.split('\n')
    .filter((line) => /Error|ENOENT|assert|expected|missing|FAIL/iu.test(line)).slice(0, 3).join(' | ');
  results.push({
    name, status, ms: Date.now() - started,
    ...(known.has(name) ? { knownUpstream: known.get(name).upstream } : {}),
    ...(status === 'PASS' ? {} : { error: errorLines.slice(0, 500) }),
  });
  process.stdout.write(`${status.padEnd(7)} ${name}\n`);
}

const counts = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/checks-summary.json', `${JSON.stringify({ counts, results }, null, 2)}\n`);
console.log(`\n${JSON.stringify(counts)}  (details: reports/checks-summary.json)`);
process.exit(results.some((r) => r.status !== 'PASS' && r.status !== 'KNOWN' && !r.knownUpstream) ? 1 : 0);
