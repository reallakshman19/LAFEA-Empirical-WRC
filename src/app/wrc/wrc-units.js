/**
 * Display units for the WRC calculator (roadmap PL-06 part 2).
 *
 * Every calculation stays in mm, N and MPa. A case stores its lengths in mm and its pressure and
 * allowables in MPa whatever `units` says; `units` only chooses what the form, the results, the report
 * and the FE contour show: SI (mm, MPa) or US customary (in, psi). Loads are stored as typed, with
 * their own force and moment units (FORCE_UNITS, MOMENT_UNITS in wrc-calc.js). Switching the system
 * converts them to the matching units (convertCaseUnits), so the physical case does not change.
 */
export const MM_PER_IN = 25.4;
export const MPA_PER_PSI = 0.00689475729316836;

/** Load units in N and N·mm. 1 lbf = 4.4482216152605 N and 1 in = 25.4 mm, both exact. */
const LBF = 4.4482216152605;
export const FORCE_UNITS = Object.freeze({ N: 1, kN: 1000, lbf: LBF, kip: 1000 * LBF });
export const MOMENT_UNITS = Object.freeze({
  'N·m': 1000, 'kN·m': 1e6, 'N·mm': 1,
  'in·lbf': LBF * MM_PER_IN, 'ft·lbf': LBF * 12 * MM_PER_IN, 'in·kip': 1000 * LBF * MM_PER_IN, 'ft·kip': 1000 * LBF * 12 * MM_PER_IN,
});

const fmt = (value, digits) => (Number.isFinite(value) ? value.toFixed(digits) : '—');

export const UNIT_SYSTEMS = Object.freeze({
  SI: Object.freeze({
    id: 'SI', label: 'SI: mm, MPa', length: 'mm', stress: 'MPa', stressLong: 'MPa (N/mm²)',
    mmPer: 1, mpaPer: 1, force: Object.freeze(['N', 'kN']), moment: Object.freeze(['N·m', 'kN·m', 'N·mm']),
  }),
  US: Object.freeze({
    id: 'US', label: 'US: in, psi', length: 'in', stress: 'psi', stressLong: 'psi (lbf/in²)',
    mmPer: MM_PER_IN, mpaPer: MPA_PER_PSI, force: Object.freeze(['lbf', 'kip']), moment: Object.freeze(['in·lbf', 'ft·lbf', 'in·kip', 'ft·kip']),
  }),
});

/** The matching unit in the other system, used when the system is switched. */
const LOAD_UNIT_TWIN = Object.freeze({
  N: 'lbf', kN: 'kip', lbf: 'N', kip: 'kN',
  'N·m': 'ft·lbf', 'kN·m': 'ft·kip', 'N·mm': 'in·lbf', 'ft·lbf': 'N·m', 'ft·kip': 'kN·m', 'in·lbf': 'N·mm', 'in·kip': 'N·m',
});

/** The display system of a case (SI when missing or unknown). */
export function unitSystem(input) {
  return UNIT_SYSTEMS[input?.units] ?? UNIT_SYSTEMS.SI;
}

/** Rounded to `digits` significant figures, so a value shown after a conversion reads cleanly (59.06, not 59.059999999). */
export function roundSig(value, digits = 10) {
  return Number.isFinite(value) && value !== 0 ? Number(value.toPrecision(digits)) : value;
}

/** `kind` 'length' (stored in mm) or 'stress' (stored in MPa: stresses, pressure, allowables). */
export function toDisplay(kind, stored, u) {
  if (stored === '' || stored === null || stored === undefined) return stored;
  const value = Number(stored);
  if (!Number.isFinite(value)) return stored;
  return kind === 'length' ? value / u.mmPer : kind === 'stress' ? value / u.mpaPer : value;
}
export function fromDisplay(kind, shown, u) {
  if (shown === '' || !Number.isFinite(shown)) return shown;
  return kind === 'length' ? shown * u.mmPer : kind === 'stress' ? shown * u.mpaPer : shown;
}

/**
 * Formatters for results. `siDigits` is the decimals shown in SI; an inch needs one more and a psi two
 * fewer (it is 145 times smaller than a MPa), so the shown precision stays about the same.
 */
export function lengthText(mm, siDigits, u) {
  return fmt(Number(mm) / u.mmPer, u.id === 'SI' ? siDigits : siDigits + 1);
}
export function stressText(mpa, siDigits, u) {
  return fmt(Number(mpa) / u.mpaPer, u.id === 'SI' ? siDigits : Math.max(0, siDigits - 2));
}
/** The same, with the unit: "12.00 mm", "0.472 in", "153.38 MPa", "22246 psi". */
export function lengthWithUnit(mm, siDigits, u) { return `${lengthText(mm, siDigits, u)} ${u.length}`; }
export function stressWithUnit(mpa, siDigits, u) { return `${stressText(mpa, siDigits, u)} ${u.stress}`; }

/** A load unit that belongs to system `u`: the unit itself, or its twin in the other system. */
export function loadUnitIn(unit, u, kind) {
  const list = kind === 'force' ? u.force : u.moment;
  if (list.includes(unit)) return unit;
  const twin = LOAD_UNIT_TWIN[unit];
  return list.includes(twin) ? twin : list[0];
}

/**
 * The same case shown in system `toId`: `units` set, and every load case's loads converted to the
 * matching force and moment units at full precision. The form shows a load to 10 significant figures,
 * so after SI → US → SI the boxes show the typed values again (the stored value is within 1e-12).
 */
export function convertCaseUnits(c, toId) {
  const u = UNIT_SYSTEMS[toId] ?? UNIT_SYSTEMS.SI;
  const forceUnit = loadUnitIn(c.forceUnit, u, 'force');
  const momentUnit = loadUnitIn(c.momentUnit, u, 'moment');
  // Units already in this system: the loads stay exactly as typed.
  if (forceUnit === c.forceUnit && momentUnit === c.momentUnit) return { ...c, units: u.id };
  const f = (FORCE_UNITS[c.forceUnit] ?? 1) / FORCE_UNITS[forceUnit];
  const m = (MOMENT_UNITS[c.momentUnit] ?? 1) / MOMENT_UNITS[momentUnit];
  const convert = (loads) => Object.fromEntries(Object.entries(loads ?? {}).map(([k, v]) => [k,
    Number(v) * (['P', 'Vc', 'Vl'].includes(k) ? f : m) || 0]));
  return {
    ...c,
    units: u.id,
    forceUnit,
    momentUnit,
    ...(c.loads ? { loads: convert(c.loads) } : {}),
    ...(Array.isArray(c.loadCases) ? { loadCases: c.loadCases.map((lc) => ({ ...lc, loads: convert(lc.loads) })) } : {}),
  };
}

/**
 * An FE contour field (crossCheckWrc537 / crossCheckWrc537Rectangular) in display units, for drawing:
 * coordinates in u.length and element values in u.stress.
 */
export function feFieldIn(field, u) {
  if (!field || u.id === 'SI') return field;
  const L = (v) => v / u.mmPer;
  return {
    ...field,
    ...(field.attachmentRadius !== undefined ? { attachmentRadius: L(field.attachmentRadius) } : {}),
    ...(field.halfSize !== undefined ? { halfSize: L(field.halfSize) } : {}),
    ...(field.halfSizeS !== undefined ? { halfSizeS: L(field.halfSizeS) } : {}),
    ...(field.halfSizeX !== undefined ? { halfSizeX: L(field.halfSizeX) } : {}),
    ...(field.attachment ? { attachment: { ...field.attachment, halfWidth: L(field.attachment.halfWidth), halfLength: L(field.attachment.halfLength) } } : {}),
    triangles: field.triangles.map((t) => ({ ...t, v: t.v.map(L), u: t.u / u.mpaPer, l: t.l / u.mpaPer })),
  };
}
