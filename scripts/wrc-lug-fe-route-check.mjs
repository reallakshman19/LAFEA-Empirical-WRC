/**
 * The shell-FE route for rectangular attachments (roadmap PL-04): when FE is compared with WRC 537, when
 * it runs alone, and what a stiff rectangular footprint does that WRC 537's square–round equivalence
 * does not show. The point-by-point checks of the lug model are in wrc-lug-fe-check.mjs.
 *
 * Checks:
 *  1. wrcFeReference: COMPARE for a lug WRC 537 solves (at the pad edge when there is a pad, also when the
 *     shell + pad location is refused); FE_ONLY for a lug refused only for WRC 537's own lug limits
 *     (torsion, β1/β2 outside 0.25–4, Mc/ML below γ 15, a term β outside 0.05–0.5); BLOCKED otherwise
 *     (round attachments, γ outside the curves, length rules, bad pad input, input errors).
 *  2. FE only: a thin plate (200 × 28 mm footprint, β1/β2 0.14) with torsion solves through the app path;
 *     torsion shear has one sign at all 8 points, as for a round attachment; frozen 8-point maximum.
 *  3. Square vs round: WRC 537 gives a square footprint (half-side c) the stresses of a round attachment
 *     with r0 = c/0.875. With both stiff, FE puts less stress than that at the middle of the square's
 *     edges and more at its corners. Frozen for Mc on the lug example's shell (c = 50 mm).
 *  4. Report and contour: the FE-only report has no WRC column and says why; the compare report has the
 *     edge-peak sentence; the contour draws the rectangle and its hover test uses it.
 */
import assert from 'node:assert/strict';
import { crossCheckWrc537Rectangular, solveLugShell } from '../src/app/lafea/lug-shell.js';
import { solveNozzleShell, wrcLoadsToShell } from '../src/app/lafea/nozzle-shell.js';
import { EXAMPLE_CASES, WRC_FE_MODE, calculateWrc537Cases, wrcFeReference } from '../src/app/wrc/wrc-calc.js';
import { buildFeContourHtml, insideAttachment } from '../src/app/wrc/fe-contour.js';
import { buildWrcReportHtml } from '../src/app/wrc/wrc-report.js';

const lug = { ...EXAMPLE_CASES.LUG_200X100 };
const zero = { P: 0, Vc: 0, Vl: 0, Mc: 0, Ml: 0, Mt: 0 };
const options = { plugFactor: 4 };
const mode = (input) => wrcFeReference(input);

// 1. Routing
{
  const compare = mode(lug);
  assert.equal(compare.feMode, WRC_FE_MODE.COMPARE);
  assert.equal(compare.ok, true);
  const kinds = (r) => r.reasons.map((x) => x.kind).sort().join(',');
  const torsion = mode({ ...lug, loads: { ...lug.loads, Mt: 500 } });
  assert.equal(torsion.feMode, WRC_FE_MODE.FE_ONLY);
  assert.equal(kinds(torsion), 'TORSION');
  const thin = mode({ ...lug, attachmentWidth: 28 });
  assert.equal(thin.feMode, WRC_FE_MODE.FE_ONLY);
  assert.equal(kinds(thin), 'RATIO');
  const long = mode({ ...lug, attachmentWidth: 900 });
  assert.equal(long.feMode, WRC_FE_MODE.FE_ONLY, 'β1/β2 above 4');
  const thick = mode({ ...lug, shellOutsideDiameter: 300, shellThickness: 12, cylinderLength: 2000, attachmentStation: 1000, attachmentLength: 60, attachmentWidth: 30 });
  assert.equal(thick.feMode, WRC_FE_MODE.FE_ONLY, `γ 12 non-square with moments: ${kinds(thick)}`);
  assert.equal(kinds(thick), 'GAMMA');
  const big = mode({ ...lug, attachmentLength: 1200, attachmentWidth: 600 });
  assert.equal(big.feMode, WRC_FE_MODE.FE_ONLY, `term β above 0.5: ${kinds(big)}`);
  assert.equal(kinds(big), 'BETA');
  // Not for FE: round attachments, γ outside the curves, length rules, input errors
  assert.equal(mode({ ...EXAMPLE_CASES.CAESAR_GAMMA48, attachmentOutsideDiameter: 20 }).feMode, WRC_FE_MODE.BLOCKED, 'round β below 0.05');
  assert.equal(mode({ ...lug, shellOutsideDiameter: 9000, shellThickness: 12 }).feMode, WRC_FE_MODE.BLOCKED, 'γ above 300');
  assert.equal(mode({ ...lug, cylinderLength: 700, attachmentStation: 350 }).feMode, WRC_FE_MODE.BLOCKED, 'length rule');
  assert.equal(mode({ ...lug, attachmentWidth: 28, cylinderLength: 700, attachmentStation: 350 }).feMode, WRC_FE_MODE.BLOCKED, 'thin plate and a length rule');
  assert.equal(mode({ ...lug, shellThickness: '' }).feMode, WRC_FE_MODE.BLOCKED, 'input error');
  // Pads: FE stands for the pad edge
  const padded = mode({ ...lug, padLength: 300, padWidth: 200, padThickness: 10 });
  assert.equal(padded.feMode, WRC_FE_MODE.COMPARE);
  assert.equal(padded.feLocation.id, 'PAD_EDGE');
  assert.equal(padded.geometry.c2, 150);
  const thinOnPad = mode({ ...lug, attachmentWidth: 28, padLength: 300, padWidth: 200, padThickness: 10 });
  assert.equal(thinOnPad.feMode, WRC_FE_MODE.COMPARE, 'thin plate on a pad: the pad edge is still a WRC 537 case');
  assert.equal(thinOnPad.feLocation.id, 'PAD_EDGE');
  assert.equal(mode({ ...lug, padLength: 300, padWidth: '', padThickness: 10 }).feMode, WRC_FE_MODE.BLOCKED, 'bad pad input');
  const nozzlePad = mode(EXAMPLE_CASES.PAD_36IN);
  assert.equal(nozzlePad.feMode, WRC_FE_MODE.COMPARE);
  assert.equal(nozzlePad.feLocation.id, 'PAD_EDGE');
  // The FE reference never carries pressure or Kn/Kb
  assert.ok(nozzlePad.pressureStress.circumferential === 0 && nozzlePad.stressConcentration.Kn === 1 && nozzlePad.stressConcentration.Kb === 1);
}

// 2. FE only: a thin plate with torsion, through the app path
const thinCase = { ...lug, title: 'Thin plate lug', attachmentWidth: 28, loads: { ...lug.loads, Mt: 800 } };
const thinRef = mode(thinCase);
assert.equal(thinRef.feMode, WRC_FE_MODE.FE_ONLY);
assert.deepEqual(thinRef.reasons.map((x) => x.kind).sort(), ['RATIO', 'TORSION']);
const thin = crossCheckWrc537Rectangular(JSON.parse(JSON.stringify(thinRef)), options);
assert.ok(thin.rows.every((r) => Number.isFinite(r.fe) && r.fe >= 0), 'finite FE stresses');
const thinFrozen = 199.91;
assert.ok(Math.abs(thin.feGoverning.fe - thinFrozen) <= 0.01 * thinFrozen, `thin plate FE max ${thin.feGoverning.fe.toFixed(2)} vs frozen ${thinFrozen}`);
const torsionOnly = solveLugShell(thin.geometry, { Mt: wrcLoadsToShell({ ...zero, Mt: 1e7 }) }, options).cases[0];
assert.ok(torsionOnly.points.every((p) => p.shear > 0), 'thin plate torsion shear positive at all 8 points');

// 3. Square footprint vs the WRC-equivalent round plug, Mc on the lug example's shell
const c = 50;
const shell = { meanRadius: 744, thickness: 12, length: 4000, station: 2000 };
const mc = { Mc: wrcLoadsToShell({ ...zero, Mc: 1e7 }) };
const square = solveLugShell({ ...shell, halfWidth: c, halfLength: c }, mc, options).cases[0];
const round = solveNozzleShell({ ...shell, attachmentRadius: c / 0.875 }, mc, options).cases[0];
const sqMax = Math.max(...square.points.map((p) => p.stressIntensity));
const rdMax = Math.max(...round.points.map((p) => p.stressIntensity));
const midRatio = sqMax / rdMax;
const cornerRatio = square.edgePeak.value / rdMax;
assert.ok(midRatio > 0.45 && midRatio < 0.62, `square mid-edge / round edge ${midRatio.toFixed(3)}`);
assert.ok(cornerRatio > 1.05 && cornerRatio < 1.45, `square corner / round edge ${cornerRatio.toFixed(3)}`);
assert.ok('CD'.includes(square.points.reduce((a, b) => (b.stressIntensity > a.stressIntensity ? b : a)).location[0]), 'Mc governs at C/D on the square');

// 4. Report and contour
const batch = calculateWrc537Cases(thinCase);
const reportOnly = buildWrcReportHtml(batch, { fe: { caseName: 'Case 1', reference: thinRef, result: thin } });
assert.ok(reportOnly.includes('Shell FE result (LAFEA shell solver)'));
assert.ok(reportOnly.includes('FE only: WRC 537 has no result for this attachment (torsion Mt; footprint β1/β2 outside 0.25–4)'));
const feStart = reportOnly.indexOf('Shell FE result');
const feSectionText = reportOnly.slice(feStart, reportOnly.indexOf('<h2>', feStart));
assert.ok(!feSectionText.includes('>WRC 537 SI</th>') && !feSectionText.includes('>FE / WRC</th>'), 'no WRC column in the FE-only section');
assert.ok(feSectionText.includes('Highest element value next to the footprint'));
assert.ok(feSectionText.includes('stiff plate'), 'lug method note');
assert.ok(reportOnly.includes('can be run with the shell FE model alone'));
const html = buildFeContourHtml(thin.field);
assert.equal((html.match(/<rect /g) ?? []).length, 2 * 3, 'background, footprint and frame per plot');
assert.ok(!html.includes('>attachment</text>'), 'no label inside a 28 mm wide plate');
assert.equal(insideAttachment(thin.field, 10, 90), true);
assert.equal(insideAttachment(thin.field, 20, 0), false);
assert.equal(insideAttachment({ attachmentRadius: 50 }, 30, 30), true);
assert.equal(insideAttachment({ attachmentRadius: 50 }, 40, 40), false);

console.log(JSON.stringify({
  check: 'wrc-lug-fe-route', status: 'PASS',
  thinPlate: { feMax: +thin.feGoverning.fe.toFixed(2), at: thin.feGoverning.location, edgePeak: thin.edgePeak.value, mesh: thin.mesh },
  squareVsRound: { squareMidEdge: +sqMax.toFixed(2), squareCorner: square.edgePeak.value, roundEdge: +rdMax.toFixed(2), midRatio: +midRatio.toFixed(3), cornerRatio: +cornerRatio.toFixed(3) },
}));
