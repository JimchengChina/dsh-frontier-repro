import assert from 'node:assert/strict'
import test from 'node:test'
import { createReproductionManifest } from '../lib/manifest.js'

function fixture() {
  return {
    record: {
      id: 'r1', title: 'Method', url: 'https://arxiv.org/abs/2608.00001', sourceId: 'arxiv', sourceClass: 'paper',
      sourceName: 'arXiv', contentDigest: 'a'.repeat(64), arxivId: '2608.00001', provenance: {}, categories: [],
      artifacts: [{ kind: 'code', url: 'https://github.com/lab/repo', immutableUrl: `https://github.com/lab/repo/tree/${'b'.repeat(40)}`, revision: 'b'.repeat(40) }],
    },
    assessment: {
      id: 'r1:behavioral', recordId: 'r1', target: 'match output', mode: 'behavioral', status: 'ready_behavioral',
      assessedAt: '2026-08-17T00:00:00Z', requirements: {
        specification: { state: 'available', evidence: ['https://arxiv.org/abs/2608.00001'], note: 'v1' },
      }, environment: { runtime: 'node22' }, missingConditions: [], nextActions: ['run baseline'],
      rubric: [{ id: 'score', description: 'match', metric: 'score', operator: 'gte', expected: 0.9, weight: 1, required: true }],
      rubricDigest: 'c'.repeat(64),
    },
    runs: [],
    sourceCatalogDigest: 'd'.repeat(64),
  }
}

test('reproduction manifest is stable for an unchanged evidence view', () => {
  const first = createReproductionManifest(fixture())
  const second = createReproductionManifest(fixture())
  assert.equal(first.integrity.digest, second.integrity.digest)
  assert.equal(first.materials.find(item => item.kind === 'code').uri.includes('/tree/'), true)
  assert.equal(first.steps.find(item => item.id === 'execute').state, 'not_run')
})

test('manifest integrity changes when the evaluation plan changes', () => {
  const firstInput = fixture()
  const secondInput = fixture()
  secondInput.assessment.rubric[0].expected = 0.95
  assert.notEqual(
    createReproductionManifest(firstInput).integrity.digest,
    createReproductionManifest(secondInput).integrity.digest,
  )
})
