/**
 * Canvas step A2: one shell with several attachments (src/app/wrc/vessel-model.js).
 *
 * Checks:
 *  1. The WRC 537 core is used as it is: each of the six examples, as a one-attachment vessel, gives the same
 *     stresses as the case on its own.
 *  2. Shell inputs are shared by every attachment; attachment inputs stay with their attachment.
 *  3. Add, remove, names and angles.
 *  4. Units: a vessel shown in US gives every attachment the same stresses as in SI.
 *  5. Files: a vessel file round-trips; a case file saved before A2 opens as one attachment; anything else
 *     is refused.
 *  6. checkVessel on the worked vessel: each attachment equals its own single-case result, and the highest
 *     one is named. The sketch draws all of them.
 */
import assert from 'node:assert/strict';
import { DEFAULT_CASE, EXAMPLE_CASES, calculateWrc537Cases } from '../src/app/wrc/wrc-calc.js';
import {
  CASE_SCHEMA, EXAMPLE_VESSELS, MAX_ATTACHMENTS, SHELL_KEYS, VESSEL_SCHEMA, addAttachment, caseFor, checkVessel, cleanAngle,
  normalizeCase, normalizeVessel, removeAttachment, vesselFile, vesselFromCase, vesselFromFile, withCase,
} from '../src/app/wrc/vessel-model.js';
import { buildVesselSketchHtml } from '../src/app/wrc/vessel-sketch.js';
import { buildWrcReportHtml } from '../src/app/wrc/wrc-report.js';
import { convertCaseUnits } from '../src/app/wrc/wrc-units.js';

/** The numbers a batch gives: per case, per location, per point. */
const stresses = (batch) => batch.cases.map((c) => (c.result.ok
  ? c.result.locations.map((l) => l.result.rows.map((r) => [r.location, r.circumferential, r.longitudinal, r.shear, r.stressIntensity]))
  : c.result.reasons.map((r) => r.kind)));

// 1. One-attachment vessels give the case's own stresses, exactly.
const cases = { DEFAULT: DEFAULT_CASE, ...EXAMPLE_CASES };
for (const [name, c] of Object.entries(cases)) {
  const direct = calculateWrc537Cases(normalizeCase(c));
  const viaVessel = calculateWrc537Cases(caseFor(vesselFromCase(c), 0));
  assert.deepEqual(stresses(viaVessel), stresses(direct), `${name}: same stresses through the vessel`);
}
assert.equal(calculateWrc537Cases(caseFor(vesselFromCase(EXAMPLE_CASES.GAMMA5_ORACLE), 0)).cases[0].result.governing.stressIntensity.toFixed(2), '72.67',
  'the γ = 5 hand calculation through the vessel');

// 2. Shared shell, own attachments.
let v = normalizeVessel(EXAMPLE_VESSELS.TWO_NOZZLES_LUG);
assert.equal(v.attachments.length, 3);
assert.deepEqual(v.attachments.map((a) => a.attachmentName), ['N1', 'N2', 'L1']);
for (const a of v.attachments) for (const k of SHELL_KEYS) assert.ok(!(k in a), `shell key ${k} is not stored on an attachment`);
const n2 = caseFor(v, 1);
v = withCase(v, 1, { ...n2, shellThickness: 14, attachmentOutsideDiameter: 200 });
assert.equal(caseFor(v, 0).shellThickness, 14, 'a shell edit reaches N1');
assert.equal(caseFor(v, 2).shellThickness, 14, 'a shell edit reaches L1');
assert.equal(caseFor(v, 0).attachmentOutsideDiameter, 219.1, "N2's diameter stays with N2");
assert.equal(caseFor(v, 1).attachmentOutsideDiameter, 200);

// 3. Add, remove, names, angles.
v = normalizeVessel(EXAMPLE_VESSELS.TWO_NOZZLES_LUG);
let added = addAttachment(v, 0);
assert.equal(added.attachments.length, 4);
assert.equal(added.active, 3);
assert.equal(added.attachments[3].attachmentName, 'N3', 'the first free N name');
assert.equal(added.attachments[3].attachmentAngle, 90, 'a quarter turn round from N1');
assert.equal(added.attachments[3].attachmentOutsideDiameter, 219.1, 'a copy of N1');
added = addAttachment(added, 2);
assert.equal(added.attachments[4].attachmentAngle, 270, 'L1 at 180° + 90°');
let removed = removeAttachment(added, 1);
assert.deepEqual(removed.attachments.map((a) => a.attachmentName), ['N1', 'L1', 'N3', 'N4']);
assert.equal(removed.active, 3, 'the active attachment moves down with the others');
removed = removeAttachment({ ...removed, active: 3 }, 3);
assert.equal(removed.active, 2, 'removing the last one selects the one before it');
assert.equal(removeAttachment(vesselFromCase(DEFAULT_CASE)).attachments.length, 1, 'the last attachment stays');
let full = vesselFromCase(DEFAULT_CASE);
for (let i = 0; i < MAX_ATTACHMENTS + 3; i += 1) full = addAttachment(full);
assert.equal(full.attachments.length, MAX_ATTACHMENTS, `at most ${MAX_ATTACHMENTS} attachments`);
assert.equal(new Set(full.attachments.map((a) => a.attachmentName)).size, MAX_ATTACHMENTS, 'names stay unique');
assert.deepEqual([cleanAngle(-90), cleanAngle(450), cleanAngle(''), cleanAngle('x'), cleanAngle(359.5)], [270, 90, 0, 0, 359.5]);
const dupes = normalizeVessel({ shell: {}, attachments: [{ attachmentName: 'A' }, { attachmentName: 'A' }, {}] });
assert.deepEqual(dupes.attachments.map((a) => a.attachmentName), ['A', 'N1', 'N2'], 'duplicate and missing names are renamed');
assert.throws(() => normalizeVessel({ shell: {}, attachments: [] }), /at least one attachment/u);

// 4. Units: the same stresses in US.
v = normalizeVessel(EXAMPLE_VESSELS.TWO_NOZZLES_LUG);
const us = normalizeVessel({ ...EXAMPLE_VESSELS.TWO_NOZZLES_LUG, shell: { ...EXAMPLE_VESSELS.TWO_NOZZLES_LUG.shell, units: 'US' } });
for (let i = 0; i < 3; i += 1) {
  const si = calculateWrc537Cases(caseFor(v, i)).cases[0].result.governing.stressIntensity;
  const inUs = caseFor(us, i);
  assert.equal(inUs.units, 'US');
  assert.ok(['lbf', 'kip'].includes(inUs.forceUnit), `attachment ${i}: loads shown in US units`);
  const usSi = calculateWrc537Cases(inUs).cases[0].result.governing.stressIntensity;
  assert.ok(Math.abs(usSi - si) < 1e-9 * si, `attachment ${i}: same stress in US`);
}
// An attachment still stored in SI loads (not visited since the switch) is shown in US when it is opened.
const mixed = { ...v, shell: { ...v.shell, units: 'US' } };
assert.equal(caseFor(mixed, 2).forceUnit, 'lbf');

// 5. Files.
const file = JSON.parse(JSON.stringify(vesselFile(v)));
assert.equal(file.schema, VESSEL_SCHEMA);
assert.deepEqual(vesselFromFile(file), v, 'a vessel file opens as it was saved');
const old = vesselFromFile({ schema: CASE_SCHEMA, case: { ...EXAMPLE_CASES.LUG_200X100 } });
assert.equal(old.attachments.length, 1, 'a case saved before A2 opens as one attachment');
assert.equal(old.attachments[0].attachmentName, 'N1');
assert.equal(old.attachments[0].attachmentAngle, 0);
assert.deepEqual(stresses(calculateWrc537Cases(caseFor(old, 0))), stresses(calculateWrc537Cases(normalizeCase(EXAMPLE_CASES.LUG_200X100))));
assert.throws(() => vesselFromFile({ schema: 'something/else', vessel: {} }), /Not a vessel or WRC case file/u);
assert.throws(() => vesselFromFile(null), /Not a vessel or WRC case file/u);

// 6. Every attachment on its own; the highest is named; the sketch draws all of them.
const checked = checkVessel(v);
assert.equal(checked.rows.length, 3);
for (const row of checked.rows) {
  assert.deepEqual(stresses(row.batch), stresses(calculateWrc537Cases(caseFor(v, row.index))), `${row.name}: its own result`);
}
const highest = Math.max(...checked.rows.map((r) => r.governing.stressIntensity));
assert.equal(checked.rows[checked.governingIndex].governing.stressIntensity, highest);
assert.equal(checked.rows[checked.governingIndex].name, 'L1', 'the lug governs the worked vessel');
const lugAlone = calculateWrc537Cases(convertCaseUnits(normalizeCase(EXAMPLE_CASES.LUG_200X100), 'SI')).governing.stressIntensity;
assert.equal(checked.rows[2].governing.stressIntensity, lugAlone, 'L1 gives the lug example\'s own result');
const sketch = buildVesselSketchHtml(caseFor(v, 1), { others: [caseFor(v, 0), caseFor(v, 2)] });
for (const name of ['N1', 'N2', 'L1']) assert.equal(sketch.match(new RegExp(`data-name="${name}"`, 'gu'))?.length, 2, `${name} named in both views`);
assert.match(sketch, /3 attachments on this shell; selected N2: nozzle of outside diameter 168\.3 mm, 2400 mm from one end of a 4000 mm cylinder, 90° around\./u);
assert.ok(sketch.includes('data-dim="90°"'), 'the selected attachment\'s angle is dimensioned in the end section');
assert.doesNotMatch(sketch, /NaN|undefined|Infinity/u);
const report = buildWrcReportHtml(calculateWrc537Cases(caseFor(v, 0)), { generatedAt: new Date(0), vessel: { name: 'N1', count: 3, others: [caseFor(v, 1), caseFor(v, 2)] } });
assert.ok(report.includes('Attachment N1, one of 3 on this shell.'), 'the report names its attachment');
assert.equal(report.match(/data-name="L1"/gu)?.length, 2, 'the report sketch shows the other attachments');

console.log(`wrc vessel: 6 examples give the same stresses as one-attachment vessels; shell shared, attachments own; add/remove/names/angles; `
  + 'US = SI; files round-trip and old case files open; every attachment checked on its own; sketch and report show all. PASS');
