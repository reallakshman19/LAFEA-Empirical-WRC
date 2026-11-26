/**
 * Shell-FE cross-check of the WRC 537 shear loads Vc, Vl and Mt (src/app/lafea/nozzle-shell.js), on
 * the CAESAR II 2017 nozzle (Rm 912.5, T 19, r0 161.9, γ 48, β 0.155), one load at a time.
 * P, Mc and Ml are checked by scripts/wrc-nozzle-fe-check.mjs. The two run separately to stay
 * inside the check runner's time limit.
 *
 * WRC 537 treats these loads as pure shear at the attachment edge:
 *   Vc: τ = Vc/(π·r0·T) at A, B;  Vl: τ = Vl/(π·r0·T) at C, D;  Mt: τ = Mt/(2π·r0²·T) at all 8 points.
 * For a rigid round attachment, the torsion formula is exact. For the shear forces, classical
 * elasticity (a rigid inclusion in a plate) splits the load into bearing (normal) stress on the
 * loaded side and shear on the flanks, so FE shear at the WRC points is below WRC's value.
 *
 * Checks:
 *  1. The shell solve passes the core's equilibrium and energy checks.
 *  2. Shear sign: at every point where WRC gives shear, FE shear has the same sign (WRC point
 *     convention, see wrcLoadsToShell).
 *  3. Shear size at the WRC points: Mt within 25% of WRC; Vc and Vl below WRC, in the frozen bands.
 *  4. Frozen FE maxima (regression, ±1%) and FE/WRC ratios, as recorded in docs/AUDIT-AND-ROADMAP.md.
 *     Sensitivity (run once, too slow for every check run): a finer mesh (16 330 DOF), an 8×-thick plug,
 *     and loading the plug at 0.5·r0 change the Mt and Vl maxima by under 4%, and Vc by up to 14%.
 *  5. The app path (crossCheckWrc537) with Vc, Vl and Mt together equals superposition of the
 *     single-load runs, and returns a stress-intensity field for the contour plot.
 */
import assert from 'node:assert/strict';
import { crossCheckWrc537, solveNozzleShell, wrcLoadsToShell } from '../src/app/lafea/nozzle-shell.js';
import { EXAMPLE_CASES, calculateWrc537, deriveWrcGeometry } from '../src/app/wrc/wrc-calc.js';

const base = { ...EXAMPLE_CASES.CAESAR_GAMMA48 };
const g = deriveWrcGeometry(base);
const geometry = { meanRadius: g.Rm, thickness: g.T, attachmentRadius: g.r0, length: g.L, station: g.x };
const unit = { Vc: 10000, Vl: 10000, Mt: 1e7 };
const zero = { P: 0, Vc: 0, Vl: 0, Mc: 0, Ml: 0, Mt: 0 };
const options = { plugFactor: 4 };

const fe = solveNozzleShell(geometry, Object.fromEntries(Object.entries(unit).map(([k, v]) => [k, wrcLoadsToShell({ [k]: v })])), options);
const frozen = { Vc: 2.63, Vl: 0.76, Mt: 7.38 };
const ratioBand = { Vc: [1.15, 1.40], Vl: [0.30, 0.45], Mt: [1.05, 1.25] };
// FE shear / WRC shear at the points WRC loads
const shearBand = { Vc: [0.60, 0.85], Vl: [0.30, 0.45], Mt: [0.75, 1.20] };
const summary = {};
for (const c of fe.cases) {
  const id = c.loadCaseId;
  const wrc = calculateWrc537({ ...base, forceUnit: 'N', momentUnit: 'N·mm', loads: { ...zero, [id]: unit[id] } });
  const shearRatios = [];
  c.points.forEach((p, i) => {
    const w = wrc.rows[i];
    assert.equal(p.location, w.location);
    if (Math.abs(w.shear) < 0.5) return;
    assert.equal(Math.sign(p.shear), Math.sign(w.shear), `${id} ${p.location} shear sign: FE ${p.shear.toFixed(3)} vs WRC ${w.shear.toFixed(3)}`);
    const ratio = p.shear / w.shear;
    assert.ok(ratio >= shearBand[id][0] && ratio <= shearBand[id][1], `${id} ${p.location}: FE/WRC shear ${ratio.toFixed(3)} outside ${shearBand[id]}`);
    shearRatios.push(ratio);
  });
  assert.ok(shearRatios.length >= 4, `${id}: expected WRC shear at 4 or more points`);
  const feMax = Math.max(...c.points.map((p) => p.stressIntensity));
  const wrcMax = wrc.governing.stressIntensity;
  assert.ok(Math.abs(feMax - frozen[id]) <= 0.01 * frozen[id], `${id}: FE max ${feMax} vs frozen ${frozen[id]}`);
  const ratio = feMax / wrcMax;
  assert.ok(ratio >= ratioBand[id][0] && ratio <= ratioBand[id][1], `${id}: FE/WRC ${ratio}`);
  summary[id] = {
    feMax: +feMax.toFixed(2),
    wrcMax: +wrcMax.toFixed(2),
    ratio: +ratio.toFixed(3),
    feGoverning: c.points.reduce((a, b) => (b.stressIntensity > a.stressIntensity ? b : a)).location,
    shearRatio: [+Math.min(...shearRatios).toFixed(2), +Math.max(...shearRatios).toFixed(2)],
  };
}

// App path with the three shear loads together equals superposition, and carries the contour field
const combinedLoads = { ...zero, Vc: -3000, Vl: 6000, Mt: 4e6 };
const wrcCombined = calculateWrc537({ ...base, forceUnit: 'N', momentUnit: 'N·mm', loads: combinedLoads });
const cross = crossCheckWrc537(wrcCombined, options);
cross.rows.forEach((row, i) => {
  const sup = (key) => fe.cases.reduce((t, c) => t + c.points[i][key] * (combinedLoads[c.loadCaseId] / unit[c.loadCaseId]), 0);
  for (const [rowKey, key] of [['feCircumferential', 'circumferential'], ['feLongitudinal', 'longitudinal'], ['feShear', 'shear']]) {
    assert.ok(Math.abs(row[rowKey] - sup(key)) < 1e-3 * Math.max(1, Math.abs(row[rowKey])), `${row.location} ${key} superposition: ${row[rowKey]} vs ${sup(key)}`);
  }
});
const field = cross.field;
assert.ok(field && field.triangles.length > 1000, 'contour field present');
assert.equal(field.attachmentRadius, g.r0);
for (const t of field.triangles) {
  assert.equal(t.v.length, 6);
  assert.ok(Number.isFinite(t.u) && t.u >= 0 && Number.isFinite(t.l) && t.l >= 0, 'field SI finite and non-negative');
  for (let k = 0; k < 6; k += 1) assert.ok(Math.abs(t.v[k]) <= field.halfSize + 0.2, 'field inside the patch');
}
// The element field peaks near the attachment edge, of the same size as the 8-point values
const fieldMax = Math.max(...field.triangles.map((t) => Math.max(t.u, t.l)));
const pointMax = cross.feGoverning.fe;
assert.ok(fieldMax > 0.5 * pointMax && fieldMax < 1.5 * pointMax, `field max ${fieldMax} vs point max ${pointMax}`);

console.log(JSON.stringify({ check: 'wrc-nozzle-fe-shear', status: 'PASS', mesh: fe.mesh, perUnitLoad: summary, combined: { feMax: +pointMax.toFixed(2), fieldMax } }));
