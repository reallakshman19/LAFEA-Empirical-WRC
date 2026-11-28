/**
 * Canvas step A6: the 3-D preview (src/app/wrc/vessel-3d.js, src/app/wrc/software-3d.js).
 *
 * Checks:
 *  1. The angle convention matches the sketch: 0° up, 90° toward −y (the side the side view is seen from),
 *     180° down.
 *  2. The meshes are the inputs: the shell's surfaces at its outside and inside radius over its length; a
 *     nozzle, trunnion or lug stands where it meets the shell (or its pad) and reaches its drawn height; a
 *     pad's top is at the pad thickness; every index is valid and every normal a unit vector.
 *  3. The projection: right is +x and up is +z from the first view; a positive tilt looks down from above;
 *     the whole vessel fits in the canvas; facing the eye is worked out from where the eye is.
 *  4. Drawing order: the shell's far faces, attachments behind it, its near faces, then pads and
 *     attachments on the near side. From above, the top nozzle is drawn over the shell and the bottom lug
 *     under it; from below, the other way round.
 *  5. The preview only reads the cases; it says what it shows, in the case's units.
 *  6. It is not in the first load: only a dynamic import reaches it.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CAMERA, facesEye, makeProjection, renderScene, sceneCentreAndSpan, shade } from '../src/app/wrc/software-3d.js';
import { attachmentMesh, describeScene, dirAt, padMesh, shellMesh, vesselScene } from '../src/app/wrc/vessel-3d.js';
import { sketchGeometry, stubHeight } from '../src/app/wrc/vessel-sketch.js';
import { EXAMPLE_VESSELS, caseFor, normalizeCase, normalizeVessel } from '../src/app/wrc/vessel-model.js';
import { EXAMPLE_CASES } from '../src/app/wrc/wrc-calc.js';
import { convertCaseUnits } from '../src/app/wrc/wrc-units.js';

let passed = 0;
const ok = (fn, name) => { fn(); passed += 1; console.log(`  PASS ${name}`); };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const verts = (m) => Array.from({ length: m.vertices.length / 3 }, (_, i) => ({ x: m.vertices[3 * i], y: m.vertices[3 * i + 1], z: m.vertices[3 * i + 2] }));
function wellFormed(m) {
  assert.equal(m.indices.length % 3, 0);
  const n = m.vertices.length / 3;
  assert.ok(m.indices.every((i) => Number.isInteger(i) && i >= 0 && i < n), `${m.id}: indices in range`);
  for (let i = 0; i < m.normals.length; i += 3) assert.ok(near(Math.hypot(m.normals[i], m.normals[i + 1], m.normals[i + 2]), 1), `${m.id}: unit normals`);
}

const worked = normalizeVessel(EXAMPLE_VESSELS.TWO_NOZZLES_LUG);
const cases = worked.attachments.map((_, i) => caseFor(worked, i));

// 1. Angles.
ok(() => {
  const close = (v, w) => assert.ok(near(v.x, w.x, 1e-12) && near(v.y, w.y, 1e-12) && near(v.z, w.z, 1e-12), JSON.stringify(v));
  close(dirAt(0), { x: 0, y: 0, z: 1 });
  close(dirAt(90), { x: 0, y: -1, z: 0 });
  close(dirAt(180), { x: 0, y: 0, z: -1 });
  close(dirAt(270), { x: 0, y: 1, z: 0 });
}, 'angles: 0° up, 90° toward the viewer of the side view (−y), 180° down');

// 2. Meshes.
const g0 = sketchGeometry(cases[0]);
const R = g0.OD / 2;
ok(() => {
  const m = shellMesh(g0, 4000);
  wellFormed(m);
  const radii = new Set(verts(m).map((p) => Math.round(Math.hypot(p.y, p.z) * 1e6) / 1e6));
  assert.deepEqual([...radii].sort((a, b) => a - b), [R - g0.tn, R], 'every point on the outside or the inside of the wall');
  assert.equal(m.bounds.minX, 0);
  assert.equal(m.bounds.maxX, 4000);
  assert.ok(near(m.bounds.maxZ, R) && near(m.bounds.minZ, -R));
}, 'shell: outside and inside surfaces over its length, and the end rings');
ok(() => {
  for (const [i, h] of cases.map((c, k) => [k, stubHeight(sketchGeometry(c), g0.OD)])) {
    const g = sketchGeometry(cases[i]);
    const m = attachmentMesh(g, R, g.x, h, `att-${i}`);
    wellFormed(m);
    const n = dirAt(g.angle);
    const w = { x: 0, y: -Math.cos(g.angle * Math.PI / 180), z: -Math.sin(g.angle * Math.PI / 180) };
    const halfAlong = g.along / 2;
    let seated = 0; let top = 0;
    for (const p of verts(m)) {
      const s = p.y * n.y + p.z * n.z;
      const b = p.y * w.y + p.z * w.z;
      assert.ok(Math.abs(p.x - g.x) <= halfAlong + 1e-6, `${g.name}: within its size along`);
      if (near(Math.hypot(s, b), R)) seated += 1;
      else if (near(s, R + h)) top += 1;
      else assert.fail(`${g.name}: a point neither on the shell nor at the top: ${JSON.stringify(p)}`);
    }
    assert.ok(seated > 0 && top > 0, `${g.name}: stands on the shell and reaches its height`);
  }
}, 'attachments (two nozzles and a lug) stand on the shell at their station and angle, to their drawn height');
ok(() => {
  const n2 = attachmentMesh(sketchGeometry(cases[1]), R, 2400, 200, 'n2');
  assert.ok(n2.bounds.minY < -R && n2.bounds.maxY < 0, 'N2 at 90° sticks out toward −y');
  const l1 = attachmentMesh(sketchGeometry(cases[2]), R, 3000, 200, 'l1');
  assert.ok(l1.bounds.minZ < -R && l1.bounds.maxZ < 0, 'L1 at 180° hangs below');
}, 'each attachment on its own side');
ok(() => {
  const pad = normalizeCase(EXAMPLE_CASES.PAD_36IN);
  const g = sketchGeometry(pad);
  assert.ok(g.pad, 'the example has a pad');
  const Rp = g.OD / 2;
  const x = 1000;
  const m = padMesh(g, Rp, x, 'pad');
  wellFormed(m);
  const radii = verts(m).map((p) => Math.hypot(p.y, p.z));
  assert.ok(radii.every((r) => near(r, Rp) || near(r, Rp + g.padT)), 'on the shell or at the pad\'s top');
  assert.ok(radii.some((r) => near(r, Rp + g.padT)) && radii.some((r) => near(r, Rp)), 'a top and an edge down to the shell');
  const att = attachmentMesh(g, Rp, x, 300, 'n');
  const seat = Rp + g.padT;
  assert.ok(verts(att).some((p) => near(Math.hypot(p.y, p.z), seat)), 'the nozzle stands on the pad');
  const trun = normalizeCase(EXAMPLE_CASES.TRUNNION_10IN);
  const gt = sketchGeometry(trun);
  const capped = attachmentMesh({ ...gt, solid: true }, gt.OD / 2, 500, 100, 't');
  const open = attachmentMesh({ ...gt, solid: false }, gt.OD / 2, 500, 100, 't');
  assert.ok(capped.indices.length > open.indices.length, 'a solid trunnion is capped, a pipe open');
}, 'pads lie on the shell; an attachment with a pad stands on it; a solid trunnion is capped');

// 3. Projection.
const scene = vesselScene(cases, 0);
const frame = sceneCentreAndSpan(scene.items);
ok(() => {
  const p = makeProjection({ azimuthDeg: 0, elevationDeg: 0, zoom: 1 }, frame, 640, 360);
  const c = frame.centre;
  assert.ok(p(c.x + 100, c.y, c.z).sx > p(c.x, c.y, c.z).sx, '+x to the right');
  assert.ok(p(c.x, c.y, c.z + 100).sy < p(c.x, c.y, c.z).sy, '+z up');
  assert.ok(p(c.x, c.y - 100, c.z).depth < p(c.x, c.y, c.z).depth, '−y nearer: the first view is from the 90° side');
  const above = makeProjection({ azimuthDeg: 0, elevationDeg: 30, zoom: 1 }, frame, 640, 360);
  assert.ok(above.eye.z > c.z, 'a positive tilt looks down from above');
  assert.ok(above(c.x, c.y, c.z + 100).depth < above(c.x, c.y, c.z).depth, 'from above, higher is nearer');
  for (const cam of [DEFAULT_CAMERA, { azimuthDeg: 45, elevationDeg: 40, zoom: 1 }, { azimuthDeg: 200, elevationDeg: -30, zoom: 1 }]) {
    const q = makeProjection(cam, frame, 640, 360);
    const b = frame.bounds;
    for (const x of [b.minX, b.maxX]) for (const y of [b.minY, b.maxY]) for (const z of [b.minZ, b.maxZ]) {
      const s = q(x, y, z);
      assert.ok(s.sx >= 0 && s.sx <= 640 && s.sy >= 0 && s.sy <= 360, `the vessel fits the canvas at ${JSON.stringify(cam)}`);
    }
  }
  assert.equal(facesEye({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }), true);
  assert.equal(facesEye({ x: 0, y: 0, z: -10 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }), false);
  assert.equal(shade('#808080', 0.5), 'rgb(64, 64, 64)');
}, 'projection: right is +x, up is +z, a positive tilt looks from above, and the vessel fits');

// 4. Drawing order.
function recorder() {
  const calls = { fill: 0 };
  return {
    calls,
    canvas: { width: 640, height: 360 },
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {},
    fill() { calls.fill += 1; },
    set fillStyle(v) { calls.style = v; }, get fillStyle() { return calls.style; },
    strokeStyle: '', lineWidth: 1,
  };
}
ok(() => {
  for (const [el, topLayer, bottomLayer] of [[30, 4, 1], [-30, 1, 4]]) {
    const ctx = recorder();
    const out = renderScene(ctx, scene.items, { azimuthDeg: 0, elevationDeg: el, zoom: 1 }, { width: 640, height: 360 });
    const total = scene.items.reduce((s, it) => s + it.mesh.indices.length / 3, 0);
    assert.equal(out.triangles, total, 'every triangle drawn');
    assert.equal(ctx.calls.fill, total, 'one fill each');
    const layersOf = (id) => new Set(out.order.filter((t) => t.id === id).map((t) => t.layer));
    assert.deepEqual([...layersOf('att-0')], [topLayer], `N1 (top) at ${el}°: layer ${topLayer}`);
    assert.deepEqual([...layersOf('att-2')], [bottomLayer], `L1 (bottom) at ${el}°: layer ${bottomLayer}`);
    assert.deepEqual([...layersOf('shell')].sort(), [0, 2], 'the shell split into far and near faces');
    const layers = out.order.map((t) => t.layer);
    assert.ok(layers.every((l, i) => i === 0 || l >= layers[i - 1]), 'layers drawn in order');
    for (let L = 0; L <= 4; L += 1) {
      const d = out.order.filter((t) => t.layer === L).map((t) => t.depth);
      assert.ok(d.every((v, i) => i === 0 || v <= d[i - 1]), `layer ${L} far to near`);
    }
  }
  const padScene = vesselScene([normalizeCase(EXAMPLE_CASES.PAD_36IN)], 0);
  const out = renderScene(recorder(), padScene.items, DEFAULT_CAMERA, { width: 640, height: 360 });
  const firstAtt = out.order.findIndex((t) => t.id === 'att-0');
  const lastPad = out.order.map((t) => t.id).lastIndexOf('pad-0');
  assert.ok(lastPad < firstAtt, 'a pad is drawn under its nozzle');
}, 'drawing order: from above the top nozzle is over the shell and the bottom lug under it; and the reverse from below');

// 5. Reads only; says what it shows.
ok(() => {
  const before = JSON.stringify(cases);
  vesselScene(cases, 1);
  renderScene(recorder(), vesselScene(cases, 1).items, DEFAULT_CAMERA, { width: 640, height: 360 });
  assert.equal(JSON.stringify(cases), before, 'the cases are not changed');
  assert.equal(scene.items.filter((it) => it.selected).length, 1);
  assert.equal(scene.labels.map((l) => l.name).join(','), 'N1,N2,L1');
  assert.equal(describeScene(cases, 1, DEFAULT_CAMERA),
    '3-D preview: shell of outside diameter 1500 mm, 4000 mm long, with 3 attachments (N1, N2, L1); N2 selected. Turned 0°, tilted 25°.');
  const us = cases.map((c) => convertCaseUnits(c, 'US'));
  assert.match(describeScene(us, 0, DEFAULT_CAMERA), /outside diameter 59\.06 in, 157\.5 in long/u);
  const usScene = vesselScene(us, 0);
  assert.deepEqual(usScene.items[0].mesh.bounds, scene.items[0].mesh.bounds, 'the same vessel in US units draws the same');
  assert.equal(vesselScene([{ ...cases[0], shellOutsideDiameter: '' }], 0).ok, false);
  assert.match(describeScene([{ ...cases[0], shellOutsideDiameter: '' }], 0, DEFAULT_CAMERA), /enter the shell/u);
}, 'reads the cases only, and says what it shows in the case\'s units');

// 6. Not in the first load.
ok(() => {
  const files = [];
  const walk = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.js$/u.test(f)) files.push(p); } };
  walk('src');
  const statics = files.filter((f) => /from\s+['"][^'"]*(vessel-3d|software-3d)\.js['"]/u.test(readFileSync(f, 'utf8')))
    .filter((f) => !/vessel-3d\.js$/u.test(f));
  assert.deepEqual(statics, [], 'nothing imports the preview statically (vessel-3d.js itself imports the renderer)');
  assert.match(readFileSync('src/app/wrc/wrc-panel.js', 'utf8'), /await import\('\.\/vessel-3d\.js'\)/u, 'the panel loads it on demand');
}, 'loaded only when opened');

console.log(`wrc-vessel-3d-check: ${passed} PASS`);
