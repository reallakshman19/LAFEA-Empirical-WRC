/**
 * Checks the "Status & roadmap" tab content (src/app/status/status-content.js):
 *  - every entry has its required fields, a unique id and a known severity, size or state;
 *  - facts the page states match their sources: the tabulated γ rows, the KNOWN-check count in
 *    scripts/known-upstream-failures.json, and the PV Elite WRC 297 ratios recorded in docs;
 *  - nothing on the page claims the universal canvas exists yet.
 * The file name contains "wrc" so check:all picks it up.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DECISIONS_MADE, KNOWN_ISSUES, OPEN_DECISIONS, PLANNED_IMPROVEMENTS, ROADMAP, SEVERITIES, STATUS_STATES, STATUS_TODAY,
  STATUS_UPDATED, STATUS_VISION,
} from '../src/app/status/status-content.js';
import { WRC_GAMMA_GRID } from '../src/app/wrc/wrc-calc.js';

const text = (value) => typeof value === 'string' && value.trim().length > 0;
const unique = (ids, label) => assert.equal(new Set(ids).size, ids.length, `${label}: duplicate id`);

assert.match(STATUS_UPDATED, /^\d{4}-\d{2}-\d{2}$/u);
assert.ok(text(STATUS_VISION.summary));
assert.deepEqual(STATUS_VISION.pillars.map((p) => p.id), ['CANVAS', 'SOLVER', 'FE']);

for (const row of STATUS_TODAY) {
  assert.ok(text(row.area) && text(row.text), JSON.stringify(row));
  assert.ok(row.state in STATUS_STATES, `${row.area}: unknown state ${row.state}`);
}
assert.equal(STATUS_TODAY.find((r) => r.area === 'Universal canvas')?.state, 'NOT_STARTED');

unique(KNOWN_ISSUES.map((i) => i.id), 'known issues');
for (const item of KNOWN_ISSUES) {
  assert.match(item.id, /^KI-\d{2}$/u);
  assert.ok(item.severity in SEVERITIES, `${item.id}: severity ${item.severity}`);
  for (const key of ['area', 'title', 'what', 'workaround', 'status']) assert.ok(text(item[key]), `${item.id}: ${key} missing`);
}
assert.ok(KNOWN_ISSUES.some((i) => i.severity === 'HIGH'));

unique(PLANNED_IMPROVEMENTS.map((p) => p.id), 'planned');
for (const item of PLANNED_IMPROVEMENTS) {
  assert.match(item.id, /^PL-\d{2}$/u);
  assert.ok(['S', 'M', 'L'].includes(item.size), `${item.id}: size ${item.size}`);
  assert.ok(text(item.title) && text(item.why) && text(item.needs), item.id);
  assert.ok(item.items.length > 0 && item.items.every(text), `${item.id}: items`);
}

unique(ROADMAP.map((s) => s.id), 'roadmap');
assert.deepEqual(ROADMAP.map((s) => s.id), ['A', 'B', 'C', 'D']);
for (const item of ROADMAP) {
  assert.ok(['S', 'M', 'L'].includes(item.size));
  assert.ok(text(item.title) && text(item.goal) && text(item.note), item.id);
  assert.ok(item.items.length >= 3 && item.items.every(text), `stage ${item.id}: items`);
}
assert.match(ROADMAP[0].title, /canvas/iu);
assert.ok(OPEN_DECISIONS.length > 0 && OPEN_DECISIONS.every(text));
assert.ok(DECISIONS_MADE.length > 0 && DECISIONS_MADE.every((d) => /^\d{4}-\d{2}-\d{2}: /u.test(d)), 'decisions need a date');
// The owner's first production scope: cylindrical shells with nozzles, trunnions and lugs.
const stageA = ROADMAP.find((s) => s.id === 'A').items.join(' ');
for (const word of ['Cylindrical shell', 'nozzles', 'trunnions', 'lugs']) assert.ok(stageA.includes(word), `stage A must cover ${word}`);

// Facts the page states, against their sources.
const ki01 = KNOWN_ISSUES.find((i) => i.id === 'KI-01');
assert.ok(ki01.what.includes(`γ = ${WRC_GAMMA_GRID.slice(0, -1).join(', ')} and ${WRC_GAMMA_GRID.at(-1)}`),
  `KI-01 must list the tabulated rows ${WRC_GAMMA_GRID.join(', ')}`);
const known = JSON.parse(readFileSync(new URL('./known-upstream-failures.json', import.meta.url))).scripts;
const ki19 = KNOWN_ISSUES.find((i) => i.id === 'KI-19');
assert.ok(ki19.what.includes(`${known.length} checks`), `KI-19 must state ${known.length} known checks`);
assert.equal(known.filter((k) => k.kind === 'SLOW').length, 2, 'KI-19 says two slow checks');
const audit = readFileSync(new URL('../docs/AUDIT-AND-ROADMAP.md', import.meta.url), 'utf8');
const ki03 = KNOWN_ISSUES.find((i) => i.id === 'KI-03');
for (const ratio of ['1.39', '1.78']) {
  assert.ok(ki03.what.includes(ratio) && audit.includes(ratio), `KI-03 ratio ${ratio} must match the audit`);
}

console.log(`app status content: ${KNOWN_ISSUES.length} known issues, ${PLANNED_IMPROVEMENTS.length} planned improvements, `
  + `${ROADMAP.length} roadmap stages, ${OPEN_DECISIONS.length} open decisions; facts match their sources. PASS`);
