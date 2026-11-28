/**
 * Canvas step A3: the unrolled shell and moving attachments on it
 * (src/app/wrc/vessel-unrolled.js, src/app/wrc/canvas-snap.js).
 *
 * Checks:
 *  1. The snaps ported from Pdf-Hub behave as there: grid, one-axis lock, line-up within the capture radius
 *     (the angle the short way round), next grid line, angles wrapped.
 *  2. snapMove: lock first, then another attachment, then the grid; snap off rounds to the small step; the
 *     shell's ends hold it.
 *  3. Layout: drawing and shell coordinates round-trip; the worked vessel is to scale; a long thin shell is
 *     stretched around and says so; the grid along is a round step in SI and US.
 *  4. The view: every attachment is a focusable, named, movable element; one crossing the 0°/360° cut shows
 *     at both edges; no shell, no view.
 *  5. Moving an attachment changes only its position: its WRC 537 stresses stay the same (angle is for the
 *     drawing; position along only enters the end-distance check), and the others are untouched.
 */
import assert from 'node:assert/strict';
import { alignTo, nextGridLine, orthoLock, snapMove, snapToGrid, wrapAngle } from '../src/app/wrc/canvas-snap.js';
import {
  ANGLE_STEP, buildUnrolledHtml, gridAlong, positionOf, positionText, toModel, toScreen, unrolledLayout,
} from '../src/app/wrc/vessel-unrolled.js';
import { EXAMPLE_VESSELS, caseFor, checkVessel, normalizeVessel, withCase } from '../src/app/wrc/vessel-model.js';
import { calculateWrc537Cases } from '../src/app/wrc/wrc-calc.js';
import { UNIT_SYSTEMS, convertCaseUnits } from '../src/app/wrc/wrc-units.js';

let passed = 0;
const ok = (fn, name) => { fn(); passed += 1; console.log(`  PASS ${name}`); };

// 1. The ported snaps.
ok(() => {
  // snapToOrthogonalGrid with one spacing, as in Pdf-Hub's gridMath.ts
  assert.deepEqual(snapToGrid({ x: 31, y: 9 }, 20, 20), { x: 40, y: 0 });
  assert.deepEqual(snapToGrid({ x: 1049, y: 22.4 }, 100, 15), { x: 1000, y: 15 });
  assert.deepEqual(snapToGrid({ x: 1049, y: 22.4 }, 0, 15), { x: 1049, y: 15 }, 'spacing 0 leaves the axis free');
}, 'grid snap, with a spacing per axis');
ok(() => {
  // applyOrthoConstraint: the axis moved further wins; weighed in pixels
  assert.deepEqual(orthoLock({ x: 0, y: 0 }, { x: 10, y: 3 }), { point: { x: 10, y: 0 }, held: 'y' });
  assert.deepEqual(orthoLock({ x: 0, y: 0 }, { x: 10, y: 3 }, 0.1, 1), { point: { x: 0, y: 3 }, held: 'x' }, '1 px along against 3 px around');
}, 'one-axis lock');
ok(() => {
  const targets = [{ value: 1000, name: 'N1' }, { value: 1020, name: 'N2' }];
  assert.deepEqual(alignTo(1012, targets, 15), { value: 1020, name: 'N2' }, 'the nearest within reach');
  assert.equal(alignTo(1040, targets, 15), null, 'none within reach');
  assert.deepEqual(alignTo(358, [{ value: 2, name: 'N3' }], 5, 360), { value: 362, name: 'N3' }, 'across 360°, on the same turn');
  assert.equal(alignTo(10, [{ value: Number.NaN, name: 'X' }], 5), null, 'an attachment with no position along is skipped');
}, 'line up with another attachment (capture radius)');
ok(() => {
  assert.equal(nextGridLine(1003, 50, 1), 1050);
  assert.equal(nextGridLine(1003, 50, -1), 1000);
  assert.equal(nextGridLine(1000, 50, 1), 1050);
  assert.equal(nextGridLine(1000, 50, -1), 950);
  assert.equal(nextGridLine(350, 15, 1), 360);
  assert.equal(wrapAngle(360), 0);
  assert.equal(wrapAngle(-15), 345);
  assert.equal(wrapAngle(359.99999999), 0);
}, 'next grid line, angles wrapped');

// 2. snapMove.
const base = { grid: { x: 100, y: 15 }, capture: { x: 30, y: 4 }, px: { x: 0.1, y: 1 }, range: [0, 4000], fine: { x: 1, y: 1 } };
ok(() => {
  const r = snapMove({ x: 1234, y: 97 }, base);
  assert.deepEqual([r.x, r.y, r.how.x, r.how.y], [1200, 90, 'grid', 'grid']);
}, 'grid when nothing to line up with');
ok(() => {
  const r = snapMove({ x: 2390, y: 97 }, { ...base, targets: [{ x: 2400, y: 180, name: 'N2' }, { x: 3000, y: 95, name: 'L1' }] });
  assert.deepEqual([r.x, r.y, r.with.x, r.with.y, r.how.x, r.how.y], [2400, 95, 'N2', 'L1', 'align', 'align'], 'lined up beats the grid on each axis');
}, 'another attachment before the grid');
ok(() => {
  const r = snapMove({ x: 1900, y: 33 }, { ...base, anchor: { x: 1000, y: 30 }, lock: true });
  assert.deepEqual([r.x, r.y, r.how.y], [1900, 30, 'held'], 'mostly along: around held, along on the grid');
  const r2 = snapMove({ x: 1010, y: 80 }, { ...base, anchor: { x: 1003, y: 30 }, lock: true });
  assert.deepEqual([r2.x, r2.y, r2.how.x], [1003, 75, 'held'], 'mostly around: along held where it was, around on the grid');
}, 'Shift holds one axis');
ok(() => {
  const r = snapMove({ x: 1234.4, y: 97.3 }, { ...base, snap: false, targets: [{ x: 1230, y: 97, name: 'N2' }] });
  assert.deepEqual([r.x, r.y, r.how.x], [1234, 97, 'free'], 'snap off: rounded to the small step only');
  assert.equal(snapMove({ x: 5000, y: 10 }, base).x, 4000, 'held at the far end');
  assert.equal(snapMove({ x: -40, y: 10 }, base).x, 0, 'held at the first end');
  assert.equal(snapMove({ x: 1000, y: 366 }, base).y, 0, '366° snaps to 360°, which is 0°');
  assert.equal(snapMove({ x: 1000, y: 368 }, base).y, 15, '368° snaps to 375°, which is 15°');
  assert.equal(snapMove({ x: 1000, y: -20 }, base).y, 345, 'up past the top comes in at the bottom');
}, 'snap off, the ends and the cut');

// 3. Layout.
const worked = normalizeVessel(EXAMPLE_VESSELS.TWO_NOZZLES_LUG);
const cases = worked.attachments.map((_, i) => caseFor(worked, i));
const layout = unrolledLayout(cases);
ok(() => {
  assert.equal(layout.ok, true);
  assert.equal(layout.span, 4000, 'the cylinder length');
  assert.equal(layout.stretch, 1, 'the worked vessel is to scale');
  assert.equal(Math.round(layout.plotH), 300);
  assert.ok(Math.abs(layout.plotH / layout.plotW - (Math.PI * 1500) / 4000) < 1e-9, 'height : width = circumference : length');
  for (const [x, y] of [[0, 0], [1000, 90], [3999, 359]]) {
    const { px, py } = toScreen(layout, x, y);
    const back = toModel(layout, px, py);
    assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.y - y) < 1e-9, `round trip at ${x}, ${y}`);
  }
  assert.deepEqual(positionOf(layout, cases[1]), { x: 2400, y: 90, placed: true });
}, 'to scale, and drawing ↔ shell coordinates round-trip');
ok(() => {
  const pipe = { ...cases[0], shellOutsideDiameter: 168.3, shellThickness: 7, cylinderLength: 12000, attachmentOutsideDiameter: 60.3, attachmentStation: 6000 };
  const l = unrolledLayout([pipe]);
  assert.ok(l.stretch > 2, `a long thin pipe is stretched around (×${l.stretch.toFixed(2)})`);
  assert.equal(Math.round(l.plotH), 150, 'to the smallest height');
  assert.match(buildUnrolledHtml([pipe], 0, { layout: l }), /Around the shell is stretched ×\d/u);
  assert.match(buildUnrolledHtml(cases, 0, { layout }), /To scale\./u);
}, 'a long thin shell is stretched around, and the caption says so');
ok(() => {
  assert.equal(gridAlong(4000, UNIT_SYSTEMS.SI), 100);
  assert.equal(gridAlong(300, UNIT_SYSTEMS.SI), 10);
  assert.equal(gridAlong(4000, UNIT_SYSTEMS.US), 6 * UNIT_SYSTEMS.US.mmPer, '157 in long: a 6 in grid');
  const us = unrolledLayout(cases.map((c) => convertCaseUnits(c, 'US')));
  assert.equal(us.grid.x, 6 * UNIT_SYSTEMS.US.mmPer);
  assert.equal(ANGLE_STEP, 15);
}, 'the grid along is a round step in the case\'s units');
ok(() => {
  const held = unrolledLayout(cases, { span: 5000 });
  assert.equal(held.span, 5000, 'a span held while dragging');
  const noLength = cases.map((c) => ({ ...c, cylinderLength: '' }));
  assert.equal(unrolledLayout(noLength).span, Math.max(3 * 1500, 3000 + 100), 'no length: three diameters, or enough for every attachment');
}, 'the drawn length');

// 4. The view.
ok(() => {
  const html = buildUnrolledHtml(cases, 1, { layout });
  const atts = [...html.matchAll(/<g class="vunroll__att( is-active)?" data-move="(\d)" tabindex="0" role="button"[^>]*aria-label="([^"]*)"/gu)];
  assert.deepEqual(atts.map((m) => m[2]).sort(), ['0', '1', '2'], 'every attachment is movable');
  assert.equal(atts.find((m) => m[2] === '1')[1], ' is-active', 'the selected one is marked');
  assert.match(atts.find((m) => m[2] === '1')[3], /^N2: 2400 mm along, 90° around, selected\./u);
  assert.match(html, /data-role="unrolled-readout">N2: 2400 mm along, 90° around\.</u);
  // One attachment's markup: from its data-move to the next one's (or the end).
  const part = (i) => {
    const from = html.indexOf(`data-move="${i}"`);
    const next = html.indexOf('data-move="', from + 10);
    return html.slice(from, next < 0 ? undefined : next);
  };
  const n1 = part(0);
  assert.equal((n1.match(/<ellipse class="vunroll__foot/gu) ?? []).length, 2, 'N1 at 0° crosses the cut: drawn at the top and the bottom');
  const n2 = part(1);
  assert.equal((n2.match(/<ellipse class="vunroll__foot/gu) ?? []).length, 1, 'N2 at 90°: once');
  assert.match(html, /<rect class="vunroll__foot"[^>]*\/>/u, 'the lug is a rectangle');
  for (const name of ['N1', 'N2', 'L1']) assert.match(html, new RegExp(`data-name="${name}"`, 'u'));
  assert.match(html, /Grid 100 mm along × 15° around\./u);
}, 'every attachment drawn, named and movable; the cut shown at both edges');
ok(() => {
  const html = buildUnrolledHtml(cases, 0, { layout, how: snapMove({ x: 2390, y: 3 }, { ...base, targets: [{ x: 2400, y: 90, name: 'N2' }] }) });
  assert.match(html, /class="vunroll__guide is-aligned" data-guide="along"/u, 'lined up along: its guide highlighted');
  assert.match(html, /class="vunroll__guide" data-guide="around"/u);
  assert.match(positionText(layout, { ...cases[0], attachmentStation: 2400 }, snapMove({ x: 2390, y: 3 }, { ...base, targets: [{ x: 2400, y: 90, name: 'N2' }] })), /along lined up with N2/u);
  assert.match(positionText(layout, { ...cases[0], attachmentStation: '' }), /no position along yet/u);
}, 'guides and the readout say what it snapped to');
ok(() => {
  assert.match(buildUnrolledHtml([{ ...cases[0], shellOutsideDiameter: '' }], 0), /data-role="unrolled-empty"/u);
}, 'no shell, no view');

// 5. Moving changes the position only.
const stresses = (c) => calculateWrc537Cases(c).cases.map((k) => (k.result.ok
  ? k.result.locations.map((l) => l.result.rows.map((r) => [r.location, r.stressIntensity])) : k.result.reasons.map((r) => r.kind)));
ok(() => {
  const before = checkVessel(worked);
  const moved = withCase(worked, 1, { ...caseFor(worked, 1), attachmentStation: 3200, attachmentAngle: 135 });
  const after = checkVessel(moved);
  assert.equal(after.rows[1].input.attachmentStation, 3200);
  assert.equal(after.rows[1].input.attachmentAngle, 135);
  assert.deepEqual(stresses(after.rows[1].input), stresses(before.rows[1].input), 'N2 moved: the same stresses');
  for (const i of [0, 2]) assert.deepEqual(after.rows[i].input, before.rows[i].input, `attachment ${i} untouched`);
  assert.equal(after.rows[1].governing.stressIntensity, before.rows[1].governing.stressIntensity);
  // Moved too close to an end, the §4.5.2 check says so: position along does reach the WRC check.
  const nearEnd = checkVessel(withCase(worked, 1, { ...caseFor(worked, 1), attachmentStation: 20 }));
  assert.notDeepEqual(stresses(nearEnd.rows[1].input), stresses(before.rows[1].input), 'too near the end: blocked or flagged');
}, 'moving changes the position only; the end-distance check still applies');

console.log(`wrc-unrolled-check: ${passed} PASS`);
