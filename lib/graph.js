import { canonicalDigest, recordContentDigest } from './canonical.js'

function nodeId(kind, identity) {
  return `${kind}:${canonicalDigest(identity).slice(0, 20)}`
}

function addNode(nodes, node) {
  if (!nodes.has(node.id)) nodes.set(node.id, node)
  return node.id
}

/** Build a portable, deterministic evidence topology without reading the network. */
export function buildEvidenceGraph({ record, assessment, runs = [] }) {
  if (record === null || typeof record !== 'object' || typeof record.id !== 'string') {
    throw new TypeError('evidence graph requires a record')
  }
  const nodes = new Map()
  const edges = []
  const issues = []
  const sourceId = addNode(nodes, {
    id: `source:${record.sourceId}`,
    kind: 'source',
    sourceId: record.sourceId,
    sourceClass: record.sourceClass,
    ...(record.sourceName === undefined ? {} : { label: record.sourceName }),
    ...(record.provenance?.sourceUrl === undefined ? {} : { url: record.provenance.sourceUrl }),
  })
  const recordId = addNode(nodes, {
    id: `record:${record.id}`,
    kind: 'record',
    recordId: record.id,
    label: record.title,
    url: record.url,
    contentDigest: record.contentDigest ?? recordContentDigest(record),
  })
  edges.push({ from: sourceId, to: recordId, relation: 'observed' })

  for (const artifact of record.artifacts ?? []) {
    const id = addNode(nodes, {
      id: nodeId('artifact', artifact.url),
      kind: 'artifact',
      artifactKind: artifact.kind,
      url: artifact.url,
      ...(artifact.immutableUrl === undefined ? {} : { immutableUrl: artifact.immutableUrl }),
      ...(artifact.revision === undefined ? {} : { revision: artifact.revision }),
      ...(artifact.license === undefined ? {} : { license: artifact.license }),
      ...(artifact.gated === undefined ? {} : { gated: artifact.gated }),
    })
    edges.push({ from: recordId, to: id, relation: 'links' })
    if (artifact.kind === 'code' && artifact.revision === undefined) {
      issues.push({ code: 'unpinned_code', nodeId: id, action: 'Resolve the repository to an immutable commit before execution.' })
    }
    if ((artifact.kind === 'model' || artifact.kind === 'dataset') && artifact.revision === undefined) {
      issues.push({ code: `unpinned_${artifact.kind}`, nodeId: id, action: `Resolve the Hugging Face ${artifact.kind} to an immutable repository SHA before execution.` })
    }
    if ((artifact.kind === 'model' || artifact.kind === 'dataset') && artifact.gated && artifact.gated !== false) {
      issues.push({ code: 'gated_artifact', nodeId: id, action: 'Document account approval and access entitlement.' })
    }
  }

  if (assessment !== undefined) {
    const assessmentId = addNode(nodes, {
      id: `assessment:${assessment.id}`,
      kind: 'assessment',
      mode: assessment.mode,
      status: assessment.status,
      target: assessment.target,
    })
    edges.push({ from: recordId, to: assessmentId, relation: 'assessed_as' })
    for (const [key, requirement] of Object.entries(assessment.requirements ?? {})) {
      const requirementId = addNode(nodes, {
        id: `requirement:${record.id}:${key}`,
        kind: 'requirement',
        requirement: key,
        state: requirement.state,
        note: requirement.note,
      })
      edges.push({ from: assessmentId, to: requirementId, relation: 'requires' })
      if (requirement.state === 'missing' || requirement.state === 'unknown') {
        const action = assessment.missingConditions?.find(item => item.requirement === key)?.action
        issues.push({ code: `requirement_${requirement.state}`, nodeId: requirementId, ...(action === undefined ? {} : { action }) })
      }
      for (const evidence of requirement.evidence ?? []) {
        const evidenceId = addNode(nodes, {
          id: nodeId('evidence', evidence),
          kind: 'evidence',
          reference: evidence,
        })
        edges.push({ from: requirementId, to: evidenceId, relation: 'supported_by' })
      }
    }
  }

  for (const run of runs) {
    const runId = addNode(nodes, {
      id: `run:${run.id}`,
      kind: 'run',
      mode: run.mode,
      verdict: run.verdict,
      ...(run.recordedAt === undefined ? {} : { recordedAt: run.recordedAt }),
    })
    edges.push({ from: recordId, to: runId, relation: 'executed_as' })
    for (const artifact of run.artifacts ?? []) {
      const outputId = addNode(nodes, { id: nodeId('output', artifact), kind: 'output', reference: artifact })
      edges.push({ from: runId, to: outputId, relation: 'produced' })
    }
  }

  const graph = {
    version: 1,
    root: recordId,
    nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)),
    edges: edges.sort((left, right) => `${left.from}:${left.relation}:${left.to}`.localeCompare(`${right.from}:${right.relation}:${right.to}`)),
    issues: issues.sort((left, right) => `${left.code}:${left.nodeId}`.localeCompare(`${right.code}:${right.nodeId}`)),
  }
  return {
    ...graph,
    summary: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      issues: graph.issues.length,
      artifactKinds: [...new Set(graph.nodes.filter(node => node.kind === 'artifact').map(node => node.artifactKind))].sort(),
    },
    digest: canonicalDigest(graph),
  }
}
