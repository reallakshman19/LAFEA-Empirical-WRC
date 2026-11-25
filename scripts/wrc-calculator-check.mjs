/**
 * Checks the plain WRC 537 calculator (src/app/wrc/wrc-calc.js) against independent references:
 *  1. γ = 5 frozen oracle (independent hand calc from the WRC 537 PDF tables): all 8 points to 1e-9.
 *  2. CAESAR II 2017 WRC benchmark at γ = 48.03 (interpolated): each point within 3%, same governing point,
 *     and never below the reference by more than its print resolution.
 *  3. Blocking rules: γ out of range, β out of range, short cylinder and end distance give plain-language reasons.
 *  4. Phase 2: pressure membrane, Kn/Kb scaling, the allowables check and load-case batches, against hand arithmetic.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXAMPLE_CASES, WRC_GAMMA_GRID, WRC_TIER, calculateWrc537, calculateWrc537Cases, classifyGamma, deriveWrcGeometry,
} from '../src/app/wrc/wrc-calc.js';
import { buildWrcReportHtml } from '../src/app/wrc/wrc-report.js';

const json = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));

// 1. γ = 5 oracle
const oracle = json('validation/emp1/wrc537-2013/gamma5-post-authority-physical-oracle-v1.json').semanticPayload;
const g5 = calculateWrc537(EXAMPLE_CASES.GAMMA5_ORACLE);
assert.equal(g5.ok, true, JSON.stringify(g5.reasons));
assert.equal(g5.tier, WRC_TIER.SOURCE_QUALIFIED);
assert.ok(Math.abs(g5.geometry.gamma - 5) < 1e-12);
assert.ok(Math.abs(g5.geometry.beta - oracle.case.beta) < 1e-12);
g5.rows.forEach((row, i) => {
  assert.ok(Math.abs(row.stressIntensity - oracle.expected.stressIntensity[i]) < 1e-9,
    `${row.location}: ${row.stressIntensity} vs oracle ${oracle.expected.stressIntensity[i]}`);
});
assert.equal(g5.governing.location, 'Au');
console.log(`γ=5 oracle: 8/8 points match, governing Au = ${g5.governing.stressIntensity.toFixed(4)} MPa`);

// Unit conversion: the same case in kN and N·m must give identical stresses
const g5Units = calculateWrc537({
  ...EXAMPLE_CASES.GAMMA5_ORACLE,
  forceUnit: 'kN',
  momentUnit: 'N·m',
  loads: Object.fromEntries(Object.entries(EXAMPLE_CASES.GAMMA5_ORACLE.loads)
    .map(([k, v]) => [k, ['P', 'Vc', 'Vl'].includes(k) ? v / 1000 : v / 1000])),
});
g5Units.rows.forEach((row, i) => assert.ok(Math.abs(row.stressIntensity - g5.rows[i].stressIntensity) < 1e-9));

// 2. CAESAR II benchmark (interpolated γ)
const benchmark = json('validation/emp1/caux2017-wrc01f/caux-pp24-31-benchmark-v1.json');
const expected = benchmark.datums.find((d) => d.quantityId === 'P29_SUS_STRESS_INTENSITY').value; // kPa
const caux = calculateWrc537(EXAMPLE_CASES.CAESAR_GAMMA48);
assert.equal(caux.ok, true, JSON.stringify(caux.reasons));
assert.equal(caux.tier, WRC_TIER.INTERPOLATED);
let worst = 0;
caux.rows.forEach((row, i) => {
  const ours = row.stressIntensity * 1000;
  const diff = (ours - expected[i]) / expected[i] * 100;
  worst = Math.max(worst, Math.abs(diff));
  assert.ok(Math.abs(diff) <= 3, `${row.location}: ${ours.toFixed(0)} kPa vs CAESAR II ${expected[i]} kPa (${diff.toFixed(1)}%)`);
  assert.ok(ours >= expected[i] - 0.5, `${row.location}: below the CAESAR II reference`);
});
const refGov = benchmark.locations[expected.indexOf(Math.max(...expected))];
assert.equal(caux.governing.location, refGov);
console.log(`CAESAR II γ=48: worst point ${worst.toFixed(1)}%, governing ${refGov} in both`);

// 3. Blocking rules
assert.deepEqual([...WRC_GAMMA_GRID], [5, 15, 50, 100, 300]);
assert.equal(classifyGamma(4).tier, WRC_TIER.BLOCKED);
assert.equal(classifyGamma(400).tier, WRC_TIER.BLOCKED);
assert.equal(classifyGamma(15).tier, WRC_TIER.TABULATED_ROW);
assert.equal(classifyGamma(30).tier, WRC_TIER.INTERPOLATED);

const thick = calculateWrc537({ ...EXAMPLE_CASES.GAMMA5_ORACLE, shellThickness: 30 });
assert.equal(thick.ok, false);
assert.ok(thick.reasons.some((r) => r.kind === 'GAMMA' && /too thick/.test(r.fix)));

const tiny = calculateWrc537({ ...EXAMPLE_CASES.CAESAR_GAMMA48, attachmentOutsideDiameter: 50 });
assert.equal(tiny.ok, false);
assert.ok(tiny.reasons.some((r) => r.kind === 'BETA' && /too small/.test(r.text)));

const short = calculateWrc537({ ...EXAMPLE_CASES.CAESAR_GAMMA48, cylinderLength: 800, attachmentStation: 400 });
assert.equal(short.ok, false);
assert.ok(short.reasons.some((r) => r.kind === 'LENGTH' && /radial load P/.test(r.text)));
assert.ok(short.reasons.some((r) => r.kind === 'LENGTH' && /nearest cylinder end/.test(r.text)));

const noLength = calculateWrc537({ ...EXAMPLE_CASES.CAESAR_GAMMA48, cylinderLength: '', attachmentStation: '' });
assert.equal(noLength.ok, true);
assert.ok(noLength.warnings.some((w) => /not checked/.test(w)));

const badCa = calculateWrc537({ ...EXAMPLE_CASES.GAMMA5_ORACLE, corrosionAllowance: 25 });
assert.equal(badCa.ok, false);

// Corrosion: Rm uses the corroded wall
const corroded = deriveWrcGeometry({ shellOutsideDiameter: 1000, shellThickness: 12, corrosionAllowance: 2, attachmentOutsideDiameter: 200 });
assert.equal(corroded.T, 10);
assert.equal(corroded.Rm, 495);

// 4a. Pressure: pRm/T hoop and pRm/2T longitudinal added at every point; Tresca recomputed by hand
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const handTresca = (a, b, t) => {
  const r = Math.sqrt(((a - b) / 2) ** 2 + t ** 2);
  const p1 = (a + b) / 2 + r; const p2 = (a + b) / 2 - r;
  return Math.max(Math.abs(p1 - p2), Math.abs(p1), Math.abs(p2));
};
const p = 2.5;
const pres = calculateWrc537({ ...EXAMPLE_CASES.CAESAR_GAMMA48, designPressure: p });
const hoop = p * caux.geometry.Rm / caux.geometry.T;
assert.ok(near(pres.pressureStress.circumferential, hoop) && near(pres.pressureStress.longitudinal, hoop / 2));
pres.rows.forEach((row, i) => {
  const base = caux.rows[i];
  assert.ok(near(row.circumferential, base.circumferential + hoop));
  assert.ok(near(row.longitudinal, base.longitudinal + hoop / 2));
  assert.ok(near(row.stressIntensity, handTresca(row.circumferential, row.longitudinal, row.shear)), row.location);
  assert.ok(Number.isFinite(row.membraneIntensity) && row.membraneIntensity >= 0);
});
assert.ok(pres.warnings.some((w) => /not part of WRC 537/.test(w)));
// Zero pressure leaves the γ = 5 oracle untouched (checked above), and pressure alone gives exactly pRm/T
const pOnly = calculateWrc537({ ...EXAMPLE_CASES.CAESAR_GAMMA48, designPressure: p, loads: { P: 0, Vc: 0, Vl: 0, Mc: 0, Ml: 0, Mt: 0 } });
pOnly.rows.forEach((row) => assert.ok(near(row.stressIntensity, hoop) && near(row.membraneIntensity, hoop)));

// 4b. Kn = Kb = 2 with no shear loads doubles every normal stress
const noShear = { ...EXAMPLE_CASES.GAMMA5_ORACLE, loads: { ...EXAMPLE_CASES.GAMMA5_ORACLE.loads, Vc: 0, Vl: 0, Mt: 0 } };
const k1 = calculateWrc537(noShear);
const k2 = calculateWrc537({ ...noShear, Kn: 2, Kb: 2 });
k2.rows.forEach((row, i) => {
  assert.ok(near(row.circumferential, 2 * k1.rows[i].circumferential) && near(row.longitudinal, 2 * k1.rows[i].longitudinal));
  assert.ok(near(row.stressIntensity, 2 * k1.rows[i].stressIntensity));
});
// Kn alone scales only the membrane part
const kn = calculateWrc537({ ...noShear, Kn: 3, Kb: 1 });
kn.rows.forEach((row, i) => assert.ok(near(row.membraneIntensity, 3 * k1.rows[i].membraneIntensity)));
assert.equal(calculateWrc537({ ...noShear, Kn: 0 }).ok, false);

// 4c. Allowables: no S → no check; S given → PM, PL, PL+Pb+Q with SPS = 3S by default
assert.equal(caux.codeCheck, null);
const S = 138;
const chk = calculateWrc537({ ...EXAMPLE_CASES.CAESAR_GAMMA48, designPressure: p, allowableS: S }).codeCheck;
const byId = Object.fromEntries(chk.items.map((i) => [i.id, i]));
assert.ok(near(byId.PM.value, hoop) && byId.PM.limit === S);
assert.ok(near(byId.PL.value, Math.max(...pres.rows.map((r) => r.membraneIntensity))) && byId.PL.limit === 1.5 * S);
assert.ok(near(byId.PLPBQ.value, pres.governing.stressIntensity) && byId.PLPBQ.limit === 3 * S);
assert.equal(chk.pass, chk.items.every((i) => i.value <= i.limit));
const strict = calculateWrc537({ ...EXAMPLE_CASES.GAMMA5_ORACLE, allowableS: 40, allowableSps: 70, bendingClass: 'PB' }).codeCheck;
assert.equal(strict.items.at(-1).id, 'PLPB');
assert.equal(strict.items.at(-1).limit, 60);
assert.equal(strict.pass, false); // Au = 72.67 > 1.5 × 40
assert.equal(calculateWrc537({ ...EXAMPLE_CASES.GAMMA5_ORACLE, allowableS: 40, allowableSps: 80 }).codeCheck.items.at(-1).limit, 80);

// 4d. Load-case batch: each case matches a single run; envelope picks the worst
const batch = calculateWrc537Cases({
  ...EXAMPLE_CASES.CAESAR_GAMMA48,
  allowableS: S,
  loadCases: [
    { name: 'Sustained', loads: EXAMPLE_CASES.CAESAR_GAMMA48.loads },
    { name: 'Operating x3', loads: Object.fromEntries(Object.entries(EXAMPLE_CASES.CAESAR_GAMMA48.loads).map(([k, v]) => [k, 3 * v])) },
  ],
});
assert.equal(batch.cases.length, 2);
assert.equal(batch.allCalculated, true);
batch.cases[0].result.rows.forEach((row, i) => assert.ok(near(row.stressIntensity, caux.rows[i].stressIntensity)));
assert.equal(batch.governing.name, 'Operating x3');
assert.ok(near(batch.governing.stressIntensity, 3 * caux.governing.stressIntensity));
assert.equal(batch.codeCheck.worstCase, 'Operating x3');
const single = calculateWrc537Cases(EXAMPLE_CASES.CAESAR_GAMMA48);
assert.equal(single.cases.length, 1);
const reportHtml = buildWrcReportHtml(batch, { generatedAt: new Date(0) });
assert.ok(reportHtml.includes('Envelope: Operating x3') && reportHtml.includes('PL + Pb + Q') && reportHtml.includes('Operating x3'));
assert.ok(buildWrcReportHtml(g5).includes('72.673'));
assert.ok(buildWrcReportHtml(thick).includes('Not calculated'));
console.log('Phase 2: pressure, Kn/Kb, allowables and load-case batch match hand arithmetic');

console.log('WRC_CALCULATOR_CHECK_PASS');
