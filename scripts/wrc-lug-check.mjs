/**
 * Checks rectangular attachments (lugs) in the WRC calculator (src/app/wrc/wrc537-rectangular.js and the
 * RECTANGULAR route of calculateWrc537).
 *
 *  1. Tables 6, 7 and 8 in the code match the extraction in docs/emp1/WRC537_2013_Tables_and_Charts.md,
 *     value by value, including which rows are printed in parentheses (approximate).
 *  2. Independent hand calculation at γ = 100 and β1/β2 = 2, where every factor is a printed table value:
 *     β for each term from equations 28–30 and §4.2.2.4–5, curves read straight from the dataset,
 *     stresses from equations 31–46 and 50–51 with the Table 5 signs typed here. All 8 points to 1e-9.
 *  3. A square footprint (c1 = c2 = c) gives the same normal stresses as a round attachment with
 *     r0 = c/0.875 (equations 26–27), at an interpolated γ; shear is Vc/(4cT) and VL/(4cT).
 *  4. Factor interpolation: exact at printed rows, 1 for a square, continuous, approximate rows flagged.
 *  5. Blocking: torsion (§4.3.4), β1/β2 outside 0.25–4, γ < 15 for moments on a non-square footprint,
 *     equivalent β outside 0.05–0.5. A radial load alone is allowed at γ < 15.
 *  6. A rectangular pad: two locations with the lug and the pad footprints; a pad smaller than the lug is blocked.
 *  7. Report and load-case batch carry the rectangular data.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXAMPLE_CASES, WRC_RECT_METHOD_TEXT, calculateWrc537, calculateWrc537Cases, calculateWrcAttachment,
} from '../src/app/wrc/wrc-calc.js';
import {
  WRC537_TABLE6, WRC537_TABLE7, WRC537_TABLE8, momentFactor, radialLoadBeta,
} from '../src/app/wrc/wrc537-rectangular.js';
import { buildWrcReportHtml } from '../src/app/wrc/wrc-report.js';
import {
  evaluateEmp1Wrc537DatasetCurve, selectEmp1Wrc537CylindricalDatasetCurve,
} from '../src/core/emp1/emp1-wrc537-cylindrical-index.js';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const COLUMNS = ['Mphi', 'Mx', 'Nphi', 'Nx'];

// 1. Tables against the extraction.
const md = readFileSync(new URL('../docs/emp1/WRC537_2013_Tables_and_Charts.md', import.meta.url), 'utf8');
const section = (heading) => {
  const start = md.indexOf(heading);
  assert.ok(start >= 0, `missing ${heading}`);
  const end = md.indexOf('\n### ', start + heading.length);
  return md.slice(start, end < 0 ? undefined : end);
};
function parseFactorTable(text) {
  const rows = {};
  let ratio = null;
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 8 || !/^\d+$/u.test(cells[2])) continue;
    if (cells[1]) ratio = Number(cells[1]);
    const values = cells.slice(4, 8);
    rows[ratio] ??= [];
    rows[ratio].push({
      gamma: Number(cells[2]),
      approximate: values.every((v) => /^\(.*\)$/u.test(v)),
      values: Object.fromEntries(COLUMNS.map((c, i) => [c, Number(values[i].replace(/[()]/gu, ''))])),
    });
  }
  return rows;
}
let compared = 0;
for (const [heading, table] of [['### Table 7 – Circumferential Moment MC', WRC537_TABLE7], ['### Table 8 – Longitudinal Moment ML', WRC537_TABLE8]]) {
  const parsed = parseFactorTable(section(heading));
  assert.deepEqual(Object.keys(parsed).map(Number).sort((a, b) => a - b), [0.25, 0.5, 2, 4], heading);
  for (const [ratio, rows] of Object.entries(parsed)) {
    assert.equal(table[ratio].length, rows.length, `${heading} ratio ${ratio}: row count`);
    rows.forEach((r, i) => {
      const ours = table[ratio][i];
      assert.equal(ours.gamma, r.gamma);
      assert.equal(ours.approximate, r.approximate, `${heading} ratio ${ratio} γ ${r.gamma}: parentheses`);
      for (const c of COLUMNS) { assert.equal(ours.values[c], r.values[c], `${heading} ratio ${ratio} γ ${r.gamma} ${c}`); compared += 1; }
    });
  }
}
const t6 = section('### Table 6 – Radial Load P');
for (const [label, key] of [['K 1', 'K1'], ['K 2', 'K2']]) {
  const cells = t6.split('\n').find((l) => l.startsWith(`| ${label} `)).split('|').map((c) => c.trim()).slice(2, 6).map(Number);
  assert.deepEqual(cells, ['Nphi', 'Nx', 'Mphi', 'Mx'].map((c) => WRC537_TABLE6[key][c]), `Table 6 ${key}`);
  compared += 4;
}
console.log(`Tables 6–8 match the docs/emp1 extraction: ${compared} values, parentheses included`);

// 2. Independent hand calculation, γ = 100 exactly, β1/β2 = 2: Rm = 1000, T = 10, c1 = 100, c2 = 50.
const hand = {
  title: 'hand calc', shellOutsideDiameter: 2010, shellThickness: 10, corrosionAllowance: 0,
  attachmentType: 'RECTANGULAR', attachmentLength: 100, attachmentWidth: 200,
  cylinderLength: '', attachmentStation: '', forceUnit: 'N', momentUnit: 'N·mm',
  loads: { P: -3000, Vc: 800, Vl: -1200, Mc: 2.0e6, Ml: -3.0e6, Mt: 0 }, coordinate: 'LINEAR_GAMMA',
};
const app = calculateWrc537(hand);
assert.equal(app.ok, true, JSON.stringify(app.reasons));
{
  const Rm = 1000; const T = 10; const c1 = 100; const c2 = 50; const b1 = c1 / Rm; const b2 = c2 / Rm; const gamma = 100;
  const { P, Vc, Vl, Mc, Ml } = hand.loads;
  // Printed factors at γ = 100: Table 7 row β1/β2 = 2, Table 8 row β2/β1 = 0.5.
  const T7 = { Mphi: 1.10, Mx: 0.95, Nphi: 1.43, Nx: 1.12 };
  const T8 = { Mphi: 1.07, Mx: 1.02, Nphi: 0.97, Nx: 0.68 };
  const K1 = { Nphi: 0.91, Nx: 1.68, Mphi: 1.76, Mx: 1.2 };
  const pBeta = (k) => (1 - (1 / 3) * (b1 / b2 - 1) * (1 - k)) * Math.sqrt(b1 * b2); // eq. 29, β1/β2 ≥ 1
  const mc = Math.cbrt(b1 * b1 * b2);
  const ml = Math.cbrt(b1 * b2 * b2);
  const y = (figure, beta) => Math.abs(evaluateEmp1Wrc537DatasetCurve(selectEmp1Wrc537CylindricalDatasetCurve({ figure, variant: 'ORIGINAL', gamma }), beta).y);
  // Figures per term: the map of the round route, validated against CAESAR II (A/B and C/D read different P curves).
  const F = {
    circ: { PmAB: '4C', PmCD: '3C', PbAB: '2C-1', PbCD: '1C', Mcm: '3A', Mcb: '1A', Mlm: '3B', Mlb: '1B' },
    long: { PmAB: '3C', PmCD: '4C', PbAB: '1C-1', PbCD: '2C', Mcm: '4A', Mcb: '2A', Mlm: '4B', Mlb: '2B' },
  };
  const stress = (family, N, M) => {
    const f = F[family];
    const pN = pBeta(K1[N]); const pM = pBeta(K1[M]);
    const bMcB = T7[M] * mc; const bMlB = T8[M] * ml;
    return {
      // eqs. 31–32 / 34–35: σ = (N/(P/Rm))·P/(Rm·T), σ = 6·(M/P)·P/T²
      PmAB: y(f.PmAB, pN) * Math.abs(P) / (Rm * T), PmCD: y(f.PmCD, pN) * Math.abs(P) / (Rm * T),
      PbAB: 6 * y(f.PbAB, pM) * Math.abs(P) / T ** 2, PbCD: 6 * y(f.PbCD, pM) * Math.abs(P) / T ** 2,
      // eqs. 37–38 / 40–41 with §4.2.2.4: membrane at ∛(β1²β2) × Cc, bending at Kc·∛(β1²β2); the same β in the formula
      Mcm: T7[N] * y(f.Mcm, mc) * Math.abs(Mc) / (Rm ** 2 * mc * T), Mcb: 6 * y(f.Mcb, bMcB) * Math.abs(Mc) / (Rm * bMcB * T ** 2),
      // eqs. 43–46 with §4.2.2.5
      Mlm: T8[N] * y(f.Mlm, ml) * Math.abs(Ml) / (Rm ** 2 * ml * T), Mlb: 6 * y(f.Mlb, bMlB) * Math.abs(Ml) / (Rm * bMlB * T ** 2),
    };
  };
  // Table 5 signs (Au, Al, Bu, Bl, Cu, Cl, Du, Dl) for the load directions shown in Figure 2; reversed for a negative load.
  const S = {
    pm: [-1, -1, -1, -1, -1, -1, -1, -1], pb: [-1, 1, -1, 1, -1, 1, -1, 1],
    mcm: [0, 0, 0, 0, -1, -1, 1, 1], mcb: [0, 0, 0, 0, -1, 1, 1, -1],
    mlm: [-1, -1, 1, 1, 0, 0, 0, 0], mlb: [-1, 1, 1, -1, 0, 0, 0, 0],
    vc: [1, 1, -1, -1, 0, 0, 0, 0], vl: [0, 0, 0, 0, -1, -1, 1, 1],
  };
  const sg = Math.sign;
  const sum = (s) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const ab = i < 4;
    return sg(P) * S.pm[i] * (ab ? s.PmAB : s.PmCD) + sg(P) * S.pb[i] * (ab ? s.PbAB : s.PbCD)
      + sg(Mc) * (S.mcm[i] * s.Mcm + S.mcb[i] * s.Mcb) + sg(Ml) * (S.mlm[i] * s.Mlm + S.mlb[i] * s.Mlb);
  });
  const sphi = sum(stress('circ', 'Nphi', 'Mphi'));
  const sx = sum(stress('long', 'Nx', 'Mx'));
  const tau = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => sg(Vc) * S.vc[i] * Math.abs(Vc) / (4 * c1 * T) + sg(Vl) * S.vl[i] * Math.abs(Vl) / (4 * c2 * T)); // eqs. 50–51
  const tresca = (a, b, t) => { const r = Math.sqrt(((a - b) / 2) ** 2 + t ** 2); const p1 = (a + b) / 2 + r; const p2 = (a + b) / 2 - r; return Math.max(p1 - p2, Math.abs(p1), Math.abs(p2)); };
  app.rows.forEach((row, i) => {
    assert.ok(near(row.circumferential, sphi[i]), `${row.location} σφ ${row.circumferential} vs hand ${sphi[i]}`);
    assert.ok(near(row.longitudinal, sx[i]), `${row.location} σx ${row.longitudinal} vs hand ${sx[i]}`);
    assert.ok(near(row.shear, tau[i]), `${row.location} τ ${row.shear} vs hand ${tau[i]}`);
    assert.ok(near(row.stressIntensity, tresca(sphi[i], sx[i], tau[i])), `${row.location} SI`);
  });
  // The terms the app used are the printed values, not interpolated.
  const used = Object.values(app.provenance.circ).concat(Object.values(app.provenance.long)).filter((p) => p.load !== 'P');
  assert.ok(used.every((p) => !p.factorInterpolated && !p.factorApproximate));
  console.log(`Hand calculation at γ = 100, β1/β2 = 2 (printed factors only): 8/8 points to 1e-9, governing ${app.governing.location} ${app.governing.stressIntensity.toFixed(3)} MPa`);
}

// 3. Square footprint = round attachment with r0 = c/0.875, interpolated γ (62), all normal-stress loads.
{
  const c = 80;
  const loads = { P: -5000, Vc: 0, Vl: 0, Mc: 1.5e6, Ml: -4e6, Mt: 0 };
  const base = { ...EXAMPLE_CASES.LUG_200X100, momentUnit: 'N·mm', loads };
  const square = calculateWrc537({ ...base, attachmentLength: 2 * c, attachmentWidth: 2 * c });
  const round = calculateWrc537({ ...base, attachmentType: 'ROUND', attachmentOutsideDiameter: 2 * c / 0.875 });
  assert.equal(square.ok && round.ok, true);
  square.rows.forEach((row, i) => {
    assert.ok(near(row.circumferential, round.rows[i].circumferential, 1e-9));
    assert.ok(near(row.longitudinal, round.rows[i].longitudinal, 1e-9));
  });
  const sheared = calculateWrc537({ ...base, attachmentLength: 2 * c, attachmentWidth: 2 * c, loads: { ...loads, Vc: 900, Vl: -700 } });
  const T = sheared.geometry.T;
  assert.ok(near(sheared.rows[0].shear, 900 / (4 * c * T)) && near(sheared.rows[4].shear, 700 / (4 * c * T)));
  console.log('Square footprint = round attachment with r0 = c/0.875: 8/8 points; shear = V/(4cT)');
}

// 4. Factor interpolation.
assert.deepEqual(momentFactor(WRC537_TABLE7, 'Nphi', 1, 62), { value: 1, approximate: false, interpolated: false, square: true });
assert.equal(momentFactor(WRC537_TABLE7, 'Nphi', 0.5, 50).value, 0.57);
assert.equal(momentFactor(WRC537_TABLE7, 'Nphi', 0.5, 50).interpolated, false);
assert.ok(near(momentFactor(WRC537_TABLE7, 'Nphi', 0.5, 62).value, 0.57 + (0.51 - 0.57) * 12 / 50));
assert.ok(near(momentFactor(WRC537_TABLE7, 'Nphi', 0.5, 62, 'LOG_GAMMA').value, 0.57 + (0.51 - 0.57) * Math.log(62 / 50) / Math.log(2)));
assert.ok(near(momentFactor(WRC537_TABLE7, 'Mx', Math.SQRT2, 100).value, (1 + 0.95) / 2)); // log-midpoint of 1 and 2
assert.ok(Math.abs(momentFactor(WRC537_TABLE8, 'Mphi', 1.001, 100).value - 1) < 0.001); // continuous through the square
assert.equal(momentFactor(WRC537_TABLE7, 'Nphi', 2, 15).approximate, true);
assert.equal(momentFactor(WRC537_TABLE7, 'Nphi', 2, 100).approximate, false);
assert.equal(momentFactor(WRC537_TABLE7, 'Nphi', 5, 100).blocked, 'RATIO');
assert.equal(momentFactor(WRC537_TABLE7, 'Nphi', 2, 10).blocked, 'GAMMA');
assert.ok(near(radialLoadBeta('Nx', 0.2, 0.05), 1.68 * Math.sqrt(0.01))); // ratio 4: 1 − ⅓·3·(1 − K1) = K1
assert.ok(near(radialLoadBeta('Nphi', 0.05, 0.2), (1 - (4 / 3) * 0.75 * (1 - 1.48)) * 0.1)); // eq. 30
console.log('Factor interpolation: exact at printed rows, 1 for a square, continuous, approximate rows flagged');

// 5. Blocking.
const lug = EXAMPLE_CASES.LUG_200X100;
const kinds = (input) => calculateWrc537(input).reasons.map((r) => r.kind);
assert.deepEqual(kinds({ ...lug, loads: { ...lug.loads, Mt: 50 } }), ['TORSION']);
const thin = calculateWrc537({ ...lug, attachmentLength: 300, attachmentWidth: 25 });
assert.equal(thin.ok, false);
assert.ok(thin.reasons.some((r) => r.kind === 'RATIO' && /0\.083/u.test(r.text) && /use FE \(LAFEA\)/u.test(r.fix)));
const thick = { ...lug, shellOutsideDiameter: 250, shellThickness: 20, attachmentLength: 60, attachmentWidth: 30, cylinderLength: '', attachmentStation: '' }; // γ 5.75
assert.ok(kinds(thick).includes('GAMMA'));
assert.equal(calculateWrc537({ ...thick, loads: { P: -1000, Vc: 100, Vl: 100, Mc: 0, Ml: 0, Mt: 0 } }).ok, true);
assert.equal(calculateWrc537({ ...thick, attachmentWidth: 60, loads: { ...lug.loads } }).ok, true); // square: no Table 7/8 factor needed
assert.ok(kinds({ ...lug, attachmentLength: 40, attachmentWidth: 20 }).includes('BETA'));
console.log('Blocked: torsion, thin plate (β1/β2 0.083), Mc/ML below γ 15, equivalent β below 0.05; radial load alone and a square are allowed at γ < 15');

// 6. Rectangular pad.
const padded = calculateWrcAttachment({ ...lug, padLength: 300, padWidth: 200, padThickness: 10 });
assert.equal(padded.ok, true, JSON.stringify(padded.reasons));
const [junction, edge] = padded.locations;
assert.equal(junction.id, 'JUNCTION');
assert.ok(near(junction.result.geometry.T, 22) && near(junction.result.geometry.c2, 100) && near(junction.result.geometry.c1, 50));
assert.ok(near(edge.result.geometry.T, 12) && near(edge.result.geometry.c2, 150) && near(edge.result.geometry.c1, 100));
const plainEdge = calculateWrc537({ ...lug, attachmentLength: 300, attachmentWidth: 200 });
edge.result.rows.forEach((row, i) => assert.equal(row.stressIntensity, plainEdge.rows[i].stressIntensity));
const small = calculateWrcAttachment({ ...lug, padLength: 150, padWidth: 200, padThickness: 10 });
assert.ok(small.reasons.some((r) => r.kind === 'PAD' && /pad length/u.test(r.text)));
assert.equal(calculateWrcAttachment({ ...lug, padOutsideDiameter: 500 }).padded, false); // a round-pad field does not apply to a lug
// A lug outside the shape range becomes valid with a pad, at the pad edge, but the junction keeps the lug footprint.
const thinPadded = calculateWrcAttachment({ ...lug, attachmentLength: 300, attachmentWidth: 25, padLength: 400, padWidth: 200, padThickness: 10 });
assert.ok(thinPadded.reasons.some((r) => r.kind === 'RATIO' && r.locationId === 'JUNCTION'));
assert.ok(!thinPadded.reasons.some((r) => r.locationId === 'PAD_EDGE'));
console.log('Rectangular pad: junction uses the lug footprint on shell + pad, pad edge the pad footprint on the shell');

// 7. Report and batch.
const batch = calculateWrc537Cases({ ...lug, loadCases: [{ name: 'A', loads: lug.loads }, { name: 'B', loads: { ...lug.loads, P: 2 * lug.loads.P } }] });
assert.equal(batch.allCalculated, true);
const html = buildWrcReportHtml(batch, { generatedAt: new Date(0) });
for (const text of ['rectangular attachment (§4.2.2', 'β used', 'Table factor', 'no method for torsion', 'half-width around', WRC_RECT_METHOD_TEXT.slice(0, 40)]) {
  assert.ok(html.includes(text), `report is missing "${text}"`);
}
console.log('Report and load-case batch carry the rectangular data');

console.log('WRC_LUG_CHECK_PASS');
