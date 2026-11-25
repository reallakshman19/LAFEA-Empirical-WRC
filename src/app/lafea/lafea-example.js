/**
 * LAFEA.3 worked example: a plane-stress cantilever plate, fixed along its left edge and
 * loaded by a uniform shear traction on its free end.
 *
 * Mounted through the same domain-first route the qualified A17 browser journey uses:
 * source document → source authority → analysis domain → analysis geometry evidence →
 * mesh profile → mesh. Distributed loads only, so displacement converges under refinement
 * (a 2-D point load is singular and correctly reports DIVERGENT).
 *
 * Hand check (Euler–Bernoulli plus shear): tip deflection
 *   δ = P L³ / (3 E I) + P L / (κ G A),  P = τ · h · t
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

export const LAFEA_EXAMPLE = Object.freeze({
  id: 'CANTILEVER_PLATE',
  title: 'Cantilever plate, end shear (plane stress)',
  length: 200, // mm
  depth: 40, // mm
  thickness: 10, // mm
  elasticModulus: 200000, // MPa
  poissonRatio: 0.3,
  endShear: -5, // MPa, uniform traction ty on the free end
  coarseMesh: 40, // mm; ladder 40 → 20 → 10 (a 5 mm level exceeds the qualified solve size)
  // Just inside the free end, off every mesh line of the 40 / 20 / 10 mm ladder (a probe on a shared edge is ambiguous).
  probe: Object.freeze({ x: 198.7, y: 21.3, quantityId: 'DISPLACEMENT_Y' }),
});

/** Beam-theory tip deflection for the example (mm, signed like the load). */
export function lafeaExampleHandTipDeflection(ex = LAFEA_EXAMPLE) {
  const P = ex.endShear * ex.depth * ex.thickness;
  const I = ex.thickness * ex.depth ** 3 / 12;
  const A = ex.thickness * ex.depth;
  const G = ex.elasticModulus / (2 * (1 + ex.poissonRatio));
  return P * ex.length ** 3 / (3 * ex.elasticModulus * I) + P * ex.length / ((5 / 6) * G * A);
}

export function lafeaExampleSource(ex = LAFEA_EXAMPLE) {
  const node = (nodeId, x, y) => ({ nodeId, x, y, sourceReference: `NODE#${nodeId}` });
  const constraint = (constraintId, nodeId, dof) => ({ constraintId, nodeId, dof, value: 0, sourceReference: `CONSTRAINT#${constraintId}` });
  return {
    schema: MODEL_SCHEMA,
    modelIdentity: ex.id,
    modelVersion: '1',
    sourceAncestry: { sourceModelIdentity: 'LAFEA_APP_EXAMPLE', sourceVersion: '1', adapterIdentity: 'LAFEA_APP_EXAMPLE', adapterVersion: '1' },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: FORMULATIONS.PLANE_STRESS,
    materials: [{ materialId: 'MAT', elasticModulus: ex.elasticModulus, poissonRatio: ex.poissonRatio, sourceReference: 'MATERIAL#MAT' }],
    nodes: [node('A', 0, 0), node('B', ex.length, 0), node('C', ex.length, ex.depth), node('D', 0, ex.depth)],
    elements: [
      { elementId: 'E1', elementType: 'T3', nodeIds: ['A', 'B', 'D'], materialId: 'MAT', thickness: ex.thickness, sourceReference: 'ELEMENT#E1' },
      { elementId: 'E2', elementType: 'T3', nodeIds: ['B', 'C', 'D'], materialId: 'MAT', thickness: ex.thickness, sourceReference: 'ELEMENT#E2' },
    ],
    elementTypePolicy: { allowT3Fallback: true, sourceReference: 'LAFEA_APP_EXAMPLE' },
    constraints: [constraint('C1', 'A', 'UX'), constraint('C2', 'A', 'UY'), constraint('C3', 'D', 'UX'), constraint('C4', 'D', 'UY')],
    loadCases: [{
      loadCaseId: 'L1',
      nodalForces: [],
      edgeTractions: [{ tractionId: 'T1', elementId: 'E2', edgeNodeIds: ['B', 'C'], tx: 0, ty: ex.endShear, sourceReference: 'TRACTION#T1' }],
      pressureLoads: [], bodyForces: [], temperatureLoads: [], imposedDisplacements: [],
      sourceReference: 'CASE#L1',
    }],
    resultRequests: { loadCaseIds: ['L1'] },
    qualificationProfile: JSON.parse(JSON.stringify(QUALIFICATION_PROFILE)),
    limitations: [],
  };
}

export function lafeaExampleMeshProfile(globalTargetSize = LAFEA_EXAMPLE.coarseMesh) {
  return canonicalProfile(PROFILE_KINDS.MESH, {
    schema: 'lafea-mesh-profile/v1',
    profileIdentity: `APP-EXAMPLE-T6-${globalTargetSize}`,
    sourceRevision: 'APP-EXAMPLE.1',
    semanticHash: undefined,
    fields: {
      ...defaultProfileFields(PROFILE_KINDS.MESH),
      continuumElement: 'T6',
      shellElement: 'CST_DKT_TRI3_THIN_SHELL_V1',
      globalTargetSize,
    },
  });
}

/** Everything the controller needs to start on the example. */
export function buildLafeaExample(ex = LAFEA_EXAMPLE) {
  const composition = requireLafeaStageComposition('LAFEA.3');
  const source = composition.normalizeDocument(lafeaExampleSource(ex));
  const authority = issueLafeaSourceAuthority('LAFEA.3', source, 'LAFEA_APP_EXAMPLE');
  const line = (segmentId, startVertexId, endVertexId) => ({ segmentId, type: 'LINE', startVertexId, endVertexId });
  const geometry = createLafeaAnalysisGeometry({
    schema: LAFEA_ANALYSIS_GEOMETRY_SCHEMA,
    stageId: 'LAFEA.3',
    geometryId: `${ex.id}-DOMAIN`,
    coordinateSystemId: 'GLOBAL_XY',
    lengthUnit: 'mm',
    orientationPolicy: LAFEA_ANALYSIS_GEOMETRY_ORIENTATION_POLICY,
    vertices: [
      { vertexId: 'A', x: 0, y: 0 }, { vertexId: 'B', x: ex.length, y: 0 },
      { vertexId: 'C', x: ex.length, y: ex.depth }, { vertexId: 'D', x: 0, y: ex.depth },
    ],
    segments: [line('BOTTOM', 'A', 'B'), line('END', 'B', 'C'), line('TOP', 'C', 'D'), line('FIXED', 'D', 'A')],
    loops: [{ loopId: 'OUTER', role: 'OUTER', segmentIds: ['BOTTOM', 'END', 'TOP', 'FIXED'] }],
  });
  const attachment = (attachmentId, kind, targetType, targetId, payload) => ({
    attachmentId, kind, targetType, targetId, physicalCaseIds: ['L1'], payload,
  });
  const domain = createLafeaContinuumAnalysisDomain({
    schema: LAFEA_CONTINUUM_ANALYSIS_DOMAIN_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: authority.sourceHash,
    applicationRef: 'LAFEA_APP_EXAMPLE/CANTILEVER',
    units: { length: 'mm', force: 'N', stress: 'MPa', temperature: 'C' },
    formulation: 'PLANE_STRESS',
    region: { regionId: 'REGION-1', materialRef: 'MAT' },
    physicalCases: [{ caseId: 'L1' }],
    attachments: [
      attachment('FIXED-EDGE', 'RESTRAINT', 'SEGMENT', 'FIXED', { ux: true, uy: true }),
      attachment('END-SHEAR', 'TRACTION', 'SEGMENT', 'END', { tx: 0, ty: ex.endShear, unit: 'MPa' }),
    ],
  }, geometry);
  const geometryEvidence = createLafeaAnalysisGeometryEvidence({
    schema: LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: authority.sourceHash,
    analysisDomain: domain,
    geometry,
    producerRef: 'LAFEA_APP_EXAMPLE/GEOMETRY',
    profileId: LAFEA_ANALYSIS_GEOMETRY_EVIDENCE_PROFILE,
  });
  return { example: ex, source, authority, geometry, domain, geometryEvidence };
}

/** Convergence-study request for the example's tip probe (3 levels, 2:1). */
export function lafeaExampleConvergenceRequest(ex = LAFEA_EXAMPLE, studyId = 'cantilever-tip-deflection') {
  const h = ex.coarseMesh;
  return {
    schema: 'lafea-continuum-convergence-study-request/v1',
    studyId,
    probe: {
      schema: 'lafea-continuum-physical-probe/v1',
      probeId: `${studyId}/probe`,
      physicalCoordinate: { x: ex.probe.x, y: ex.probe.y },
      coordinateFrame: 'GLOBAL_XY',
      loadCaseId: 'L1',
      quantityId: ex.probe.quantityId,
      representation: 'PHYSICAL_POINT_DIRECT',
      recoveryMethod: 'ELEMENT_SHAPE_INTERPOLATION',
      units: 'mm',
      singularityClassification: 'NOT_APPLICABLE',
    },
    levels: [{ levelId: 'COARSE', h }, { levelId: 'MEDIUM', h: h / 2 }, { levelId: 'FINE', h: h / 4 }],
  };
}
