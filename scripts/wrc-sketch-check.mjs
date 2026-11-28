/**
 * Canvas step A1: the dimensioned sketch of the WRC calculator's inputs (src/app/wrc/vessel-sketch.js).
 *
 * Checks:
 *  1. Every example draws two views (side, end section) with a name for screen readers, and no NaN,
 *     "undefined" or Infinity anywhere in the SVG.
 *  2. The dimensions read the inputs: the lug example in SI and US, the γ = 5 case, the pad example.
 *  3. Missing inputs say so: no shell gives a message, no attachment size and no cylinder length give notes
 *     and draw no dimension for them.
 *  4. The sketch only reads the case: the input is unchanged and the WRC 537 results are identical.
 *  5. The printed report holds the sketch in plain colours (no CSS variables).
 */
import assert from 'node:assert/strict';
import { DEFAULT_CASE, EXAMPLE_CASES, calculateWrc537Cases } from '../src/app/wrc/wrc-calc.js';
import { buildVesselSketchHtml, sketchGeometry } from '../src/app/wrc/vessel-sketch.js';
import { buildWrcReportHtml } from '../src/app/wrc/wrc-report.js';
import { convertCaseUnits } from '../src/app/wrc/wrc-units.js';

const cases = { DEFAULT: DEFAULT_CASE, ...EXAMPLE_CASES };
const dims = (html) => [...html.matchAll(/data-dim="([^"]*)"/gu)].map((m) => m[1]);

// 1. Two named views for every example, in both unit systems, with finite numbers only.
for (const [name, c] of Object.entries(cases)) {
  for (const units of ['SI', 'US']) {
    const html = buildVesselSketchHtml(convertCaseUnits({ ...c }, units));
    assert.match(html, /data-role="vessel-sketch"/u, `${name} ${units}: sketch drawn`);
    assert.equal(html.match(/<svg /gu)?.length, 2, `${name} ${units}: two views`);
    assert.ok(html.includes('data-view="side"') && html.includes('data-view="end"'), `${name} ${units}: side and end views`);
    assert.equal(html.match(/role="img" aria-label="[^"]+"/gu)?.length, 2, `${name} ${units}: each view is named`);
    assert.doesNotMatch(html, /NaN|undefined|Infinity/u, `${name} ${units}: finite numbers only`);
    const unit = units === 'SI' ? 'mm' : 'in';
    assert.ok(dims(html).every((d) => d.endsWith(` ${unit}`) || d.endsWith(` ${unit} around`)), `${name} ${units}: every dimension in ${unit}`);
  }
}

// 2. The dimensions read the inputs.
const lug = buildVesselSketchHtml(EXAMPLE_CASES.LUG_200X100);
for (const d of ['200 mm', '100 mm', '2000 mm', '4000 mm', 'Ø1500 mm']) assert.ok(dims(lug).includes(d), `lug SI: ${d}`);
assert.ok(lug.includes('t 12 mm'), 'lug SI: wall thickness');
const lugUs = buildVesselSketchHtml(convertCaseUnits({ ...EXAMPLE_CASES.LUG_200X100 }, 'US'));
for (const d of ['7.874 in', '3.937 in', '78.74 in', '157.5 in', 'Ø59.06 in']) assert.ok(dims(lugUs).includes(d), `lug US: ${d}`);
assert.ok(lugUs.includes('t 0.4724 in'), 'lug US: wall thickness');
const g5 = buildVesselSketchHtml(EXAMPLE_CASES.GAMMA5_ORACLE);
for (const d of ['Ø35.4286 mm', '80 mm', '300 mm', 'Ø220 mm']) assert.ok(dims(g5).includes(d), `γ = 5: ${d}`);
const pad = buildVesselSketchHtml(EXAMPLE_CASES.PAD_36IN);
for (const d of ['Ø914.4 mm', 'pad Ø1064.4 mm', 'pad 1064.4 mm around', 'Ø2161 mm']) assert.ok(dims(pad).includes(d), `pad: ${d}`);
assert.ok(pad.includes('No cylinder length given'), 'pad example has no length: the note says so');
assert.ok(!dims(pad).some((d) => /^\d/u.test(d) && !d.includes('around')), 'no length or station dimension without a cylinder length');
const solid = sketchGeometry({ ...EXAMPLE_CASES.TRUNNION_10IN, trunnionConstruction: 'SOLID' });
assert.equal(solid.kind, 'TRUNNION');
assert.equal(solid.solid, true);
assert.equal(sketchGeometry(EXAMPLE_CASES.TRUNNION_10IN).solid, false, 'the 10-inch trunnion is a pipe');

// 3. Missing inputs.
assert.match(buildVesselSketchHtml({ ...DEFAULT_CASE, shellOutsideDiameter: '' }), /data-role="vessel-sketch-empty"/u, 'no shell: message');
assert.match(buildVesselSketchHtml({ ...DEFAULT_CASE, shellThickness: 600 }), /data-role="vessel-sketch-empty"/u, 'wall thicker than the radius: message');
const noAtt = buildVesselSketchHtml({ ...DEFAULT_CASE, attachmentOutsideDiameter: '' });
assert.ok(noAtt.includes("Enter the attachment's outside diameter to draw it."), 'no attachment: note');
assert.ok(!dims(noAtt).some((d) => d === 'Ø219.1 mm'), 'no attachment: no attachment dimension');
const noStation = buildVesselSketchHtml({ ...DEFAULT_CASE, attachmentStation: '' });
assert.ok(noStation.includes('No attachment position given: it is drawn at mid-length.'), 'no station: note');
assert.ok(!dims(noStation).includes('1500 mm'), 'no station: no station dimension');
assert.ok(dims(noStation).includes('3000 mm'), 'no station: the length is still dimensioned');

// 4. The sketch only reads the case.
for (const [name, c] of Object.entries(cases)) {
  const input = structuredClone({ ...c, loadCases: [{ name: 'Case 1', loads: { ...c.loads } }], activeCase: 0 });
  const before = JSON.stringify(input);
  const resultBefore = JSON.stringify(calculateWrc537Cases(input));
  buildVesselSketchHtml(input);
  buildVesselSketchHtml(input, { theme: 'print' });
  assert.equal(JSON.stringify(input), before, `${name}: input unchanged`);
  assert.equal(JSON.stringify(calculateWrc537Cases(input)), resultBefore, `${name}: WRC 537 results unchanged`);
}

// 5. The report holds the sketch in plain colours.
const report = buildWrcReportHtml(calculateWrc537Cases({ ...EXAMPLE_CASES.LUG_200X100 }), { generatedAt: new Date(0) });
assert.ok(report.includes('<div class="sketch"><figure class="vsketch" data-role="vessel-sketch">'), 'report: sketch after the geometry table');
const reportSketch = report.slice(report.indexOf('<div class="sketch">'), report.indexOf('</figure>'));
assert.ok(!reportSketch.includes('var(--'), 'report sketch: plain colours, no CSS variables');

console.log(`wrc sketch: ${Object.keys(cases).length} examples × SI/US draw two named views; dimensions read the inputs; `
  + 'missing inputs say so; the case and its WRC 537 results are unchanged; the report holds it. PASS');
