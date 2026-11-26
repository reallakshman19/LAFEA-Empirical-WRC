/**
 * LAFEA plate input: a rectangular plane-stress plate, optionally with a central round hole,
 * built from plain form values into the same domain-first model the worked example uses:
 * source → source authority → analysis domain → analysis geometry evidence → mesh profile.
 *
 * Coordinates: x along the length L (0…L), y up the height H (0…H). The hole (if any) is at the
 * plate centre. Edges: BOTTOM (y = 0), RIGHT (x = L), TOP (y = H), LEFT (x = 0).
 *
 * Each edge has a support (FREE, FIXED, ROLLER_X: ux = 0, ROLLER_Y: uy = 0) and a uniform traction:
 * `normal` (MPa, + = tension, pulling outward) and `shear` (MPa, in +x on BOTTOM/TOP, in +y on
 * LEFT/RIGHT). Loads are distributed only, so results converge under refinement.
 *
 * Pure: no DOM.
 */
import { FORMULATIONS, MODEL_SCHEMA, QUALIFICATION_PROFILE } from '../../core/local-continuum/index.js';
import { PROFILE_KINDS, canonicalProfile, defaultProfileFields } from '../../core/lafea-profile-contract/index.js';
import {
  LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_PROFILE,
  LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SCHEMA,
  createLafeaAnalysisGeometryEvidence,
} from '../../workspace/lafea-analysis-geometry-evidence.js';
import {
  LAFEA_ANALYSIS_GEOMETRY_ORIENTATION_POLICY,
  LAFEA_ANALYSIS_GEOMETRY_SCHEMA,
  createLafeaAnalysisGeometry,
} from '../../workspace/lafea-analysis-geometry-contract.js';
import {
  LAFEA_CONTINUUM_ANALYSIS_DOMAIN_SCHEMA,
  createLafeaContinuumAnalysisDomain,
} from '../../workspace/lafea-continuum-analysis-domain.js';
import { requireLafeaStageComposition } from '../../workspace/lafea-stage-composition-root.js';
import { issueLafeaSourceAuthority } from '../../workspace/lafea-source-authority.js';

export const PLATE_EDGES = Object.freeze(['LEFT', 'RIGHT', 'BOTTOM', 'TOP']);
export const PLATE_SUPPORTS = Object.freeze({
  FREE: 'Free',
  FIXED: 'Fixed (ux = uy = 0)',
  ROLLER_X: 'Roller: ux = 0 (slides along y)',
  ROLLER_Y: 'Roller: uy = 0 (slides along x)',
});
export const PLATE_PROBE_QUANTITIES = Object.freeze({
  PRINCIPAL_MAXIMUM: { label: 'Maximum principal stress', units: 'MPa' },
  VON_MISES: { label: 'Von Mises stress', units: 'MPa' },
  STRESS_SIGMA_X: { label: 'σx', units: 'MPa' },
  STRESS_SIGMA_Y: { label: 'σy', units: 'MPa' },
  DISPLACEMENT_X: { label: 'Displacement ux', units: 'mm' },
  DISPLACEMENT_Y: { label: 'Displacement uy', units: 'mm' },
  DISPLACEMENT_MAGNITUDE: { label: 'Displacement (total)', units: 'mm' },
});

const LOAD_CASE = 'L1';
const STAGE = 'LAFEA.3';
const OUTWARD = { BOTTOM: [0, -1], RIGHT: [1, 0], TOP: [0, 1], LEFT: [-1, 0] };
const SHEAR_DIRECTION = { BOTTOM: [1, 0], TOP: [1, 0], LEFT: [0, 1], RIGHT: [0, 1] };

const edge = (support = 'FREE', normal = 0, shear = 0) => ({ support, normal, shear });

/** Plate with a central hole in uniaxial tension: the stress concentration (Kt ≈ 3) check. */
export const PLATE_HOLE_TENSION = Object.freeze({
  title: 'Plate with a hole in tension (Kt check)',
  shape: 'HOLE',
  length: 400,
  height: 200,
  thickness: 10,
  holeDiameter: 20,
  elasticModulus: 200000,
  poissonRatio: 0.3,
  edges: { LEFT: edge('FIXED'), RIGHT: edge('FREE', 100), BOTTOM: edge(), TOP: edge() },
  meshSize: 40, // levels 40 / 20 / 10 mm; the hole edge is resolved finer automatically
  probe: null, // null = automatic (near the hole crown for a hole; most loaded edge for a plain plate)
});

export const PLATE_DEFAULTS = PLATE_HOLE_TENSION;

const num = (value) => (value === '' || value === null || value === undefined ? NaN : Number(value));

/** Normalise raw form values (strings or numbers) into a plate input. */
export function normalizePlateInput(raw = {}) {
  const base = PLATE_DEFAULTS;
  const edges = {};
  for (const id of PLATE_EDGES) {
    const e = raw.edges?.[id] ?? base.edges[id];
    edges[id] = {
      support: Object.hasOwn(PLATE_SUPPORTS, e?.support) ? e.support : 'FREE',
      normal: num(e?.normal ?? 0),
      shear: num(e?.shear ?? 0),
    };
  }
  const probe = raw.probe && raw.probe.x !== '' && raw.probe.x !== undefined
    ? {
      x: num(raw.probe.x),
      y: num(raw.probe.y),
      quantityId: Object.hasOwn(PLATE_PROBE_QUANTITIES, raw.probe.quantityId) ? raw.probe.quantityId : 'PRINCIPAL_MAXIMUM',
    }
    : null;
  return {
    title: String(raw.title ?? base.title).slice(0, 120),
    shape: raw.shape === 'RECT' ? 'RECT' : 'HOLE',
    length: num(raw.length ?? base.length),
    height: num(raw.height ?? base.height),
    thickness: num(raw.thickness ?? base.thickness),
    holeDiameter: num(raw.holeDiameter ?? base.holeDiameter),
    elasticModulus: num(raw.elasticModulus ?? base.elasticModulus),
    poissonRatio: num(raw.poissonRatio ?? base.poissonRatio),
    edges,
    meshSize: num(raw.meshSize ?? base.meshSize),
    probe,
  };
}

/** Hard input errors, each with a plain reason. Empty when the plate can be built. */
export function validatePlateInput(p) {
  const errors = [];
  const need = (ok, text) => { if (!ok) errors.push(text); };
  need(p.length > 0, 'Length must be a positive number.');
  need(p.height > 0, 'Height must be a positive number.');
  need(p.thickness > 0, 'Thickness must be a positive number.');
  need(p.elasticModulus > 0, 'Young\'s modulus E must be a positive number.');
  need(p.poissonRatio >= 0 && p.poissonRatio < 0.5, 'Poisson\'s ratio must be at least 0 and less than 0.5.');
  need(p.meshSize > 0, 'Mesh size must be a positive number.');
  if (p.shape === 'HOLE') {
    need(p.holeDiameter > 0, 'Hole diameter must be a positive number.');
    const ligament = Math.min(p.length, p.height) - p.holeDiameter;
    need(ligament > 0.1 * Math.min(p.length, p.height), 'The hole must leave at least 5% of the plate on each side. Make the hole smaller or the plate bigger.');
  }
  for (const id of PLATE_EDGES) {
    const e = p.edges[id];
    need(Number.isFinite(e.normal) && Number.isFinite(e.shear), `${title(id)} edge: the loads must be numbers (enter 0 for none).`);
  }
  const anyLoad = PLATE_EDGES.some((id) => p.edges[id].normal !== 0 || p.edges[id].shear !== 0);
  need(anyLoad, 'Add a load: enter a normal or shear stress on at least one edge.');
  const restrained = (id, dof) => {
    const s = p.edges[id].support;
    return s === 'FIXED' || (dof === 'x' ? s === 'ROLLER_X' : s === 'ROLLER_Y');
  };
  const ux = PLATE_EDGES.some((id) => restrained(id, 'x'));
  const uy = PLATE_EDGES.some((id) => restrained(id, 'y'));
  // Rotation is stopped by ux = 0 along a vertical edge, uy = 0 along a horizontal edge, or a fixed edge.
  const rotation = PLATE_EDGES.some((id) => p.edges[id].support === 'FIXED')
    || ['LEFT', 'RIGHT'].some((id) => restrained(id, 'x'))
    || ['BOTTOM', 'TOP'].some((id) => restrained(id, 'y'));
  need(ux && uy && rotation, 'The supports do not hold the plate in place: it could slide or rotate. Fix one edge, or add rollers in both directions with one of them along the edge it stops.');
  for (const id of PLATE_EDGES) {
    const e = p.edges[id];
    if (e.support === 'FIXED' && (e.normal !== 0 || e.shear !== 0)) {
      errors.push(`${title(id)} edge is fixed, so a load on it would have no effect. Remove the load or free the edge.`);
    }
  }
  const elements = estimateElements(p);
  need(elements <= MAX_FINE_ELEMENTS, `Mesh size ${p.meshSize} mm is too fine for this plate (about ${Math.round(elements)} elements on the finest of the 3 levels). Use a larger mesh size.`);
  if (p.probe) {
    need(Number.isFinite(p.probe.x) && Number.isFinite(p.probe.y), 'The result point needs both x and y.');
    need(insidePlate(p, p.probe.x, p.probe.y), 'The result point must be inside the plate material (not on an edge or in the hole).');
  }
  return errors;
}

function title(id) { return id.charAt(0) + id.slice(1).toLowerCase(); }

/**
 * Largest estimated element count on the finest level (h/4). Above this the study takes minutes and
 * the browser stays busy, so a larger mesh size is asked for instead.
 */
export const MAX_FINE_ELEMENTS = 4000;

/** Rough T6 element count on the finest level (h/4), for the size guard. */
export function estimateElements(p) {
  const hFine = p.meshSize / 4;
  const area = p.length * p.height - (p.shape === 'HOLE' ? Math.PI * (p.holeDiameter / 2) ** 2 : 0);
  return 2.3 * area / (hFine * hFine);
}

function insidePlate(p, x, y) {
  const margin = 1e-6 * Math.max(p.length, p.height);
  if (!(x > margin && x < p.length - margin && y > margin && y < p.height - margin)) return false;
  if (p.shape !== 'HOLE') return true;
  return Math.hypot(x - p.length / 2, y - p.height / 2) > p.holeDiameter / 2 * (1 + 1e-6);
}

/** The main load direction: 'x' when the normal stress on LEFT/RIGHT dominates, else 'y'. */
export function plateLoadAxis(p) {
  const sx = Math.max(Math.abs(p.edges.LEFT.normal), Math.abs(p.edges.RIGHT.normal));
  const sy = Math.max(Math.abs(p.edges.BOTTOM.normal), Math.abs(p.edges.TOP.normal));
  return sx >= sy ? 'x' : 'y';
}

/** Nominal (applied) stress: the largest normal edge stress. */
export function plateNominalStress(p) {
  return Math.max(...PLATE_EDGES.map((id) => Math.abs(p.edges[id].normal)));
}

/** A point at radius factor `rf` (× hole radius) from the hole centre, `offsetDegrees` from the crown. */
function crownPoint(p, rf, offsetDegrees) {
  const r = (p.holeDiameter / 2) * rf;
  const crown = plateLoadAxis(p) === 'x' ? Math.PI / 2 : 0;
  const angle = crown + (offsetDegrees * Math.PI) / 180;
  return { x: p.length / 2 + r * Math.cos(angle), y: p.height / 2 + r * Math.sin(angle) };
}

/**
 * The result point checked by the convergence study. Automatic: the total displacement just inside
 * the middle of the most heavily loaded edge, for both shapes. Displacement is a whole-plate result
 * and converges steadily as the mesh is refined, so the study shows real convergence.
 *
 * Why not a stress point: in a plain plate the stress is nearly uniform and exact on every mesh, so a
 * stress point changes only at rounding level, with no trend (the study calls that oscillatory). Near a
 * hole, the mesh at the hole edge is set by the arc resolution (15° segments), not by h, and direct
 * element stresses there move up and down by about 1–2% between meshes, so a stress point near the hole
 * passes or fails the study depending on the mesh size chosen. The peak stress for Kt is reported
 * separately (platePeakPoint), with its change between the coarsest and finest mesh.
 */
export function plateProbe(p) {
  if (p.probe) return { ...p.probe, automatic: false };
  const load = (id) => Math.abs(p.edges[id].normal) + Math.abs(p.edges[id].shear);
  const loaded = [...PLATE_EDGES].sort((a, b) => load(b) - load(a))[0];
  const inset = 0.003;
  const point = {
    LEFT: { x: inset * p.length, y: (0.5 + 0.013) * p.height },
    RIGHT: { x: (1 - inset) * p.length, y: (0.5 + 0.013) * p.height },
    BOTTOM: { x: (0.5 + 0.013) * p.length, y: inset * p.height },
    TOP: { x: (0.5 + 0.013) * p.length, y: (1 - inset) * p.height },
  }[loaded];
  return { ...point, quantityId: 'DISPLACEMENT_MAGNITUDE', automatic: true, location: `middle of the ${loaded.toLowerCase()} edge (the most loaded edge)` };
}

/**
 * The peak point for Kt: maximum principal stress just inside the hole edge at the crown, where the
 * peak tensile stress is (0.2% of the radius in, 1.3° off the crown line, so it never lies on a mesh
 * line). Null for a plain plate.
 */
export function platePeakPoint(p) {
  if (p.shape !== 'HOLE') return null;
  return { ...crownPoint(p, 1.002, 1.3), quantityId: 'PRINCIPAL_MAXIMUM' };
}

/** A physical-probe request for a point and quantity (the shape the workbench store evaluates). */
export function platePhysicalProbe(p, point, probeId) {
  const q = PLATE_PROBE_QUANTITIES[point.quantityId];
  const stress = q.units === 'MPa';
  return {
    schema: 'lafea-continuum-physical-probe/v1',
    probeId,
    physicalCoordinate: { x: point.x, y: point.y },
    coordinateFrame: 'GLOBAL_XY',
    loadCaseId: LOAD_CASE,
    quantityId: point.quantityId,
    representation: 'PHYSICAL_POINT_DIRECT',
    recoveryMethod: stress ? 'ELEMENT_LOCAL_DIRECT_DISPLACEMENT_GRADIENT' : 'ELEMENT_SHAPE_INTERPOLATION',
    units: q.units,
    singularityClassification: stress ? (p.shape === 'HOLE' ? 'HIGH_GRADIENT_CONVERGENCE' : 'NON_SINGULAR_ANALYTICAL') : 'NOT_APPLICABLE',
  };
}

/**
 * Reference stress concentration for a central hole in a finite-width plate in uniaxial tension,
 * or null when the loading is not uniaxial tension. Kt,net = 3.00 − 3.13(d/W) + 3.66(d/W)² − 1.53(d/W)³
 * (the finite-width fit given in Roark's Formulas for Stress and Strain), on the net section; Kt,gross =
 * Kt,net / (1 − d/W). W is the plate width across the load. The infinite-plate value is 3 (Kirsch).
 */
export function plateReferenceKt(p) {
  if (p.shape !== 'HOLE') return null;
  const axis = plateLoadAxis(p);
  const loaded = axis === 'x' ? ['LEFT', 'RIGHT'] : ['BOTTOM', 'TOP'];
  const other = axis === 'x' ? ['BOTTOM', 'TOP'] : ['LEFT', 'RIGHT'];
  const tension = loaded.some((id) => p.edges[id].normal > 0);
  const clean = loaded.every((id) => p.edges[id].normal >= 0)
    && other.every((id) => p.edges[id].normal === 0)
    && PLATE_EDGES.every((id) => p.edges[id].shear === 0);
  if (!tension || !clean) return null;
  const W = axis === 'x' ? p.height : p.length;
  const ratio = p.holeDiameter / W;
  if (!(ratio > 0 && ratio <= 0.5)) return null;
  const net = 3.0 - 3.13 * ratio + 3.66 * ratio ** 2 - 1.53 * ratio ** 3;
  return { dOverW: ratio, ktNet: net, ktGross: net / (1 - ratio), width: W };
}

function source(p) {
  // The source document carries the material, thickness and load-case identity only. The analysis
  // mesh, supports and loads come from the analysis domain (domain-first route).
  const node = (nodeId, x, y) => ({ nodeId, x, y, sourceReference: `PLATE_SOURCE_NODE#${nodeId}` });
  return {
    schema: MODEL_SCHEMA,
    modelIdentity: 'LAFEA_APP_PLATE',
    modelVersion: '1',
    sourceAncestry: { sourceModelIdentity: 'LAFEA_APP_PLATE_FORM', sourceVersion: '1', adapterIdentity: 'LAFEA_APP_PLATE_FORM', adapterVersion: '1' },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: FORMULATIONS.PLANE_STRESS,
    materials: [{ materialId: 'MAT', elasticModulus: p.elasticModulus, poissonRatio: p.poissonRatio, sourceReference: 'PLATE_FORM#MATERIAL' }],
    nodes: [node('SRC-A', 0, 0), node('SRC-B', 1, 0), node('SRC-C', 0, 1)],
    elements: [{ elementId: 'SRC-E1', elementType: 'T3', nodeIds: ['SRC-A', 'SRC-B', 'SRC-C'], materialId: 'MAT', thickness: p.thickness, sourceReference: 'PLATE_FORM#SOURCE_PLACEHOLDER' }],
    elementTypePolicy: { allowT3Fallback: true, sourceReference: 'PLATE_FORM#SOURCE_PLACEHOLDER_NOT_MESH_AUTHORITY' },
    constraints: [
      { constraintId: 'SRC-C1', nodeId: 'SRC-A', dof: 'UX', value: 0, sourceReference: 'PLATE_FORM#SOURCE_PLACEHOLDER' },
      { constraintId: 'SRC-C2', nodeId: 'SRC-A', dof: 'UY', value: 0, sourceReference: 'PLATE_FORM#SOURCE_PLACEHOLDER' },
    ],
    loadCases: [{
      loadCaseId: LOAD_CASE,
      nodalForces: [], edgeTractions: [], pressureLoads: [], bodyForces: [], temperatureLoads: [], imposedDisplacements: [],
      sourceReference: 'PLATE_FORM#DOMAIN_FIRST_ATTACHMENT_AUTHORITY',
    }],
    resultRequests: { loadCaseIds: [LOAD_CASE] },
    qualificationProfile: JSON.parse(JSON.stringify(QUALIFICATION_PROFILE)),
    limitations: ['PLATE_FORM_SOURCE_GEOMETRY_IS_NOT_ANALYSIS_MESH_AUTHORITY'],
  };
}

function geometryOf(p) {
  const L = p.length;
  const H = p.height;
  const line = (segmentId, startVertexId, endVertexId) => ({ segmentId, type: 'LINE', startVertexId, endVertexId });
  const vertices = [
    { vertexId: 'BL', x: 0, y: 0 }, { vertexId: 'BR', x: L, y: 0 },
    { vertexId: 'TR', x: L, y: H }, { vertexId: 'TL', x: 0, y: H },
  ];
  const segments = [line('BOTTOM', 'BL', 'BR'), line('RIGHT', 'BR', 'TR'), line('TOP', 'TR', 'TL'), line('LEFT', 'TL', 'BL')];
  const loops = [{ loopId: 'OUTER', role: 'OUTER', segmentIds: ['BOTTOM', 'RIGHT', 'TOP', 'LEFT'] }];
  if (p.shape === 'HOLE') {
    const a = p.holeDiameter / 2;
    const cx = L / 2;
    const cy = H / 2;
    vertices.push(
      { vertexId: 'HE', x: cx + a, y: cy }, { vertexId: 'HS', x: cx, y: cy - a },
      { vertexId: 'HW', x: cx - a, y: cy }, { vertexId: 'HN', x: cx, y: cy + a },
    );
    const arc = (segmentId, startVertexId, endVertexId) => ({
      segmentId, type: 'CIRCULAR_ARC', startVertexId, endVertexId, centerX: cx, centerY: cy, radius: a, sweep: 'CW',
    });
    // Hole loops run clockwise (OUTER_CCW_HOLES_CW_V1).
    segments.push(arc('HOLE-ES', 'HE', 'HS'), arc('HOLE-SW', 'HS', 'HW'), arc('HOLE-WN', 'HW', 'HN'), arc('HOLE-NE', 'HN', 'HE'));
    loops.push({ loopId: 'HOLE', role: 'HOLE', segmentIds: ['HOLE-ES', 'HOLE-SW', 'HOLE-WN', 'HOLE-NE'] });
  }
  return createLafeaAnalysisGeometry({
    schema: LAFEA_ANALYSIS_GEOMETRY_SCHEMA,
    stageId: STAGE,
    geometryId: `PLATE-${p.shape}-DOMAIN`,
    coordinateSystemId: 'GLOBAL_XY',
    lengthUnit: 'mm',
    orientationPolicy: LAFEA_ANALYSIS_GEOMETRY_ORIENTATION_POLICY,
    vertices,
    segments,
    loops,
  });
}

function attachmentsOf(p) {
  const rows = [];
  const add = (attachmentId, kind, targetId, payload) => rows.push({
    attachmentId, kind, targetType: 'SEGMENT', targetId, physicalCaseIds: [LOAD_CASE], payload,
  });
  for (const id of PLATE_EDGES) {
    const e = p.edges[id];
    if (e.support === 'FIXED') add(`SUPPORT-${id}`, 'RESTRAINT', id, { ux: true, uy: true });
    if (e.support === 'ROLLER_X') add(`SUPPORT-${id}`, 'RESTRAINT', id, { ux: true });
    if (e.support === 'ROLLER_Y') add(`SUPPORT-${id}`, 'RESTRAINT', id, { uy: true });
    if (e.normal !== 0 || e.shear !== 0) {
      const [nx, ny] = OUTWARD[id];
      const [sx, sy] = SHEAR_DIRECTION[id];
      add(`LOAD-${id}`, 'TRACTION', id, { tx: e.normal * nx + e.shear * sx, ty: e.normal * ny + e.shear * sy, unit: 'MPa' });
    }
  }
  return rows;
}

/** Mesh profile at target size h (T6 quadratic triangles). */
export function plateMeshProfile(h) {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: `APP-PLATE-T6-${h}`,
    sourceRevision: 'APP-PLATE.1',
    semanticHash: undefined,
    fields: { ...defaultProfileFields(PROFILE_KINDS.MESH), continuumElement: 'T6', shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1', globalTargetSize: h },
  });
}

/** Convergence study request on the result point: 3 levels h, h/2, h/4. */
export function plateConvergenceRequest(p, studyId = 'plate-result-point') {
  const h = p.meshSize;
  return {
    schema: 'lafea-continuum-convergence-study-request/v1',
    studyId,
    probe: platePhysicalProbe(p, plateProbe(p), `${studyId}/probe`),
    levels: [{ levelId: 'COARSE', h }, { levelId: 'MEDIUM', h: h / 2 }, { levelId: 'FINE', h: h / 4 }],
  };
}

/** Everything the controller needs to start on this plate. Throws on invalid input. */
export function buildPlateModel(raw) {
  const p = normalizePlateInput(raw);
  const errors = validatePlateInput(p);
  if (errors.length) {
    const error = new Error(errors[0]);
    error.code = 'LAFEA_PLATE_INPUT_INVALID';
    error.reasons = errors;
    throw error;
  }
  const composition = requireLafeaStageComposition(STAGE);
  const normalizedSource = composition.normalizeDocument(source(p));
  const authority = issueLafeaSourceAuthority(STAGE, normalizedSource, 'LAFEA_APP_PLATE_FORM');
  const geometry = geometryOf(p);
  const domain = createLafeaContinuumAnalysisDomain({
    schema: LAFEA_CONTINUUM_ANALYSIS_DOMAIN_SCHEMA,
    stageId: STAGE,
    sourceHash: authority.sourceHash,
    applicationRef: `LAFEA_APP_PLATE_FORM/${p.shape}`,
    units: { length: 'mm', force: 'N', stress: 'MPa', temperature: 'C' },
    formulation: 'PLANE_STRESS',
    region: { regionId: 'REGION-1', materialRef: 'MAT' },
    physicalCases: [{ caseId: LOAD_CASE }],
    attachments: attachmentsOf(p),
  }, geometry);
  const geometryEvidence = createLafeaAnalysisGeometryEvidence({
    schema: LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SCHEMA,
    stageId: STAGE,
    sourceHash: authority.sourceHash,
    analysisDomain: domain,
    geometry,
    producerRef: 'LAFEA_APP_PLATE_FORM/GEOMETRY',
    profileId: LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_PROFILE,
  });
  return {
    input: p,
    source: normalizedSource,
    authority,
    geometry,
    domain,
    geometryEvidence,
    meshProfile: plateMeshProfile(p.meshSize),
    convergenceRequest: plateConvergenceRequest(p),
    probe: plateProbe(p),
    peakProbe: platePeakPoint(p) ? platePhysicalProbe(p, platePeakPoint(p), 'plate-hole-edge-peak/probe') : null,
    nominalStress: plateNominalStress(p),
    referenceKt: plateReferenceKt(p),
  };
}
