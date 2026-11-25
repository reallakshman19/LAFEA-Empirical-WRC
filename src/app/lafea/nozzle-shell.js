/**
 * Shell-FE cross-check for WRC 537: a round, near-rigid attachment on a cylindrical shell,
 * solved with the LAFEA.4 shell core (CST + DKT triangles, 5 DOF per node).
 *
 * Mesh (in the unrolled surface: s = Rm·θ around, x along the axis):
 *  - a polar patch around the attachment: rings from the attachment edge (r = r0) out to a
 *    square of half-size a, graded fine towards r0;
 *  - a rigid plug inside r0: the same rings shrinking to the centre, with thickness × plugFactor;
 *  - a graded structured grid over the rest of the full circumference (periodic seam) and length.
 * Cylinder ends are clamped. Loads go in at the plug centre node: P radial (+ outward),
 * Mc about the cylinder axis, Ml about the circumferential direction, Vc/Vl/Mt not modelled.
 *
 * Stresses at the WRC points (A/B on the longitudinal axis, C/D on the circumferential axis,
 * u = outside, l = inside) are taken from the first two element rings outside r0 and linearly
 * extrapolated to r = r0.
 *
 * Pure: no DOM.
 */
import {
  BASE_LIMITATIONS,
  CANONICAL_UNITS,
  FORMULATION,
  MODEL_SCHEMA,
  RESULT_REQUEST,
  calculateLocalShell,
  createCanonicalLocalShellModel,
} from '../../core/local-shell/index.js';

export const NOZZLE_FE_DEFAULTS = Object.freeze({
  patchFactor: 2.5, // a = patchFactor · r0
  patchDivisions: 16, // n: grid intervals per patch side, so each ring has 4n nodes
  rings: 10, // rings between r0 and the square
  ringGrading: 1.7, // ring radius t^grading: > 1 puts rings closer to r0
  plugRings: 3,
  plugFactor: 20, // plug thickness = plugFactor · T (near-rigid attachment)
  outerGrowth: 1.35, // element growth ratio away from the patch
  maxOuterElement: 400, // mm
  elasticModulus: 200000,
  poissonRatio: 0.3,
});

const LOCATIONS = ['Au', 'Al', 'Bu', 'Bl', 'Cu', 'Cl', 'Du', 'Dl'];

/** Build the canonical local-shell source. `geometry`: { meanRadius, thickness, attachmentRadius, length, station }. */
export function buildNozzleShellSource(geometry, loads, options = {}) {
  const o = { ...NOZZLE_FE_DEFAULTS, ...options };
  const R = geometry.meanRadius;
  const T = geometry.thickness;
  const r0 = geometry.attachmentRadius;
  const L = geometry.length;
  const xc = geometry.station;
  const n = o.patchDivisions;
  const a = o.patchFactor * r0;
  if (!(xc - a > 0 && xc + a < L)) throw new RangeError('NOZZLE_FE_PATCH_OUTSIDE_CYLINDER');
  if (!(a < Math.PI * R)) throw new RangeError('NOZZLE_FE_PATCH_WRAPS_CIRCUMFERENCE');

  // Grid lines (s periodic over the full circumference, x over the length)
  const patchLine = (center) => Array.from({ length: n + 1 }, (_, k) => center - a + (2 * a * k) / n);
  const h0 = (2 * a) / n;
  const grow = (start, end) => { // points strictly between start and end, growing from start
    const out = [];
    let step = h0 * o.outerGrowth;
    let pos = start;
    const dir = Math.sign(end - start);
    while (Math.abs(end - pos) > step * 1.5) {
      pos += dir * step;
      out.push(pos);
      step = Math.min(step * o.outerGrowth, o.maxOuterElement);
    }
    return out;
  };
  const sPatch = patchLine(0);
  const sRight = grow(a, Math.PI * R);
  const sLeft = grow(-a, -Math.PI * R).reverse();
  const sLines = [-Math.PI * R, ...sLeft, ...sPatch, ...sRight]; // +πR is the same line as −πR
  const xPatch = patchLine(xc);
  const xLines = [0, ...grow(xc - a, 0).reverse(), ...xPatch, ...grow(xc + a, L), L];

  const nodes = [];
  const nodeAt = new Map();
  const addNode = (id, s, x) => {
    const theta = s / R;
    nodes.push({
      nodeId: id,
      position: [x, R * Math.sin(theta), R * Math.cos(theta)],
      director: [0, Math.sin(theta), Math.cos(theta)],
      rotationBasis1: [1, 0, 0],
      rotationBasis2: [0, Math.cos(theta), -Math.sin(theta)],
      sourceReference: 'NOZZLE_FE',
    });
    return id;
  };
  const ns = sLines.length;
  const gridId = (i, j) => `G${(i + ns) % ns}-${j}`;
  const iPatch0 = sLines.indexOf(sPatch[0]);
  const jPatch0 = xLines.indexOf(xPatch[0]);
  const insidePatch = (i, j) => i > iPatch0 && i < iPatch0 + n && j > jPatch0 && j < jPatch0 + n;
  for (let i = 0; i < ns; i += 1) {
    for (let j = 0; j < xLines.length; j += 1) {
      if (insidePatch(i, j)) continue;
      nodeAt.set(gridId(i, j), addNode(gridId(i, j), sLines[i], xLines[j]));
    }
  }

  // Square boundary of the patch, counter-clockwise in (s, x), as grid node ids
  const square = [];
  for (let k = 0; k < n; k += 1) square.push([iPatch0 + k, jPatch0]); // bottom edge, s increasing
  for (let k = 0; k < n; k += 1) square.push([iPatch0 + n, jPatch0 + k]); // right edge
  for (let k = 0; k < n; k += 1) square.push([iPatch0 + n - k, jPatch0 + n]); // top edge
  for (let k = 0; k < n; k += 1) square.push([iPatch0, jPatch0 + n - k]); // left edge
  const m = 4 * n;
  const angles = square.map(([i, j]) => Math.atan2(xLines[j] - xc, sLines[i]));

  // Ring k = 0 is the attachment edge (r0); ring o.rings is the square.
  const ringIds = [];
  for (let k = 0; k <= o.rings; k += 1) {
    if (k === o.rings) { ringIds.push(square.map(([i, j]) => gridId(i, j))); continue; }
    const t = (k / o.rings) ** o.ringGrading;
    ringIds.push(square.map(([i, j], q) => {
      const cs = r0 * Math.cos(angles[q]);
      const cx = r0 * Math.sin(angles[q]);
      return addNode(`R${k}-${q}`, cs + t * (sLines[i] - cs), xc + cx + t * (xLines[j] - xc - cx));
    }));
  }
  // Plug rings inside r0, then the centre node
  const plugIds = [ringIds[0]];
  for (let k = 1; k <= o.plugRings; k += 1) {
    const rr = r0 * (1 - k / (o.plugRings + 1));
    plugIds.push(angles.map((ang, q) => addNode(`P${k}-${q}`, rr * Math.cos(ang), xc + rr * Math.sin(ang))));
  }
  const centre = addNode('CENTRE', 0, xc);

  const elements = [];
  const tri = (id, ids, thickness) => elements.push({ elementId: id, nodeIds: ids, materialId: 'MAT', thickness, sourceReference: 'NOZZLE_FE' });
  // Orientation: (s, x) counter-clockwise maps to an outward normal for this node basis.
  const quad = (id, p1, p2, p3, p4, thickness) => { tri(`${id}a`, [p1, p2, p3], thickness); tri(`${id}b`, [p1, p3, p4], thickness); };
  for (let i = 0; i < ns; i += 1) {
    for (let j = 0; j < xLines.length - 1; j += 1) {
      if (i >= iPatch0 && i < iPatch0 + n && j >= jPatch0 && j < jPatch0 + n) continue;
      quad(`Q${i}-${j}`, gridId(i, j), gridId(i + 1, j), gridId(i + 1, j + 1), gridId(i, j + 1), T);
    }
  }
  const ringQuads = (rings, prefix, thickness) => {
    for (let k = 0; k < rings.length - 1; k += 1) {
      for (let q = 0; q < m; q += 1) {
        const q1 = (q + 1) % m;
        // inner ring k, outer ring k+1: inner→outer is outward, so order keeps the normal outward
        quad(`${prefix}${k}-${q}`, rings[k][q], rings[k + 1][q], rings[k + 1][q1], rings[k][q1], thickness);
      }
    }
  };
  ringQuads(ringIds, 'RQ', T);
  ringQuads([...plugIds].reverse(), 'PQ', o.plugFactor * T);
  const innermost = plugIds.at(-1);
  for (let q = 0; q < m; q += 1) tri(`PC-${q}`, [centre, innermost[q], innermost[(q + 1) % m]], o.plugFactor * T);
  // Fix element orientation: every triangle's normal must point outward (along the director).
  const pos = new Map(nodes.map((node) => [node.nodeId, node]));
  for (const element of elements) {
    const [p, q, r] = element.nodeIds.map((id) => pos.get(id).position);
    const normal = cross(sub(q, p), sub(r, p));
    const centroid = [0, 1, 2].map((axis) => (p[axis] + q[axis] + r[axis]) / 3);
    const outward = [0, centroid[1], centroid[2]];
    if (dot(normal, outward) < 0) element.nodeIds = [element.nodeIds[0], element.nodeIds[2], element.nodeIds[1]];
  }

  const constraints = nodes
    .filter((node) => Math.abs(node.position[0]) < 1e-9 || Math.abs(node.position[0] - L) < 1e-9)
    .flatMap((node) => ['UX', 'UY', 'UZ', 'R1', 'R2'].map((dof) => ({
      constraintId: `FIX-${node.nodeId}-${dof}`, nodeId: node.nodeId, dof, value: 0, sourceReference: 'CLAMPED_END',
    })));

  const loadCases = Object.entries(loads).map(([loadCaseId, l]) => ({
    loadCaseId,
    // At the plug centre (θ = 0): +z is radial outward, basis1 = cylinder axis (x), basis2 = circumferential (y).
    nodalLoads: [{ loadId: `${loadCaseId}-L`, nodeId: 'CENTRE', fx: 0, fy: 0, fz: l.P ?? 0, m1: l.Mc ?? 0, m2: l.Ml ?? 0, sourceReference: loadCaseId }],
    pressureLoads: [],
    sourceReference: loadCaseId,
  }));

  return {
    source: {
      schema: MODEL_SCHEMA,
      modelIdentity: 'WRC_NOZZLE_SHELL_CROSS_CHECK',
      modelVersion: '1',
      sourceAncestry: ['lafea-emp-app/nozzle-shell/v1'],
      units: { ...CANONICAL_UNITS },
      formulation: FORMULATION,
      materials: [{ materialId: 'MAT', elasticModulus: o.elasticModulus, poissonRatio: o.poissonRatio, sourceReference: 'MAT' }],
      nodes,
      elements,
      constraints,
      loadCases,
      resultRequests: { stressSurfaces: [...RESULT_REQUEST.stressSurfaces], dktIntegrationRule: RESULT_REQUEST.dktIntegrationRule, retainElementMatrices: true },
      qualificationProfile: qualificationProfile(),
      limitations: [...BASE_LIMITATIONS],
    },
    mesh: { ringIds, angles, m, n, a, xc, R, r0, nodeCount: nodes.length, elementCount: elements.length },
  };
}

/** Solve and return WRC-point stresses for each load case. */
export function solveNozzleShell(geometry, loads, options = {}) {
  const { source, mesh } = buildNozzleShellSource(geometry, loads, options);
  const model = createCanonicalLocalShellModel(source);
  const result = calculateLocalShell(model);
  if (!result.qualification?.accepted) {
    const error = new Error(`NOZZLE_FE_NOT_ACCEPTED: ${result.qualification?.summary ?? result.qualification?.state}`);
    error.result = result;
    throw error;
  }
  const frames = new Map(result.meshEvidence.elements.map((e) => [e.elementId, e]));
  const positions = new Map(source.nodes.map((node) => [node.nodeId, node.position]));
  const elementNodes = new Map(source.elements.map((e) => [e.elementId, e.nodeIds]));
  const cases = result.loadCaseResults.map((lc) => {
    const byElement = new Map(lc.elementResults.map((e) => [e.elementId, e]));
    return { loadCaseId: lc.loadCaseId, points: wrcPoints(mesh, frames, byElement, positions, elementNodes), solver: lc.solverEvidence?.method };
  });
  return { mesh: { nodeCount: mesh.nodeCount, elementCount: mesh.elementCount, dofs: mesh.nodeCount * 5 }, cases };
}

function wrcPoints(mesh, frames, byElement, positions, elementNodes) {
  const { m, R, angles } = mesh;
  // Ring-quad columns q whose angle straddles each WRC axis direction (angles measured in (s, x)).
  const targets = { A: -Math.PI / 2, B: Math.PI / 2, C: Math.PI, D: 0 }; // A/B: −x/+x along the axis; C/D: −s/+s around
  const out = {};
  for (const [label, angle] of Object.entries(targets)) {
    // Ring node on this axis (n is even, so a square mid-side node lies exactly on each axis).
    const gap = (b) => Math.abs(Math.atan2(Math.sin(b - angle), Math.cos(b - angle)));
    const q = angles.reduce((best, b, idx) => (gap(b) < gap(angles[best]) ? idx : best), 0);
    const columns = [(q - 1 + m) % m, q];
    const ringValue = (k, surface) => {
      // Average of the 4 triangles in the two ring-quads that share the axis line.
      const rows = columns.flatMap((c) => ['a', 'b'].map((side) => `RQ${k}-${c}${side}`));
      const acc = { circ: 0, long: 0, shear: 0, r: 0 };
      for (const id of rows) {
        const res = byElement.get(id);
        const ev = frames.get(id);
        const centroid = [0, 1, 2].map((axis) => elementNodes.get(id).reduce((t, nid) => t + positions.get(nid)[axis], 0) / 3);
        const theta = Math.atan2(centroid[1], centroid[2]);
        const circDir = [0, Math.cos(theta), -Math.sin(theta)];
        const longDir = [1, 0, 0];
        const stress = averageSurfaceStress(res, surface);
        const [ca, cb] = inPlane(circDir, ev.localFrame);
        const [la, lb] = inPlane(longDir, ev.localFrame);
        acc.circ += project(stress, ca, cb);
        acc.long += project(stress, la, lb);
        acc.shear += shearProject(stress, ca, cb, la, lb);
        acc.r += Math.hypot(R * theta, centroid[0] - mesh.xc);
      }
      return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v / rows.length]));
    };
    for (const [suffix, surface] of [['u', 'TOP'], ['l', 'BOTTOM']]) {
      const v1 = ringValue(0, surface);
      const v2 = ringValue(1, surface);
      const f = (mesh.r0 - v1.r) / (v2.r - v1.r); // extrapolate to r0 (f < 0)
      const ex = (k) => v1[k] + f * (v2[k] - v1[k]);
      const circ = ex('circ');
      const long = ex('long');
      const shear = ex('shear');
      out[`${label}${suffix}`] = { circumferential: circ, longitudinal: long, shear, stressIntensity: tresca(circ, long, shear) };
    }
  }
  return LOCATIONS.map((location) => ({ location, ...out[location] }));
}

function averageSurfaceStress(res, surface) {
  const pts = res.integrationPoints;
  const sum = { sigmaX: 0, sigmaY: 0, tauXY: 0 };
  for (const p of pts) {
    const s = p.surfaces.find((row) => row.surface === surface).combinedStress;
    sum.sigmaX += s.sigmaX; sum.sigmaY += s.sigmaY; sum.tauXY += s.tauXY;
  }
  return { sigmaX: sum.sigmaX / pts.length, sigmaY: sum.sigmaY / pts.length, tauXY: sum.tauXY / pts.length };
}
function inPlane(global, frame) {
  let a = dot(global, frame.ex);
  let b = dot(global, frame.ey);
  const len = Math.hypot(a, b);
  a /= len; b /= len;
  return [a, b];
}
function project(s, a, b) { return a * a * s.sigmaX + b * b * s.sigmaY + 2 * a * b * s.tauXY; }
function shearProject(s, a1, b1, a2, b2) { return a1 * a2 * s.sigmaX + b1 * b2 * s.sigmaY + (a1 * b2 + a2 * b1) * s.tauXY; }
function tresca(a, b, t) {
  const r = Math.sqrt(((a - b) / 2) ** 2 + t * t);
  const p1 = (a + b) / 2 + r;
  const p2 = (a + b) / 2 - r;
  return Math.max(Math.abs(p1 - p2), Math.abs(p1), Math.abs(p2));
}
function sub(p, q) { return [p[0] - q[0], p[1] - q[1], p[2] - q[2]]; }
function cross(p, q) { return [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]; }
function dot(p, q) { return p[0] * q[0] + p[1] * q[1] + p[2] * q[2]; }
function qualificationProfile() {
  const tight = { absolute: 1e-10, relative: 1e-10 };
  // Iterative (Jacobi PCG) solve of a thin shell: equilibrium is checked to 0.5 N / 1e-6 relative, and
  // moments to 1e-5 relative. Pure-moment cases have zero net applied force, so an absolute floor is needed.
  const equilibrium = { absolute: 0.5, relative: 1e-6 };
  return {
    minimumFacetArea: { absolute: 1e-9, relative: 1e-12 },
    nodeBasisUnit: { ...tight },
    nodeBasisOrthogonality: { ...tight },
    nodeBasisHandedness: { ...tight },
    elementNormalDirectorAlignment: { minimum: 0.8 },
    rotationMappingRank: { absolute: 1e-12, relative: 1e-12 },
    membraneConstitutiveSymmetry: { absolute: 1e-10, relative: 1e-12 },
    bendingConstitutiveSymmetry: { absolute: 1e-10, relative: 1e-12 },
    elementStiffnessSymmetry: { absolute: 1e-6, relative: 1e-10 },
    globalStiffnessSymmetry: { absolute: 1e-6, relative: 1e-10 },
    rigidTranslation: { absolute: 1e-6, relative: 1e-9 },
    rigidRotation: { absolute: 1e-8, relative: 1e-8 },
    choleskyPivot: { absolute: 1e-12, relative: 1e-13 },
    freeDofResidual: { ...equilibrium },
    forceEquilibrium: { ...equilibrium },
    momentEquilibrium: { absolute: 1, relative: 1e-5 },
    strainEnergyReconstruction: { absolute: 1e-6, relative: 1e-6 },
    membranePatchResponse: { absolute: 1e-10, relative: 1e-10 },
    bendingPatchResponse: { absolute: 1e-9, relative: 1e-9 },
  };
}

/**
 * WRC 537 loads (N, N·mm, WRC Figure 2 axes as used by the calculator) → shell-model loads.
 * The FE model's +z is radially outward, m1 is about the cylinder axis and m2 about the
 * circumferential direction. These sign maps were fixed by requiring each single load to give
 * the same stress sign as WRC 537 at every WRC point it loads (scripts/wrc-nozzle-fe-check.mjs).
 */
export function wrcLoadsToShell(loads) {
  return { P: -(loads.P ?? 0), Mc: loads.Mc ?? 0, Ml: -(loads.Ml ?? 0) };
}

/** Run the shell model for one WRC result (ok === true) and compare point by point. */
export function crossCheckWrc537(wrcResult, options = {}) {
  if (!wrcResult?.ok) throw new Error('NOZZLE_FE_WRC_RESULT_REQUIRED');
  const g = wrcResult.geometry;
  const L = Number.isFinite(g.L) && g.L > 0 ? g.L : 8 * g.Rm;
  const station = Number.isFinite(g.x) && g.L > 0 ? g.x : L / 2;
  const geometry = { meanRadius: g.Rm, thickness: g.T, attachmentRadius: g.r0, length: L, station };
  const started = Date.now();
  const fe = solveNozzleShell(geometry, { WRC: wrcLoadsToShell(wrcResult.loadsBase) }, options);
  const fePoints = fe.cases[0].points;
  const rows = fePoints.map((p) => ({
    location: p.location,
    fe: p.stressIntensity,
    feCircumferential: p.circumferential,
    feLongitudinal: p.longitudinal,
  }));
  return {
    geometry,
    lengthAssumed: !(Number.isFinite(g.L) && g.L > 0),
    mesh: fe.mesh,
    milliseconds: Date.now() - started,
    rows,
    feGoverning: rows.reduce((a, b) => (b.fe > a.fe ? b : a)),
  };
}
