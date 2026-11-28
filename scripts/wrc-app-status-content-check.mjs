/**
 * Checks the "Status & roadmap" tab content (src/app/status/status-content.js):
 *  - every entry has its required fields, a unique id and a known severity, size or state;
 *  - facts the page states match their sources: the tabulated γ rows, the KNOWN-check count in
 *    scripts/known-upstream-failures.json, and the PV Elite WRC 297 ratios recorded in docs;
 *  - the universal canvas is "partial" (steps A1–A3 and A6: the sketch, several attachments, moving them on
 *    an unrolled view, a 3-D preview) and the page does not claim more: sizes and loads are typed, A4 and A5
 *    are still to come.
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
const canvas = STATUS_TODAY.find((r) => r.area === 'Universal canvas');
assert.equal(canvas?.state, 'PARTIAL');
assert.match(canvas.text, /A1/u);
assert.match(canvas.text, /A3: attachments are moved on an unrolled view/u, 'the canvas row says attachments can be moved on the drawing');
assert.match(canvas.text, /Sizes and loads are still typed in the form/u, 'and does not claim more than moving');
assert.match(canvas.text, /A6: a 3-D preview of the vessel, view only/u, 'the 3-D preview is done and only a view');
assert.match(canvas.text, /Still to come:[^.]*A4[^.]*A5/u, 'A4 and A5 named as still to come');
assert.doesNotMatch(canvas.text.slice(canvas.text.indexOf('Still to come')), /A6/u, 'A6 no longer listed as to come');

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

// The lug roadmap points at a benchmark request that exists and lists the same cases.
const pl02 = PLANNED_IMPROVEMENTS.find((p) => p.id === 'PL-02');
const requestDoc = readFileSync(new URL('../docs/LUG-BENCHMARK-REQUEST.md', import.meta.url), 'utf8');
assert.ok(pl02.needs.includes('docs/LUG-BENCHMARK-REQUEST.md'), 'PL-02 must point at the request');
const requestCases = JSON.parse(readFileSync(new URL('../validation/emp1/lug-benchmark-request/lug-benchmark-cases-v1.json', import.meta.url))).cases;
for (const c of requestCases) assert.ok(requestDoc.includes(`| ${c.caseId}`) && pl02.items[0].includes(c.caseId), `PL-02 and the request must both list ${c.caseId}`);
console.log(`app status content: ${KNOWN_ISSUES.length} known issues, ${PLANNED_IMPROVEMENTS.length} planned improvements, `
  + `${ROADMAP.length} roadmap stages, ${OPEN_DECISIONS.length} open decisions; facts match their sources. PASS`);
