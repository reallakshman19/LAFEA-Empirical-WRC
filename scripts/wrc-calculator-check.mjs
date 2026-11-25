/**
 * Checks the plain WRC 537 calculator (src/app/wrc/wrc-calc.js) against independent references:
 *  1. γ = 5 frozen oracle (independent hand calc from the WRC 537 PDF tables): all 8 points to 1e-9.
 *  2. CAESAR II 2017 WRC benchmark at γ = 48.03 (interpolated): each point within 3%, same governing point,
 *     and never below the reference by more than its print resolution.
 *  3. Blocking rules: γ out of range, β out of range, short cylinder and end distance give plain-language reasons.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXAMPLE_CASES, WRC_GAMMA_GRID, WRC_TIER, calculateWrc537, classifyGamma, deriveWrcGeometry,
} from '../src/app/wrc/wrc-calc.js';

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

console.log('WRC_CALCULATOR_CHECK_PASS');
