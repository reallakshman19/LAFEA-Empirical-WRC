/**
 * LAFEA plate input form (src/app/lafea/lafea-plate.js), through the same domain-first workbench store
 * the LAFEA tab uses: source → domain → geometry evidence → mesh → solve → 3-level convergence study.
 *
 * Checks:
 *  1. Input validation gives plain reasons for unusable input (no supports, rigid-body motion, a load on a
 *     fixed edge, a hole too big, a result point in the hole, a mesh too fine).
 *  2. Plate with a central hole in tension (the Kt check, d/W = 0.1, mesh 40 / 20 / 10 mm):
 *     the study (on the displacement at the loaded edge) passes and publishes results; the peak at the
 *     hole edge on the finest mesh gives Kt within 2% of the finite-width reference (3.025) and within 3%
 *     of Kirsch's 3.0, and moves less than 2% between the coarsest and finest mesh; frozen peak ±0.5%.
 *     (Mesh sizes 32 and 28 were also run once: Kt 3.023 and 3.052, studies passed.)
 *  3. Plain plate in tension: the automatic result point (displacement at the loaded edge) converges and
 *     matches σ·L/E within 2%.
 */
import assert from 'node:assert/strict';
import { createLafeaWorkbenchStore } from '../src/workspace/lafea-lifecycle-workbench-store.js';
import {
  PLATE_DEFAULTS,
  buildPlateModel,
  normalizePlateInput,
  validatePlateInput,
} from '../src/app/lafea/lafea-plate.js';

const PUBLISHABLE = ['ASYMPTOTIC', 'MONOTONIC_CONVERGING', 'NEAR_ZERO_FINE_DIFFERENCE'];
const clone = (value) => JSON.parse(JSON.stringify(value));

// 1. Validation
const errorsFor = (change) => {
  const raw = clone(PLATE_DEFAULTS);
  change(raw);
  return validatePlateInput(normalizePlateInput(raw)).join(' | ');
};
assert.equal(errorsFor(() => {}), '', 'default plate is valid');
assert.match(errorsFor((r) => { r.edges.LEFT.support = 'FREE'; }), /do not hold the plate in place/);
assert.match(errorsFor((r) => { r.edges.LEFT.support = 'ROLLER_Y'; }), /do not hold the plate in place/, 'uy only: free to slide in x');
assert.match(errorsFor((r) => { r.edges.LEFT.support = 'ROLLER_X'; r.edges.TOP.support = 'ROLLER_X'; }), /do not hold the plate in place/, 'ux only: free to slide in y');
assert.equal(errorsFor((r) => { r.edges.LEFT.support = 'ROLLER_X'; r.edges.BOTTOM.support = 'ROLLER_Y'; }), '', 'two rollers hold the plate');
assert.match(errorsFor((r) => { r.edges.LEFT.normal = 50; }), /fixed, so a load on it would have no effect/);
assert.match(errorsFor((r) => { r.holeDiameter = 195; }), /must leave at least 5%/);
assert.match(errorsFor((r) => { r.edges.RIGHT.normal = 0; }), /Add a load/);
assert.match(errorsFor((r) => { r.poissonRatio = 0.5; }), /Poisson/);
assert.match(errorsFor((r) => { r.meshSize = 20; }), /too fine/);
assert.equal(errorsFor((r) => { r.meshSize = 28; }), '', 'mesh 28 (finest 7 mm) is allowed');
assert.match(errorsFor((r) => { r.probe = { x: 200, y: 100, quantityId: 'VON_MISES' }; }), /inside the plate material/, 'point in the hole');
assert.throws(() => buildPlateModel({ ...clone(PLATE_DEFAULTS), length: -1 }), /Length must be a positive number/);

function solve(raw) {
  const m = buildPlateModel(raw);
  const store = createLafeaWorkbenchStore({ initialStage: 'LAFEA.3', initialDocument: m.source, initialSourceHash: m.authority.sourceHash });
  try {
    store.activateDomainFirstProfile();
    assert.equal(store.registerAnalysisDomain(m.domain).projection.state, 'CURRENT_PASS');
    assert.equal(store.registerAnalysisGeometryEvidence(m.geometryEvidence).projection.state, 'CURRENT_PASS');
    store.bindAnalysisMeshProfile(m.meshProfile);
    assert.equal(store.generateAnalysisMesh().evidence.qualification, 'PASS');
    assert.equal(store.prepareContinuumForRun().projection.state, 'CURRENT_PASS');
    store.run();
    assert.equal(store.getState().stages['LAFEA.3'].execution?.status, 'QUALIFIED');
    const peakCoarse = m.peakProbe ? store.evaluateContinuumPhysicalProbe(m.peakProbe).authoritativeValue : null;
    const study = store.runContinuumConvergenceStudy(m.convergenceRequest);
    const peakFine = m.peakProbe ? store.evaluateContinuumPhysicalProbe(m.peakProbe).authoritativeValue : null;
    return {
      model: m,
      study,
      levels: study.study.levels.map((l) => l.authoritativeValue),
      resultReady: store.getState().stages['LAFEA.3'].lifecycleReadiness?.resultReady === true,
      peakCoarse,
      peakFine,
    };
  } finally {
    store.destroy();
  }
}

// 2. Plate with a hole in tension: Kt
const hole = solve(clone(PLATE_DEFAULTS));
assert.equal(hole.study.status, 'CURRENT_PASS', `hole study: ${hole.study.status} ${hole.study.projection?.classification}`);
assert.ok(PUBLISHABLE.includes(hole.study.projection.classification));
assert.equal(hole.resultReady, true);
const ref = hole.model.referenceKt;
assert.ok(Math.abs(ref.ktGross - 3.0245) < 1e-3 && Math.abs(ref.dOverW - 0.1) < 1e-12);
const kt = hole.peakFine / hole.model.nominalStress;
assert.ok(Math.abs(kt - ref.ktGross) / ref.ktGross < 0.02, `Kt ${kt} vs reference ${ref.ktGross}`);
assert.ok(Math.abs(kt - 3) / 3 < 0.03, `Kt ${kt} vs Kirsch 3.0`);
assert.ok(Math.abs(hole.peakFine - hole.peakCoarse) / hole.peakFine < 0.02, `peak coarse ${hole.peakCoarse} vs fine ${hole.peakFine}`);
assert.equal(hole.model.probe.quantityId, 'DISPLACEMENT_MAGNITUDE', 'study point: displacement at the loaded edge');
const holeHand = PLATE_DEFAULTS.edges.RIGHT.normal * PLATE_DEFAULTS.length / PLATE_DEFAULTS.elasticModulus;
assert.ok(Math.abs(hole.levels.at(-1) - holeHand) / holeHand < 0.03, `hole plate end displacement ${hole.levels.at(-1)} vs σL/E ${holeHand}`);
const frozen = { peakFine: 304.712 };
assert.ok(Math.abs(hole.peakFine - frozen.peakFine) / frozen.peakFine < 0.005, `peak ${hole.peakFine}`);

// 3. Plain plate in tension: end displacement ≈ σL/E
const rect = solve({ ...clone(PLATE_DEFAULTS), shape: 'RECT' });
assert.equal(rect.study.status, 'CURRENT_PASS', `rect study: ${rect.study.status} ${rect.study.projection?.classification}`);
assert.equal(rect.model.probe.quantityId, 'DISPLACEMENT_MAGNITUDE');
const hand = PLATE_DEFAULTS.edges.RIGHT.normal * PLATE_DEFAULTS.length / PLATE_DEFAULTS.elasticModulus;
assert.ok(Math.abs(rect.levels.at(-1) - hand) / hand < 0.02, `end displacement ${rect.levels.at(-1)} vs σL/E ${hand}`);

console.log(JSON.stringify({
  check: 'lafea-plate-form',
  status: 'PASS',
  hole: {
    classification: hole.study.projection.classification,
    endDisplacementLevels: hole.levels.map((v) => +v.toFixed(6)),
    peak: { coarse: +hole.peakCoarse.toFixed(2), fine: +hole.peakFine.toFixed(2) },
    kt: +kt.toFixed(4),
    referenceKt: +ref.ktGross.toFixed(4),
  },
  plainPlate: { classification: rect.study.projection.classification, endDisplacement: +rect.levels.at(-1).toFixed(5), hand },
}));
