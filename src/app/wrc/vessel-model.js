/**
 * Canvas step A2: one shell with several attachments (roadmap stage A, empirical track).
 *
 * A vessel is a shell and a list of attachments. Each attachment, joined with the shell, is exactly the
 * single case the WRC 537 calculator has always taken, so the WRC core is used as it is:
 *   caseFor(vessel, i) = { ...vessel.shell, ...vessel.attachments[i] }   (in the vessel's units)
 * The shell holds what one shell shares: its size and length, design pressure, allowables and the method
 * settings. An attachment holds the rest: type, size, pad, station, angle around, Kn/Kb and its load cases.
 *
 * The model file is empirical only (owner decision 8, 2026-11-28). LAFEA does not read or write it.
 */
import { DEFAULT_CASE, EXAMPLE_CASES, calculateWrc537Cases } from './wrc-calc.js';
import { UNIT_SYSTEMS, convertCaseUnits } from './wrc-units.js';

export const VESSEL_SCHEMA = 'lafea-emp-app/vessel/v1';
export const CASE_SCHEMA = 'lafea-emp-app/wrc537-case/v1';
export const MAX_CASES = 20;
export const MAX_ATTACHMENTS = 20;

/** Inputs one shell shares. Everything else in a case belongs to its attachment. */
export const SHELL_KEYS = Object.freeze([
  'title', 'units', 'shellOutsideDiameter', 'shellThickness', 'corrosionAllowance', 'cylinderLength',
  'designPressure', 'allowableS', 'allowableSps', 'bendingClass', 'coordinate',
]);
const SHELL = new Set(SHELL_KEYS);

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Fill defaults and turn an old single-load case (`loads`) into the load-case list. */
export function normalizeCase(c) {
  const src = clone(c ?? {});
  const merged = { ...clone(DEFAULT_CASE), ...src };
  let cases = Array.isArray(src.loadCases) ? src.loadCases.filter((x) => x && typeof x === 'object') : [];
  if (!cases.length) cases = [{ name: 'Case 1', loads: { ...DEFAULT_CASE.loads, ...(src.loads ?? {}) } }];
  merged.loadCases = cases.slice(0, MAX_CASES).map((x, i) => ({
    name: String(x.name || `Case ${i + 1}`).slice(0, 60),
    loads: Object.fromEntries(Object.keys(DEFAULT_CASE.loads).map((k) => [k, Number(x.loads?.[k] ?? 0) || 0])),
  }));
  merged.activeCase = Number.isInteger(src.activeCase) && src.activeCase >= 0 && src.activeCase < merged.loadCases.length ? src.activeCase : 0;
  delete merged.loads;
  merged.attachmentName = cleanName(src.attachmentName) || 'N1';
  merged.attachmentAngle = cleanAngle(src.attachmentAngle);
  // Cases saved before units existed are SI. Load units from the other system (an edited file) are converted.
  merged.units = UNIT_SYSTEMS[merged.units] ? merged.units : 'SI';
  return convertCaseUnits(merged, merged.units);
}

/** Degrees around the shell, clockwise from the top seen from the end where the station is measured: 0 ≤ a < 360. */
export function cleanAngle(value) {
  const a = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(a)) return 0;
  return ((a % 360) + 360) % 360;
}
function cleanName(value) { return String(value ?? '').trim().slice(0, 40); }

/** A case split into the shell's part and the attachment's part. */
export function splitCase(c) {
  const shell = {};
  const attachment = {};
  for (const [k, v] of Object.entries(c)) (SHELL.has(k) ? shell : attachment)[k] = v;
  return { shell, attachment };
}

/** A vessel holding one case as its only attachment. */
export function vesselFromCase(c) {
  const { shell, attachment } = splitCase(normalizeCase(c));
  return { shell, attachments: [attachment], active: 0 };
}

/** Attachment `i` as the calculator's case, in the vessel's units. */
export function caseFor(vessel, i = vessel.active) {
  return convertCaseUnits({ ...clone(vessel.shell), ...clone(vessel.attachments[i]) }, vessel.shell.units);
}

/** The vessel with attachment `i` replaced by case `c`; the shell part of `c` becomes the shell for all. */
export function withCase(vessel, i, c) {
  const { shell, attachment } = splitCase(clone(c));
  return { ...vessel, shell, attachments: vessel.attachments.map((a, j) => (j === i ? attachment : a)) };
}

/** The first name N1, N2, … not used yet. */
export function nextName(vessel) {
  const used = new Set(vessel.attachments.map((a) => a.attachmentName));
  for (let k = 1; ; k += 1) if (!used.has(`N${k}`)) return `N${k}`;
}

/** A copy of attachment `i` added after the others, a quarter turn further round so the two do not overlap. */
export function addAttachment(vessel, i = vessel.active) {
  if (vessel.attachments.length >= MAX_ATTACHMENTS) return vessel;
  const copy = { ...clone(vessel.attachments[i]), attachmentName: nextName(vessel), attachmentAngle: cleanAngle(Number(vessel.attachments[i].attachmentAngle ?? 0) + 90) };
  return { ...vessel, attachments: [...vessel.attachments, copy], active: vessel.attachments.length };
}

/** The vessel without attachment `i` (the last one cannot be removed). */
export function removeAttachment(vessel, i = vessel.active) {
  if (vessel.attachments.length < 2) return vessel;
  const attachments = vessel.attachments.filter((_, j) => j !== i);
  return { ...vessel, attachments, active: Math.min(vessel.active > i ? vessel.active - 1 : vessel.active, attachments.length - 1) };
}

/** Defaults filled in and every attachment checked as a case; names made unique. Throws when there is no attachment. */
export function normalizeVessel(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.attachments) || !raw.attachments.length) {
    throw new Error('A vessel needs at least one attachment.');
  }
  const shellIn = raw.shell && typeof raw.shell === 'object' ? raw.shell : {};
  const parts = raw.attachments.slice(0, MAX_ATTACHMENTS).filter((a) => a && typeof a === 'object')
    .map((a) => splitCase(normalizeCase({ ...a, ...pick(shellIn) })));
  if (!parts.length) throw new Error('A vessel needs at least one attachment.');
  const vessel = { shell: parts[0].shell, attachments: [], active: 0 };
  for (const { attachment } of parts) {
    const name = attachment.attachmentName;
    vessel.attachments.push({ ...attachment, attachmentName: vessel.attachments.some((a) => a.attachmentName === name) ? nextName(vessel) : name });
  }
  const active = Number(raw.active);
  vessel.active = Number.isInteger(active) && active >= 0 && active < vessel.attachments.length ? active : 0;
  return vessel;
}
function pick(shell) { return Object.fromEntries(Object.entries(shell).filter(([k]) => SHELL.has(k))); }

/** A saved file: a vessel, or a case saved before A2 (it opens as a vessel with one attachment). */
export function vesselFromFile(parsed) {
  if (parsed?.schema === VESSEL_SCHEMA) return normalizeVessel(parsed.vessel);
  if (parsed?.schema === CASE_SCHEMA && parsed.case && typeof parsed.case === 'object') return vesselFromCase(parsed.case);
  throw new Error('Not a vessel or WRC case file.');
}
export function vesselFile(vessel) { return { schema: VESSEL_SCHEMA, vessel: clone(vessel) }; }

/**
 * Every attachment checked on its own, as the calculator checks one: its batch of load cases, and the
 * attachment that governs the shell (highest stress intensity among those calculated). WRC 537 does not
 * cover two attachments close together, so nothing here combines them.
 */
export function checkVessel(vessel) {
  const rows = vessel.attachments.map((a, i) => {
    const c = caseFor(vessel, i);
    const batch = calculateWrc537Cases(c);
    return { index: i, name: a.attachmentName, input: c, batch, governing: batch.governing };
  });
  const calculated = rows.filter((r) => r.governing);
  const governing = calculated.length ? calculated.reduce((m, r) => (r.governing.stressIntensity > m.governing.stressIntensity ? r : m)) : null;
  return { rows, governingIndex: governing ? governing.index : null };
}

/**
 * Worked vessel: the lug example's shell with two nozzles and the lug, each at its own station and angle.
 * Stored in SI; the panel shows it in the units chosen.
 */
export const EXAMPLE_VESSELS = Object.freeze({
  TWO_NOZZLES_LUG: Object.freeze({
    shell: Object.freeze({
      title: 'Vessel with two nozzles and a lug', units: 'SI',
      shellOutsideDiameter: 1500, shellThickness: 12, corrosionAllowance: 0, cylinderLength: 4000, designPressure: 0,
      allowableS: '', allowableSps: '', bendingClass: 'Q', coordinate: 'LINEAR_GAMMA',
    }),
    attachments: Object.freeze([
      Object.freeze({ attachmentName: 'N1', attachmentAngle: 0, attachmentType: 'ROUND', attachmentOutsideDiameter: 219.1, attachmentStation: 1000,
        forceUnit: 'N', momentUnit: 'N·m', loadCases: [{ name: 'Operating', loads: { ...DEFAULT_CASE.loads } }] }),
      Object.freeze({ attachmentName: 'N2', attachmentAngle: 90, attachmentType: 'ROUND', attachmentOutsideDiameter: 168.3, attachmentStation: 2400,
        forceUnit: 'N', momentUnit: 'N·m', loadCases: [{ name: 'Operating', loads: { P: -1500, Vc: 400, Vl: -600, Mc: 900, Ml: -1200, Mt: 500 } }] }),
      Object.freeze({ ...EXAMPLE_CASES.LUG_200X100, attachmentName: 'L1', attachmentAngle: 180, attachmentStation: 3000, title: undefined }),
    ]),
    active: 0,
  }),
});
