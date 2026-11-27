/**
 * Runs every LAFEA / EMP1 / WRC node check in scripts/ and reports a summary.
 *
 * Selected: *-check.mjs, *-self-test.mjs, *-source-guard.mjs, *-falsifiers.mjs, and the
 * independent WRC hand-calculation scripts (*-handcalc.mjs, *-refreeze.mjs).
 * Checks listed in scripts/known-upstream-failures.json are skipped by default and reported as
 * KNOWN: each is a REAL_GAP (a real limitation, with the reason), SLOW (too long for this run) or
 * a HELPER (a script another check runs with arguments). Pass --include-known to run them anyway.
 * Checks that need a tool that is not installed (python3) are reported as SKIPPED with the reason;
 * CI (ubuntu-latest) has it, so they run there.
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

// The B01 route checks were upstream qualification runs that refuse a dirty git tree. Here they
// are regression checks, so they run on a working tree too (the receipt records the override).
const SCRIPT_ARGS = {
  'lafea-b01-registered-route-check.mjs': ['--allow-dirty'],
  'lafea-b01-metamorphic-route-check.mjs': ['--allow-dirty'],
  'lafea-b01-negative-route-check.mjs': ['--allow-dirty'],
};
// The B01 meshes come from validation/lafea-benchmark-data/B01/mesh-generator.py.
const REQUIRES = {
  'lafea-b01-registered-route-check.mjs': 'python3',
  'lafea-b01-metamorphic-route-check.mjs': 'python3',
  'lafea-b01-negative-route-check.mjs': 'python3',
};
// About 2 minutes on an idle machine, close to the default limit; give it room on a busy one.
const SCRIPT_TIMEOUT = {
  'lafea-b02d-v2-governing-response-check.mjs': 600000,
  // The lug shell-FE checks take about 70 s alone and over 2 min on a busy machine.
  'wrc-lug-fe-check.mjs': 300000,
  'wrc-lug-fe-route-check.mjs': 300000,
};
const available = new Map();
const hasTool = (tool) => {
  if (!available.has(tool)) {
    const probe = spawnSync(tool, ['--version'], { encoding: 'utf8' });
    available.set(tool, !probe.error && probe.status === 0);
  }
  return available.get(tool);
};

const scripts = fs.readdirSync('scripts')
  .filter((name) => PATTERN.test(name) && /lafea|emp1|wrc/iu.test(name) && name.includes(filter))
  .sort();

const results = [];
for (const name of scripts) {
  if (known.has(name) && !includeKnown) {
    results.push({ name, status: 'KNOWN', kind: known.get(name).kind });
    continue;
  }
  if (REQUIRES[name] && !hasTool(REQUIRES[name])) {
    results.push({ name, status: 'SKIPPED', reason: `needs ${REQUIRES[name]} on PATH` });
    process.stdout.write(`SKIPPED ${name} (needs ${REQUIRES[name]})\n`);
    continue;
  }
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join('scripts', name), ...(SCRIPT_ARGS[name] ?? [])], {
    encoding: 'utf8', timeout: Math.max(timeout, SCRIPT_TIMEOUT[name] ?? 0), maxBuffer: 1 << 26,
  });
  const status = run.error?.code === 'ETIMEDOUT' ? 'TIMEOUT' : run.status === 0 ? 'PASS' : 'FAIL';
  const errorLines = `${run.stderr ?? ''}\n${run.stdout ?? ''}`.split('\n')
    .filter((line) => /Error|ENOENT|assert|expected|missing|FAIL/iu.test(line)).slice(0, 3).join(' | ');
  results.push({
    name, status, ms: Date.now() - started,
    ...(known.has(name) ? { knownKind: known.get(name).kind } : {}),
    ...(status === 'PASS' ? {} : { error: errorLines.slice(0, 500) }),
  });
  process.stdout.write(`${status.padEnd(7)} ${name}\n`);
}

const counts = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/checks-summary.json', `${JSON.stringify({ counts, results }, null, 2)}\n`);
console.log(`\n${JSON.stringify(counts)}  (details: reports/checks-summary.json)`);
process.exit(results.some((r) => (r.status === 'FAIL' || r.status === 'TIMEOUT') && !r.knownKind) ? 1 : 0);
