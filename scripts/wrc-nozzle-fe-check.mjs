/**
 * Shell-FE cross-check of the WRC 537 calculator (src/app/lafea/nozzle-shell.js), on the
 * CAESAR II 2017 nozzle (Rm 912.5, T 19, r0 161.9, γ 48, β 0.155), one load at a time.
 *
 * Checks:
 *  1. The shell solve passes the core's equilibrium and energy checks (calculateLocalShell accepted).
 *  2. Sign mapping: at every WRC point where a load gives a significant FE stress, the dominant
 *     stress component has the same sign in FE and WRC 537.
 *  3. Frozen FE maxima (regression) and the FE / WRC ratios recorded in docs/AUDIT-AND-ROADMAP.md.
 *     Mesh sensitivity (run once, too slow for every check run): a finer mesh (16 330 DOF) and an
 *     8×-thick plug change the maxima by under 2% and 6%.
 *  4. The combined cross-check (crossCheckWrc537) equals superposition of the single-load runs.
 */
import assert from 'node:assert/strict';
import { crossCheckWrc537, solveNozzleShell, wrcLoadsToShell } from '../src/app/lafea/nozzle-shell.js';
import { EXAMPLE_CASES, calculateWrc537, deriveWrcGeometry } from '../src/app/wrc/wrc-calc.js';

const base = { ...EXAMPLE_CASES.CAESAR_GAMMA48 };
const g = deriveWrcGeometry(base);
const geometry = { meanRadius: g.Rm, thickness: g.T, attachmentRadius: g.r0, length: g.L, station: g.x };
const unit = { P: 10000, Mc: 1e7, Ml: 1e7 };
const zero = { P: 0, Vc: 0, Vl: 0, Mc: 0, Ml: 0, Mt: 0 };

const fe = solveNozzleShell(geometry, Object.fromEntries(Object.entries(unit).map(([k, v]) => [k, wrcLoadsToShell({ [k]: v })])), { plugFactor: 4 });
const frozen = { P: 21.58, Mc: 145.62, Ml: 57.99 };
const ratioBand = { P: [1.15, 1.45], Mc: [1.25, 1.55], Ml: [0.85, 1.05] };
const summary = {};
for (const c of fe.cases) {
  const wrc = calculateWrc537({ ...base, forceUnit: 'N', momentUnit: 'N·mm', loads: { ...zero, [c.loadCaseId]: unit[c.loadCaseId] } });
  const feMax = Math.max(...c.points.map((p) => p.stressIntensity));
  const wrcMax = wrc.governing.stressIntensity;
  c.points.forEach((p, i) => {
    const w = wrc.rows[i];
    if (p.stressIntensity < 0.25 * feMax || w.stressIntensity < 1) return;
    const key = Math.abs(w.circumferential) >= Math.abs(w.longitudinal) ? 'circumferential' : 'longitudinal';
    assert.equal(Math.sign(p[key]), Math.sign(w[key]), `${c.loadCaseId} ${p.location} ${key}: FE ${p[key].toFixed(2)} vs WRC ${w[key].toFixed(2)}`);
  });
  assert.ok(Math.abs(feMax - frozen[c.loadCaseId]) <= 0.01 * frozen[c.loadCaseId], `${c.loadCaseId}: FE max ${feMax} vs frozen ${frozen[c.loadCaseId]}`);
  const ratio = feMax / wrcMax;
  assert.ok(ratio >= ratioBand[c.loadCaseId][0] && ratio <= ratioBand[c.loadCaseId][1], `${c.loadCaseId}: FE/WRC ${ratio}`);
  summary[c.loadCaseId] = { feMax: +feMax.toFixed(2), wrcMax: +wrcMax.toFixed(2), ratio: +ratio.toFixed(3) };
}

// Combined load through the app-facing function equals the superposed single-load FE stresses
const combinedLoads = { ...zero, P: 4000, Mc: 3e6, Ml: -5e6 };
const wrcCombined = calculateWrc537({ ...base, forceUnit: 'N', momentUnit: 'N·mm', loads: combinedLoads });
const cross = crossCheckWrc537(wrcCombined, { plugFactor: 4 });
cross.rows.forEach((row, i) => {
  const sup = (key) => fe.cases.reduce((t, c) => t + c.points[i][key] * (combinedLoads[c.loadCaseId] / unit[c.loadCaseId]), 0);
  assert.ok(Math.abs(row.feCircumferential - sup('circumferential')) < 1e-3 * Math.max(1, Math.abs(row.feCircumferential)), `${row.location} circ superposition`);
  assert.ok(Math.abs(row.feLongitudinal - sup('longitudinal')) < 1e-3 * Math.max(1, Math.abs(row.feLongitudinal)), `${row.location} long superposition`);
});

console.log(JSON.stringify({ check: 'wrc-nozzle-fe', status: 'PASS', mesh: fe.mesh, perUnitLoad: summary }));
