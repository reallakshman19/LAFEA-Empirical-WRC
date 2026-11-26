/**
 * Phase 5.4: checks the WRC 537 calculator against a PV Elite 28 report for a 36-inch nozzle that
 * PV Elite evaluated with WRC 297 (validation/emp1/pvelite28-wrc297-36in-nozzle/).
 *
 * WRC 297 and WRC 537 use different curves, so the stresses are not expected to agree. This check only
 * asserts what does not depend on the method, and records the size of the difference:
 *  1. PV Elite's own tables are consistent: each summary is the sum of its rows, and each printed
 *     stress intensity is reproduced from the summaries by our Tresca function (24 points).
 *  2. PV Elite's vessel stresses are rebuilt from its printed WRC 297 coefficients:
 *     1.2 (shell SCF) x coefficient x load / T^2 (P) or / (d T^2) (Mc, Ml), x 6 for bending.
 *  3. Our WRC 537 run on the same geometry and loads gives the same sign as PV Elite for every load
 *     term at every point, and zero where PV Elite prints zero (16 points x 12 terms).
 *  4. Shear stresses (Vc, Vl, Mt) agree within 1%: both programs use the same thin-wall formulas.
 *  5. The PV Elite / WRC 537 ratio for each load term is printed (not asserted: different method).
 *  6. Interpolation spread: linear-γ and log-γ give the same governing point, within 3%.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WRC_TIER, calculateWrc537 } from '../src/app/wrc/wrc-calc.js';
import { emp1Wrc537PlaneStressIntensity as tresca } from '../src/core/emp1/emp1-wrc537-cylindrical-table5.js';

const reference = JSON.parse(readFileSync(new URL(
  '../validation/emp1/pvelite28-wrc297-36in-nozzle/pvelite28-wrc297-36in-nozzle-reference-v1.json', import.meta.url)));
assert.equal(reference.role, 'DIFFERENT_METHOD_REFERENCE_NOT_A_WRC537_BENCHMARK');
const { input, locations } = reference;
const LOAD_TERMS = ['Pmem', 'Pbend', 'Mcmem', 'Mcbend', 'Mlmem', 'Mlbend'];
const PRINT_RESOLUTION = 0.5; // kPa

// 1. PV Elite's tables are internally consistent.
let siPoints = 0;
for (const c of reference.cases) {
  const v = c.vessel;
  for (const side of ['outplane', 'inplane']) {
    locations.forEach((loc, i) => {
      const sum = [...LOAD_TERMS, 'pressure'].reduce((s, term) => s + v[side][term][i], 0);
      assert.ok(Math.abs(sum - v[side].summary[i]) <= 7 * PRINT_RESOLUTION, `${c.caseId} ${side} ${loc}: rows sum to ${sum}, summary ${v[side].summary[i]}`);
    });
  }
  const tables = [[v.outplane.summary, v.inplane.summary, v.shear.summary, v.stressIntensity]];
  if (c.nozzle) tables.push([c.nozzle.hoopSummary, c.nozzle.axialSummary, c.nozzle.shearSummary, c.nozzle.stressIntensity]);
  for (const [a, b, shear, printed] of tables) {
    locations.forEach((loc, i) => {
      const si = tresca(a[i], b[i], shear[i]);
      // PV Elite works from unrounded components, so the printed summaries carry a few kPa of rounding
      // (worst seen: 6 kPa, about 0.01%). 10 kPa still catches any wrong combination rule.
      assert.ok(Math.abs(si - printed[i]) <= 10, `${c.caseId} ${loc}: Tresca ${si.toFixed(0)} vs printed ${printed[i]} kPa`);
      siPoints += 1;
    });
  }
}
assert.equal(siPoints, 24);
console.log(`PV Elite tables consistent; ${siPoints}/24 printed stress intensities reproduced by our Tresca function`);

// 2. Rebuild PV Elite's vessel stresses from its printed WRC 297 coefficients.
// Outplane (θ direction around the nozzle) uses the N0/M0 curves, inplane (radial) the Nr/Mr curves.
const COEFFICIENT = {
  outplane: { Pmem: 'N0/P', Pbend: 'M0/P', Mcmem: 'N0DL/Mc', Mcbend: 'M0d/Mc', Mlmem: 'N0DL/Ml', Mlbend: 'M0D/Ml' },
  inplane: { Pmem: 'Nr/P', Pbend: 'Mr/P', Mcmem: 'NrDL/Mc', Mcbend: 'MrD/Mc', Mlmem: 'NrDL/Ml', Mlbend: 'MrD/Ml' },
};
const K = input.shellStressConcentrationFactor;
let worstCoefficientGap = 0;
for (const c of reference.cases) {
  const { vesselThickness: T, nozzleOutsideDiameter: d } = c.wrc297CurveAccess;
  for (const side of ['outplane', 'inplane']) {
    for (const term of LOAD_TERMS) {
      const key = term.startsWith('P') ? 'P' : term.slice(0, 2); // P, Mc, Ml
      const magnitude = Math.abs(input.loads[key]) * (key === 'P' ? 1 : 1000); // N or N·mm
      const scale = K * (term.endsWith('bend') ? 6 : 1) * magnitude / (key === 'P' ? T ** 2 : d * T ** 2) * 1000; // kPa per unit coefficient
      const printed = Math.max(...c.vessel[side][term].map(Math.abs));
      const implied = printed / scale;
      const gap = Math.abs(implied - c.coefficients[COEFFICIENT[side][term]]);
      worstCoefficientGap = Math.max(worstCoefficientGap, gap);
      // Coefficients are printed to 3 decimals; allow two units in the last place.
      assert.ok(gap <= 0.001, `${c.caseId} ${side} ${term}: implied ${implied.toFixed(5)} vs printed ${c.coefficients[COEFFICIENT[side][term]]}`);
    }
  }
}
console.log(`PV Elite stresses = ${K} (shell SCF) x WRC 297 coefficient x load: 24/24 terms, worst coefficient gap ${worstCoefficientGap.toFixed(5)}`);

// Our WRC 537 run on the same geometry: PV Elite's mean diameter and thickness for each location.
const ourInput = (c, extra = {}) => {
  const { vesselMeanDiameter: D, vesselThickness: T, nozzleOutsideDiameter: d } = c.wrc297CurveAccess;
  return {
    shellOutsideDiameter: D + T,
    shellThickness: T,
    corrosionAllowance: 0,
    attachmentOutsideDiameter: d,
    forceUnit: 'N',
    momentUnit: 'N·m',
    loads: input.loads,
    coordinate: 'LINEAR_GAMMA',
    designPressure: 0,
    Kn: K,
    Kb: K,
    ...extra,
  };
};
const ourDirection = (side, i) => ((side === 'outplane') === (i < 4) ? 'circumferential' : 'longitudinal');

const expectedGeometry = { JUNCTION: { gamma: 21.61, beta: 0.370 }, PAD_EDGE: { gamma: 42.72, beta: 0.436 } };
const ratioRows = [];
for (const c of reference.cases) {
  const ours = calculateWrc537(ourInput(c));
  assert.equal(ours.ok, true, JSON.stringify(ours.reasons));
  assert.equal(ours.tier, WRC_TIER.INTERPOLATED);
  assert.ok(Math.abs(ours.geometry.gamma - expectedGeometry[c.caseId].gamma) < 0.01);
  assert.ok(Math.abs(ours.geometry.beta - expectedGeometry[c.caseId].beta) < 0.001);

  // 3. Same sign for every load term at every point; zero where PV Elite prints zero.
  let compared = 0;
  for (const side of ['outplane', 'inplane']) {
    for (const term of LOAD_TERMS) {
      locations.forEach((loc, i) => {
        const pv = c.vessel[side][term][i];
        const our = ours.components[ourDirection(side, i)][term][i] * 1000;
        if (pv === 0) {
          assert.ok(Math.abs(our) < 1e-6, `${c.caseId} ${side} ${term} ${loc}: PV Elite 0, ours ${our}`);
        } else {
          assert.equal(Math.sign(our), Math.sign(pv), `${c.caseId} ${side} ${term} ${loc}: sign differs (PV Elite ${pv}, ours ${our.toFixed(0)})`);
        }
        compared += 1;
      });
      const pvMax = Math.max(...c.vessel[side][term].map(Math.abs));
      if (pvMax > 0) {
        const i = c.vessel[side][term].findIndex((x) => Math.abs(x) === pvMax);
        ratioRows.push({ caseId: c.caseId, side, term, pv: pvMax, ours: Math.abs(ours.components[ourDirection(side, i)][term][i] * 1000) });
      }
    }
  }
  assert.equal(compared, 96);

  // 4. Shear (Vc, Vl, Mt) uses the same thin-wall formulas in both programs.
  locations.forEach((loc, i) => {
    const pv = Math.abs(c.vessel.shear.summary[i]);
    const our = Math.abs(ours.rows[i].shear * 1000);
    assert.ok(Math.abs(our - pv) <= 0.01 * pv + PRINT_RESOLUTION, `${c.caseId} ${loc}: shear ${our.toFixed(0)} vs PV Elite ${pv} kPa`);
  });
  console.log(`${c.caseId}: γ ${ours.geometry.gamma.toFixed(2)}, β ${ours.geometry.beta.toFixed(3)}; signs agree at 96/96 term-points; shear within 1% at 8/8`);
}

// 5. Record the size of the method difference (PV Elite WRC 297 / our WRC 537, both with the 1.2 SCF).
console.log('\nPV Elite WRC 297 / our WRC 537, largest value of each load term (not asserted):');
for (const r of ratioRows) {
  console.log(`  ${r.caseId.padEnd(8)} ${r.side.padEnd(8)} ${r.term.padEnd(6)} PV Elite ${String(r.pv).padStart(6)}  ours ${r.ours.toFixed(0).padStart(6)}  ratio ${(r.pv / r.ours).toFixed(2)}`);
}
const ratios = ratioRows.map((r) => r.pv / r.ours);
console.log(`  range ${Math.min(...ratios).toFixed(2)} to ${Math.max(...ratios).toFixed(2)}`);

// Load-only stress intensity at each point (PV Elite's pressure rows removed), both with the 1.2 SCF.
console.log('\nLoad-only stress intensity, kPa (PV Elite WRC 297 / our WRC 537, not asserted):');
for (const c of reference.cases) {
  const ours = calculateWrc537(ourInput(c));
  const v = c.vessel;
  const cells = locations.map((loc, i) => {
    const pv = tresca(v.outplane.summary[i] - v.outplane.pressure[i], v.inplane.summary[i] - v.inplane.pressure[i], v.shear.summary[i]);
    return `${loc} ${pv.toFixed(0)}/${(ours.rows[i].stressIntensity * 1000).toFixed(0)}`;
  });
  const pvMax = Math.max(...locations.map((_, i) => tresca(v.outplane.summary[i] - v.outplane.pressure[i], v.inplane.summary[i] - v.inplane.pressure[i], v.shear.summary[i])));
  console.log(`  ${c.caseId}: ${cells.join('  ')}`);
  console.log(`  ${c.caseId}: governing PV Elite ${pvMax.toFixed(0)}, ours ${(ours.governing.stressIntensity * 1000).toFixed(0)} at ${ours.governing.location}, ratio ${(pvMax / (ours.governing.stressIntensity * 1000)).toFixed(2)}`);
}

// 6. Interpolation spread between the two γ blending rules.
for (const c of reference.cases) {
  const linear = calculateWrc537(ourInput(c, { Kn: 1, Kb: 1 }));
  const log = calculateWrc537(ourInput(c, { Kn: 1, Kb: 1, coordinate: 'LOG_GAMMA' }));
  assert.equal(log.ok, true);
  assert.equal(linear.governing.location, log.governing.location);
  const spread = Math.abs(linear.governing.stressIntensity - log.governing.stressIntensity) / linear.governing.stressIntensity * 100;
  assert.ok(spread <= 3, `${c.caseId}: linear vs log γ differ by ${spread.toFixed(1)}%`);
  console.log(`${c.caseId}: governing ${linear.governing.location} ${linear.governing.stressIntensity.toFixed(2)} MPa (linear γ) vs ${log.governing.stressIntensity.toFixed(2)} MPa (log γ), spread ${spread.toFixed(1)}%`);
}

console.log('\nwrc-pvelite-wrc297-reference: PASS (different-method reference, not a WRC 537 benchmark)');
