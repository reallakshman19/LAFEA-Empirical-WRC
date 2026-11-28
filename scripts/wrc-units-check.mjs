/**
 * Checks the WRC calculator's display units (roadmap PL-06 part 2, src/app/wrc/wrc-units.js).
 *
 * Calculations stay in mm, N and MPa; `units` only changes what is shown. So:
 *  1. The unit factors are the exact definitions (1 in = 25.4 mm, 1 lbf = 4.4482216152605 N, 1 psi = 6894.757… Pa).
 *  2. Every example switched to US customary and back shows its typed loads again (to the 10 significant
 *     figures the form shows; within 1e-12 stored), and the load units map to their twins
 *     (N ↔ lbf, N·m ↔ ft·lbf, N·mm ↔ in·lbf).
 *  3. Switching units does not change a result: each example gives the same stresses in SI and in US.
 *  4. Formatting: an inch shows one more decimal than a mm, a psi two fewer than a MPa.
 *  5. The calculator's own messages, the report and the FE contour are in the case's units, and in SI they
 *     are unchanged.
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_CASE, EXAMPLE_CASES, FORCE_UNITS, MOMENT_UNITS, calculateWrc537, calculateWrc537Cases,
} from '../src/app/wrc/wrc-calc.js';
import { buildWrcReportHtml } from '../src/app/wrc/wrc-report.js';
import { buildFeContourHtml, feEdgePeakText } from '../src/app/wrc/fe-contour.js';
import {
  MPA_PER_PSI, UNIT_SYSTEMS, convertCaseUnits, feFieldIn, fromDisplay, lengthText, roundSig, stressText, toDisplay, unitSystem,
} from '../src/app/wrc/wrc-units.js';

const US = UNIT_SYSTEMS.US;
const SI = UNIT_SYSTEMS.SI;
const close = (a, b, rel, label) => assert.ok(Math.abs(a - b) <= rel * Math.max(1e-12, Math.abs(b)), `${label}: ${a} vs ${b}`);

// 1. Exact definitions.
assert.equal(FORCE_UNITS.lbf, 4.4482216152605);
assert.equal(FORCE_UNITS.kip, 4448.2216152605);
close(MOMENT_UNITS['in·lbf'], 4.4482216152605 * 25.4, 1e-15, 'in·lbf');
close(MOMENT_UNITS['ft·lbf'], 4.4482216152605 * 304.8, 1e-15, 'ft·lbf');
close(MOMENT_UNITS['ft·kip'], 4448.2216152605 * 304.8, 1e-15, 'ft·kip');
close(MPA_PER_PSI, FORCE_UNITS.lbf / 25.4 ** 2, 1e-14, 'psi = lbf/in²');
assert.equal(unitSystem({}).id, 'SI', 'a case saved before units existed is SI');
assert.equal(unitSystem({ units: 'nonsense' }).id, 'SI');
assert.equal(DEFAULT_CASE.units, 'SI');

// 2. SI → US → SI gives the typed loads back, with the twin units.
const twins = { N: 'lbf', 'N·m': 'ft·lbf', 'N·mm': 'in·lbf' };
for (const [name, example] of Object.entries({ DEFAULT: DEFAULT_CASE, ...EXAMPLE_CASES })) {
  const us = convertCaseUnits(example, 'US');
  assert.equal(us.units, 'US', name);
  assert.equal(us.forceUnit, twins[example.forceUnit], `${name} force unit`);
  assert.equal(us.momentUnit, twins[example.momentUnit], `${name} moment unit`);
  const back = convertCaseUnits(us, 'SI');
  assert.equal(back.forceUnit, example.forceUnit, `${name} force unit back`);
  assert.equal(back.momentUnit, example.momentUnit, `${name} moment unit back`);
  for (const [k, v] of Object.entries(example.loads)) {
    // The form shows 10 significant figures: the typed value again. The stored value is within 1e-12.
    assert.equal(roundSig(back.loads[k], 10), v, `${name} ${k} round trip as shown`);
    close(back.loads[k], v, 1e-12, `${name} ${k} round trip stored`);
  }
  // Geometry is stored in mm whatever the units: untouched.
  assert.equal(us.shellOutsideDiameter, example.shellOutsideDiameter, `${name} geometry stays in mm`);

  // 3. The same physical case gives the same stresses.
  const a = calculateWrc537Cases(example).cases[0].result;
  const b = calculateWrc537Cases(us).cases[0].result;
  assert.equal(a.ok, b.ok, `${name} ok`);
  if (a.ok) {
    a.locations.forEach((loc, li) => loc.result.rows.forEach((row, ri) => {
      close(b.locations[li].result.rows[ri].stressIntensity, row.stressIntensity, 1e-7, `${name} ${loc.id} ${row.location}`);
    }));
  }
}
// The load-case list converts too, and a case already in its system is left exactly as typed.
const listed = convertCaseUnits({ ...DEFAULT_CASE, loadCases: [{ name: 'A', loads: { P: 1000, Vc: 0, Vl: 0, Mc: 1, Ml: 0, Mt: 0 } }] }, 'US');
close(listed.loadCases[0].loads.P, 1000 / FORCE_UNITS.lbf, 1e-9, 'load case P in lbf');
close(listed.loadCases[0].loads.Mc, 1000 / MOMENT_UNITS['ft·lbf'], 1e-9, 'load case Mc in ft·lbf');
const kept = convertCaseUnits({ ...EXAMPLE_CASES.PAD_36IN, units: 'SI' }, 'SI');
assert.equal(kept.loads.P, EXAMPLE_CASES.PAD_36IN.loads.P);

// 4. Formatting and the form's conversions.
assert.equal(lengthText(1500, 2, SI), '1500.00');
assert.equal(lengthText(1500, 2, US), '59.055');
assert.equal(stressText(153.38, 2, SI), '153.38');
assert.equal(stressText(153.38, 2, US), '22246');
assert.equal(stressText(1, 3, US), '145.0');
assert.equal(toDisplay('length', 2161, US), 2161 / 25.4);
assert.equal(roundSig(toDisplay('length', 2161, US), 10), 85.07874016);
assert.equal(fromDisplay('length', 1, US), 25.4);
assert.equal(fromDisplay('stress', 1000, US), 1000 * MPA_PER_PSI);
assert.equal(toDisplay('length', '', US), '', 'a blank stays blank');

// 5a. The calculator's messages: SI as before, US in inches and psi.
const tooBig = { ...EXAMPLE_CASES.CAESAR_GAMMA48, attachmentOutsideDiameter: 1500 };
const siReason = calculateWrc537(tooBig).reasons.find((r) => r.kind === 'BETA');
assert.match(siReason.fix, /^Attachment OD must lie between \d+\.\d and \d+\.\d mm for this shell\.$/u);
const usReason = calculateWrc537({ ...tooBig, units: 'US' }).reasons.find((r) => r.kind === 'BETA');
assert.match(usReason.fix, /^Attachment OD must lie between \d+\.\d\d and \d+\.\d\d in for this shell\.$/u);
const pressured = calculateWrc537({ ...convertCaseUnits(EXAMPLE_CASES.PAD_36IN, 'US') });
assert.ok(pressured.warnings.some((w) => w.startsWith('Pressure 76.0 psi adds thin-shell membrane stress')), 'pressure warning in psi');

// 5b. The report: in US every length and stress is in inches and psi; the only "MPa" is the units line.
const usBatch = calculateWrc537Cases(convertCaseUnits({ ...EXAMPLE_CASES.PAD_36IN, allowableS: 138 }, 'US'));
const usHtml = buildWrcReportHtml(usBatch, { generatedAt: new Date(0) });
assert.equal(usHtml.match(/MPa/gu)?.length, 1, 'US report: MPa only in the units line');
assert.ok(usHtml.includes('Calculated in mm, N and MPa and converted for this report'));
assert.ok(usHtml.includes('Stresses at the eight WRC points (psi)'));
assert.ok(usHtml.includes(`<td class="n">${lengthText(2161, 2, US)}</td><td>in</td>`), 'shell OD in inches');
const gov = usBatch.cases[0].result.governing.stressIntensity;
assert.ok(usHtml.includes(`stress intensity ${stressText(gov, 3, US)} psi.`), 'governing in psi');
assert.ok(usHtml.includes('(ft·lbf)') && usHtml.includes('(lbf)'), 'load units in the load table');
const siHtml = buildWrcReportHtml(calculateWrc537Cases({ ...EXAMPLE_CASES.PAD_36IN, allowableS: 138 }), { generatedAt: new Date(0) });
assert.ok(!siHtml.includes('converted for this report') && !siHtml.includes('psi'), 'SI report has no US text');
assert.ok(siHtml.includes('Stresses at the eight WRC points (MPa)'));

// 5c. The FE contour and edge-peak text in display units.
const field = {
  attachment: { shape: 'rectangle', halfWidth: 50, halfLength: 100 }, halfSizeS: 254, halfSizeX: 381,
  triangles: [{ v: [-254, -381, 254, -381, 0, 381], u: 68.9475729316836, l: 6.89475729316836 }],
};
const usField = feFieldIn(field, US);
close(usField.halfSizeS, 10, 1e-12, 'patch in inches');
close(usField.triangles[0].u, 10000, 1e-9, 'element value in psi');
close(usField.attachment.halfLength, 100 / 25.4, 1e-12, 'footprint in inches');
assert.equal(feFieldIn(field, SI), field, 'SI field untouched');
const usPlot = buildFeContourHtml(usField, { unitsLabel: 'psi', lengthLabel: 'in', stressDigits: 0 });
assert.ok(usPlot.includes('s, around the shell (in)') && usPlot.includes('Peak 10000 psi') && usPlot.includes('>10.0<'), 'US contour labels');
const siPlot = buildFeContourHtml(field);
assert.ok(siPlot.includes('s, around the shell (mm)') && siPlot.includes('Peak 68.95 MPa') && siPlot.includes('>254<'), 'SI contour unchanged');
const peakRun = { edgePeak: { value: 68.9475729316836, surface: 'u', s: 45, x: 90 }, geometry: { halfWidth: 50, halfLength: 100 } };
assert.ok(feEdgePeakText(peakRun).startsWith('Highest element value next to the footprint: 68.95 MPa on the outside surface, at s = 45 mm, x = 90 mm, at a corner.'));
assert.ok(feEdgePeakText(peakRun, null, US).startsWith('Highest element value next to the footprint: 10000 psi on the outside surface, at s = 1.8 in, x = 3.5 in, at a corner.'));

// 6. The facts the load help text states (wrc-panel.js LOADS), on the CAESAR II case and a lug.
const only = (key, base = EXAMPLE_CASES.CAESAR_GAMMA48) => calculateWrc537({
  ...base, loads: { P: 0, Vc: 0, Vl: 0, Mc: 0, Ml: 0, Mt: 0, [key]: base.momentUnit === 'N·mm' && key.startsWith('M') ? 1e6 : 1000 },
});
const pOnly = only('P');
for (const p of ['A', 'B', 'C', 'D']) {
  const [up, low] = ['u', 'l'].map((s) => pOnly.rows.find((r) => r.location === p + s));
  assert.ok(up.circumferential + low.circumferential < 0, `P > 0 pushes the attachment in: compressive hoop membrane at ${p}`);
}
for (const base of [EXAMPLE_CASES.CAESAR_GAMMA48, EXAMPLE_CASES.LUG_200X100]) {
  assert.match(only('Mc', base).governing.location, /^[CD]/u, 'Mc is largest at C or D');
  assert.match(only('Ml', base).governing.location, /^[AB]/u, 'Ml is largest at A or B');
}

console.log(`WRC units: exact factors; ${Object.keys(EXAMPLE_CASES).length + 1} cases round-trip SI → US → SI and give the same stresses; `
  + 'messages, report and contour follow the units. WRC_UNITS_CHECK_PASS');
