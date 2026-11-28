/**
 * Canvas step A3: snapping for moving an attachment on the unrolled shell (roadmap stage A, empirical track).
 *
 * A point is { x, y } with x the position along the shell (mm) and y the angle around it (degrees, wrapping
 * at 360°). Nothing here touches the WRC 537 core: it only decides where a dragged attachment lands.
 *
 * Ported from Pdf-Hub, MIT licence: github.com/reallakshman19/Pdf-Hub at commit 74fcb94, as plain JS:
 * - snapToGrid: frontend/src/core/cad-grid/gridMath.ts `snapToOrthogonalGrid`, with a spacing per axis;
 * - orthoLock: frontend/src/core/cad-modeling/draftingMath.ts `applyOrthoConstraint`, the axes weighed in
 *   pixels so "mostly along" means what it looks like on the drawing;
 * - alignTo: the capture-radius search of frontend/src/core/annotations/cadSnapping.ts `findSnapTarget`,
 *   one axis at a time (line up with another attachment's position along or angle around), the angle
 *   measured the short way round;
 * - snapMove: the priority of cadSnapping.ts `resolveLineEndpoint`: the lock first, then another
 *   attachment, then the grid.
 */

const EPS = 1e-9;

/** The nearest grid point (`snapToOrthogonalGrid`), with its own spacing on each axis. 0 leaves that axis free. */
export function snapToGrid(pt, spacingX, spacingY) {
  return {
    x: spacingX > 0 ? Math.round(pt.x / spacingX) * spacingX : pt.x,
    y: spacingY > 0 ? Math.round(pt.y / spacingY) * spacingY : pt.y,
  };
}

/**
 * Movement held to one axis (`applyOrthoConstraint`): whichever the pointer has moved further along, in
 * pixels (`kx`, `ky` are pixels per unit on each axis). Returns the point and the axis that stays put.
 */
export function orthoLock(anchor, current, kx = 1, ky = 1) {
  const dx = Math.abs(current.x - anchor.x) * kx;
  const dy = Math.abs(current.y - anchor.y) * ky;
  return dx >= dy ? { point: { x: current.x, y: anchor.y }, held: 'y' } : { point: { x: anchor.x, y: current.y }, held: 'x' };
}

/** Distance between two values; with a period (360° around the shell) the short way round. */
function gap(a, b, period) {
  const d = Math.abs(a - b);
  return period ? Math.min(d % period, period - (d % period)) : d;
}

/**
 * The nearest target value within `capture` of `value` (`findSnapTarget`, on one axis), or null.
 * `targets` are { value, name }. With a period, the result is moved to the turn `value` is on.
 */
export function alignTo(value, targets, capture, period = 0) {
  let best = null;
  let bestGap = Infinity;
  for (const t of targets) {
    const d = gap(value, t.value, period);
    if (d <= capture && d < bestGap) { bestGap = d; best = t; }
  }
  if (!best) return null;
  if (!period) return { value: best.value, name: best.name };
  const turns = Math.round((value - best.value) / period);
  return { value: best.value + turns * period, name: best.name };
}

/** The next grid line from `value` in direction `dir` (+1 or −1): from 1003 with a step of 50, 1050 or 1000. */
export function nextGridLine(value, step, dir) {
  if (!(step > 0)) return value;
  return dir > 0 ? (Math.floor(value / step + EPS) + 1) * step : (Math.ceil(value / step - EPS) - 1) * step;
}

/** An angle in 0 ≤ a < 360, with a value a hair under 360 taken as 0. */
export function wrapAngle(a) {
  const w = ((a % 360) + 360) % 360;
  return w > 360 - 1e-7 ? 0 : w;
}

const roundTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);
const clean = (v) => Math.round(v * 1e6) / 1e6; // drop floating-point dust such as 1049.9999999

/**
 * Where a dragged attachment lands. `raw` is where the pointer puts it; options:
 * - anchor: where it was when the drag started (for the lock);
 * - lock: hold it to one axis (Shift);
 * - snap: grid and line-up snaps on (off while Alt is held, or with the Snap box cleared);
 * - grid: { x, y } spacing (mm along, degrees around); fine: { x, y } rounding when not snapped;
 * - targets: the other attachments, { x, y, name };
 * - capture: { x, y } how close counts as lined up (the pointer's capture radius in each axis's units);
 * - px: { x, y } pixels per unit, for the lock; range: [min, max] along (the shell's ends).
 * Returns { x, y, how: { x, y } } with how 'held', 'align', 'grid' or 'free', and `with` the names lined up with.
 */
export function snapMove(raw, {
  anchor = raw, lock = false, snap = true, grid = { x: 0, y: 15 }, fine = { x: 0, y: 0 },
  targets = [], capture = { x: 0, y: 0 }, px = { x: 1, y: 1 }, range = [0, Infinity],
} = {}) {
  let p = { ...raw };
  const how = { x: 'free', y: 'free' };
  const withName = { x: null, y: null };
  let held = null;
  if (lock) {
    const locked = orthoLock(anchor, p, px.x, px.y);
    p = locked.point;
    held = locked.held;
    how[held] = 'held';
  }
  for (const axis of ['x', 'y']) {
    if (axis === held) continue;
    const period = axis === 'y' ? 360 : 0;
    if (snap) {
      const hit = alignTo(p[axis], targets.map((t) => ({ value: t[axis], name: t.name })), capture[axis], period);
      if (hit) {
        p[axis] = hit.value;
        how[axis] = 'align';
        withName[axis] = hit.name;
        continue;
      }
      p[axis] = snapToGrid(p, axis === 'x' ? grid.x : 0, axis === 'y' ? grid.y : 0)[axis];
      how[axis] = grid[axis] > 0 ? 'grid' : 'free';
    } else {
      p[axis] = roundTo(p[axis], fine[axis]);
    }
  }
  const [lo, hi] = range;
  return { x: clean(Math.min(Math.max(p.x, lo), hi)), y: clean(wrapAngle(p.y)), how, with: withName };
}
