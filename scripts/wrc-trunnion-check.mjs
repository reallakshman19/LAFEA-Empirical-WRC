/**
 * Checks trunnions in the WRC calculator (attachmentType 'TRUNNION', roadmap PL-03).
 *
 * WRC 537 §4.2.2 has no solid/hollow selector for cylindrical shells: a round attachment is described only by
 * r0 (docs/emp1/WRC537_2013_Cylindrical_Attachment_Class_Authority.md). So a trunnion must give exactly the
 * shell stresses of a nozzle with the same outside diameter, and only the labels, notes and scope differ.
 *  1. Trunnion = nozzle at every point, on the γ = 5 hand-calculation case (Au = 72.67 MPa) and the CAESAR II case.
 *  2. Solid and hollow give the same stresses; the notes say why, and a hollow trunnion gets the rigidity note.
 *  3. Pressure: a trunnion does not open the shell, so its note says so instead of the opening-edge note.
 *  4. Pads, load cases, blocking and the report work for a trunnion and say "trunnion".
 *  5. A case saved before trunnions existed (no attachmentType) is still a nozzle.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_CASE, EXAMPLE_CASES, WRC_TRUNNION_METHOD_TEXT, calculateWrc537, calculateWrc537Cases, calculateWrcAttachment, isTrunnion,
} from '../src/app/wrc/wrc-calc.js';
import { buildWrcReportHtml } from '../src/app/wrc/wrc-report.js';

const oracle = JSON.parse(readFileSync(new URL('../validation/emp1/wrc537-2013/gamma5-post-authority-physical-oracle-v1.json', import.meta.url))).semanticPayload;
const same = (a, b, label) => {
  assert.equal(a.ok, true, `${label}: ${JSON.stringify(a.reasons)}`);
  a.rows.forEach((row, i) => {
    for (const key of ['circumferential', 'longitudinal', 'shear', 'stressIntensity', 'membraneIntensity']) {
      assert.equal(row[key], b.rows[i][key], `${label} ${row.location} ${key}`);
    }
  });
};

// 1. Trunnion = nozzle of the same outside diameter.
const g5 = calculateWrc537(EXAMPLE_CASES.GAMMA5_ORACLE);
const g5Trunnion = calculateWrc537({ ...EXAMPLE_CASES.GAMMA5_ORACLE, attachmentType: 'TRUNNION' });
same(g5Trunnion, g5, 'γ = 5');
g5Trunnion.rows.forEach((row, i) => assert.ok(Math.abs(row.stressIntensity - oracle.expected.stressIntensity[i]) < 1e-9));
const caesar = calculateWrc537(EXAMPLE_CASES.CAESAR_GAMMA48);
same(calculateWrc537({ ...EXAMPLE_CASES.CAESAR_GAMMA48, attachmentType: 'TRUNNION', trunnionConstruction: 'HOLLOW' }), caesar, 'CAESAR II');
console.log(`Trunnion = nozzle at 8/8 points: γ = 5 hand calc (Au ${g5Trunnion.governing.stressIntensity.toFixed(2)} MPa) and the CAESAR II case`);

// 2. Solid and hollow.
const example = EXAMPLE_CASES.TRUNNION_10IN;
assert.equal(example.attachmentType, 'TRUNNION');
const hollow = calculateWrc537(example);
const solid = calculateWrc537({ ...example, trunnionConstruction: 'SOLID' });
same(hollow, solid, 'solid vs hollow');
same(hollow, calculateWrc537({ ...example, attachmentType: 'ROUND' }), 'example vs nozzle');
assert.ok(hollow.warnings.includes(WRC_TRUNNION_METHOD_TEXT) && solid.warnings.includes(WRC_TRUNNION_METHOD_TEXT));
assert.ok(hollow.warnings.some((w) => w.startsWith('Hollow trunnion: treated as rigid')));
assert.ok(!solid.warnings.some((w) => w.startsWith('Hollow trunnion')));
assert.ok(!caesar.warnings.some((w) => /trunnion/iu.test(w)));
console.log(`Solid = hollow (${hollow.governing.stressIntensity.toFixed(2)} MPa at ${hollow.governing.location} for the example); the notes say why`);

// 3. Pressure wording.
const pressed = calculateWrc537({ ...example, designPressure: 2 });
assert.ok(pressed.warnings.some((w) => /does not open the shell/u.test(w)));
assert.ok(!pressed.warnings.some((w) => /edge of the opening/u.test(w)));
assert.ok(calculateWrc537({ ...example, attachmentType: 'ROUND', designPressure: 2 }).warnings.some((w) => /edge of the opening/u.test(w)));
console.log('Pressure note: a trunnion does not open the shell; a nozzle keeps the opening-edge note');

// 4. Pads, load cases, blocking, report.
const padded = calculateWrcAttachment({ ...example, padOutsideDiameter: 330, padThickness: 10 });
assert.equal(padded.ok, true, JSON.stringify(padded.reasons));
assert.deepEqual(padded.locations.map((l) => l.id), ['JUNCTION', 'PAD_EDGE']);
assert.equal(padded.pad.rectangular, false);
const big = calculateWrc537({ ...example, attachmentOutsideDiameter: 406.4 });
assert.ok(big.reasons.some((r) => r.kind === 'BETA' && /too large/u.test(r.text)));
const batch = calculateWrc537Cases({ ...example, loadCases: [{ name: 'Sustained', loads: example.loads }, { name: 'Occasional', loads: { ...example.loads, Vl: -15000 } }] });
assert.equal(batch.allCalculated, true);
const html = buildWrcReportHtml(batch, { generatedAt: new Date(0) });
for (const text of ['round attachment (trunnion)', 'Trunnion outside diameter (pipe (hollow))', 'no solid/hollow selector', 'A trunnion does not open the shell', 'Stresses in the trunnion or its weld']) {
  assert.ok(html.includes(text), `report is missing "${text}"`);
}
const nozzleHtml = buildWrcReportHtml(calculateWrc537Cases(EXAMPLE_CASES.CAESAR_GAMMA48));
assert.ok(!/trunnion/iu.test(nozzleHtml));
console.log('Pads, load cases, the β limit and the report work for a trunnion and say so; a nozzle report does not mention trunnions');

// 5. Old saved cases.
const { attachmentType, trunnionConstruction, ...oldCase } = { ...DEFAULT_CASE, loads: { ...DEFAULT_CASE.loads } };
assert.equal(attachmentType, 'ROUND');
assert.equal(trunnionConstruction, 'SOLID');
assert.equal(isTrunnion(oldCase), false);
assert.equal(calculateWrc537(oldCase).ok, true);
console.log('A case saved without an attachment type is still a nozzle');

console.log('WRC_TRUNNION_CHECK_PASS');
