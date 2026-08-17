import assert from 'node:assert/strict'
import test from 'node:test'
import { assessClaims, assessReproduction, CLAIM_MODES, gradeRubric, MODES, recordAttempt, recordRun } from '../lib/repro.js'

const rubric = [{
  id: 'pass-rate', description: 'Match the pass-rate target', metric: 'pass_rate',
  operator: 'gte', expected: 0.9, weight: 1,
}]

function availableRequirements(mode) {
  return Object.fromEntries(MODES[mode].map(key => [key, {
    state: 'available', evidence: [`evidence:${key}`], note: 'checked',
  }]))
}

function availableClaimRequirements(mode) {
  return Object.fromEntries(CLAIM_MODES[mode].map(key => [key, {
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

test('claim-level plans require primary evidence for every independently testable claim', () => {
  const assessment = assessClaims({
    targetId: 'evt_1', targetDigest: 'a'.repeat(64), targetVersion: 2,
    target: 'Replicate the released evaluation', mode: 'execute_existing', equivalence: 'exact',
    requirements: availableClaimRequirements('execute_existing'),
    claims: [{
      id: 'accuracy', statement: 'Reach the reported accuracy', metric: 'accuracy', operator: 'gte', expected: 0.9,
      evidence: ['https://lab.example/system-card'],
    }],
  }, Date.UTC(2026, 7, 17))
  assert.equal(assessment.status, 'ready')
  assert.equal(assessment.targetDigest, 'a'.repeat(64))
  assert.equal(assessment.targetVersion, 2)
  assert.equal(assessment.claims[0].statement, 'Reach the reported accuracy')
  assert.equal(assessment.digest.length, 64)

  const insufficient = assessClaims({
    targetId: 'evt_1', target: 'Replicate the released evaluation', mode: 'execute_existing', equivalence: 'exact',
    requirements: availableClaimRequirements('execute_existing'),
    claims: [{ id: 'accuracy', statement: 'Reach accuracy', metric: 'accuracy', operator: 'gte', expected: 0.9 }],
  })
  assert.equal(insufficient.status, 'insufficient_evidence')
  assert.equal(insufficient.missingConditions[0].requirement, 'claim:accuracy')
})

test('attempts preserve resource, verifier, and negative evidence while toy never becomes reproduced', () => {
  const assessment = assessClaims({
    targetId: 'evt_1', target: 'Toy evaluation', mode: 'partial_reimplementation', equivalence: 'toy',
    requirements: availableClaimRequirements('partial_reimplementation'),
    claims: [{
      id: 'pass-rate', statement: 'Meet toy pass rate', metric: 'pass_rate', operator: 'gte', expected: 0.9,
      evidence: ['https://lab.example/report'],
    }],
  })
  const attempt = recordAttempt({
    targetId: 'evt_1', assessment, mode: 'partial_reimplementation', equivalence: 'toy', verdict: 'passed',
    commands: ['python eval.py'], artifacts: ['results.json'], metrics: { pass_rate: 0.95 },
    claimResults: [{ claimId: 'pass-rate', actual: 0.95, passed: true, evidence: ['results.json'] }],
    resources: { gpuModel: 'RTX 4090', gpuCount: 1, vramGb: 24, durationSeconds: 90, costUsd: 1.5, dataScale: '100 samples', relativeToPaper: 0.01, jobUrl: 'https://jobs.example/1' },
    verifier: { kind: 'benchmark', identity: 'eval-v1', verdict: 'passed', evidence: ['results.json'] },
  })
  assert.equal(attempt.accepted, true)
  assert.equal(attempt.outcome, 'toy_only')
  assert.equal(attempt.resources.vramGb, 24)

  const negative = recordAttempt({
    targetId: 'evt_1', assessment, mode: 'partial_reimplementation', equivalence: 'toy', verdict: 'negative',
    commands: ['python eval.py'], artifacts: ['failure.log'], metrics: {},
  })
  assert.equal(negative.accepted, true)
  assert.equal(negative.outcome, 'negative_result')
})

test('blocked attempts can be preserved before readiness without fabricating execution', () => {
  const requirements = availableClaimRequirements('from_scratch_replication')
  requirements.compute = { state: 'missing', evidence: [], note: 'No compatible accelerator' }
  const assessment = assessClaims({
    targetId: 'evt_blocked', target: 'Train the released model', mode: 'from_scratch_replication', equivalence: 'scaled',
    requirements,
    claims: [{
      id: 'loss', statement: 'Reach the reported loss', metric: 'loss', operator: 'lte', expected: 1,
      evidence: ['https://lab.example/paper'],
    }],
  })
  assert.equal(assessment.status, 'blocked')
  const attempt = recordAttempt({
    targetId: 'evt_blocked', assessment, mode: 'from_scratch_replication', equivalence: 'scaled', verdict: 'blocked',
    notes: 'Stopped before execution because compute is unavailable.',
  })
  assert.equal(attempt.accepted, true)
  assert.equal(attempt.outcome, 'blocked')
  assert.deepEqual(attempt.commands, [])
})
