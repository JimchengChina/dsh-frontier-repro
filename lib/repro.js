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

const STATES = new Set(['available', 'missing', 'unknown', 'not_required'])
const MAX_PERSISTED_VALUE_BYTES = 64 * 1024

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

/** Deterministically assess a declared evidence matrix without inventing missing requirements. */
export function assessReproduction({ recordId, target, mode, requirements, environment = {} }, now = Date.now()) {
  if (!Object.hasOwn(MODES, mode)) throw new TypeError(`unsupported reproduction mode: ${String(mode)}`)
  if (typeof target !== 'string' || target.trim() === '') throw new TypeError('target must be a non-empty string')
  if (requirements === null || typeof requirements !== 'object' || Array.isArray(requirements)) {
    throw new TypeError('requirements must be an object')
  }
  if (environment === null || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new TypeError('environment must be an object')
  }
  if (Buffer.byteLength(JSON.stringify({ requirements, environment }), 'utf8') > MAX_PERSISTED_VALUE_BYTES) {
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
  if (invalid.length > 0 || unknown.length > 0) status = 'insufficient_evidence'
  else if (missing.length > 0) status = 'blocked'
  else status = `ready_${mode}`
  const missingConditions = [...new Set([...missing, ...unknown, ...invalid.map(([key]) => key)])]
    .map(key => ({ requirement: key, state: matrix[key].state, action: ACTIONS[key] }))
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

/** Validate and normalize one executed reproduction result. */
export function recordRun({ recordId, mode, verdict, commands, artifacts, metrics, deviations, notes }, now = Date.now()) {
  if (!Object.hasOwn(MODES, mode)) throw new TypeError(`unsupported reproduction mode: ${String(mode)}`)
  if (!['passed', 'partial', 'failed', 'not_run'].includes(verdict)) throw new TypeError(`unsupported verdict: ${String(verdict)}`)
  const normalized = {
    id: `${recordId}:${now}`,
    recordId,
    mode,
    verdict,
    commands: asStringArray(commands),
    artifacts: asStringArray(artifacts),
    metrics: metrics !== null && typeof metrics === 'object' && !Array.isArray(metrics) ? metrics : {},
    deviations: asStringArray(deviations),
    notes: typeof notes === 'string' ? notes.trim().slice(0, 4_000) : '',
    recordedAt: new Date(now).toISOString(),
  }
  const problems = []
  if (verdict === 'passed' && normalized.commands.length === 0) problems.push('passed verdict requires at least one executed command')
  if (verdict === 'passed' && normalized.artifacts.length === 0) problems.push('passed verdict requires at least one result artifact')
  if (verdict === 'passed' && Object.keys(normalized.metrics).length === 0) problems.push('passed verdict requires measured metrics')
  if (verdict === 'not_run' && normalized.commands.length > 0) problems.push('not_run verdict cannot include executed commands')
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_PERSISTED_VALUE_BYTES) {
    problems.push(`run evidence exceeds ${MAX_PERSISTED_VALUE_BYTES} UTF-8 bytes`)
  }
  return { ...normalized, accepted: problems.length === 0, problems }
}
