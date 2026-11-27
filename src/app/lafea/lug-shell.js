/**
 * Shell-FE model for a rectangular attachment (a lug, or a rectangular pad) on a cylindrical shell,
 * solved with the LAFEA.4 shell core (CST + DKT triangles, 5 DOF per node). It follows the round
 * nozzle model (nozzle-shell.js) with a rectangular footprint.
 *
 * Mesh (in the unrolled surface: s = Rm·θ around, x along the axis):
 *  - a rectangular patch around the footprint: rings from the footprint edge (half-sizes c1 around,
 *    c2 along) out to a rectangle d further out on every side, graded fine towards the edge. Each ring
 *    is the footprint scaled towards the patch rectangle, so the footprint corners are mesh nodes;
 *  - a stiff plug over the footprint: a structured grid with thickness × plugFactor;
 *  - a graded structured grid over the rest of the full circumference (periodic seam) and length.
 * d = (patchFactor − 1)·max(c1, c2)/0.875: for a square it is the distance the round model uses for the
 * round attachment WRC 537 treats as equivalent (β = 0.875·r0/Rm = c/Rm).
 *
 * Loads: all six go onto the interior plug nodes as statically exact nodal forces about the footprint
 * centre (P uniform, Mc and Ml linear across the footprint, Vc and Vl uniform, Mt as a couple). A long,
 * narrow plug is not rigid, so spreading the loads keeps a centre point load from bending it; it is also
 * how WRC 537's rectangular solution (Bijlaard) applies them. Cylinder ends are clamped.
 *
 * Stresses at the WRC points (A/B at the middle of the edges across the axis, x = ∓c2; C/D at the middle
 * of the edges along it, s = ∓c1; u = outside, l = inside) are taken from the first two element rows
 * outside the edge and linearly extrapolated to it, as in the round model, with the same shear sign
 * convention. The corners of a stiff rectangle are stress singularities in a shell model, so the highest
 * element value next to the footprint (`edgePeak`) is reported but grows as the mesh is refined.
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
import {
  WRC_POINT_LABELS,
  averageSurfaceStress,
  cross,
  dot,
  inPlane,
  project,
  qualificationProfile,
  shearProject,
  sub,
  tresca,
  wrcLoadsToShell,
} from './nozzle-shell.js';

export const LUG_FE_DEFAULTS = Object.freeze({
  patchFactor: 2.5, // patch margin d = (patchFactor − 1)·max(c1, c2)/0.875
  patchDivisions: 16, // grid intervals along the longer patch side (even)
  minSideDivisions: 8, // at least this many along the shorter side (even)
  rings: 10, // element rows between the footprint edge and the patch rectangle
  ringGrading: 1.7, // ring position t^grading: > 1 puts rows closer to the edge
  plugFactor: 4, // plug thickness = plugFactor · T
  outerGrowth: 1.35, // element growth ratio away from the patch
  maxOuterElement: 400, // mm
  elasticModulus: 200000,
  poissonRatio: 0.3,
});

/** Patch size and divisions for a footprint, without building the mesh. */
export function lugPatch(geometry, options = {}) {
  const o = { ...LUG_FE_DEFAULTS, ...options };
  const c1 = geometry.halfWidth;
  const c2 = geometry.halfLength;
  const d = ((o.patchFactor - 1) * Math.max(c1, c2)) / 0.875;
  const as = c1 + d;
  const ax = c2 + d;
  const h = (2 * Math.max(as, ax)) / o.patchDivisions;
  const even = (v) => Math.max(o.minSideDivisions, 2 * Math.round(v / 2));
  return { c1, c2, d, as, ax, ns: even((2 * as) / h), nx: even((2 * ax) / h) };
}

/**
 * Build the canonical local-shell source.
 * `geometry`: { meanRadius, thickness, halfWidth (c1, around the shell), halfLength (c2, along it), length, station }.
 * `loads`: { loadCaseId: { P, Mc, Ml, Vc, Vl, Mt } } in the shell-model convention (see wrcLoadsToShell).
 */
export function buildLugShellSource(geometry, loads, options = {}) {
  const o = { ...LUG_FE_DEFAULTS, ...options };
  const R = geometry.meanRadius;
  const T = geometry.thickness;
  const L = geometry.length;
  const xc = geometry.station;
  const { c1, c2, as, ax, ns, nx } = lugPatch(geometry, o);
  if (!(c1 > 0 && c2 > 0)) throw new RangeError('LUG_FE_FOOTPRINT_REQUIRED');
  if (!(xc - ax > 0 && xc + ax < L)) throw new RangeError('LUG_FE_PATCH_OUTSIDE_CYLINDER');
  if (!(as < Math.PI * R)) throw new RangeError('LUG_FE_PATCH_WRAPS_CIRCUMFERENCE');

  // Grid lines (s periodic over the full circumference, x over the length)
  const line = (center, half, count) => Array.from({ length: count + 1 }, (_, k) => center - half + (2 * half * k) / count);
  const grow = (start, end, h0) => { // points strictly between start and end, growing from start
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
  const hs = (2 * as) / ns;
  const hx = (2 * ax) / nx;
  const sPatch = line(0, as, ns);
  const sLines = [-Math.PI * R, ...grow(-as, -Math.PI * R, hs).reverse(), ...sPatch, ...grow(as, Math.PI * R, hs)]; // +πR is the same line as −πR
  const xPatch = line(xc, ax, nx);
  const xLines = [0, ...grow(xc - ax, 0, hx).reverse(), ...xPatch, ...grow(xc + ax, L, hx), L];

  const nodes = [];
  const addNode = (id, s, x) => {
    const theta = s / R;
    nodes.push({
      nodeId: id,
      position: [x, R * Math.sin(theta), R * Math.cos(theta)],
      director: [0, Math.sin(theta), Math.cos(theta)],
      rotationBasis1: [1, 0, 0],
      rotationBasis2: [0, Math.cos(theta), -Math.sin(theta)],
      sourceReference: 'LUG_FE',
    });
    return id;
  };
  const nsl = sLines.length;
  const gridId = (i, j) => `G${(i + nsl) % nsl}-${j}`;
  const iPatch0 = sLines.indexOf(sPatch[0]);
  const jPatch0 = xLines.indexOf(xPatch[0]);
  const insidePatch = (i, j) => i > iPatch0 && i < iPatch0 + ns && j > jPatch0 && j < jPatch0 + nx;
  for (let i = 0; i < nsl; i += 1) {
    for (let j = 0; j < xLines.length; j += 1) {
      if (!insidePatch(i, j)) addNode(gridId(i, j), sLines[i], xLines[j]);
    }
  }

  // Patch rectangle boundary, counter-clockwise in (s, x), as grid indices. q = 0 is the bottom-left corner.
  const boundary = [];
  for (let k = 0; k < ns; k += 1) boundary.push([iPatch0 + k, jPatch0]); // bottom edge (x = −ax), s increasing
  for (let k = 0; k < nx; k += 1) boundary.push([iPatch0 + ns, jPatch0 + k]); // right edge (s = +as)
  for (let k = 0; k < ns; k += 1) boundary.push([iPatch0 + ns - k, jPatch0 + nx]); // top edge (x = +ax)
  for (let k = 0; k < nx; k += 1) boundary.push([iPatch0, jPatch0 + nx - k]); // left edge (s = −as)
  const m = boundary.length;

  // Ring k = 0 is the footprint edge; ring o.rings is the patch rectangle. Each ring node moves along the
  // line from the scaled footprint point to its patch-boundary node.
  const ringIds = [];
  for (let k = 0; k <= o.rings; k += 1) {
    if (k === o.rings) { ringIds.push(boundary.map(([i, j]) => gridId(i, j))); continue; }
    const t = (k / o.rings) ** o.ringGrading;
    ringIds.push(boundary.map(([i, j], q) => {
      const so = sLines[i];
      const xo = xLines[j] - xc;
      const si = (so * c1) / as;
      const xi = (xo * c2) / ax;
      return addNode(`R${k}-${q}`, si + t * (so - si), xc + xi + t * (xo - xi));
    }));
  }

  // Plug: a structured (ns + 1) × (nx + 1) grid over the footprint; its boundary is ring 0.
  const ring0 = ringIds[0];
  const plugId = (a, b) => {
    if (b === 0 && a < ns) return ring0[a];
    if (a === ns && b < nx) return ring0[ns + b];
    if (b === nx && a > 0) return ring0[ns + nx + (ns - a)];
    if (a === 0 && b > 0) return ring0[2 * ns + nx + (nx - b)];
    return `P${a}-${b}`;
  };
  const interior = [];
  for (let a = 1; a < ns; a += 1) {
    for (let b = 1; b < nx; b += 1) {
      interior.push(addNode(`P${a}-${b}`, -c1 + (2 * c1 * a) / ns, xc - c2 + (2 * c2 * b) / nx));
    }
  }

  const elements = [];
  const tri = (id, ids, thickness) => elements.push({ elementId: id, nodeIds: ids, materialId: 'MAT', thickness, sourceReference: 'LUG_FE' });
  const quad = (id, p1, p2, p3, p4, thickness) => { tri(`${id}a`, [p1, p2, p3], thickness); tri(`${id}b`, [p1, p3, p4], thickness); };
  for (let i = 0; i < nsl; i += 1) {
    for (let j = 0; j < xLines.length - 1; j += 1) {
      if (i >= iPatch0 && i < iPatch0 + ns && j >= jPatch0 && j < jPatch0 + nx) continue;
      quad(`Q${i}-${j}`, gridId(i, j), gridId(i + 1, j), gridId(i + 1, j + 1), gridId(i, j + 1), T);
    }
  }
  for (let k = 0; k < o.rings; k += 1) {
    for (let q = 0; q < m; q += 1) {
      const q1 = (q + 1) % m;
      quad(`RQ${k}-${q}`, ringIds[k][q], ringIds[k + 1][q], ringIds[k + 1][q1], ringIds[k][q1], T);
    }
  }
  for (let a = 0; a < ns; a += 1) {
    for (let b = 0; b < nx; b += 1) {
      quad(`PQ${a}-${b}`, plugId(a, b), plugId(a + 1, b), plugId(a + 1, b + 1), plugId(a, b + 1), o.plugFactor * T);
    }
  }
  // Every triangle's normal must point outward (along the director).
  const pos = new Map(nodes.map((node) => [node.nodeId, node]));
  for (const element of elements) {
    const [p, q, r] = element.nodeIds.map((id) => pos.get(id).position);
    const normal = cross(sub(q, p), sub(r, p));
    const centroid = [0, 1, 2].map((axis) => (p[axis] + q[axis] + r[axis]) / 3);
    if (dot(normal, [0, centroid[1], centroid[2]]) < 0) element.nodeIds = [element.nodeIds[0], element.nodeIds[2], element.nodeIds[1]];
  }

  const constraints = nodes
    .filter((node) => Math.abs(node.position[0]) < 1e-9 || Math.abs(node.position[0] - L) < 1e-9)
    .flatMap((node) => ['UX', 'UY', 'UZ', 'R1', 'R2'].map((dof) => ({
      constraintId: `FIX-${node.nodeId}-${dof}`, nodeId: node.nodeId, dof, value: 0, sourceReference: 'CLAMPED_END',
    })));

  const loadCases = Object.entries(loads).map(([loadCaseId, l]) => ({
    loadCaseId,
    nodalLoads: footprintLoads(interior.map((id) => pos.get(id).position), [xc, 0, R], l)
      .map((f, i) => ({ loadId: `${loadCaseId}-${interior[i]}`, nodeId: interior[i], fx: f[0], fy: f[1], fz: f[2], m1: 0, m2: 0, sourceReference: loadCaseId })),
    pressureLoads: [],
    sourceReference: loadCaseId,
  }));

  return {
    source: {
      schema: MODEL_SCHEMA,
      modelIdentity: 'WRC_LUG_SHELL_CROSS_CHECK',
      modelVersion: '1',
      sourceAncestry: ['lafea-emp-app/lug-shell/v1'],
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
    mesh: { ringIds, m, ns, nx, as, ax, xc, R, c1, c2, nodeCount: nodes.length, elementCount: elements.length },
  };
}

/**
 * Nodal forces (global x, y, z) on the interior plug nodes that are statically equal to the six loads
 * at the footprint centre `c`: net force (Vl, Vc, P) and net moment (Mc about +x, Ml about +y, and
 * −Mt about +z, i.e. Mt counter-clockwise in the (s, x) plane, as in the round model).
 * P is spread uniformly; Vc and Vl too; Mt as forces ⟂ to the lever arm; Mc and Ml as radial forces
 * linear in the lever arm, sized to also cancel any moment of the in-plane forces about `c`.
 * The interior grid is symmetric about the centre, so the cross terms vanish.
 */
export function footprintLoads(positions, c, l) {
  const n = positions.length;
  const r = positions.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
  const sum = (fn) => r.reduce((t, ri) => t + fn(ri), 0);
  const xx = sum((ri) => ri[0] * ri[0]);
  const yy = sum((ri) => ri[1] * ri[1]);
  const kt = (l.Mt ?? 0) / (xx + yy);
  const forces = r.map((ri) => [(l.Vl ?? 0) / n + kt * ri[1], (l.Vc ?? 0) / n - kt * ri[0], 0]);
  const moment = [0, 0, 0];
  forces.forEach((f, i) => { const mm = cross(r[i], f); moment[0] += mm[0]; moment[1] += mm[1]; moment[2] += mm[2]; });
  const mx = (l.Mc ?? 0) - moment[0];
  const my = (l.Ml ?? 0) - moment[1];
  forces.forEach((f, i) => { f[2] = (l.P ?? 0) / n + (mx * r[i][1]) / yy - (my * r[i][0]) / xx; });
  return forces;
}

/** Solve and return WRC-point stresses (and the edge peak) for each load case. */
export function solveLugShell(geometry, loads, options = {}) {
  const { source, mesh } = buildLugShellSource(geometry, loads, options);
  const model = createCanonicalLocalShellModel(source);
  const result = calculateLocalShell(model);
  if (!result.qualification?.accepted) {
    const error = new Error(`LUG_FE_NOT_ACCEPTED: ${result.qualification?.summary ?? result.qualification?.state}`);
    error.result = result;
    throw error;
  }
  const frames = new Map(result.meshEvidence.elements.map((e) => [e.elementId, e]));
  const positions = new Map(source.nodes.map((node) => [node.nodeId, node.position]));
  const elementNodes = new Map(source.elements.map((e) => [e.elementId, e.nodeIds]));
  const cases = result.loadCaseResults.map((lc) => {
    const byElement = new Map(lc.elementResults.map((e) => [e.elementId, e]));
    const field = stressIntensityField(mesh, source.elements, byElement, positions);
    return {
      loadCaseId: lc.loadCaseId,
      points: wrcPoints(mesh, frames, byElement, positions, elementNodes),
      edgePeak: edgePeak(field),
      field: options.field ? field : undefined,
    };
  });
  return { mesh: { nodeCount: mesh.nodeCount, elementCount: mesh.elementCount, dofs: mesh.nodeCount * 5, ns: mesh.ns, nx: mesh.nx, halfSizeS: mesh.as, halfSizeX: mesh.ax }, cases };
}

/** Element-average stress intensity (Tresca) of the ring elements, unrolled (s, x − station), as in the round model. */
function stressIntensityField(mesh, elements, byElement, positions) {
  const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
  const triangles = [];
  for (const element of elements) {
    if (!element.elementId.startsWith('RQ')) continue;
    const res = byElement.get(element.elementId);
    const vertices = element.nodeIds.flatMap((id) => {
      const [x, y, z] = positions.get(id);
      return [round(mesh.R * Math.atan2(y, z), 1), round(x - mesh.xc, 1)];
    });
    const si = (surface) => {
      const s = averageSurfaceStress(res, surface);
      return round(tresca(s.sigmaX, s.sigmaY, s.tauXY), 2);
    };
    triangles.push({ v: vertices, u: si('TOP'), l: si('BOTTOM'), edge: element.elementId.startsWith('RQ0-') });
  }
  return {
    attachment: { shape: 'rectangle', halfWidth: mesh.c1, halfLength: mesh.c2 },
    halfSizeS: mesh.as,
    halfSizeX: mesh.ax,
    triangles,
  };
}

/** Highest element-average stress intensity in the first row of elements around the footprint. */
function edgePeak(field) {
  let best = null;
  for (const t of field.triangles) {
    if (!t.edge) continue;
    for (const surface of ['u', 'l']) {
      if (!best || t[surface] > best.value) {
        best = { value: t[surface], surface, s: (t.v[0] + t.v[2] + t.v[4]) / 3, x: (t.v[1] + t.v[3] + t.v[5]) / 3 };
      }
    }
  }
  return best;
}

function wrcPoints(mesh, frames, byElement, positions, elementNodes) {
  const { m, ns, nx, R, c1, c2 } = mesh;
  // Ring node in the middle of each footprint edge, and the edge's normal distance function.
  const targets = {
    A: { q: ns / 2, dist: (s, x) => -x - c2 }, // bottom edge, x = −c2
    B: { q: ns + nx + ns / 2, dist: (s, x) => x - c2 }, // top edge, x = +c2
    C: { q: 2 * ns + nx + nx / 2, dist: (s) => -s - c1 }, // left edge, s = −c1
    D: { q: ns + nx / 2, dist: (s) => s - c1 }, // right edge, s = +c1
  };
  const out = {};
  for (const [label, { q, dist }] of Object.entries(targets)) {
    const columns = [(q - 1 + m) % m, q];
    const rowValue = (k, surface) => {
      const ids = columns.flatMap((col) => ['a', 'b'].map((side) => `RQ${k}-${col}${side}`));
      const acc = { circ: 0, long: 0, shear: 0, d: 0 };
      for (const id of ids) {
        const res = byElement.get(id);
        const ev = frames.get(id);
        const centroid = [0, 1, 2].map((axis) => elementNodes.get(id).reduce((t, nid) => t + positions.get(nid)[axis], 0) / 3);
        const theta = Math.atan2(centroid[1], centroid[2]);
        const circDir = [0, Math.cos(theta), -Math.sin(theta)];
        const stress = averageSurfaceStress(res, surface);
        const [ca, cb] = inPlane(circDir, ev.localFrame);
        const [la, lb] = inPlane([1, 0, 0], ev.localFrame);
        acc.circ += project(stress, ca, cb);
        acc.long += project(stress, la, lb);
        acc.shear += shearProject(stress, ca, cb, la, lb);
        acc.d += dist(R * theta, centroid[0] - mesh.xc);
      }
      return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v / ids.length]));
    };
    for (const [suffix, surface] of [['u', 'TOP'], ['l', 'BOTTOM']]) {
      const v1 = rowValue(0, surface);
      const v2 = rowValue(1, surface);
      const f = (0 - v1.d) / (v2.d - v1.d); // extrapolate to the edge (f < 0)
      const ex = (k) => v1[k] + f * (v2[k] - v1[k]);
      const circ = ex('circ');
      const long = ex('long');
      const shear = (label === 'C' || label === 'D' ? -1 : 1) * ex('shear');
      out[`${label}${suffix}`] = { circumferential: circ, longitudinal: long, shear, stressIntensity: tresca(circ, long, shear) };
    }
  }
  return WRC_POINT_LABELS.map((location) => ({ location, ...out[location] }));
}

/**
 * Run the rectangular-footprint model for one WRC 537 location result and return the FE stress at the
 * 8 points. The result need not be `ok`: a rectangle WRC 537 refuses (thin plate, torsion) is solved the
 * same way, from its geometry and loads, and the panel shows FE only.
 */
export function crossCheckWrc537Rectangular(wrcResult, options = {}) {
  const g = wrcResult?.geometry;
  if (!g?.rectangular || !wrcResult.loadsBase) throw new Error('LUG_FE_RECTANGULAR_RESULT_REQUIRED');
  const L = Number.isFinite(g.L) && g.L > 0 ? g.L : 8 * g.Rm;
  const station = Number.isFinite(g.x) && g.L > 0 ? g.x : L / 2;
  const geometry = { meanRadius: g.Rm, thickness: g.T, halfWidth: g.c1, halfLength: g.c2, length: L, station };
  const started = Date.now();
  const fe = solveLugShell(geometry, { WRC: wrcLoadsToShell(wrcResult.loadsBase) }, { field: true, ...options });
  const rows = fe.cases[0].points.map((p) => ({
    location: p.location,
    fe: p.stressIntensity,
    feCircumferential: p.circumferential,
    feLongitudinal: p.longitudinal,
    feShear: p.shear,
  }));
  return {
    geometry,
    rectangular: true,
    lengthAssumed: !(Number.isFinite(g.L) && g.L > 0),
    mesh: fe.mesh,
    milliseconds: Date.now() - started,
    rows,
    feGoverning: rows.reduce((a, b) => (b.fe > a.fe ? b : a)),
    edgePeak: fe.cases[0].edgePeak,
    field: fe.cases[0].field,
  };
}
