/**
 * Shell-FE model for a rectangular attachment (src/app/lafea/lug-shell.js), roadmap PL-04, on the
 * 200 × 100 mm lug example (shell 1500 × 12, Rm 744, γ 62; c2 = 100 along, c1 = 50 around), one load at
 * a time. The square-vs-round comparison and the FE-only route are in wrc-lug-fe-route-check.mjs; the two
 * run separately to stay inside the check runner's time limit.
 *
 * Checks:
 *  1. The mesh: footprint corners are nodes, the plug's boundary is the first ring, every triangle faces
 *     outward, and the plug loads have exactly the six resultants at the footprint centre (no solve).
 *  2. The shell solve passes the core's equilibrium and energy checks.
 *  3. Signs: for P, Mc and Ml, the dominant normal stress has the WRC 537 sign at every point both load;
 *     for Vc and Vl, the shear has the WRC 537 sign at every point WRC gives shear; for Mt (which WRC 537
 *     refuses on a lug), the shear has the sign of WRC 537's round-attachment torsion at all 8 points.
 *  4. Frozen FE maxima (regression, ±1%) and FE/WRC ratios, as recorded in docs/AUDIT-AND-ROADMAP.md.
 *     The corner (edge peak) is above the 8-point maximum for P, Mc and Ml.
 *     Sensitivity (run once, too slow for every check run): 24 divisions and 15 rings (16 050 DOF) change
 *     the 8-point maxima by under 1.2% but the edge peak by 21–28%; a 12×-thick plug lowers the maxima 4–8%.
 *  5. The app path (wrcFeReference → crossCheckWrc537Rectangular) with the example's loads equals the
 *     superposition of the single-load runs, and returns a rectangular stress-intensity field.
 */
import assert from 'node:assert/strict';
import { buildLugShellSource, crossCheckWrc537Rectangular, solveLugShell } from '../src/app/lafea/lug-shell.js';
import { cross, wrcLoadsToShell } from '../src/app/lafea/nozzle-shell.js';
import { EXAMPLE_CASES, WRC_FE_MODE, calculateWrc537, deriveWrcGeometry, wrcFeReference } from '../src/app/wrc/wrc-calc.js';

const base = { ...EXAMPLE_CASES.LUG_200X100 };
const g = deriveWrcGeometry(base);
assert.equal(g.rectangular, true);
const geometry = { meanRadius: g.Rm, thickness: g.T, halfWidth: g.c1, halfLength: g.c2, length: g.L, station: g.x };
const zero = { P: 0, Vc: 0, Vl: 0, Mc: 0, Ml: 0, Mt: 0 };
const unit = { P: 10000, Vc: 10000, Vl: 10000, Mc: 1e7, Ml: 1e7, Mt: 1e7 };
const options = { plugFactor: 4 };

// 1. Mesh and load resultants, without solving
{
  const target = { P: 1234, Vc: -567, Vl: 890, Mc: 3.2e6, Ml: -4.5e6, Mt: 2.1e6 };
  const { source, mesh } = buildLugShellSource(geometry, { T: target }, options);
  const pos = new Map(source.nodes.map((n) => [n.nodeId, n.position]));
  const unrolled = (id) => { const [x, y, z] = pos.get(id); return [g.Rm * Math.atan2(y, z), x - g.x]; };
  const ring0 = mesh.ringIds[0];
  for (const [s, x] of [[-g.c1, -g.c2], [g.c1, -g.c2], [g.c1, g.c2], [-g.c1, g.c2]]) {
    assert.ok(ring0.some((id) => { const [a, b] = unrolled(id); return Math.abs(a - s) < 1e-6 && Math.abs(b - x) < 1e-6; }), `corner (${s}, ${x}) is a node`);
  }
  for (const id of ring0) {
    const [s, x] = unrolled(id);
    assert.ok(Math.abs(Math.abs(s) - g.c1) < 1e-6 || Math.abs(Math.abs(x) - g.c2) < 1e-6, `ring 0 node ${id} on the footprint edge`);
  }
  const plug = source.elements.filter((e) => e.elementId.startsWith('PQ'));
  assert.equal(plug.length, 2 * mesh.ns * mesh.nx);
  assert.ok(plug.every((e) => e.thickness === 4 * g.T), 'plug thickness 4T');
  for (const e of source.elements) {
    const [p, q, r] = e.nodeIds.map((id) => pos.get(id));
    const n = cross([q[0] - p[0], q[1] - p[1], q[2] - p[2]], [r[0] - p[0], r[1] - p[1], r[2] - p[2]]);
    const c = [0, 1, 2].map((k) => (p[k] + q[k] + r[k]) / 3);
    assert.ok(n[1] * c[1] + n[2] * c[2] > 0, `${e.elementId} faces outward`);
  }
  // Resultants about the footprint centre (xc, 0, Rm), in the shell-model convention
  const f = [0, 0, 0];
  const m = [0, 0, 0];
  for (const l of source.loadCases[0].nodalLoads) {
    const p = pos.get(l.nodeId);
    const rr = [p[0] - g.x, p[1], p[2] - g.Rm];
    const mm = cross(rr, [l.fx, l.fy, l.fz]);
    for (let k = 0; k < 3; k += 1) { f[k] += [l.fx, l.fy, l.fz][k]; m[k] += mm[k]; }
    assert.ok(l.m1 === 0 && l.m2 === 0, 'no nodal moments');
  }
  const near = (a, b, label) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)) + 1e-6, `${label}: ${a} vs ${b}`);
  near(f[0], target.Vl, 'force x = Vl'); near(f[1], target.Vc, 'force y = Vc'); near(f[2], target.P, 'force z = P');
  near(m[0], target.Mc, 'moment x = Mc'); near(m[1], target.Ml, 'moment y = Ml'); near(m[2], -target.Mt, 'moment z = −Mt');
}

// 2–4. One solve, six unit loads
const fe = solveLugShell(geometry, Object.fromEntries(Object.entries(unit).map(([k, v]) => [k, wrcLoadsToShell({ ...zero, [k]: v })])), options);
const frozen = { P: 40.99, Vc: 3.03, Vl: 2.09, Mc: 401.28, Ml: 232.42, Mt: 33.01 };
const ratioBand = { P: [0.62, 0.80], Vc: [0.30, 0.45], Vl: [0.42, 0.58], Mc: [0.58, 0.75], Ml: [0.62, 0.80] };
const wrcRoundTorsion = calculateWrc537({ ...base, attachmentType: 'ROUND', attachmentOutsideDiameter: 200, forceUnit: 'N', momentUnit: 'N·mm', loads: { ...zero, Mt: unit.Mt } });
assert.ok(wrcRoundTorsion.ok && wrcRoundTorsion.rows.every((w) => w.shear > 0), 'WRC 537 round torsion: positive shear at all 8 points');
const summary = {};
for (const c of fe.cases) {
  const id = c.loadCaseId;
  const feMax = Math.max(...c.points.map((p) => p.stressIntensity));
  assert.ok(Math.abs(feMax - frozen[id]) <= 0.01 * frozen[id], `${id}: FE max ${feMax.toFixed(3)} vs frozen ${frozen[id]}`);
  if (id === 'Mt') {
    const wrc = calculateWrc537({ ...base, forceUnit: 'N', momentUnit: 'N·mm', loads: { ...zero, Mt: unit.Mt } });
    assert.equal(wrc.ok, false, 'WRC 537 refuses torsion on a lug');
    assert.ok(c.points.every((p) => p.shear > 0), `Mt: FE shear positive at all 8 points (${c.points.map((p) => p.shear.toFixed(2))})`);
    summary.Mt = { feMax: +feMax.toFixed(2), wrc: 'refused', feGoverning: c.points.reduce((a, b) => (b.stressIntensity > a.stressIntensity ? b : a)).location };
    continue;
  }
  const wrc = calculateWrc537({ ...base, forceUnit: 'N', momentUnit: 'N·mm', loads: { ...zero, [id]: unit[id] } });
  assert.ok(wrc.ok, `${id}: WRC 537 result`);
  let signed = 0;
  c.points.forEach((p, i) => {
    const w = wrc.rows[i];
    assert.equal(p.location, w.location);
    if (['Vc', 'Vl'].includes(id)) {
      if (Math.abs(w.shear) < 0.5) return;
      assert.equal(Math.sign(p.shear), Math.sign(w.shear), `${id} ${p.location} shear: FE ${p.shear.toFixed(3)} vs WRC ${w.shear.toFixed(3)}`);
      signed += 1;
      return;
    }
    if (p.stressIntensity < 0.25 * feMax || w.stressIntensity < 1) return;
    const key = Math.abs(w.circumferential) >= Math.abs(w.longitudinal) ? 'circumferential' : 'longitudinal';
    assert.equal(Math.sign(p[key]), Math.sign(w[key]), `${id} ${p.location} ${key}: FE ${p[key].toFixed(2)} vs WRC ${w[key].toFixed(2)}`);
    signed += 1;
  });
  assert.ok(signed >= 4, `${id}: sign compared at ${signed} points`);
  const ratio = feMax / wrc.governing.stressIntensity;
  assert.ok(ratio >= ratioBand[id][0] && ratio <= ratioBand[id][1], `${id}: FE/WRC ${ratio.toFixed(3)} outside ${ratioBand[id]}`);
  if (['P', 'Mc', 'Ml'].includes(id)) assert.ok(c.edgePeak.value > feMax, `${id}: edge peak ${c.edgePeak.value} above the 8-point maximum ${feMax}`);
  summary[id] = { feMax: +feMax.toFixed(2), wrcMax: +wrc.governing.stressIntensity.toFixed(2), ratio: +ratio.toFixed(3), edgePeak: c.edgePeak.value };
}

// 5. The app path with the example's own loads equals superposition, and carries a rectangular field
const reference = wrcFeReference(base);
assert.equal(reference.feMode, WRC_FE_MODE.COMPARE);
assert.equal(reference.feLocation.id, 'ATTACHMENT');
const app = crossCheckWrc537Rectangular(JSON.parse(JSON.stringify(reference)), options);
assert.equal(app.rectangular, true);
const loads = reference.loadsBase;
app.rows.forEach((row, i) => {
  const sup = (key) => fe.cases.reduce((t, c) => t + c.points[i][key] * (loads[c.loadCaseId] / unit[c.loadCaseId]), 0);
  for (const [rowKey, key] of [['feCircumferential', 'circumferential'], ['feLongitudinal', 'longitudinal'], ['feShear', 'shear']]) {
    assert.ok(Math.abs(row[rowKey] - sup(key)) < 1e-3 * Math.max(1, Math.abs(row[rowKey])), `${row.location} ${key} superposition: ${row[rowKey]} vs ${sup(key)}`);
  }
});
const field = app.field;
assert.deepEqual(field.attachment, { shape: 'rectangle', halfWidth: g.c1, halfLength: g.c2 });
assert.ok(field.triangles.length > 1000, 'contour field present');
for (const t of field.triangles) {
  assert.ok(Number.isFinite(t.u) && t.u >= 0 && Number.isFinite(t.l) && t.l >= 0, 'field SI finite and non-negative');
  for (let k = 0; k < 6; k += 2) assert.ok(Math.abs(t.v[k]) <= field.halfSizeS + 0.2 && Math.abs(t.v[k + 1]) <= field.halfSizeX + 0.2, 'field inside the patch');
}
assert.ok(app.edgePeak.value >= app.feGoverning.fe, 'edge peak at or above the 8-point maximum');

console.log(JSON.stringify({ check: 'wrc-lug-fe', status: 'PASS', mesh: fe.mesh, perUnitLoad: summary, example: { feMax: +app.feGoverning.fe.toFixed(2), at: app.feGoverning.location, edgePeak: app.edgePeak.value, wrcMax: +reference.governing.stressIntensity.toFixed(2) } }));
