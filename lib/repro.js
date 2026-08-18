export const REQUIREMENT_KEYS = Object.freeze([
  'specification',
  'code',
  'model_access',
  'data',
  'compute',
  'runtime',
  'license',
  'evaluation',
  'reference_access',
  'safety_and_scope',
])

export const MODES = Object.freeze({
  exact: ['specification', 'code', 'model_access', 'data', 'compute', 'runtime', 'license', 'evaluation', 'safety_and_scope'],
  scaled: ['specification', 'code', 'model_access', 'data', 'compute', 'runtime', 'license', 'evaluation', 'safety_and_scope'],
  behavioral: ['specification', 'reference_access', 'runtime', 'license', 'evaluation', 'safety_and_scope'],
})

export const CLAIM_MODES = Object.freeze({
  execute_existing: ['specification', 'code', 'model_access', 'data', 'compute', 'runtime', 'license', 'evaluation', 'safety_and_scope'],
  partial_reimplementation: ['specification', 'code', 'data', 'compute', 'runtime', 'license', 'evaluation', 'safety_and_scope'],
  from_scratch_replication: ['specification', 'data', 'compute', 'runtime', 'license', 'evaluation', 'safety_and_scope'],
})

export const EQUIVALENCE_LEVELS = Object.freeze(['exact', 'scaled', 'toy'])

const STATES = new Set(['available', 'missing', 'unknown', 'not_required'])
const MAX_PERSISTED_VALUE_BYTES = 64 * 1024
const RUBRIC_OPERATORS = new Set(['gte', 'lte', 'equal', 'within'])

const ACTIONS = Object.freeze({
  specification: 'Obtain the primary paper/specification and pin its version, claims, inputs, outputs, and algorithm details.',
  code: 'Locate the authors’ code at a pinned commit; otherwise document the pseudocode gaps before implementing a clean-room substitute.',
  model_access: 'Obtain the exact weights/API entitlement, or name a compatible smaller/open substitute and downgrade the reproduction mode.',
  data: 'Acquire the named dataset and split/checksum, or define a legal surrogate and document distribution differences.',
  compute: 'Record accelerator type/count, VRAM, storage, expected runtime, and a budget estimate before running.',
  runtime: 'Pin OS, drivers, CUDA/runtime, framework, dependencies, seeds, and launch commands.',
  license: 'Resolve code, model, data, API, and output licenses before copying, training, or redistributing artifacts.',
  evaluation: 'Implement the primary metric and baseline with the official split and a numeric acceptance tolerance.',
  reference_access: 'Secure access to reference outputs, a public API, traces, or an executable system for behavioral comparison.',
  safety_and_scope: 'State excluded harmful uses, data/privacy constraints, and any sandbox or human-review requirements.',
})

function validateRequirement(key, value, required) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { state: 'unknown', evidence: [], note: '', problem: `${key} must be an object` }
  }
  const state = STATES.has(value.state) ? value.state : 'unknown'
  const evidence = Array.isArray(value.evidence)
    ? value.evidence.filter(item => typeof item === 'string' && item.trim() !== '')
      .map(item => item.trim().slice(0, 2_000)).slice(0, 20)
    : []
  const note = typeof value.note === 'string' ? value.note.trim().slice(0, 2_000) : ''
  let problem
  if (value.state !== state) problem = `${key}.state must be available, missing, unknown, or not_required`
  else if (state === 'available' && evidence.length === 0) problem = `${key} is available but has no evidence`
  else if (state === 'not_required' && note === '') problem = `${key} is not_required but has no justification`
  else if (required && state === 'not_required') problem = `${key} is required for this reproduction mode`
  return { state, evidence, note, ...(problem === undefined ? {} : { problem }) }
}

export function normalizeRubric(value) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new TypeError('rubric must be an array')
  if (value.length > 50) throw new TypeError('rubric may contain at most 50 criteria')
  const ids = new Set()
  return value.map((criterion, index) => {
    if (criterion === null || typeof criterion !== 'object' || Array.isArray(criterion)) {
      throw new TypeError(`rubric[${index}] must be an object`)
    }
    const id = typeof criterion.id === 'string' ? criterion.id.trim() : ''
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)) throw new TypeError(`rubric[${index}].id is invalid`)
    if (ids.has(id)) throw new TypeError(`duplicate rubric id: ${id}`)
    ids.add(id)
    const description = typeof criterion.description === 'string' ? criterion.description.trim().slice(0, 1_000) : ''
    const metric = typeof criterion.metric === 'string' ? criterion.metric.trim().slice(0, 200) : ''
    const operator = RUBRIC_OPERATORS.has(criterion.operator) ? criterion.operator : undefined
    const weight = criterion.weight === undefined ? 1 : criterion.weight
    if (description === '') throw new TypeError(`rubric[${index}].description is required`)
    if (metric === '') throw new TypeError(`rubric[${index}].metric is required`)
    if (operator === undefined) throw new TypeError(`rubric[${index}].operator must be gte, lte, equal, or within`)
    if (!Number.isInteger(weight) || weight < 1 || weight > 100) throw new TypeError(`rubric[${index}].weight must be an integer from 1 to 100`)
    if (operator !== 'equal' && (typeof criterion.expected !== 'number' || !Number.isFinite(criterion.expected))) {
      throw new TypeError(`rubric[${index}].expected must be a finite number for ${operator}`)
    }
    if (operator === 'equal' && !['string', 'number', 'boolean'].includes(typeof criterion.expected)) {
      throw new TypeError(`rubric[${index}].expected must be a string, number, or boolean for equal`)
    }
    const tolerance = criterion.tolerance === undefined ? 0 : criterion.tolerance
    if (operator === 'within' && (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0)) {
      throw new TypeError(`rubric[${index}].tolerance must be a non-negative finite number`)
    }
    return {
      id,
      description,
      metric,
      operator,
      expected: criterion.expected,
      ...(operator === 'within' ? { tolerance } : {}),
      weight,
      required: criterion.required !== false,
    }
  })
}

function metricValue(metrics, key) {
  const value = metrics[key]
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value.actual ?? value.value
  return value
}

/** Grade measured metrics against an author-declared deterministic rubric. */
export function gradeRubric(rubricInput, metrics) {
  const rubric = normalizeRubric(rubricInput)
  const values = metrics !== null && typeof metrics === 'object' && !Array.isArray(metrics) ? metrics : {}
  const criteria = rubric.map((criterion) => {
    const actual = metricValue(values, criterion.metric)
    let passed = false
    let problem
    if (actual === undefined) problem = `metric ${criterion.metric} is missing`
    else if (criterion.operator === 'equal') passed = actual === criterion.expected
    else if (typeof actual !== 'number' || !Number.isFinite(actual)) problem = `metric ${criterion.metric} must be a finite number`
    else if (criterion.operator === 'gte') passed = actual >= criterion.expected
    else if (criterion.operator === 'lte') passed = actual <= criterion.expected
    else passed = Math.abs(actual - criterion.expected) <= criterion.tolerance
    return {
      ...criterion,
      ...(actual === undefined ? {} : { actual }),
      passed,
      ...(problem === undefined ? {} : { problem }),
    }
  })
  const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0)
  const earnedWeight = criteria.filter(criterion => criterion.passed).reduce((sum, criterion) => sum + criterion.weight, 0)
  const requiredPassed = criteria.filter(criterion => criterion.required).every(criterion => criterion.passed)
  return {
    passed: criteria.length > 0 && requiredPassed,
    score: totalWeight === 0 ? 0 : earnedWeight / totalWeight,
    earnedWeight,
    totalWeight,
    criteria,
    digest: canonicalDigest(rubric),
  }
}

/** Deterministically assess a declared evidence matrix without inventing missing requirements. */
export function assessReproduction({ recordId, target, mode, requirements, environment = {}, rubric: rubricInput }, now = Date.now()) {
  if (!Object.hasOwn(MODES, mode)) throw new TypeError(`unsupported reproduction mode: ${String(mode)}`)
  if (typeof target !== 'string' || target.trim() === '') throw new TypeError('target must be a non-empty string')
  if (requirements === null || typeof requirements !== 'object' || Array.isArray(requirements)) {
    throw new TypeError('requirements must be an object')
  }
  if (environment === null || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new TypeError('environment must be an object')
  }
  const rubric = normalizeRubric(rubricInput)
  if (Buffer.byteLength(JSON.stringify({ requirements, environment, rubric }), 'utf8') > MAX_PERSISTED_VALUE_BYTES) {
    throw new TypeError(`assessment evidence exceeds ${MAX_PERSISTED_VALUE_BYTES} UTF-8 bytes`)
  }
  const requiredKeys = new Set(MODES[mode])
  const matrix = Object.fromEntries(REQUIREMENT_KEYS.map(key => [
    key,
    validateRequirement(key, requirements[key] ?? { state: 'unknown' }, requiredKeys.has(key)),
  ]))
  const invalid = Object.entries(matrix).filter(([, value]) => value.problem !== undefined)
  const missing = [...requiredKeys].filter(key => matrix[key].state === 'missing')
  const unknown = [...requiredKeys].filter(key => matrix[key].state === 'unknown' || matrix[key].state === 'not_required')
  let status
  if (invalid.length > 0 || unknown.length > 0 || rubric.length === 0) status = 'insufficient_evidence'
  else if (missing.length > 0) status = 'blocked'
  else status = `ready_${mode}`
  const missingConditions = [...new Set([...missing, ...unknown, ...invalid.map(([key]) => key)])]
    .map(key => ({ requirement: key, state: matrix[key].state, action: ACTIONS[key] }))
  if (rubric.length === 0) missingConditions.push({
    requirement: 'rubric',
    state: 'missing',
    action: 'Define at least one weighted metric criterion with an expected value and comparison operator.',
  })
  const fallbackModes = mode === 'exact' ? ['scaled', 'behavioral'] : mode === 'scaled' ? ['behavioral'] : []
  return {
    id: `${recordId}:${mode}`,
    recordId,
    target: target.trim().slice(0, 500),
    mode,
    status,
    assertion: status.startsWith('ready_')
      ? 'All mode-required conditions are declared available with evidence. This does not mean the feature was reproduced; execution and evaluation are still required.'
      : 'Do not claim reproduction. Resolve the listed conditions or explicitly downgrade the mode.',
    required: [...requiredKeys],
    requirements: matrix,
    environment,
    rubric,
    rubricDigest: canonicalDigest(rubric),
    missingConditions,
    fallbackModes,
    nextActions: missingConditions.length > 0
      ? missingConditions.map(condition => condition.action)
      : [
          'Create an isolated workspace and pin every dependency and artifact version.',
          'Run the smallest official baseline before implementing changes.',
          'Execute the target reproduction and compare the declared primary metric to its tolerance.',
          'Record commands, artifact paths, metrics, failures, and deviations with frontier_repro_record_result.',
        ],
    assessedAt: new Date(now).toISOString(),
  }
}

function asStringArray(value, limit = 100) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim() !== '')
      .map(item => item.trim().slice(0, 4_000)).slice(0, limit)
    : []
}

function normalizeClaim(claim, index) {
  if (claim === null || typeof claim !== 'object' || Array.isArray(claim)) {
    throw new TypeError(`claims[${index}] must be an object`)
  }
  const rubric = normalizeRubric([{
    id: claim.id,
    description: claim.statement,
    metric: claim.metric,
    operator: claim.operator,
    expected: claim.expected,
    tolerance: claim.tolerance,
    weight: claim.weight,
    required: claim.required,
  }])[0]
  const evidence = asStringArray(claim.evidence, 20)
  return {
    id: rubric.id,
    statement: rubric.description,
    observable: typeof claim.observable === 'string' ? claim.observable.trim().slice(0, 1_000) : rubric.description,
    metric: rubric.metric,
    operator: rubric.operator,
    expected: rubric.expected,
    ...(rubric.tolerance === undefined ? {} : { tolerance: rubric.tolerance }),
    weight: rubric.weight,
    required: rubric.required,
    evidence,
    ...(evidence.length === 0 ? { problem: `claim ${rubric.id} requires primary-source evidence` } : {}),
  }
}

function claimsAsRubric(claims) {
  return claims.map(claim => ({
    id: claim.id,
    description: claim.statement,
    metric: claim.metric,
    operator: claim.operator,
    expected: claim.expected,
    ...(claim.tolerance === undefined ? {} : { tolerance: claim.tolerance }),
    weight: claim.weight,
    required: claim.required,
  }))
}

/** Gate a reproduction plan at the granularity of independently verifiable claims. */
export function assessClaims({
  targetId,
  targetType = 'event',
  targetDigest,
  targetVersion,
  target,
  mode,
  equivalence,
  claims: claimInput,
  requirements,
  environment = {},
}, now = Date.now()) {
  if (!Object.hasOwn(CLAIM_MODES, mode)) throw new TypeError(`unsupported claim reproduction mode: ${String(mode)}`)
  if (!EQUIVALENCE_LEVELS.includes(equivalence)) throw new TypeError(`unsupported equivalence level: ${String(equivalence)}`)
  if (typeof target !== 'string' || target.trim() === '') throw new TypeError('target must be a non-empty string')
  if (!Array.isArray(claimInput) || claimInput.length < 1 || claimInput.length > 50) {
    throw new TypeError('claims must contain 1 to 50 claim objects')
  }
  if (requirements === null || typeof requirements !== 'object' || Array.isArray(requirements)) {
    throw new TypeError('requirements must be an object')
  }
  if (environment === null || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new TypeError('environment must be an object')
  }
  const claims = claimInput.map(normalizeClaim)
  if (new Set(claims.map(claim => claim.id)).size !== claims.length) throw new TypeError('claim ids must be unique')
  const requiredKeys = new Set(CLAIM_MODES[mode])
  const matrix = Object.fromEntries(REQUIREMENT_KEYS.map(key => [
    key,
    validateRequirement(key, requirements[key] ?? { state: 'unknown' }, requiredKeys.has(key)),
  ]))
  const invalid = Object.entries(matrix).filter(([, value]) => value.problem !== undefined)
  const missing = [...requiredKeys].filter(key => matrix[key].state === 'missing')
  const unknown = [...requiredKeys].filter(key => matrix[key].state === 'unknown' || matrix[key].state === 'not_required')
  const claimProblems = claims.filter(claim => claim.problem !== undefined)
  let status = 'ready'
  if (invalid.length > 0 || unknown.length > 0 || claimProblems.length > 0) status = 'insufficient_evidence'
  else if (missing.length > 0) status = 'blocked'
  const missingConditions = [...new Set([...missing, ...unknown, ...invalid.map(([key]) => key)])]
    .map(key => ({ requirement: key, state: matrix[key].state, action: ACTIONS[key] }))
  missingConditions.push(...claimProblems.map(claim => ({
    requirement: `claim:${claim.id}`,
    state: 'missing',
    action: `Attach primary-source evidence for claim ${claim.id}.`,
  })))
  const assessment = {
    id: `${targetId}:${mode}:${now}`,
    targetId,
    targetType,
    ...(typeof targetDigest === 'string' ? { targetDigest } : {}),
    ...(Number.isInteger(targetVersion) ? { targetVersion } : {}),
    target: target.trim().slice(0, 500),
    mode,
    equivalence,
    status,
    assertion: status === 'ready'
      ? 'The plan is evidence-complete at claim level. No claim is reproduced until an accepted attempt passes its verifier.'
      : 'Do not claim reproduction. Resolve the listed requirement or claim-evidence conditions first.',
    required: [...requiredKeys],
    requirements: matrix,
    environment,
    claims,
    rubric: claimsAsRubric(claims),
    missingConditions,
    assessedAt: new Date(now).toISOString(),
  }
  if (Buffer.byteLength(JSON.stringify(assessment), 'utf8') > MAX_PERSISTED_VALUE_BYTES) {
    throw new TypeError(`claim assessment exceeds ${MAX_PERSISTED_VALUE_BYTES} UTF-8 bytes`)
  }
  return { ...assessment, digest: canonicalDigest(assessment) }
}

function finiteNumber(value, name, { min = 0 } = {}) {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) throw new TypeError(`${name} must be a finite number >= ${min}`)
  return value
}

function normalizeResources(value) {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('resources must be an object')
  const text = key => typeof value[key] === 'string' && value[key].trim() !== '' ? value[key].trim().slice(0, 500) : undefined
  return {
    ...(text('gpuModel') === undefined ? {} : { gpuModel: text('gpuModel') }),
    ...(finiteNumber(value.gpuCount, 'resources.gpuCount') === undefined ? {} : { gpuCount: finiteNumber(value.gpuCount, 'resources.gpuCount') }),
    ...(finiteNumber(value.vramGb, 'resources.vramGb') === undefined ? {} : { vramGb: finiteNumber(value.vramGb, 'resources.vramGb') }),
    ...(text('cpuModel') === undefined ? {} : { cpuModel: text('cpuModel') }),
    ...(finiteNumber(value.cpuCount, 'resources.cpuCount') === undefined ? {} : { cpuCount: finiteNumber(value.cpuCount, 'resources.cpuCount') }),
    ...(finiteNumber(value.durationSeconds, 'resources.durationSeconds') === undefined ? {} : { durationSeconds: finiteNumber(value.durationSeconds, 'resources.durationSeconds') }),
    ...(finiteNumber(value.costUsd, 'resources.costUsd') === undefined ? {} : { costUsd: finiteNumber(value.costUsd, 'resources.costUsd') }),
    ...(text('dataScale') === undefined ? {} : { dataScale: text('dataScale') }),
    ...(finiteNumber(value.relativeToPaper, 'resources.relativeToPaper') === undefined ? {} : { relativeToPaper: finiteNumber(value.relativeToPaper, 'resources.relativeToPaper') }),
    ...(text('jobUrl') === undefined ? {} : { jobUrl: text('jobUrl') }),
  }
}

function normalizeVerifier(value) {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('verifier must be an object')
  const verdict = ['passed', 'failed', 'inconclusive'].includes(value.verdict) ? value.verdict : undefined
  if (verdict === undefined) throw new TypeError('verifier.verdict must be passed, failed, or inconclusive')
  return {
    kind: typeof value.kind === 'string' ? value.kind.trim().slice(0, 100) : '',
    identity: typeof value.identity === 'string' ? value.identity.trim().slice(0, 500) : '',
    verdict,
    evidence: asStringArray(value.evidence, 20),
  }
}

/** Normalize one preserved attempt and refuse unsupported reproduction outcomes. */
export function recordAttempt({
  targetId,
  targetType = 'event',
  assessment,
  mode,
  equivalence,
  verdict,
  commands,
  artifacts,
  metrics,
  claimResults,
  resources,
  verifier,
  deviations,
  notes,
}, now = Date.now()) {
  if (!Object.hasOwn(CLAIM_MODES, mode)) throw new TypeError(`unsupported claim reproduction mode: ${String(mode)}`)
  if (!EQUIVALENCE_LEVELS.includes(equivalence)) throw new TypeError(`unsupported equivalence level: ${String(equivalence)}`)
  if (!['passed', 'partial', 'failed', 'blocked', 'negative'].includes(verdict)) throw new TypeError(`unsupported attempt verdict: ${String(verdict)}`)
  const normalizedMetrics = metrics !== null && typeof metrics === 'object' && !Array.isArray(metrics) ? metrics : {}
  const resultById = new Map((Array.isArray(claimResults) ? claimResults : []).map(result => [result?.claimId, result]))
  const normalizedClaimResults = (assessment?.claims ?? []).map(claim => {
    const result = resultById.get(claim.id) ?? {}
    return {
      claimId: claim.id,
      ...(result.actual === undefined ? {} : { actual: result.actual }),
      passed: result.passed === true,
      evidence: asStringArray(result.evidence, 20),
      ...(typeof result.note === 'string' ? { note: result.note.trim().slice(0, 2_000) } : {}),
    }
  })
  const metricValues = { ...normalizedMetrics }
  for (const result of normalizedClaimResults) {
    const claim = assessment?.claims?.find(candidate => candidate.id === result.claimId)
    if (claim !== undefined && result.actual !== undefined) metricValues[claim.metric] = result.actual
  }
  const rubricGrade = gradeRubric(assessment?.rubric ?? [], metricValues)
  const normalizedVerifier = normalizeVerifier(verifier)
  const normalized = {
    id: `${targetId}:attempt:${now}`,
    targetId,
    targetType,
    ...(assessment?.id === undefined ? {} : { assessmentId: assessment.id }),
    ...(assessment?.digest === undefined ? {} : { assessmentDigest: assessment.digest }),
    ...(assessment?.targetDigest === undefined ? {} : { targetDigest: assessment.targetDigest }),
    ...(assessment?.targetVersion === undefined ? {} : { targetVersion: assessment.targetVersion }),
    mode,
    equivalence,
    verdict,
    commands: asStringArray(commands),
    artifacts: asStringArray(artifacts),
    metrics: normalizedMetrics,
    claimResults: normalizedClaimResults,
    rubricGrade,
    resources: normalizeResources(resources),
    ...(normalizedVerifier === undefined ? {} : { verifier: normalizedVerifier }),
    deviations: asStringArray(deviations),
    notes: typeof notes === 'string' ? notes.trim().slice(0, 4_000) : '',
    recordedAt: new Date(now).toISOString(),
  }
  const problems = []
  if (assessment === undefined) problems.push('attempt requires a saved claim assessment')
  else if (assessment.mode !== mode || assessment.equivalence !== equivalence) problems.push('attempt mode and equivalence must match the assessment')
  else if (verdict === 'passed' && assessment.status !== 'ready') problems.push('passed attempt requires a ready claim assessment')
  if (verdict === 'passed' && normalized.commands.length === 0) problems.push('passed verdict requires at least one executed command')
  if (verdict === 'passed' && normalized.artifacts.length === 0) problems.push('passed verdict requires at least one result artifact')
  if (verdict === 'passed' && !rubricGrade.passed) problems.push('passed verdict requires every required claim metric to pass')
  const missingClaimEvidence = normalizedClaimResults.filter(result => {
    const claim = assessment?.claims?.find(candidate => candidate.id === result.claimId)
    return claim?.required === true && (result.actual === undefined || result.passed !== true || result.evidence.length === 0)
  }).map(result => result.claimId)
  if (verdict === 'passed' && missingClaimEvidence.length > 0) {
    problems.push(`passed verdict requires actual value, pass decision, and evidence for required claims: ${missingClaimEvidence.join(', ')}`)
  }
  if (verdict === 'passed' && normalizedVerifier?.verdict !== 'passed') problems.push('passed verdict requires a passing verifier')
  if (verdict === 'passed' && (normalizedVerifier?.kind === '' || normalizedVerifier?.identity === '' || normalizedVerifier?.evidence.length === 0)) {
    problems.push('passed verdict requires verifier kind, identity, and evidence')
  }
  if (verdict === 'passed') {
    if (normalized.resources.gpuModel === undefined && normalized.resources.cpuModel === undefined) problems.push('passed verdict requires GPU or CPU model')
    for (const key of ['durationSeconds', 'costUsd', 'dataScale', 'relativeToPaper']) {
      if (normalized.resources[key] === undefined) problems.push(`passed verdict requires resources.${key}`)
    }
    if (normalized.resources.gpuModel !== undefined && normalized.resources.vramGb === undefined) {
      problems.push('passed GPU verdict requires resources.vramGb')
    }
  }
  if (verdict === 'negative' && normalized.commands.length === 0 && normalized.artifacts.length === 0) {
    problems.push('negative result requires an executed command or preserved artifact')
  }
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_PERSISTED_VALUE_BYTES) {
    problems.push(`attempt evidence exceeds ${MAX_PERSISTED_VALUE_BYTES} UTF-8 bytes`)
  }
  const outcome = verdict === 'passed'
    ? equivalence === 'toy' ? 'toy_only' : 'reproduced'
    : verdict === 'negative' ? 'negative_result'
      : verdict === 'blocked' ? 'blocked' : verdict
  return { ...normalized, outcome, accepted: problems.length === 0, problems }
}

/** Validate and normalize one executed reproduction result. */
export function recordRun({ recordId, mode, verdict, commands, artifacts, metrics, deviations, notes, rubric: rubricInput }, now = Date.now()) {
  if (!Object.hasOwn(MODES, mode)) throw new TypeError(`unsupported reproduction mode: ${String(mode)}`)
  if (!['passed', 'partial', 'failed', 'not_run'].includes(verdict)) throw new TypeError(`unsupported verdict: ${String(verdict)}`)
  const rubric = normalizeRubric(rubricInput)
  const normalizedMetrics = metrics !== null && typeof metrics === 'object' && !Array.isArray(metrics) ? metrics : {}
  const rubricGrade = gradeRubric(rubric, normalizedMetrics)
  const normalized = {
    id: `${recordId}:${now}`,
    recordId,
    mode,
    verdict,
    commands: asStringArray(commands),
    artifacts: asStringArray(artifacts),
    metrics: normalizedMetrics,
    rubricGrade,
    deviations: asStringArray(deviations),
    notes: typeof notes === 'string' ? notes.trim().slice(0, 4_000) : '',
    recordedAt: new Date(now).toISOString(),
  }
  const problems = []
  if (verdict === 'passed' && normalized.commands.length === 0) problems.push('passed verdict requires at least one executed command')
  if (verdict === 'passed' && normalized.artifacts.length === 0) problems.push('passed verdict requires at least one result artifact')
  if (verdict === 'passed' && Object.keys(normalized.metrics).length === 0) problems.push('passed verdict requires measured metrics')
  if (verdict === 'passed' && rubric.length === 0) problems.push('passed verdict requires a saved evaluation rubric')
  else if (verdict === 'passed' && !rubricGrade.passed) problems.push('passed verdict requires every required rubric criterion to pass')
  if (verdict === 'not_run' && normalized.commands.length > 0) problems.push('not_run verdict cannot include executed commands')
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_PERSISTED_VALUE_BYTES) {
    problems.push(`run evidence exceeds ${MAX_PERSISTED_VALUE_BYTES} UTF-8 bytes`)
  }
  return { ...normalized, accepted: problems.length === 0, problems }
}
import { canonicalDigest } from './canonical.js'
