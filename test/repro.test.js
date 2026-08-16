import assert from 'node:assert/strict'
import test from 'node:test'
import { assessReproduction, gradeRubric, MODES, recordRun } from '../lib/repro.js'

const rubric = [{
  id: 'pass-rate', description: 'Match the pass-rate target', metric: 'pass_rate',
  operator: 'gte', expected: 0.9, weight: 1,
}]

function availableRequirements(mode) {
  return Object.fromEntries(MODES[mode].map(key => [key, {
    state: 'available', evidence: [`evidence:${key}`], note: 'checked',
  }]))
}

test('readiness is granted only when every mode-required condition has evidence', () => {
  const assessment = assessReproduction({
    recordId: 'r1',
    target: 'Reproduce benchmark score within ±1 point',
    mode: 'exact',
    requirements: availableRequirements('exact'),
    environment: { gpu: '8xH100' },
    rubric,
  }, Date.UTC(2026, 7, 16))
  assert.equal(assessment.status, 'ready_exact')
  assert.equal(assessment.missingConditions.length, 0)
  assert.match(assessment.assertion, /does not mean/i)
})

test('missing or unevidenced requirements block reproduction claims', () => {
  const requirements = availableRequirements('scaled')
  requirements.compute = { state: 'missing', evidence: [], note: 'No compatible GPU' }
  requirements.license = { state: 'available', evidence: [], note: 'guessed' }
  const assessment = assessReproduction({
    recordId: 'r2', target: 'Scaled training run', mode: 'scaled', requirements, rubric,
  })
  assert.equal(assessment.status, 'insufficient_evidence')
  assert.deepEqual(assessment.missingConditions.map(item => item.requirement).sort(), ['compute', 'license'])
  assert.deepEqual(assessment.fallbackModes, ['behavioral'])
})

test('passed runs require commands, artifacts, and metrics', () => {
  const rejected = recordRun({ recordId: 'r1', mode: 'behavioral', verdict: 'passed' })
  assert.equal(rejected.accepted, false)
  assert.equal(rejected.problems.length, 4)

  const accepted = recordRun({
    recordId: 'r1',
    mode: 'behavioral',
    verdict: 'passed',
    commands: ['pnpm test'],
    artifacts: ['reports/eval.json'],
    metrics: { pass_rate: { actual: 0.92, expected: 0.9, tolerance: 0.02 } },
    rubric,
  }, Date.UTC(2026, 7, 16))
  assert.equal(accepted.accepted, true)
  assert.equal(accepted.recordedAt, '2026-08-16T00:00:00.000Z')
  assert.equal(accepted.rubricGrade.passed, true)
})

test('rubric grading rejects unsupported success and reports weighted score', () => {
  const grade = gradeRubric([
    ...rubric,
    { id: 'latency', description: 'Stay below latency', metric: 'latency_ms', operator: 'lte', expected: 200, weight: 3 },
  ], { pass_rate: 0.95, latency_ms: 250 })
  assert.equal(grade.passed, false)
  assert.equal(grade.score, 0.25)
  assert.equal(grade.criteria.find(item => item.id === 'latency').passed, false)
})

test('readiness stays insufficient without a measurable rubric', () => {
  const assessment = assessReproduction({
    recordId: 'r3', target: 'Vague similarity', mode: 'behavioral', requirements: availableRequirements('behavioral'),
  })
  assert.equal(assessment.status, 'insufficient_evidence')
  assert.equal(assessment.missingConditions.at(-1).requirement, 'rubric')
})
