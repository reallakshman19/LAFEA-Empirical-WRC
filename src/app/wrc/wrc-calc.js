/**
 * Plain WRC 537 (2013) cylindrical-shell local stress calculator.
 *
 * calculateWrc537 checks one shell location. calculateWrcAttachment adds the optional reinforcing
 * pad (two locations: at the attachment with shell + pad, and at the pad edge), and
 * calculateWrc537Cases runs every load case through it.
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
  classifyEmp1Wrc537BracketSignChange,
  emp1Wrc537CommonTabulatedGammas,
  evaluateEmp1Wrc537InterpolatedOrdinate,
} from '../../core/emp1/emp1-wrc537-cylindrical-gamma-interpolation.js';
import {
  EMP1_WRC537_CYL_LOCATIONS,
  emp1Wrc537PlaneStressIntensity as tresca,
  evaluateEmp1Wrc537CylindricalTable5,
} from '../../core/emp1/emp1-wrc537-cylindrical-table5.js';
import { WRC537_RECT_RATIO_RANGE, rectangularTerms } from './wrc537-rectangular.js';

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

export const WRC_ATTACHMENT_TYPES = Object.freeze({
  ROUND: 'Round (nozzle, trunnion)',
  RECTANGULAR: 'Rectangular (lug, plate)',
});

export const WRC_RECT_METHOD_TEXT = 'Rectangular attachment: WRC 537 §4.2.2 gives each load and stress component its own β '
  + '(equations 28–30 with Table 6 for P; Tables 7 and 8 for Mc and ML), read on the same curves as a round attachment. '
  + 'Shear is Vc/(4·c1·T) and VL/(4·c2·T) (equations 50–51).';

/** Where the shell is checked. Without a pad there is one location; with a pad there are two. */
export const WRC_LOCATION_TEXT = Object.freeze({
  ATTACHMENT: 'At the attachment',
  JUNCTION: 'At the attachment (shell + pad)',
  PAD_EDGE: 'At the pad edge (shell only)',
});

export const WRC_PAD_METHOD_TEXT = 'Reinforcing pad: WRC 537 itself has no pad rule (it lists pad guidance as future work). '
  + 'The shell is checked twice, as PV Elite and similar programs do: at the attachment with the shell and pad '
  + 'thicknesses added, and at the pad edge with the shell alone and the pad (its diameter, or its length and width) as the attachment. '
  + 'This assumes the pad is fully welded and acts with the shell. It is common practice, not a WRC rule.';

export const DEFAULT_CASE = Object.freeze({
  title: 'Nozzle on cylinder',
  shellOutsideDiameter: 1000,
  shellThickness: 12,
  corrosionAllowance: 0,
  attachmentType: 'ROUND',
  attachmentOutsideDiameter: 219.1,
  attachmentLength: '',
  attachmentWidth: '',
  padOutsideDiameter: '',
  padLength: '',
  padWidth: '',
  padThickness: '',
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
  PAD_36IN: Object.freeze({
    title: '36-inch nozzle with reinforcing pad (geometry of the PV Elite WRC 297 reference)',
    shellOutsideDiameter: 2161,
    shellThickness: 25,
    corrosionAllowance: 0,
    attachmentOutsideDiameter: 914.4,
    padOutsideDiameter: 1064.4,
    padThickness: 25,
    cylinderLength: '',
    attachmentStation: '',
    forceUnit: 'N',
    momentUnit: 'N·m',
    loads: Object.freeze({ P: -25926.99, Vc: 22115.01, Vl: 69592.96, Mc: -45209.96, Ml: 78037.98, Mt: 101000.95 }),
    coordinate: 'LINEAR_GAMMA',
    designPressure: 0.5237,
    Kn: 1.2,
    Kb: 1.2,
  }),
  LUG_200X100: Object.freeze({
    title: 'Lug footprint 200 mm along × 100 mm around the shell',
    shellOutsideDiameter: 1500,
    shellThickness: 12,
    corrosionAllowance: 0,
    attachmentType: 'RECTANGULAR',
    attachmentLength: 200,
    attachmentWidth: 100,
    cylinderLength: 4000,
    attachmentStation: 2000,
    forceUnit: 'N',
    momentUnit: 'N·m',
    loads: Object.freeze({ P: -5000, Vc: 1000, Vl: -3000, Mc: 1000, Ml: -4000, Mt: 0 }),
    coordinate: 'LINEAR_GAMMA',
  }),
});

export function isRectangular(input) { return input?.attachmentType === 'RECTANGULAR'; }

const LOAD_KEYS = Object.freeze(['P', 'Vc', 'Vl', 'Mc', 'Ml', 'Mt']);
const FORCE_KEYS = new Set(['P', 'Vc', 'Vl']);

/** Derived geometry, available even when the stress calculation is blocked. */
export function deriveWrcGeometry(input) {
  const OD = num(input.shellOutsideDiameter);
  const tn = num(input.shellThickness);
  const ca = num(input.corrosionAllowance ?? 0);
  const T = tn - ca; // corroded wall
  const Rm = (OD - T) / 2; // mean radius of the corroded wall (bore grows by CA)
  const gamma = Rm / T;
  const L = num(input.cylinderLength);
  const x = num(input.attachmentStation);
  const endDistance = Number.isFinite(L) && Number.isFinite(x) ? Math.min(x, L - x) : NaN;
  if (isRectangular(input)) {
    // WRC 537 (28): c1 half-length around the shell, c2 half-length along it.
    const c1 = num(input.attachmentWidth) / 2;
    const c2 = num(input.attachmentLength) / 2;
    const beta1 = c1 / Rm;
    const beta2 = c2 / Rm;
    return { rectangular: true, OD, tn, ca, T, Rm, c1, c2, beta1, beta2, ratio: beta1 / beta2, r0: NaN, gamma, beta: NaN, L, x, endDistance };
  }
  const r0 = num(input.attachmentOutsideDiameter) / 2;
  const beta = 0.875 * r0 / Rm;
  return { rectangular: false, OD, tn, ca, T, Rm, r0, gamma, beta, L, x, endDistance };
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
  const sizeFields = g.rectangular
    ? [['c2', 'Attachment length along the shell'], ['c1', 'Attachment width around the shell']]
    : [['r0', 'Attachment outside diameter']];
  for (const [key, label] of [['OD', 'Shell outside diameter'], ['tn', 'Shell thickness'], ...sizeFields]) {
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
    if (g.rectangular) {
      reasons.push(...rectangularRangeReasons(g, loads, input.coordinate === 'LOG_GAMMA' ? 'LOG_GAMMA' : 'LINEAR_GAMMA', gammaClass));
    } else if (!(g.beta >= WRC_BETA_RANGE.minimum && g.beta <= WRC_BETA_RANGE.maximum)) {
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

  let evaluated;
  try {
    evaluated = g.rectangular ? evaluateRectangular(g, loads, coordinate, Kn, Kb) : evaluateRound(g, loads, coordinate, Kn, Kb);
  } catch (error) {
    return { ...base, ok: false, tier: WRC_TIER.BLOCKED, reasons: [explainCoreError(error)], warnings };
  }
  const s = evaluated.stresses;
  const c = evaluated.components;
  if (g.rectangular) warnings.push(...rectangularWarnings(evaluated.rectangular, loads));
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
    ordinates: evaluated.ordinates,
    provenance: evaluated.provenance,
    scale: evaluated.scale,
    components: evaluated.components,
    rectangular: evaluated.rectangular ?? null,
    rows,
    governing,
    pressureStress,
    stressConcentration: { Kn, Kb },
    codeCheck,
    policy: { coordinate, interpolationPolicy: EMP1_WRC537_GAMMA_INTERPOLATION_POLICY.basis },
  };
}

/** Round attachment: one β for every curve, WRC 537 Table 5. */
function evaluateRound(g, loads, coordinate, Kn, Kb) {
  const ordinateSet = buildEmp1Wrc537InterpolatedTable5Ordinates({
    variant: 'ORIGINAL',
    gamma: g.gamma,
    beta: g.beta,
    coordinate,
    betaDomain: { basis: 'OWNER_DECLARED', ...WRC_BETA_RANGE },
    longitudinalMomentFigures: WRC_ML_FIGURES,
  });
  const table5 = evaluateEmp1Wrc537CylindricalTable5({
    geometry: { meanRadius: g.Rm, shellThickness: g.T, attachmentRadius: g.r0, beta: g.beta },
    stressConcentration: { Kn, Kb },
    loads,
    curveOrdinates: ordinateSet.ordinates,
  });
  return { ordinates: ordinateSet.ordinates, provenance: ordinateSet.provenance, scale: table5.scale, components: table5.components, stresses: table5.stresses };
}

/** The figure for each Table 5 term: the same map as buildEmp1Wrc537InterpolatedTable5Ordinates, ML bending 1B/2B. */
const TABLE5_FIGURES = Object.freeze({
  circ: Object.freeze({ Pmem_AB: '4C', Pmem_CD: '3C', Pbend_AB: '2C-1', Pbend_CD: '1C', Mcmem: '3A', Mcbend: '1A', Mlmem: '3B', Mlbend: WRC_ML_FIGURES.circumferential }),
  long: Object.freeze({ Pmem_AB: '3C', Pmem_CD: '4C', Pbend_AB: '1C-1', Pbend_CD: '2C', Mcmem: '4A', Mcbend: '2A', Mlmem: '4B', Mlbend: WRC_ML_FIGURES.longitudinal }),
});
const TABLE5_ALL_FIGURES = Object.freeze([...EMP1_WRC537_TABLE5_REQUIRED_FIGURES, WRC_ML_FIGURES.circumferential, WRC_ML_FIGURES.longitudinal]);
const ZERO_LOADS = Object.freeze({ P: 0, Vc: 0, Vl: 0, Mc: 0, Ml: 0, Mt: 0 });

/**
 * Rectangular attachment: each term is read at its own β (wrc537-rectangular.js) and scaled by its own
 * β in the stress formula. The verified Table 5 evaluator is reused for the signs and the superposition:
 * it is called with β = 1, so each moment ordinate passed in is (curve value × C) / β_term, which gives
 * σ = value · C · M / (Rm² β_term T) for membrane and 6 · value · M / (Rm β_term T²) for bending.
 * Shear (50–51) is evaluated through the same core with an equivalent radius: π·r·T = 4·c·T.
 */
function evaluateRectangular(g, loads, coordinate, Kn, Kb) {
  const rect = rectangularTerms({ beta1: g.beta1, beta2: g.beta2, gamma: g.gamma, coordinate });
  const ordinates = { circ: {}, long: {} };
  const provenance = { circ: {}, long: {} };
  const raw = { circ: {}, long: {} };
  for (const family of ['circ', 'long']) {
    for (const [key, figure] of Object.entries(TABLE5_FIGURES[family])) {
      const term = rect.terms[family][key];
      if (loads[term.load] === 0) {
        ordinates[family][key] = 0;
        provenance[family][key] = { figure, y: 0, interpolationUsed: false, unused: true, ...termInfo(term) };
        continue;
      }
      const ev = evaluateEmp1Wrc537InterpolatedOrdinate({
        figure, variant: 'ORIGINAL', gamma: g.gamma, beta: term.beta, coordinate,
        betaDomain: { basis: 'OWNER_DECLARED', ...WRC_BETA_RANGE }, figures: TABLE5_ALL_FIGURES,
      });
      const magnitude = Math.abs(ev.y) * term.factor;
      ordinates[family][key] = term.load === 'P' ? magnitude : magnitude / term.beta;
      provenance[family][key] = { figure: ev.figure, y: ev.y, interpolationUsed: ev.interpolationUsed, unused: false, ...termInfo(term) };
      raw[family][key] = ev;
    }
  }
  // Same fail-closed rule as the round route: a curve that changes sign between the γ rows, while carrying a
  // material share of its family, could cancel towards zero.
  for (const family of ['circ', 'long']) {
    const evs = Object.entries(raw[family]);
    const familyMaximum = Math.max(0, ...evs.map(([, ev]) => Math.abs(ev.y)));
    const material = evs.filter(([, ev]) => ev.signChange?.signChange
      && classifyEmp1Wrc537BracketSignChange(ev.bracketOrdinates.lowerY, ev.bracketOrdinates.upperY, familyMaximum).material === true);
    if (material.length) {
      const error = new Error(`EMP1_WRC537_GAMMA_INTERP_MATERIAL_SIGN_CHANGE_ACROSS_BRACKET:${material.map(([k]) => `${family}.${k}`).join(',')}`);
      error.code = error.message;
      throw error;
    }
  }
  const core = (attachmentRadius, coreLoads) => evaluateEmp1Wrc537CylindricalTable5({
    geometry: { meanRadius: g.Rm, shellThickness: g.T, attachmentRadius, beta: 1 },
    stressConcentration: { Kn, Kb },
    loads: coreLoads,
    curveOrdinates: ordinates,
  });
  const normal = core(1, { ...loads, Vc: 0, Vl: 0, Mt: 0 });
  const vc = core(4 * g.c1 / Math.PI, { ...ZERO_LOADS, Vc: loads.Vc }).components.shear.Vc; // τ = Vc/(4·c1·T), eq. 50
  const vl = core(4 * g.c2 / Math.PI, { ...ZERO_LOADS, Vl: loads.Vl }).components.shear.Vl; // τ = VL/(4·c2·T), eq. 51
  const mt = WRC_LOCATIONS.map(() => 0); // blocked before this point unless Mt = 0
  const shear = WRC_LOCATIONS.map((_, i) => vc[i] + vl[i]);
  const { circumferential, longitudinal } = normal.stresses;
  return {
    ordinates,
    provenance,
    scale: { vcShear: Math.abs(loads.Vc) / (4 * g.c1 * g.T), vlShear: Math.abs(loads.Vl) / (4 * g.c2 * g.T), note: 'Moment terms use each term\'s own β; see provenance.' },
    components: { circumferential: normal.components.circumferential, longitudinal: normal.components.longitudinal, shear: { Vc: vc, Vl: vl, Mt: mt } },
    stresses: {
      circumferential,
      longitudinal,
      shear,
      stressIntensity: WRC_LOCATIONS.map((_, i) => tresca(circumferential[i], longitudinal[i], shear[i])),
    },
    rectangular: { ratio: rect.ratio, beta1: g.beta1, beta2: g.beta2, terms: rect.terms },
  };
}

function termInfo(term) {
  return {
    load: term.load, component: term.component, beta: term.beta, factor: term.factor, tableFactor: term.tableFactor ?? null, basis: term.basis,
    factorApproximate: Boolean(term.factorApproximate), factorInterpolated: Boolean(term.factorInterpolated),
  };
}

/** Blocking rules for a rectangular attachment that WRC 537 states (§4.2.2, §4.3.4, Tables 6–8). */
function rectangularRangeReasons(g, loads, coordinate, gammaClass) {
  const out = [];
  const range = WRC537_RECT_RATIO_RANGE;
  if (loads.Mt !== 0) {
    out.push(reason('TORSION',
      'WRC 537 §4.3.4 gives no method for torsion Mt on a rectangular attachment ("acceptable methods of analyzing this situation are not available").',
      'Check the torsion by FE (LAFEA) or test, as the bulletin says. Run the other loads here with Mt = 0 only if you assess the torsion separately.'));
  }
  if (!(g.ratio >= range.minimum - 1e-12 && g.ratio <= range.maximum + 1e-12)) {
    out.push(reason('RATIO',
      `The footprint shape β1/β2 = c1/c2 = ${fmt(g.ratio, 3)} is outside 0.25–4, where WRC 537 Tables 6–8 hold. A thin plate welded straight to the shell is usually outside it.`,
      `Width around the shell must be between ${fmt(range.minimum * 2 * g.c2, 1)} and ${fmt(range.maximum * 2 * g.c2, 1)} mm for this length. Otherwise use FE (LAFEA). A pad does not help here: at the lug the footprint is still the plate.`));
    return out;
  }
  if (gammaClass.tier === WRC_TIER.BLOCKED) return out;
  const square = Math.abs(g.ratio - 1) <= 1e-9;
  if (!square && (loads.Mc !== 0 || loads.Ml !== 0) && g.gamma < 15 - 1e-9) {
    out.push(reason('GAMMA',
      `γ = ${fmt(g.gamma, 1)}: WRC 537 Tables 7 and 8 (the Mc and ML factors for a non-square attachment) start at γ = 15.`,
      'Use FE (LAFEA), or a square footprint, for Mc or ML on this shell.'));
    return out;
  }
  const rect = rectangularTerms({ beta1: g.beta1, beta2: g.beta2, gamma: g.gamma, coordinate });
  const outside = [];
  for (const family of ['circ', 'long']) {
    for (const [key, term] of Object.entries(rect.terms[family])) {
      if (loads[term.load] === 0) continue;
      if (!(term.beta >= WRC_BETA_RANGE.minimum && term.beta <= WRC_BETA_RANGE.maximum)) outside.push({ key, term });
    }
  }
  if (outside.length) {
    const worst = outside.reduce((a, b) => (Math.abs(Math.log(b.term.beta / 0.2)) > Math.abs(Math.log(a.term.beta / 0.2)) ? b : a));
    const lowHigh = worst.term.beta < WRC_BETA_RANGE.minimum ? 'small' : 'large';
    const list = [...new Set(outside.map((o) => `${o.term.load} ${o.term.component} β = ${fmt(o.term.beta, 3)}`))].join('; ');
    out.push(reason('BETA',
      `The equivalent β for some terms is outside the curves' 0.05–0.5: ${list}. The footprint is too ${lowHigh} for this shell.`,
      'Change the footprint size, or use FE (LAFEA).'));
  }
  return out;
}

function rectangularWarnings(rect, loads) {
  const used = ['circ', 'long'].flatMap((f) => Object.values(rect.terms[f])).filter((t) => loads[t.load] !== 0);
  const out = [WRC_RECT_METHOD_TEXT];
  const moments = used.filter((t) => t.load !== 'P');
  if (moments.some((t) => t.factorInterpolated)) {
    out.push(`Table 7/8 factors for β1/β2 = ${fmt(rect.ratio, 3)} were interpolated between the printed rows (in γ, and in log β1/β2 with factor 1 for a square). This is engineering judgement, not a WRC rule.`);
  }
  if (moments.some((t) => t.factorApproximate)) {
    out.push('Some Table 7/8 factors used are printed in parentheses in WRC 537: "determined by an approximate solution".');
  }
  out.push('Radial-load K factors (Table 6) are applied per stress component (Nφ, Nx, Mφ, Mx) at every point. Table 6 is stated to hold approximately for 4 ≥ β1/β2 ≥ 0.25.');
  return out;
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

/** Pad fields for the attachment type: a round pad for a round attachment, a rectangular pad for a rectangular one. */
function padFields(input) {
  return isRectangular(input) ? [input.padLength, input.padWidth, input.padThickness] : [input.padOutsideDiameter, input.padThickness];
}

/** True when any pad field holds a non-zero value. Blank or 0 in all of them means no pad. */
export function hasPad(input) {
  return padFields(input).some((v) => !(v === '' || v == null || Number(v) === 0));
}

/**
 * The shell locations to check, each as an equivalent plain WRC 537 input.
 *  - no pad:   ATTACHMENT, the input itself.
 *  - with pad: JUNCTION, the wall thickened by the pad on the outside (OD + 2·tp, t + tp), round attachment as given;
 *              PAD_EDGE, the shell alone with the pad diameter as the attachment.
 * Corrosion stays on the inside of the shell, so the junction wall is T = t − CA + tp and
 * Rm = (OD − T + tp)/2: the mean radius of the combined wall (PV Elite: D = 2161 for ID 2111, T 25 + pad 25).
 */
export function wrcLocationInputs(input) {
  if (!hasPad(input)) return [{ id: 'ATTACHMENT', label: WRC_LOCATION_TEXT.ATTACHMENT, input }];
  const tp = num(input.padThickness);
  return [
    {
      id: 'JUNCTION',
      label: WRC_LOCATION_TEXT.JUNCTION,
      input: { ...input, shellOutsideDiameter: num(input.shellOutsideDiameter) + 2 * tp, shellThickness: num(input.shellThickness) + tp },
    },
    {
      id: 'PAD_EDGE',
      label: WRC_LOCATION_TEXT.PAD_EDGE,
      input: isRectangular(input)
        ? { ...input, attachmentLength: num(input.padLength), attachmentWidth: num(input.padWidth) }
        : { ...input, attachmentOutsideDiameter: num(input.padOutsideDiameter) },
    },
  ];
}

function padReasons(input) {
  if (!hasPad(input)) return [];
  if (isRectangular(input)) {
    const out = [];
    const both = 'Enter all three pad fields, or leave them blank for no pad.';
    for (const [key, label] of [['padLength', 'Pad length along the shell'], ['padWidth', 'Pad width around the shell'], ['padThickness', 'Pad thickness']]) {
      if (!(num(input[key]) > 0)) out.push(reason('PAD', `${label} must be a positive number.`, both));
    }
    for (const [pad, att, label] of [['padLength', 'attachmentLength', 'length'], ['padWidth', 'attachmentWidth', 'width']]) {
      if (num(input[pad]) > 0 && num(input[att]) > 0 && !(num(input[pad]) > num(input[att]))) {
        out.push(reason('PAD', `The pad ${label} (${fmt(num(input[pad]), 1)} mm) must be larger than the attachment ${label} (${fmt(num(input[att]), 1)} mm).`, 'Check the pad size.'));
      }
    }
    return out;
  }
  const dp = num(input.padOutsideDiameter);
  const tp = num(input.padThickness);
  const dA = num(input.attachmentOutsideDiameter);
  const out = [];
  if (!(dp > 0)) out.push(reason('PAD', 'Pad outside diameter must be a positive number.', 'Enter both pad fields, or leave both blank for no pad.'));
  if (!(tp > 0)) out.push(reason('PAD', 'Pad thickness must be a positive number.', 'Enter both pad fields, or leave both blank for no pad.'));
  if (dp > 0 && dA > 0 && !(dp > dA)) {
    out.push(reason('PAD', `The pad (${fmt(dp, 1)} mm) must be larger than the attachment (${fmt(dA, 1)} mm).`, 'Check the pad outside diameter.'));
  }
  return out;
}

const TIER_ORDER = [WRC_TIER.SOURCE_QUALIFIED, WRC_TIER.TABULATED_ROW, WRC_TIER.INTERPOLATED, WRC_TIER.BLOCKED];

/**
 * One attachment, one load case: the shell is checked at every location from wrcLocationInputs.
 * `governing` and `codeCheck` are the worst over the locations; each location keeps its full result.
 */
export function calculateWrcAttachment(input) {
  const padded = hasPad(input);
  let pad = null;
  if (padded && isRectangular(input)) {
    pad = { rectangular: true, length: num(input.padLength), width: num(input.padWidth), thickness: num(input.padThickness) };
  } else if (padded) {
    pad = { rectangular: false, outsideDiameter: num(input.padOutsideDiameter), thickness: num(input.padThickness), width: (num(input.padOutsideDiameter) - num(input.attachmentOutsideDiameter)) / 2 };
  }
  const invalid = padReasons(input);
  if (invalid.length) {
    return {
      input: structuredCloneSafe(input), padded, pad, locations: [], ok: false, tier: WRC_TIER.BLOCKED,
      reasons: invalid, warnings: [], governing: null, codeCheck: null,
    };
  }
  const locations = wrcLocationInputs(input).map((spec) => ({ id: spec.id, label: spec.label, result: calculateWrc537(spec.input) }));
  const prefix = (label, text) => (padded ? `${label}: ${text}` : text);
  // At the pad edge the "attachment" is the pad, so say so in the suggested fix.
  const fixFor = (l, r) => (l.id === 'PAD_EDGE' ? r.fix.replace(/^Attachment OD/u, 'Pad OD').replace(/^Width around the shell/u, 'Pad width around the shell') : r.fix);
  const reasons = locations.flatMap((l) => l.result.reasons.map((r) => ({ ...r, text: prefix(l.label, r.text), fix: fixFor(l, r), locationId: l.id })));
  const warnings = [...(padded ? [WRC_PAD_METHOD_TEXT] : []),
    ...new Set(locations.flatMap((l) => l.result.warnings.map((w) => prefix(l.label, w))))];
  const ok = locations.every((l) => l.result.ok);
  const tier = locations.map((l) => l.result.tier).reduce((a, b) => (TIER_ORDER.indexOf(b) > TIER_ORDER.indexOf(a) ? b : a));
  let governing = null;
  let codeCheck = null;
  if (ok) {
    const gov = locations.reduce((a, b) => (b.result.governing.stressIntensity > a.result.governing.stressIntensity ? b : a));
    governing = { locationId: gov.id, label: gov.label, location: gov.result.governing.location, stressIntensity: gov.result.governing.stressIntensity };
    if (locations.every((l) => l.result.codeCheck)) {
      const worst = locations.reduce((a, b) => (b.result.codeCheck.worst.ratio > a.result.codeCheck.worst.ratio ? b : a));
      codeCheck = {
        pass: locations.every((l) => l.result.codeCheck.pass),
        worst: { ...worst.result.codeCheck.worst, locationId: worst.id, locationLabel: worst.label },
      };
    }
  }
  return { input: structuredCloneSafe(input), padded, pad, locations, ok, tier: ok ? tier : WRC_TIER.BLOCKED, reasons, warnings, governing, codeCheck };
}

/**
 * Run several load cases on one geometry. `input.loadCases` = [{ name, loads }]; when absent,
 * `input.loads` is the only case. Each case's result comes from calculateWrcAttachment (one or two
 * shell locations); the envelope is the worst over cases and locations.
 */
export function calculateWrc537Cases(input) {
  const list = Array.isArray(input.loadCases) && input.loadCases.length
    ? input.loadCases
    : [{ name: 'Case 1', loads: input.loads }];
  const cases = list.map((c, index) => ({
    name: String(c?.name || `Case ${index + 1}`),
    result: calculateWrcAttachment({ ...input, loads: c?.loads ?? {} }),
  }));
  const ok = cases.filter((c) => c.result.ok);
  const governing = ok.reduce((best, c) => (best && best.result.governing.stressIntensity >= c.result.governing.stressIntensity ? best : c), null);
  const checked = ok.filter((c) => c.result.codeCheck);
  const worstCheck = checked.reduce((a, b) => (a && a.result.codeCheck.worst.ratio >= b.result.codeCheck.worst.ratio ? a : b), null);
  return {
    cases,
    allCalculated: ok.length === cases.length,
    governing: governing
      ? { name: governing.name, ...governing.result.governing }
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
