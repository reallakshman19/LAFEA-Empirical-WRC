/**
 * WRC 537 (2013) rectangular attachments on a cylindrical shell (lugs, rectangular pads).
 *
 * Source, read from the licensed bulletin (printed pages 13 and 17, Tables 6–8 on pages 31–32):
 *  - (28) β1 = c1/Rm, β2 = c2/Rm. c1 is the half-length around the shell (circumferential),
 *    c2 the half-length along it (longitudinal).
 *  - Radial load P, for each stress component Nφ, Nx, Mφ, Mx with K from Table 6:
 *      (29) β = [1 − ⅓(β1/β2 − 1)(1 − K1)]·√(β1β2)   when β1/β2 ≥ 1
 *      (30) β = [1 − ⁴⁄₃(1 − β1/β2)(1 − K2)]·√(β1β2) when β1/β2 < 1
 *  - Circumferential moment Mc (4.2.2.4): membrane β = ∛(β1²β2), then the curve value is multiplied by
 *    Cc (Table 7); bending β = Kc·∛(β1²β2). Table 7 is indexed by β1/β2.
 *  - Longitudinal moment ML (4.2.2.5): membrane β = ∛(β1β2²), then × CL (Table 8); bending
 *    β = KL·∛(β1β2²). Table 8 is indexed by β2/β1.
 *  - Shear (50) τ = Vc/(4·c1·T), (51) τ = VL/(4·c2·T).
 *  - Torsion (4.3.4): "Acceptable methods of analyzing this situation are not available at this time."
 *  - Tables 6–8 hold approximately for 4 ≥ β1/β2 ≥ 0.25. Tables 7–8 start at γ = 15.
 * 4.3 uses "the applicable values of γ and β calculated in paragraph 4.2" both to read each curve and in
 * its stress formula (Nφ = value · Mc/(Rm²β) etc.), so each term's own β appears in both places.
 *
 * Engineering judgement, labelled in the results:
 *  - Tables 7–8 between their rows are interpolated in γ (the user's γ rule) and in log(β1/β2); a square
 *    attachment (ratio 1) has factor 1 (4.2.2.2), which is the middle row of the interpolation.
 *  - Table 6 is stated per stress component (Nφ, Nx, Mφ, Mx); the K for a component is used for every point
 *    where that component is evaluated.
 */

/** Table 6: K1 (β1/β2 ≥ 1) and K2 (β1/β2 < 1) for radial load, by stress component. */
export const WRC537_TABLE6 = Object.freeze({
  K1: Object.freeze({ Nphi: 0.91, Nx: 1.68, Mphi: 1.76, Mx: 1.2 }),
  K2: Object.freeze({ Nphi: 1.48, Nx: 1.2, Mphi: 0.88, Mx: 1.25 }),
});

const row = (gamma, values, approximate = false) => Object.freeze({ gamma, values: Object.freeze(values), approximate });

/**
 * Table 7 (Mc, indexed by β1/β2) and Table 8 (ML, indexed by β2/β1). Columns: K for Mφ, K for Mx, C for Nφ,
 * C for Nx (the θ column is not needed). `approximate`: the bulletin prints the row in parentheses
 * ("determined by an approximate solution").
 */
export const WRC537_TABLE7 = Object.freeze({
  0.25: Object.freeze([
    row(15, { Mphi: 1.31, Mx: 1.84, Nphi: 0.31, Nx: 0.49 }),
    row(50, { Mphi: 1.24, Mx: 1.62, Nphi: 0.21, Nx: 0.46 }),
    row(100, { Mphi: 1.16, Mx: 1.45, Nphi: 0.15, Nx: 0.44 }),
    row(300, { Mphi: 1.02, Mx: 1.17, Nphi: 0.09, Nx: 0.46 }),
  ]),
  0.5: Object.freeze([
    row(15, { Mphi: 1.09, Mx: 1.36, Nphi: 0.64, Nx: 0.75 }),
    row(50, { Mphi: 1.08, Mx: 1.31, Nphi: 0.57, Nx: 0.75 }),
    row(100, { Mphi: 1.04, Mx: 1.26, Nphi: 0.51, Nx: 0.76 }),
    row(300, { Mphi: 0.99, Mx: 1.13, Nphi: 0.39, Nx: 0.77 }),
  ]),
  2: Object.freeze([
    row(15, { Mphi: 1.20, Mx: 0.97, Nphi: 1.7, Nx: 1.3 }, true),
    row(100, { Mphi: 1.10, Mx: 0.95, Nphi: 1.43, Nx: 1.12 }),
    row(300, { Mphi: 1.00, Mx: 0.90, Nphi: 1.3, Nx: 1.00 }, true),
  ]),
  4: Object.freeze([
    row(15, { Mphi: 1.47, Mx: 1.08, Nphi: 1.75, Nx: 1.31 }, true),
    row(100, { Mphi: 1.38, Mx: 1.06, Nphi: 1.49, Nx: 0.81 }),
    row(300, { Mphi: 1.27, Mx: 0.98, Nphi: 1.36, Nx: 0.74 }, true),
  ]),
});

export const WRC537_TABLE8 = Object.freeze({
  0.25: Object.freeze([
    row(15, { Mphi: 1.80, Mx: 1.24, Nphi: 0.75, Nx: 0.43 }),
    row(50, { Mphi: 1.65, Mx: 1.16, Nphi: 0.77, Nx: 0.33 }),
    row(100, { Mphi: 1.59, Mx: 1.11, Nphi: 0.80, Nx: 0.24 }),
    row(300, { Mphi: 1.56, Mx: 1.11, Nphi: 0.90, Nx: 0.07 }),
  ]),
  0.5: Object.freeze([
    row(15, { Mphi: 1.08, Mx: 1.04, Nphi: 0.90, Nx: 0.76 }, true),
    row(100, { Mphi: 1.07, Mx: 1.02, Nphi: 0.97, Nx: 0.68 }),
    row(300, { Mphi: 1.05, Mx: 1.02, Nphi: 1.10, Nx: 0.60 }, true),
  ]),
  2: Object.freeze([
    row(15, { Mphi: 0.94, Mx: 1.12, Nphi: 0.87, Nx: 1.30 }, true),
    row(100, { Mphi: 0.89, Mx: 1.07, Nphi: 0.81, Nx: 1.15 }),
    row(300, { Mphi: 0.79, Mx: 0.90, Nphi: 0.80, Nx: 1.50 }, true),
  ]),
  4: Object.freeze([
    row(15, { Mphi: 0.90, Mx: 1.24, Nphi: 0.68, Nx: 1.20 }),
    row(100, { Mphi: 0.81, Mx: 1.12, Nphi: 0.51, Nx: 1.03 }),
    row(300, { Mphi: 0.64, Mx: 0.83, Nphi: 0.50, Nx: 1.33 }, true),
  ]),
});

export const WRC537_RECT_RATIO_RANGE = Object.freeze({ minimum: 0.25, maximum: 4 });
export const WRC537_RECT_FACTOR_GAMMA_RANGE = Object.freeze({ minimum: 15, maximum: 300 });

/** Equations 29–30: the β that replaces √(β1β2) for radial load, for one stress component. */
export function radialLoadBeta(component, beta1, beta2) {
  const ratio = beta1 / beta2;
  const root = Math.sqrt(beta1 * beta2);
  if (ratio >= 1) return (1 - (1 / 3) * (ratio - 1) * (1 - WRC537_TABLE6.K1[component])) * root;
  return (1 - (4 / 3) * (1 - ratio) * (1 - WRC537_TABLE6.K2[component])) * root;
}

const SYMBOL = Object.freeze({ Nphi: 'Nφ', Nx: 'Nx', Mphi: 'Mφ', Mx: 'Mx' });

const SAME = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

function gammaWeight(coordinate, gamma, lower, upper) {
  if (coordinate === 'LOG_GAMMA') return (Math.log(gamma) - Math.log(lower)) / (Math.log(upper) - Math.log(lower));
  return (gamma - lower) / (upper - lower);
}

/**
 * One ratio row of Table 7 or 8, at γ: exact, or blended between the two nearest γ rows.
 * `pickGamma` ('lo' or 'hi') takes that printed row instead of blending (for the interpolation spread).
 */
function valueAtGamma(rows, column, gamma, coordinate, pickGamma = null) {
  const exact = rows.find((r) => SAME(r.gamma, gamma));
  if (exact) return { value: exact.values[column], approximate: exact.approximate, gammaInterpolated: false };
  const i = rows.findIndex((r) => r.gamma > gamma);
  const lower = rows[i - 1];
  const upper = rows[i];
  if (pickGamma) {
    const r = pickGamma === 'lo' ? lower : upper;
    return { value: r.values[column], approximate: r.approximate, gammaInterpolated: false, picked: true };
  }
  const w = gammaWeight(coordinate, gamma, lower.gamma, upper.gamma);
  return {
    value: (1 - w) * lower.values[column] + w * upper.values[column],
    approximate: (lower.approximate && w < 1) || (upper.approximate && w > 0),
    gammaInterpolated: true,
  };
}

/**
 * Table 7 or 8 factor for one column at a shape ratio and γ.
 * Returns { value, approximate, interpolated } or { blocked: reason }.
 * `pick` = { ratio: 'lo'|'hi', gamma: 'lo'|'hi' } takes the printed row on that side of each bracket instead
 * of interpolating (exact rows are used as they are). This gives the corners of the interpolation spread.
 */
export function momentFactor(table, column, ratio, gamma, coordinate = 'LINEAR_GAMMA', pick = null) {
  if (SAME(ratio, 1)) return { value: 1, approximate: false, interpolated: false, square: true };
  if (!(ratio >= WRC537_RECT_RATIO_RANGE.minimum - 1e-12 && ratio <= WRC537_RECT_RATIO_RANGE.maximum + 1e-12)) {
    return { blocked: 'RATIO' };
  }
  if (!(gamma >= WRC537_RECT_FACTOR_GAMMA_RANGE.minimum - 1e-9 && gamma <= WRC537_RECT_FACTOR_GAMMA_RANGE.maximum + 1e-9)) {
    return { blocked: 'GAMMA' };
  }
  const ratios = [0.25, 0.5, 1, 2, 4];
  const at = (r) => (r === 1
    ? { value: 1, approximate: false, gammaInterpolated: false }
    : valueAtGamma(table[r], column, gamma, coordinate, pick?.gamma ?? null));
  const exactRatio = ratios.find((r) => SAME(r, ratio));
  if (exactRatio !== undefined) {
    const v = at(exactRatio);
    return { value: v.value, approximate: v.approximate, interpolated: v.gammaInterpolated };
  }
  const i = ratios.findIndex((r) => r > ratio);
  const lo = ratios[i - 1];
  const hi = ratios[i];
  if (pick) {
    const v = at(pick.ratio === 'lo' ? lo : hi);
    return { value: v.value, approximate: v.approximate, interpolated: false, picked: true };
  }
  const w = (Math.log(ratio) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  const a = at(lo);
  const b = at(hi);
  return {
    value: (1 - w) * a.value + w * b.value,
    approximate: (a.approximate && w < 1) || (b.approximate && w > 0),
    interpolated: true,
  };
}

/**
 * The β and multiplier for every Table 5 term of a rectangular attachment.
 * `family` is circ (σφ: Nφ, Mφ) or long (σx: Nx, Mx); `key` is the Table 5 ordinate key.
 * Returns { terms: { circ: {key: term}, long: {...} }, reasons, notes }, where a term is
 * { component, load, beta, factor, factorApproximate, factorInterpolated, basis }.
 */
export function rectangularTerms({ beta1, beta2, gamma, coordinate, pick = null }) {
  const ratio = beta1 / beta2; // Table 7 index
  const mcRoot = Math.cbrt(beta1 ** 2 * beta2);
  const mlRoot = Math.cbrt(beta1 * beta2 ** 2);
  const terms = { circ: {}, long: {} };
  const blockedFactors = new Set();
  const add = (family, key, term) => { terms[family][key] = Object.freeze(term); };
  for (const [family, N, M] of [['circ', 'Nphi', 'Mphi'], ['long', 'Nx', 'Mx']]) {
    const pN = radialLoadBeta(N, beta1, beta2);
    const pM = radialLoadBeta(M, beta1, beta2);
    for (const key of ['Pmem_AB', 'Pmem_CD']) add(family, key, { component: N, load: 'P', beta: pN, factor: 1, tableFactor: null, basis: `eq. ${ratio >= 1 ? 29 : 30}, Table 6 K for ${SYMBOL[N]}` });
    for (const key of ['Pbend_AB', 'Pbend_CD']) add(family, key, { component: M, load: 'P', beta: pM, factor: 1, tableFactor: null, basis: `eq. ${ratio >= 1 ? 29 : 30}, Table 6 K for ${SYMBOL[M]}` });

    const cMem = momentFactor(WRC537_TABLE7, N, ratio, gamma, coordinate, pick);
    const cBend = momentFactor(WRC537_TABLE7, M, ratio, gamma, coordinate, pick);
    const lMem = momentFactor(WRC537_TABLE8, N, 1 / ratio, gamma, coordinate, pick);
    const lBend = momentFactor(WRC537_TABLE8, M, 1 / ratio, gamma, coordinate, pick);
    for (const f of [cMem, cBend]) if (f.blocked) blockedFactors.add(`Mc:${f.blocked}`);
    for (const f of [lMem, lBend]) if (f.blocked) blockedFactors.add(`Ml:${f.blocked}`);
    const term = (load, component, beta, factor, basis, f, kind) => ({
      component, load, beta, factor, basis, tableFactor: Number.isFinite(f?.value) ? { kind, value: f.value } : null,
      factorApproximate: Boolean(f?.approximate), factorInterpolated: Boolean(f?.interpolated), blocked: f?.blocked ?? null,
    });
    add(family, 'Mcmem', term('Mc', N, mcRoot, cMem.value ?? NaN, `β = ∛(β1²β2), value × Cc for ${SYMBOL[N]} (Table 7)`, cMem, 'C'));
    add(family, 'Mcbend', term('Mc', M, (cBend.value ?? NaN) * mcRoot, 1, `β = Kc for ${SYMBOL[M]} (Table 7) × ∛(β1²β2)`, cBend, 'K'));
    add(family, 'Mlmem', term('Ml', N, mlRoot, lMem.value ?? NaN, `β = ∛(β1β2²), value × CL for ${SYMBOL[N]} (Table 8)`, lMem, 'C'));
    add(family, 'Mlbend', term('Ml', M, (lBend.value ?? NaN) * mlRoot, 1, `β = KL for ${SYMBOL[M]} (Table 8) × ∛(β1β2²)`, lBend, 'K'));
  }
  return { ratio, terms, blockedFactors: [...blockedFactors] };
}
