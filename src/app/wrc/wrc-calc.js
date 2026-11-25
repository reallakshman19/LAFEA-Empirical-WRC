/**
 * Plain WRC 537 (2013) cylindrical-shell local stress calculator.
 *
 * A thin, engineer-facing wrapper over the verified EMP1 numerics:
 *  - curve ordinates: buildEmp1Wrc537InterpolatedTable5Ordinates (exact γ rows delegate
 *    to the source-qualified selector; other γ are blended between bracket rows)
 *  - stresses:        evaluateEmp1Wrc537CylindricalTable5 (WRC 537 Table 5 superposition)
 *
 * It takes inputs in WRC axes (P, Vc, Vl, Mc, Ml, Mt), so no global-frame transfer is done.
 * Pure function: no DOM, safe to unit-test in Node.
 */
import {
  EMP1_WRC537_GAMMA_INTERPOLATION_POLICY,
  EMP1_WRC537_TABLE5_REQUIRED_FIGURES,
  buildEmp1Wrc537InterpolatedTable5Ordinates,
  emp1Wrc537CommonTabulatedGammas,
} from '../../core/emp1/emp1-wrc537-cylindrical-gamma-interpolation.js';
import {
  EMP1_WRC537_CYL_LOCATIONS,
  emp1Wrc537PlaneStressIntensity as tresca,
  evaluateEmp1Wrc537CylindricalTable5,
} from '../../core/emp1/emp1-wrc537-cylindrical-table5.js';

export const WRC_LOCATIONS = EMP1_WRC537_CYL_LOCATIONS;
export const WRC_BETA_RANGE = Object.freeze({ minimum: 0.05, maximum: 0.5 });
export const WRC_ML_FIGURES = Object.freeze({ circumferential: '1B', longitudinal: '2B' });
export const WRC_GAMMA_GRID = emp1Wrc537CommonTabulatedGammas(
  'ORIGINAL',
  [...EMP1_WRC537_TABLE5_REQUIRED_FIGURES, WRC_ML_FIGURES.circumferential, WRC_ML_FIGURES.longitudinal],
);
export const WRC_COORDINATES = Object.freeze({
  LINEAR_GAMMA: 'Linear in γ: conservative, the default',
  LOG_GAMMA: 'Log γ: best estimate, can be unconservative',
});

export const FORCE_UNITS = Object.freeze({ N: 1, kN: 1000 });
export const MOMENT_UNITS = Object.freeze({ 'N·m': 1000, 'kN·m': 1e6, 'N·mm': 1 });

/** Route tiers, most to least authoritative. */
export const WRC_TIER = Object.freeze({
  SOURCE_QUALIFIED: 'SOURCE_QUALIFIED',
  TABULATED_ROW: 'TABULATED_ROW',
  INTERPOLATED: 'INTERPOLATED',
  BLOCKED: 'BLOCKED',
});

export const WRC_TIER_TEXT = Object.freeze({
  SOURCE_QUALIFIED: 'WRC 537, γ = 5 row: the source-qualified range',
  TABULATED_ROW: 'WRC 537, tabulated γ row. The source does not print the β limit for γ above 5, so 0.05–0.5 is assumed.',
  INTERPOLATED: 'Interpolated γ: engineering judgement, not a WRC rule. Use for screening and review.',
  BLOCKED: 'Not calculated. See the reasons below.',
});

/** How the shell bending stress from external loads is classified for the code check. */
export const WRC_BENDING_CLASS = Object.freeze({
  Q: 'Secondary Q, PL+Pb+Q ≤ SPS (default)',
  PB: 'Primary Pb, PL+Pb ≤ 1.5S (conservative)',
});

export const DEFAULT_CASE = Object.freeze({
  title: 'Nozzle on cylinder',
  shellOutsideDiameter: 1000,
  shellThickness: 12,
  corrosionAllowance: 0,
  attachmentOutsideDiameter: 219.1,
  cylinderLength: 3000,
  attachmentStation: 1500,
  forceUnit: 'N',
  momentUnit: 'N·m',
  loads: Object.freeze({ P: -2000, Vc: 500, Vl: -800, Mc: 1500, Ml: -2500, Mt: 1000 }),
  coordinate: 'LINEAR_GAMMA',
  designPressure: 0,
  Kn: 1,
  Kb: 1,
  allowableS: '',
  allowableSps: '',
  bendingClass: 'Q',
});

/** Reference cases, each with independently known answers (see scripts/wrc-calculator-check.mjs). */
export const EXAMPLE_CASES = Object.freeze({
  GAMMA5_ORACLE: Object.freeze({
    title: 'WRC 537 γ = 5 reference case (independent hand calc: Au = 72.67 MPa)',
    shellOutsideDiameter: 220,
    shellThickness: 20,
    corrosionAllowance: 0,
    attachmentOutsideDiameter: 2 * 17.714285714285715,
    cylinderLength: 300,
    attachmentStation: 80,
    forceUnit: 'N',
    momentUnit: 'N·mm',
    loads: Object.freeze({ P: -1000, Vc: 250, Vl: -400, Mc: 500000, Ml: -600000, Mt: 700000 }),
    coordinate: 'LINEAR_GAMMA',
  }),
  CAESAR_GAMMA48: Object.freeze({
    title: 'CAESAR II 2017 WRC benchmark, γ = 48 (governing Du = 1.754 MPa in CAESAR II)',
    shellOutsideDiameter: 1844,
    shellThickness: 19,
    corrosionAllowance: 0,
    attachmentOutsideDiameter: 323.85,
    cylinderLength: 6000,
    attachmentStation: 3000,
    forceUnit: 'N',
    momentUnit: 'N·mm',
    loads: Object.freeze({ P: -161, Vc: -53, Vl: -2109, Mc: 121000, Ml: 33000, Mt: -775000 }),
    coordinate: 'LINEAR_GAMMA',
  }),
});

const LOAD_KEYS = Object.freeze(['P', 'Vc', 'Vl', 'Mc', 'Ml', 'Mt']);
const FORCE_KEYS = new Set(['P', 'Vc', 'Vl']);

/** Derived geometry, available even when the stress calculation is blocked. */
export function deriveWrcGeometry(input) {
  const OD = num(input.shellOutsideDiameter);
  const tn = num(input.shellThickness);
  const ca = num(input.corrosionAllowance ?? 0);
  const dA = num(input.attachmentOutsideDiameter);
  const T = tn - ca; // corroded wall
  const Rm = (OD - T) / 2; // mean radius of the corroded wall (bore grows by CA)
  const r0 = dA / 2;
  const gamma = Rm / T;
  const beta = 0.875 * r0 / Rm;
  const L = num(input.cylinderLength);
  const x = num(input.attachmentStation);
  const endDistance = Number.isFinite(L) && Number.isFinite(x) ? Math.min(x, L - x) : NaN;
  return { OD, tn, ca, T, Rm, r0, gamma, beta, L, x, endDistance };
}

/** Convert user-unit loads to N and N·mm. */
export function loadsToBase(input) {
  const f = FORCE_UNITS[input.forceUnit] ?? NaN;
  const m = MOMENT_UNITS[input.momentUnit] ?? NaN;
  return Object.fromEntries(LOAD_KEYS.map((k) => [k, num(input.loads?.[k] ?? 0) * (FORCE_KEYS.has(k) ? f : m)]));
}

/** Classify γ against the tabulated grid. */
export function classifyGamma(gamma) {
  const grid = WRC_GAMMA_GRID;
  const exact = grid.find((g) => Math.abs(g - gamma) <= 1e-9 * Math.max(1, g));
  if (exact === 5) return { tier: WRC_TIER.SOURCE_QUALIFIED, exact };
  if (exact !== undefined) return { tier: WRC_TIER.TABULATED_ROW, exact };
  if (gamma < grid[0] || gamma > grid[grid.length - 1]) return { tier: WRC_TIER.BLOCKED };
  const i = grid.findIndex((g) => g > gamma);
  return { tier: WRC_TIER.INTERPOLATED, lower: grid[i - 1], upper: grid[i] };
}

/**
 * Run the calculation. Never throws for engineering-range problems: those come back as
 * `blocked` reasons in plain language, each with a suggested fix.
 */
export function calculateWrc537(input) {
  const geometry = deriveWrcGeometry(input);
  const loads = loadsToBase(input);
  const reasons = [];
  const warnings = [];
  const g = geometry;

  // Input sanity
  for (const [key, label] of [['OD', 'Shell outside diameter'], ['tn', 'Shell thickness'], ['r0', 'Attachment outside diameter']]) {
    if (!(g[key] > 0)) reasons.push(reason('INPUT', `${label} must be a positive number.`));
  }
  if (!(g.ca >= 0)) reasons.push(reason('INPUT', 'Corrosion allowance must be zero or positive.'));
  if (g.tn > 0 && g.ca >= g.tn) reasons.push(reason('INPUT', 'Corrosion allowance must be less than the shell thickness.'));
  if (g.T > 0 && g.OD > 0 && 2 * g.T >= g.OD) reasons.push(reason('INPUT', 'The wall is thicker than the radius: check the diameter and thickness.'));
  for (const k of LOAD_KEYS) {
    if (!Number.isFinite(loads[k])) reasons.push(reason('INPUT', `Load ${k} must be a number (use 0 if none).`));
  }
  if (!FORCE_UNITS[input.forceUnit] || !MOMENT_UNITS[input.momentUnit]) reasons.push(reason('INPUT', 'Choose force and moment units.'));
  const coordinate = WRC_COORDINATES[input.coordinate] ? input.coordinate : 'LINEAR_GAMMA';
  const Kn = numOr(input.Kn, 1);
  const Kb = numOr(input.Kb, 1);
  const pressure = numOr(input.designPressure, 0);
  if (!(Kn > 0) || !(Kb > 0)) reasons.push(reason('INPUT', 'Kn and Kb must be positive numbers (use 1 if you have no value).'));
  if (!Number.isFinite(pressure)) reasons.push(reason('INPUT', 'Design pressure must be a number (use 0 if none).'));

  let gammaClass = { tier: WRC_TIER.BLOCKED };
  if (!reasons.length) {
    gammaClass = classifyGamma(g.gamma);
    if (gammaClass.tier === WRC_TIER.BLOCKED) {
      reasons.push(reason('GAMMA',
        `γ = Rm/T = ${fmt(g.gamma, 1)} is outside the WRC 537 curves (γ ${WRC_GAMMA_GRID[0]} to ${WRC_GAMMA_GRID.at(-1)}).`,
        g.gamma < WRC_GAMMA_GRID[0]
          ? 'The shell is too thick for WRC 537. Use FE (LAFEA) instead.'
          : 'The shell is too thin for WRC 537. Use FE (LAFEA) instead.'));
    }
    if (!(g.beta >= WRC_BETA_RANGE.minimum && g.beta <= WRC_BETA_RANGE.maximum)) {
      const lowHigh = g.beta < WRC_BETA_RANGE.minimum ? 'small' : 'large';
      reasons.push(reason('BETA',
        `β = 0.875·r0/Rm = ${fmt(g.beta, 3)} is outside 0.05–0.5: the attachment is too ${lowHigh} for this shell.`,
        `Attachment OD must lie between ${fmt(2 * WRC_BETA_RANGE.minimum * g.Rm / 0.875, 1)} and ${fmt(2 * WRC_BETA_RANGE.maximum * g.Rm / 0.875, 1)} mm for this shell.`));
    }
    // WRC 537 §4.5.2 cylinder-length rules (only checked when a length is given)
    const hasLength = Number.isFinite(g.L) && g.L > 0;
    if (hasLength) {
      if (!(g.x >= 0 && g.x <= g.L)) {
        reasons.push(reason('LENGTH', 'The attachment position must lie between 0 and the cylinder length.'));
      } else {
        if (loads.P !== 0 && g.L < g.Rm) {
          reasons.push(reason('LENGTH',
            `Cylinder length ${fmt(g.L, 0)} mm is less than Rm = ${fmt(g.Rm, 1)} mm, so WRC 537 §4.5.2 does not allow a radial load P.`,
            'Use a longer cylinder (the distance between stiffeners or heads), or set P = 0.'));
        }
        if ((loads.Mc !== 0 || loads.Ml !== 0) && g.endDistance < 0.5 * g.Rm) {
          reasons.push(reason('LENGTH',
            `The attachment is ${fmt(g.endDistance, 0)} mm from the nearest cylinder end, which is under 0.5·Rm = ${fmt(0.5 * g.Rm, 1)} mm. WRC 537 §4.5.2 does not allow Mc or Ml there.`,
            'Move the attachment further from the end, or use FE (LAFEA).'));
        }
      }
    } else {
      warnings.push('No cylinder length was given, so the §4.5.2 length and end-distance limits were not checked.');
    }
  }

  const base = { input: structuredCloneSafe(input), geometry, loadsBase: loads, coordinate, gammaClass };
  if (reasons.length) {
    return { ...base, ok: false, tier: WRC_TIER.BLOCKED, reasons, warnings };
  }

  let ordinateSet;
  try {
    ordinateSet = buildEmp1Wrc537InterpolatedTable5Ordinates({
      variant: 'ORIGINAL',
      gamma: g.gamma,
      beta: g.beta,
      coordinate,
      betaDomain: { basis: 'OWNER_DECLARED', ...WRC_BETA_RANGE },
      longitudinalMomentFigures: WRC_ML_FIGURES,
    });
  } catch (error) {
    return { ...base, ok: false, tier: WRC_TIER.BLOCKED, reasons: [explainCoreError(error)], warnings };
  }
  const table5 = evaluateEmp1Wrc537CylindricalTable5({
    geometry: { meanRadius: g.Rm, shellThickness: g.T, attachmentRadius: g.r0, beta: g.beta },
    stressConcentration: { Kn, Kb },
    loads,
    curveOrdinates: ordinateSet.ordinates,
  });
  const s = table5.stresses;
  const c = table5.components;
  // Thin-shell pressure membrane stress, added at every point on both surfaces.
  const pressureStress = { circumferential: pressure * g.Rm / g.T, longitudinal: pressure * g.Rm / (2 * g.T) };
  const rows = WRC_LOCATIONS.map((location, i) => {
    const circumferential = s.circumferential[i] + pressureStress.circumferential;
    const longitudinal = s.longitudinal[i] + pressureStress.longitudinal;
    const membraneCirc = c.circumferential.Pmem[i] + c.circumferential.Mcmem[i] + c.circumferential.Mlmem[i] + pressureStress.circumferential;
    const membraneLong = c.longitudinal.Pmem[i] + c.longitudinal.Mcmem[i] + c.longitudinal.Mlmem[i] + pressureStress.longitudinal;
    return {
      location,
      circumferential,
      longitudinal,
      shear: s.shear[i],
      stressIntensity: pressure === 0 ? s.stressIntensity[i] : tresca(circumferential, longitudinal, s.shear[i]),
      membraneIntensity: tresca(membraneCirc, membraneLong, s.shear[i]),
    };
  });
  const governing = rows.reduce((best, row) => (row.stressIntensity > best.stressIntensity ? row : best), rows[0]);
  if (pressure !== 0) {
    warnings.push(`Pressure ${fmt(pressure, 3)} MPa adds thin-shell membrane stress p·Rm/T = ${fmt(pressureStress.circumferential, 2)} MPa (hoop) and p·Rm/2T = ${fmt(pressureStress.longitudinal, 2)} MPa (longitudinal) at every point. `
      + 'This is common practice, not part of WRC 537. The extra pressure stress at the edge of the opening is not included: check it with the code nozzle rules or FE.');
  }
  if (Kn !== 1 || Kb !== 1) {
    warnings.push(`User-supplied stress concentration factors: Kn = ${fmt(Kn, 3)} (membrane), Kb = ${fmt(Kb, 3)} (bending). They multiply the WRC load stresses only, not the pressure or shear stress.`);
  }
  const codeCheck = buildCodeCheck(rows, governing, { pressure, g, input });
  if (gammaClass.tier === WRC_TIER.INTERPOLATED) {
    warnings.push(`γ ${fmt(g.gamma, 2)} lies between tabulated rows γ = ${gammaClass.lower} and ${gammaClass.upper}. `
      + `Curve values were blended (${coordinate === 'LINEAR_GAMMA' ? 'linear in γ' : 'log γ'}).`);
  }
  if (gammaClass.tier !== WRC_TIER.SOURCE_QUALIFIED) {
    warnings.push('The β limit of 0.05–0.5 is printed in WRC 537 only for γ = 5. Here it is an assumed limit.');
  }
  return {
    ...base,
    ok: true,
    tier: gammaClass.tier,
    reasons: [],
    warnings,
    ordinates: ordinateSet.ordinates,
    provenance: ordinateSet.provenance,
    scale: table5.scale,
    components: table5.components,
    rows,
    governing,
    pressureStress,
    stressConcentration: { Kn, Kb },
    codeCheck,
    policy: { coordinate, interpolationPolicy: EMP1_WRC537_GAMMA_INTERPOLATION_POLICY.basis },
  };
}

/**
 * Code check against user-entered allowables, using the ASME VIII-2 Part 5 stress categories:
 *  - Pm      (pressure hoop membrane, thin shell)     <= S
 *  - PL      (membrane at the attachment, all points) <= 1.5 S
 *  - PL+Pb+Q (total, all points)                      <= SPS (default 3 S), when load bending is Q
 *  - PL+Pb   (total, all points)                      <= 1.5 S, when load bending is treated as primary
 * Returns null when no allowable S has been entered.
 */
function buildCodeCheck(rows, governing, { pressure, g, input }) {
  const S = num(input.allowableS);
  if (!(S > 0)) return null;
  const SpsIn = num(input.allowableSps);
  const Sps = SpsIn > 0 ? SpsIn : 3 * S;
  const bendingClass = WRC_BENDING_CLASS[input.bendingClass] ? input.bendingClass : 'Q';
  const membrane = rows.reduce((best, row) => (row.membraneIntensity > best.membraneIntensity ? row : best), rows[0]);
  const item = (id, label, value, location, limit, limitText) => ({
    id, label, value, location, limit, limitText, ratio: value / limit, pass: value <= limit,
  });
  const items = [
    item('PM', 'Pm, general primary membrane (pressure only)', Math.abs(pressure) * g.Rm / g.T, '—', S, 'S'),
    item('PL', 'PL, local primary membrane', membrane.membraneIntensity, membrane.location, 1.5 * S, '1.5 S'),
    bendingClass === 'Q'
      ? item('PLPBQ', 'PL + Pb + Q, total', governing.stressIntensity, governing.location, Sps, SpsIn > 0 ? 'SPS' : 'SPS = 3 S')
      : item('PLPB', 'PL + Pb, total (load bending treated as primary)', governing.stressIntensity, governing.location, 1.5 * S, '1.5 S'),
  ];
  const worst = items.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  return { S, Sps, bendingClass, items, pass: items.every((i) => i.pass), worst };
}

/**
 * Run several load cases on one geometry. `input.loadCases` = [{ name, loads }]; when absent,
 * `input.loads` is the only case. Returns each case's result plus an envelope.
 */
export function calculateWrc537Cases(input) {
  const list = Array.isArray(input.loadCases) && input.loadCases.length
    ? input.loadCases
    : [{ name: 'Case 1', loads: input.loads }];
  const cases = list.map((c, index) => ({
    name: String(c?.name || `Case ${index + 1}`),
    result: calculateWrc537({ ...input, loads: c?.loads ?? {} }),
  }));
  const ok = cases.filter((c) => c.result.ok);
  const governing = ok.reduce((best, c) => (best && best.result.governing.stressIntensity >= c.result.governing.stressIntensity ? best : c), null);
  const checked = ok.filter((c) => c.result.codeCheck);
  const worstCheck = checked.reduce((a, b) => (a && a.result.codeCheck.worst.ratio >= b.result.codeCheck.worst.ratio ? a : b), null);
  return {
    cases,
    allCalculated: ok.length === cases.length,
    governing: governing
      ? { name: governing.name, location: governing.result.governing.location, stressIntensity: governing.result.governing.stressIntensity }
      : null,
    codeCheck: worstCheck
      ? { pass: checked.length === cases.length && checked.every((c) => c.result.codeCheck.pass), worstCase: worstCheck.name, worst: worstCheck.result.codeCheck.worst }
      : null,
  };
}

function explainCoreError(error) {
  const code = String(error?.code ?? error?.message ?? error);
  if (code.includes('MATERIAL_SIGN_CHANGE')) {
    return reason('CURVE',
      'One of the WRC curves changes sign between the two γ rows used for interpolation, so blending them could understate the stress.',
      'Use the nearest tabulated γ (5, 15, 50, 100 or 300) as a bound, or use FE (LAFEA).');
  }
  if (code.includes('DENOMINATOR') || code.includes('RESULT_INVALID')) {
    return reason('CURVE', 'A WRC curve fit cannot be evaluated at this β.', 'Change the attachment size slightly, or use FE (LAFEA).');
  }
  return reason('CURVE', `The WRC curve evaluation was refused (${code}).`, 'Check the inputs.');
}

function reason(kind, text, fix = '') { return { kind, text, fix }; }
function numOr(value, fallback) { return value === '' || value == null ? fallback : num(value); }
function num(value) { return typeof value === 'number' ? value : (value === '' || value == null ? NaN : Number(value)); }
export function fmt(value, digits = 2) { return Number.isFinite(value) ? value.toFixed(digits) : '—'; }
function structuredCloneSafe(value) { try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); } }
