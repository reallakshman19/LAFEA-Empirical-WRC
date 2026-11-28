/**
 * Canvas step A6: a small software 3-D renderer on a plain 2-D canvas (no WebGL, no three.js).
 *
 * Ported from Pdf-Hub, MIT licence: github.com/reallakshman19/Pdf-Hub, frontend/src/core/cad-3d/
 * software3dRenderer.ts at commit 74fcb94, as plain JS: the orbit camera (azimuth, elevation, distance about
 * the scene's centre), the perspective projection, the scene's centre and span, and the painter's algorithm
 * (triangles sorted far to near, back faces darker). Changed here: the shade is mixed into the colour instead
 * of drawn with transparency, so hidden faces do not show through; the colours come from the caller.
 *
 * A mesh is { vertices, normals, indices } (flat arrays of x, y, z and triangle corners) with `bounds`. World
 * axes: z is up. With azimuth 0 the viewer is on the −y side looking toward +y, x to the right.
 */

const DEG = Math.PI / 180;

/** The default view: from the −y side, a little above. */
export const DEFAULT_CAMERA = Object.freeze({ azimuthDeg: 0, elevationDeg: 25, zoom: 1 });

/** Centre and size of everything to draw (`computeScenePivotAndSpan`). */
export function sceneCentreAndSpan(items) {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const { mesh } of items) {
    const b = mesh.bounds;
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); minZ = Math.min(minZ, b.minZ);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY); maxZ = Math.max(maxZ, b.maxZ);
  }
  if (!items.length) return { centre: { x: 0, y: 0, z: 0 }, span: 100, bounds: { minX: -50, minY: -50, minZ: -50, maxX: 50, maxY: 50, maxZ: 50 } };
  return {
    centre: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
    span: Math.max(1e-6, maxX - minX, maxY - minY, maxZ - minZ),
    bounds: { minX, minY, minZ, maxX, maxY, maxZ },
  };
}

/**
 * The projection for a camera, a scene and a canvas size: `project(x, y, z)` gives { sx, sy, depth }, depth
 * growing away from the viewer. At zoom 1 the scene's box, as seen from the camera, fills 85% of the canvas
 * and is centred in it (a fit added here; Pdf-Hub uses a fixed distance and field of view).
 */
export function makeProjection(camera, { centre, span, bounds }, width, height) {
  const az = camera.azimuthDeg * DEG;
  const el = camera.elevationDeg * DEG;
  const cosAz = Math.cos(az); const sinAz = Math.sin(az);
  const cosEl = Math.cos(el); const sinEl = Math.sin(el);
  const distance = 2.5 * span;
  // Perspective without the screen scale: (right, up) per unit of the field of view.
  const view = (x, y, z) => {
    const px = x - centre.x; const py = y - centre.y; const pz = z - centre.z;
    const rx = cosAz * px - sinAz * py;
    const ry = sinAz * px + cosAz * py;
    // Elevation above the horizon looks down (Pdf-Hub's signs put the eye below for a positive elevation).
    const ey = cosEl * pz + sinEl * ry;
    const depth = -sinEl * pz + cosEl * ry + distance;
    const k = 1 / Math.max(depth, 1e-6);
    return { u: rx * k, v: ey * k, depth };
  };
  let minU = Infinity; let maxU = -Infinity; let minV = Infinity; let maxV = -Infinity;
  const b = bounds ?? { minX: centre.x - span / 2, maxX: centre.x + span / 2, minY: centre.y - span / 2, maxY: centre.y + span / 2, minZ: centre.z - span / 2, maxZ: centre.z + span / 2 };
  for (const x of [b.minX, b.maxX]) for (const y of [b.minY, b.maxY]) for (const z of [b.minZ, b.maxZ]) {
    const p = view(x, y, z);
    minU = Math.min(minU, p.u); maxU = Math.max(maxU, p.u); minV = Math.min(minV, p.v); maxV = Math.max(maxV, p.v);
  }
  const fov = 0.85 * Math.min(width / Math.max(maxU - minU, 1e-9), height / Math.max(maxV - minV, 1e-9)) * (camera.zoom ?? 1);
  const cx = width / 2 - fov * ((minU + maxU) / 2);
  const cy = height / 2 + fov * ((minV + maxV) / 2);
  const project = function project(x, y, z) {
    const p = view(x, y, z);
    return { sx: cx + p.u * fov, sy: cy - p.v * fov, depth: p.depth };
  };
  // Where the eye is: `distance` back from the centre along the depth axis.
  const d = { x: cosEl * sinAz, y: cosEl * cosAz, z: -sinEl };
  project.eye = { x: centre.x - d.x * distance, y: centre.y - d.y * distance, z: centre.z - d.z * distance };
  return project;
}

/** True when a surface at `p` with outward normal `n` faces the eye. */
export function facesEye(eye, p, n) {
  return n.x * (eye.x - p.x) + n.y * (eye.y - p.y) + n.z * (eye.z - p.z) > 0;
}

/** '#rrggbb' scaled toward black by `k` (0–1): the shaded face colour. */
export function shade(hex, k) {
  const n = Number.parseInt(String(hex).replace('#', ''), 16);
  const c = (shift) => Math.round(((n >> shift) & 255) * Math.min(1, Math.max(0, k)));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

const LIGHT = Object.freeze({ x: 0.45, y: -0.55, z: 0.7 }); // from the front, above, a little to the right

/**
 * Draws the items ({ mesh, color, edge }) on a 2-D context: background, then every triangle far to near,
 * shaded by its angle to the light (`renderSceneMeshesToCanvas2D`). Returns the projection and the number of
 * triangles drawn.
 */
export function renderScene(ctx, items, camera, { width, height, background = '#07101f' } = {}) {
  const w = width ?? ctx.canvas?.width ?? 640;
  const h = height ?? ctx.canvas?.height ?? 360;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  const scene = sceneCentreAndSpan(items);
  const project = makeProjection(camera, scene, w, h);
  const { eye } = project;
  // Layers, drawn in this order and each sorted far to near. Sorting alone (Pdf-Hub's way) lets a big face
  // of the shell cover a small nozzle standing on it; a convex body splits that cleanly:
  // 0 the body's faces turned away, 1 parts on its far side, 2 its faces toward the eye, 3 parts lying on it on
  // the near side (`under`: pads), 4 parts standing on those (attachments).
  // An item is a `body` (split face by face) or a part with an `anchor` { p, n } saying which side it is on.
  const layers = [[], [], [], [], []];
  for (const item of items) {
    const near = item.anchor ? facesEye(eye, item.anchor.p, item.anchor.n) : true;
    const partLayer = near ? (item.under ? 3 : 4) : 1;
    const { vertices: v, normals: nrm, indices: idx } = item.mesh;
    const count = v.length / 3;
    const pts = new Array(count);
    for (let i = 0; i < count; i += 1) pts[i] = project(v[3 * i], v[3 * i + 1], v[3 * i + 2]);
    for (let t = 0; t < idx.length; t += 3) {
      const a = pts[idx[t]]; const b = pts[idx[t + 1]]; const c = pts[idx[t + 2]];
      // The face's normal: the mean of its corners' (Pdf-Hub takes the first corner's, which stripes a cylinder).
      const nx = nrm[3 * idx[t]] + nrm[3 * idx[t + 1]] + nrm[3 * idx[t + 2]];
      const ny = nrm[3 * idx[t] + 1] + nrm[3 * idx[t + 1] + 1] + nrm[3 * idx[t + 2] + 1];
      const nz = nrm[3 * idx[t] + 2] + nrm[3 * idx[t + 1] + 2] + nrm[3 * idx[t + 2] + 2];
      const nl = Math.hypot(nx, ny, nz) || 1;
      // Facing the light (either side: a pipe is seen from inside too), and back faces a little darker.
      const lit = Math.abs(nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z) / (nl * Math.hypot(LIGHT.x, LIGHT.y, LIGHT.z));
      const i0 = idx[t]; const i1 = idx[t + 1]; const i2 = idx[t + 2];
      const mid = { x: (v[3 * i0] + v[3 * i1] + v[3 * i2]) / 3, y: (v[3 * i0 + 1] + v[3 * i1 + 1] + v[3 * i2 + 1]) / 3, z: (v[3 * i0 + 2] + v[3 * i1 + 2] + v[3 * i2 + 2]) / 3 };
      const front = facesEye(eye, mid, { x: nx, y: ny, z: nz });
      const k = 0.35 + 0.65 * lit;
      const layer = item.body ? (front ? 2 : 0) : partLayer;
      layers[layer].push({ a, b, c, depth: (a.depth + b.depth + c.depth) / 3, fill: shade(item.color, front ? k : k * 0.75), edge: item.edge, id: item.mesh.id, layer });
    }
  }
  const tris = [];
  for (const layer of layers) tris.push(...layer.sort((p, q) => q.depth - p.depth));
  for (const t of tris) {
    ctx.beginPath();
    ctx.moveTo(t.a.sx, t.a.sy);
    ctx.lineTo(t.b.sx, t.b.sy);
    ctx.lineTo(t.c.sx, t.c.sy);
    ctx.closePath();
    ctx.fillStyle = t.fill;
    ctx.fill();
    // A hairline in the face's own colour closes the gaps between neighbouring triangles.
    ctx.strokeStyle = t.edge ?? t.fill;
    ctx.lineWidth = t.edge ? 0.6 : 0.5;
    ctx.stroke();
  }
  return { project, triangles: tris.length, scene, order: tris };
}
