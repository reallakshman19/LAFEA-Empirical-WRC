/**
 * Checks the reinforcing-pad option of the WRC calculator (calculateWrcAttachment in src/app/wrc/wrc-calc.js).
 *
 * WRC 537 has no pad rule, so the calculator uses the usual two-location method: at the attachment with
 * the shell and pad thicknesses added, and at the pad edge with the shell alone and the pad diameter.
 * This check uses evidence that does not come from our own code:
 *  1. Geometry convention: from the raw PV Elite inputs (shell ID, T, nozzle OD, pad OD and thickness), both
 *     locations reproduce the mean diameter, thickness and attachment diameter PV Elite printed for its two
 *     checks (validation/emp1/pvelite28-wrc297-36in-nozzle/).
 *  2. Pressure membrane p·Rm/T at each location matches PV Elite's largest hoop pressure stress within 0.1%.
 *  3. Shear from Vc, Vl and Mt at both locations matches PV Elite within 1% (same thin-wall formulas).
 *  4. Hand calculation: torsion alone gives τ = Mt / (2π r0² T) at all 8 points, at both locations.
 * And the wiring:
 *  5. No pad (blank or 0) gives exactly the single-location result; each pad location equals a plain run on
 *     the equivalent shell; corrosion stays on the inside.
 *  6. Governing point, envelope and code check are the worst over both locations.
 *  7. Bad pad inputs and out-of-range locations are blocked with the location named.
 *  8. The report shows both locations and the method note.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXAMPLE_CASES, WRC_PAD_METHOD_TEXT, WRC_TIER, calculateWrc537, calculateWrc537Cases, calculateWrcAttachment,
} from '../src/app/wrc/wrc-calc.js';
import { buildWrcReportHtml } from '../src/app/wrc/wrc-report.js';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const reference = JSON.parse(readFileSync(new URL(
  '../validation/emp1/pvelite28-wrc297-36in-nozzle/pvelite28-wrc297-36in-nozzle-reference-v1.json', import.meta.url)));
const pv = reference.input;
const pvCase = Object.fromEntries(reference.cases.map((c) => [c.caseId, c]));

// Our input, built only from PV Elite's raw inputs (not from its derived per-location values).
const padInput = {
  title: 'PV Elite 36-inch nozzle with pad',
  shellOutsideDiameter: pv.shellInsideDiameter + 2 * pv.shellThickness,
  shellThickness: pv.shellThickness,
  corrosionAllowance: pv.shellCorrosionAllowance,
  attachmentOutsideDiameter: pv.nozzleOutsideDiameter,
  padOutsideDiameter: pv.padDiameter,
  padThickness: pv.padThickness,
  forceUnit: 'N',
  momentUnit: 'N·m',
  loads: pv.loads,
  coordinate: 'LINEAR_GAMMA',
  designPressure: pv.designPressure / 1000, // kPa → MPa
  Kn: pv.shellStressConcentrationFactor,
  Kb: pv.shellStressConcentrationFactor,
};
const padded = calculateWrcAttachment(padInput);
assert.equal(padded.ok, true, JSON.stringify(padded.reasons));
assert.equal(padded.padded, true);
assert.deepEqual(padded.locations.map((l) => l.id), ['JUNCTION', 'PAD_EDGE']);
const at = Object.fromEntries(padded.locations.map((l) => [l.id, l.result]));

// 1. Geometry convention against PV Elite's printed per-location values.
for (const id of ['JUNCTION', 'PAD_EDGE']) {
  const g = at[id].geometry;
  const printed = pvCase[id].wrc297CurveAccess;
  assert.ok(near(2 * g.Rm, printed.vesselMeanDiameter), `${id}: mean diameter ${2 * g.Rm} vs PV Elite ${printed.vesselMeanDiameter}`);
  assert.ok(near(g.T, printed.vesselThickness), `${id}: T ${g.T} vs PV Elite ${printed.vesselThickness}`);
  assert.ok(near(2 * g.r0, printed.nozzleOutsideDiameter), `${id}: attachment diameter ${2 * g.r0} vs PV Elite ${printed.nozzleOutsideDiameter}`);
}
console.log('Pad geometry matches PV Elite at both locations: D 2161 / T 50 / d 914.4 (shell + pad), D 2136 / T 25 / d 1064.4 (pad edge)');

// 2. Pressure hoop membrane against PV Elite's largest hoop pressure row (kPa).
for (const id of ['JUNCTION', 'PAD_EDGE']) {
  const ours = at[id].pressureStress.circumferential * 1000;
  const theirs = Math.max(...pvCase[id].vessel.outplane.pressure, ...pvCase[id].vessel.inplane.pressure);
  const diff = Math.abs(ours - theirs) / theirs;
  assert.ok(diff <= 0.001, `${id}: pressure hoop ${ours.toFixed(0)} vs PV Elite ${theirs} kPa`);
  console.log(`${id}: pressure hoop p·Rm/T = ${ours.toFixed(0)} kPa, PV Elite ${theirs} kPa (${(diff * 100).toFixed(2)}%)`);
}

// 3. Shear at every point, both locations.
for (const id of ['JUNCTION', 'PAD_EDGE']) {
  reference.locations.forEach((loc, i) => {
    const theirs = Math.abs(pvCase[id].vessel.shear.summary[i]);
    const ours = Math.abs(at[id].rows[i].shear * 1000);
    assert.ok(Math.abs(ours - theirs) <= 0.01 * theirs + 0.5, `${id} ${loc}: shear ${ours.toFixed(0)} vs PV Elite ${theirs} kPa`);
  });
}
console.log('Shear within 1% of PV Elite at 16/16 points');

// 4. Hand calculation: torsion only, τ = Mt / (2π r0² T), at both locations.
const Mt = 5e6; // N·mm
const torsion = calculateWrcAttachment({ ...padInput, momentUnit: 'N·mm', designPressure: 0, loads: { P: 0, Vc: 0, Vl: 0, Mc: 0, Ml: 0, Mt } });
assert.equal(torsion.ok, true);
const handTau = {
  JUNCTION: Mt / (2 * Math.PI * (pv.nozzleOutsideDiameter / 2) ** 2 * (pv.shellThickness + pv.padThickness)),
  PAD_EDGE: Mt / (2 * Math.PI * (pv.padDiameter / 2) ** 2 * pv.shellThickness),
};
for (const l of torsion.locations) {
  l.result.rows.forEach((row) => assert.ok(near(Math.abs(row.shear), handTau[l.id], 1e-9), `${l.id} ${row.location}: τ ${row.shear} vs hand ${handTau[l.id]}`));
}
console.log(`Torsion alone: τ = Mt/(2π r0² T) = ${handTau.JUNCTION.toFixed(4)} MPa (shell + pad), ${handTau.PAD_EDGE.toFixed(4)} MPa (pad edge), 8/8 points each`);

// 5. Wiring. No pad, blank or zero, is the plain single-location result.
const g5 = calculateWrc537(EXAMPLE_CASES.GAMMA5_ORACLE);
for (const pad of [{}, { padOutsideDiameter: '', padThickness: '' }, { padOutsideDiameter: 0, padThickness: 0 }]) {
  const r = calculateWrcAttachment({ ...EXAMPLE_CASES.GAMMA5_ORACLE, ...pad });
  assert.equal(r.padded, false);
  assert.equal(r.locations.length, 1);
  assert.equal(r.locations[0].id, 'ATTACHMENT');
  r.locations[0].result.rows.forEach((row, i) => assert.equal(row.stressIntensity, g5.rows[i].stressIntensity));
  assert.equal(r.governing.stressIntensity, g5.governing.stressIntensity);
  assert.ok(!r.warnings.includes(WRC_PAD_METHOD_TEXT));
}
// Each pad location equals a plain run on the equivalent shell.
const tp = pv.padThickness;
const junctionPlain = calculateWrc537({ ...padInput, padOutsideDiameter: '', padThickness: '', shellOutsideDiameter: padInput.shellOutsideDiameter + 2 * tp, shellThickness: pv.shellThickness + tp });
const edgePlain = calculateWrc537({ ...padInput, padOutsideDiameter: '', padThickness: '', attachmentOutsideDiameter: pv.padDiameter });
at.JUNCTION.rows.forEach((row, i) => assert.equal(row.stressIntensity, junctionPlain.rows[i].stressIntensity));
at.PAD_EDGE.rows.forEach((row, i) => assert.equal(row.stressIntensity, edgePlain.rows[i].stressIntensity));
// Corrosion stays on the inside: junction T = t − CA + tp; pad edge T = t − CA.
const corroded = calculateWrcAttachment({ ...padInput, corrosionAllowance: 3 });
assert.ok(near(corroded.locations[0].result.geometry.T, pv.shellThickness - 3 + tp));
assert.ok(near(corroded.locations[1].result.geometry.T, pv.shellThickness - 3));
assert.ok(near(corroded.locations[0].result.geometry.Rm, (padInput.shellOutsideDiameter + 2 * tp - (pv.shellThickness - 3 + tp)) / 2));
console.log('No pad = single-location result; each pad location = plain run on the equivalent shell; corrosion on the inside');

// 6. Governing, envelope and code check are the worst over both locations.
const worstSi = Math.max(at.JUNCTION.governing.stressIntensity, at.PAD_EDGE.governing.stressIntensity);
assert.equal(padded.governing.stressIntensity, worstSi);
assert.equal(padded.governing.locationId, at.PAD_EDGE.governing.stressIntensity >= at.JUNCTION.governing.stressIntensity ? 'PAD_EDGE' : 'JUNCTION');
assert.equal(padded.tier, WRC_TIER.INTERPOLATED);
assert.ok(padded.warnings[0] === WRC_PAD_METHOD_TEXT);
assert.ok(padded.warnings.some((w) => w.startsWith('At the pad edge (shell only): Pressure')));
// S chosen so the pad edge fails PL+Pb+Q and the junction passes.
const S = (at.JUNCTION.governing.stressIntensity / 3 + at.PAD_EDGE.governing.stressIntensity / 3) / 2;
assert.ok(at.JUNCTION.governing.stressIntensity < 3 * S && at.PAD_EDGE.governing.stressIntensity > 3 * S);
const checked = calculateWrcAttachment({ ...padInput, allowableS: S });
assert.equal(checked.codeCheck.pass, false);
assert.equal(checked.codeCheck.worst.locationId, 'PAD_EDGE');
assert.equal(checked.locations[0].result.codeCheck.items.find((x) => x.id === 'PLPBQ').pass, true);
// Pm at the pad edge is the bare shell's p·Rm/T, the larger of the two.
assert.ok(near(checked.locations[1].result.codeCheck.items[0].value, at.PAD_EDGE.pressureStress.circumferential));
const batch = calculateWrc537Cases({
  ...padInput,
  loadCases: [
    { name: 'Sustained', loads: pv.loads },
    { name: 'Double', loads: Object.fromEntries(Object.entries(pv.loads).map(([k, v]) => [k, 2 * v])) },
  ],
});
assert.equal(batch.allCalculated, true);
assert.equal(batch.governing.name, 'Double');
assert.equal(batch.governing.locationId, padded.governing.locationId);
console.log(`Governing ${padded.governing.location} at the ${padded.governing.locationId === 'PAD_EDGE' ? 'pad edge' : 'attachment'}, ${padded.governing.stressIntensity.toFixed(2)} MPa; code check and envelope take the worst location`);

// 7. Blocking.
const small = calculateWrcAttachment({ ...padInput, padOutsideDiameter: 900 });
assert.equal(small.ok, false);
assert.equal(small.locations.length, 0);
assert.ok(small.reasons.some((r) => r.kind === 'PAD' && /larger than the attachment/.test(r.text)));
const half = calculateWrcAttachment({ ...padInput, padThickness: '' });
assert.equal(half.ok, false);
assert.ok(half.reasons.some((r) => r.kind === 'PAD' && /thickness/.test(r.text)));
const big = calculateWrcAttachment({ ...padInput, padOutsideDiameter: 1600 });
assert.equal(big.ok, false);
const bigReason = big.reasons.find((r) => r.kind === 'BETA');
assert.equal(bigReason.locationId, 'PAD_EDGE');
assert.ok(bigReason.text.startsWith('At the pad edge (shell only): '));
assert.ok(bigReason.fix.startsWith('Pad OD must lie between'));
// A thick pad on a thick shell takes the junction below γ = 5.
const thick = calculateWrcAttachment({ ...EXAMPLE_CASES.GAMMA5_ORACLE, padOutsideDiameter: 60, padThickness: 10 });
assert.equal(thick.ok, false);
assert.ok(thick.reasons.some((r) => r.kind === 'GAMMA' && r.locationId === 'JUNCTION' && r.text.startsWith('At the attachment (shell + pad): ')));
console.log('Blocked: pad not larger than the attachment, a missing pad field, pad edge β > 0.5, shell + pad γ < 5');

// 8. Report.
const html = buildWrcReportHtml(batch, { generatedAt: new Date(0) });
for (const text of ['At the attachment (shell + pad)', 'At the pad edge (shell only)', 'WRC 537 itself has no pad rule', 'Reinforcing pad outside diameter', 'Pad outside radius (the attachment here)']) {
  assert.ok(html.includes(text), `report is missing "${text}"`);
}
const plainHtml = buildWrcReportHtml(calculateWrc537Cases(EXAMPLE_CASES.CAESAR_GAMMA48));
assert.ok(!/pad edge|shell \+ pad|Reinforcing pad/u.test(plainHtml));
assert.ok(buildWrcReportHtml(small).includes('Not calculated'));
console.log('Report shows both locations and the method note');

console.log('WRC_PAD_CHECK_PASS');
