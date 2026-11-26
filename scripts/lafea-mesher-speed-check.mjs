/**
 * Mesher and hashing speed changes (Phase 5.3) keep their results.
 *
 *  1. lawsonFlip (src/core/lafea-meshing/constrained-delaunay-t6.js) now keeps its edge index and a
 *     heap of candidate edges up to date instead of rebuilding and re-sorting after every flip. On
 *     inputs that do not cycle it must give exactly the triangles of the original algorithm (a copy of
 *     which is below), so random point sets are compared one to one.
 *  2. A structured grid (cocircular quads everywhere) stays a valid tiling.
 *  3. The plate-with-hole mesh at h = 10 mm generates and qualifies in seconds. Before the cycle guard
 *     its interior refinement hit a flip cycle (a nearly cocircular quad whose two diagonals both pass
 *     the in-circle test in floating point) and ran to the n² pass cap: 376 s on the same machine.
 *  4. canonicalSha256 (src/core/shared-primitives/canonical-json-sha256.js, rewritten for speed) equals
 *     node:crypto SHA-256 of the canonical JSON, and its error messages keep their JSON paths.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lawsonFlip } from '../src/core/lafea-meshing/constrained-delaunay-t6.js';
import { canonicalJson, canonicalSha256 } from '../src/core/shared-primitives/canonical-json-sha256.js';
import { createLafeaWorkbenchStore } from '../src/workspace/lafea-lifecycle-workbench-store.js';
import { PLATE_DEFAULTS, buildPlateModel, plateMeshProfile } from '../src/app/lafea/lafea-plate.js';

// --- reference: the original lawsonFlip (one flip per pass, full rebuild and sort) ---------------
function edgeKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }
function signedTurn(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function inCircle(a, b, c, d) {
  const ax = a.x - d.x; const ay = a.y - d.y; const a2 = ax * ax + ay * ay;
  const bx = b.x - d.x; const by = b.y - d.y; const b2 = bx * bx + by * by;
  const cx = c.x - d.x; const cy = c.y - d.y; const c2 = cx * cx + cy * cy;
  return ax * (by * c2 - b2 * cy) - ay * (bx * c2 - b2 * cx) + a2 * (bx * cy - by * cx) > 1e-12;
}
function orderShared(triangle, [a, b]) { const ia = triangle.indexOf(a); const ib = triangle.indexOf(b); return (ib - ia + 3) % 3 === 1 ? [a, b] : [b, a]; }
function convexQuad(a, apexA, b, apexB) {
  const t = [signedTurn(a, apexA, b), signedTurn(apexA, b, apexB), signedTurn(b, apexB, a), signedTurn(apexB, a, apexA)];
  return t.every((v) => v > 0) || t.every((v) => v < 0);
}
function normalize(tri, points) { const [ia, ib, ic] = tri; if (signedTurn(points[ia], points[ib], points[ic]) < 0) { tri[1] = ic; tri[2] = ib; } }
function referenceLawsonFlip(points, triples, boundary) {
  const triangles = triples.map((t) => [...t]);
  const maxPasses = Math.max(200, triangles.length * triangles.length);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const index = new Map();
    triangles.forEach((t, ti) => { for (let i = 0; i < 3; i += 1) { const k = edgeKey(t[i], t[(i + 1) % 3]); if (!index.has(k)) index.set(k, []); index.get(k).push(ti); } });
    let flipped = false;
    for (const key of [...index.keys()].sort()) {
      if (boundary.has(key)) continue;
      const owners = index.get(key);
      if (owners.length !== 2) continue;
      const [tA, tB] = owners;
      const shared = key.split(':').map(Number);
      const apexA = triangles[tA].find((v) => !shared.includes(v));
      const apexB = triangles[tB].find((v) => !shared.includes(v));
      const [s0, s1] = orderShared(triangles[tA], shared);
      if (!inCircle(points[s0], points[s1], points[apexA], points[apexB])) continue;
      if (!convexQuad(points[s0], points[apexA], points[s1], points[apexB])) continue;
      triangles[tA] = [s0, apexA, apexB];
      triangles[tB] = [apexB, apexA, s1];
      normalize(triangles[tA], points);
      normalize(triangles[tB], points);
      flipped = true;
      break;
    }
    if (!flipped) break;
  }
  return triangles;
}

// A fan triangulation of a convex polygon plus random interior points inserted by splitting the
// containing triangle: a valid but far-from-Delaunay start that needs many flips.
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
function randomTriangulation(interior) {
  const corners = 12;
  const points = Array.from({ length: corners }, (_, i) => ({ x: 100 * Math.cos((2 * Math.PI * i) / corners), y: 100 * Math.sin((2 * Math.PI * i) / corners) }));
  let triangles = [];
  for (let i = 1; i < corners - 1; i += 1) triangles.push([0, i, i + 1]);
  const inside = (p, [a, b, c]) => {
    const d1 = signedTurn(points[a], points[b], p); const d2 = signedTurn(points[b], points[c], p); const d3 = signedTurn(points[c], points[a], p);
    return d1 > 1e-9 && d2 > 1e-9 && d3 > 1e-9;
  };
  for (let n = 0; n < interior; n += 1) {
    const p = { x: (rnd() * 2 - 1) * 70, y: (rnd() * 2 - 1) * 70 };
    const at = triangles.findIndex((t) => inside(p, t));
    if (at < 0) continue;
    const [a, b, c] = triangles[at];
    const id = points.push(p) - 1;
    triangles.splice(at, 1, [a, b, id], [b, c, id], [c, a, id]);
  }
  triangles = triangles.map((t) => { normalize(t, points); return t; });
  const boundary = new Set(Array.from({ length: corners }, (_, i) => edgeKey(i, (i + 1) % corners)));
  return { points, triangles, boundary };
}

// 1. Same flips as the original on non-cycling inputs
let compared = 0;
for (const interior of [5, 20, 60, 120, 200]) {
  for (let repeat = 0; repeat < 4; repeat += 1) {
    const { points, triangles, boundary } = randomTriangulation(interior);
    assert.deepEqual(lawsonFlip(points, triangles, boundary), referenceLawsonFlip(points, triangles, boundary), `interior=${interior} repeat=${repeat}`);
    compared += 1;
  }
}

// 2. A regular grid has cocircular quads everywhere: flipping must keep a valid tiling, quickly
const grid = [];
const n = 12;
for (let j = 0; j <= n; j += 1) for (let i = 0; i <= n; i += 1) grid.push({ x: i * 37.3, y: j * 37.3 });
const id = (i, j) => j * (n + 1) + i;
const gridTriangles = [];
for (let j = 0; j < n; j += 1) {
  for (let i = 0; i < n; i += 1) {
    gridTriangles.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
  }
}
gridTriangles.forEach((t) => normalize(t, grid));
const gridBoundary = new Set();
for (let i = 0; i < n; i += 1) {
  gridBoundary.add(edgeKey(id(i, 0), id(i + 1, 0))); gridBoundary.add(edgeKey(id(i, n), id(i + 1, n)));
  gridBoundary.add(edgeKey(id(0, i), id(0, i + 1))); gridBoundary.add(edgeKey(id(n, i), id(n, i + 1)));
}
let started = Date.now();
const flippedGrid = lawsonFlip(grid, gridTriangles, gridBoundary);
const gridMs = Date.now() - started;
assert.equal(flippedGrid.length, gridTriangles.length);
assert.ok(gridMs < 2000, `grid flip took ${gridMs} ms`);
const area = flippedGrid.reduce((sum, [a, b, c]) => sum + signedTurn(grid[a], grid[b], grid[c]) / 2, 0);
assert.ok(Math.abs(area - (n * 37.3) ** 2) < 1e-6 * area, 'grid triangles still tile the square');

// 3. The plate-with-hole mesh at h = 10 mm
const plate = buildPlateModel({ ...PLATE_DEFAULTS });
const store = createLafeaWorkbenchStore({ initialStage: 'LAFEA.3', initialDocument: plate.source, initialSourceHash: plate.authority.sourceHash });
store.activateDomainFirstProfile();
store.registerAnalysisDomain(plate.domain);
store.registerAnalysisGeometryEvidence(plate.geometryEvidence);
store.bindAnalysisMeshProfile(plateMeshProfile(10));
started = Date.now();
const mesh = store.generateAnalysisMesh();
const meshMs = Date.now() - started;
store.destroy();
assert.equal(mesh.evidence.qualification, 'PASS');
assert.ok(mesh.evidence.mesh.elements.length > 1500, 'h = 10 mesh is the full mesh');
assert.ok(meshMs < 30000, `h = 10 mesh took ${meshMs} ms`);

// 4. SHA-256
let hashed = 0;
const sha = (value) => {
  assert.equal(canonicalSha256(value), `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`);
  hashed += 1;
};
for (let len = 0; len < 200; len += 1) sha('é'.repeat(len));
sha({ nodes: mesh.evidence.mesh.nodes.slice(0, 500), unicode: '漢字🙂', negativeZero: -0 });
assert.throws(() => canonicalJson({ a: [1, { b: Number.NaN }] }), { message: '$.a[1].b contains a non-finite number.' });
assert.throws(() => canonicalJson({ get g() { return 1; } }), { message: '$.g contains a non-JSON property.' });

console.log(JSON.stringify({ check: 'lafea-mesher-speed', status: 'PASS', flipComparisons: compared, gridFlipMs: gridMs, holeMeshH10: { elements: mesh.evidence.mesh.elements.length, ms: meshMs }, shaInputs: hashed }));
