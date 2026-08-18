import { canonicalDigest, recordContentDigest } from './canonical.js'
import { buildEvidenceGraph } from './graph.js'

function artifactMaterial(artifact) {
  return {
    kind: artifact.kind,
    uri: artifact.immutableUrl ?? artifact.url,
    sourceUri: artifact.url,
    ...(artifact.revision === undefined ? {} : { revision: artifact.revision }),
    ...(artifact.license === undefined ? {} : { license: artifact.license }),
    ...(artifact.gated === undefined ? {} : { gated: artifact.gated }),
  }
}

/** Freeze the current readiness and execution evidence into a canonical handoff manifest. */
export function createReproductionManifest({ record, assessment, runs = [], sourceCatalogDigest }) {
  if (record === null || typeof record !== 'object' || typeof record.id !== 'string') {
    throw new TypeError('manifest requires a record')
  }
  if (assessment === null || typeof assessment !== 'object' || assessment.recordId !== record.id) {
    throw new TypeError('manifest requires the saved assessment for this record')
  }
  const graph = buildEvidenceGraph({ record, assessment, runs })
  const contentDigest = record.contentDigest ?? recordContentDigest(record)
  const evidenceMaterials = Object.entries(assessment.requirements ?? {}).flatMap(([requirement, value]) =>
    (value.evidence ?? []).map(reference => ({ kind: 'requirement-evidence', requirement, uri: reference })))
  const materials = [
    {
      kind: 'specification',
      uri: record.url,
      contentDigest,
      ...(record.arxivId === undefined ? {} : { arxivId: record.arxivId }),
      ...(record.arxivVersion === undefined ? {} : { arxivVersion: record.arxivVersion }),
    },
    ...(record.artifacts ?? []).map(artifactMaterial),
    ...evidenceMaterials,
  ]
  const uniqueMaterials = [...new Map(materials.map(material => [`${material.kind}:${material.uri}`, material])).values()]
  const body = {
    schema: 'https://github.com/JimchengChina/dsh-frontier-repro/blob/main/docs/reproduction-manifest.schema.json',
    version: 1,
    record: {
      id: record.id,
      title: record.title,
      url: record.url,
      sourceId: record.sourceId,
      sourceClass: record.sourceClass,
      contentDigest,
    },
    plan: {
      assessmentId: assessment.id,
      target: assessment.target,
      mode: assessment.mode,
      status: assessment.status,
      assessedAt: assessment.assessedAt,
      requirements: assessment.requirements,
      environment: assessment.environment,
      rubric: assessment.rubric,
      rubricDigest: assessment.rubricDigest,
      missingConditions: assessment.missingConditions,
    },
    materials: uniqueMaterials,
    steps: [
      { id: 'prepare', state: assessment.status.startsWith('ready_') ? 'ready' : 'blocked', actions: assessment.nextActions },
      { id: 'execute', state: runs.length > 0 ? 'observed' : 'not_run', commands: runs.flatMap(run => run.commands ?? []).slice(0, 100) },
      { id: 'evaluate', state: runs.length > 0 ? 'observed' : 'not_run', rubricDigest: assessment.rubricDigest },
    ],
    products: runs.flatMap(run => (run.artifacts ?? []).map(reference => ({ runId: run.id, uri: reference }))).slice(0, 200),
    byproducts: runs.map(run => ({
      runId: run.id,
      verdict: run.verdict,
      metrics: run.metrics,
      ...(run.rubricGrade === undefined ? {} : { rubricGrade: run.rubricGrade }),
      ...(run.deviations === undefined ? {} : { deviations: run.deviations }),
      ...(run.recordedAt === undefined ? {} : { recordedAt: run.recordedAt }),
    })),
    evidenceGraphDigest: graph.digest,
    sourceCatalogDigest,
  }
  return {
    ...body,
    integrity: { algorithm: 'sha256', digest: canonicalDigest(body) },
  }
}
