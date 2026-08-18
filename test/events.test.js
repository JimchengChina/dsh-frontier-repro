import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEvidenceBundles, reconcileEvidenceBundles } from '../lib/events.js'

function record(overrides = {}) {
  return {
    id: 'release',
    title: 'DeepSeek-V4 model release and benchmark',
    url: 'https://deepseek.example/v4',
    lab: 'DeepSeek',
    sourceId: 'deepseek-news',
    sourceClass: 'official_lab',
    summary: 'Evaluation results for a reasoning model.',
    artifacts: [],
    contentDigest: 'a'.repeat(64),
    firstSeenAt: '2026-08-16T00:00:00.000Z',
    lastSeenAt: '2026-08-16T00:00:00.000Z',
    publishedAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  }
}

test('release bundles cluster cross-source evidence conservatively within one lab', () => {
  const records = [
    record(),
    record({
      id: 'model', title: 'deepseek-ai/DeepSeek-V4-Pro', url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro',
      sourceId: 'deepseek-models', sourceClass: 'official_artifact', contentDigest: 'b'.repeat(64),
      artifacts: [{ kind: 'model', url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro', immutableUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/tree/abc', revision: 'abc', license: 'MIT' }],
    }),
    record({
      id: 'paper', title: 'DeepSeek-V4 technical report', url: 'https://arxiv.org/abs/2608.00001',
      lab: 'Independent research', sourceId: 'arxiv', sourceClass: 'paper', contentDigest: 'c'.repeat(64),
      artifacts: [
        { kind: 'paper', url: 'https://arxiv.org/pdf/2608.00001v1', immutableUrl: 'https://arxiv.org/pdf/2608.00001v1', revision: 'v1' },
        { kind: 'code', url: 'https://github.com/deepseek-ai/v4', immutableUrl: 'https://github.com/deepseek-ai/v4/tree/def', revision: 'def', license: 'MIT' },
      ],
    }),
  ]
  const events = Object.values(buildEvidenceBundles(records))
  assert.equal(events.length, 1)
  assert.equal(events[0].entity, 'deepseek-v4')
  assert.deepEqual(events[0].contributingLabs, ['DeepSeek', 'Independent research'])
  assert.equal(events[0].corroboration.corroborated, true)
  assert.equal(events[0].reproductionLevel, 'exact_candidate')
  assert.deepEqual(events[0].licenses, ['MIT'])
  assert.equal(events[0].evidence.model[0].immutable, true)
})

test('event versions advance only for substantive evidence changes and retain predecessors', () => {
  const first = buildEvidenceBundles([record()])
  const eventId = Object.keys(first)[0]
  const repeated = reconcileEvidenceBundles([
    record({ lastSeenAt: '2026-08-17T00:00:00.000Z' }),
  ], first)
  assert.equal(repeated.events[eventId].version, 1)
  assert.equal(repeated.events[eventId].substantiveDigest, first[eventId].substantiveDigest)
  assert.equal(repeated.events[eventId].changes.evidence.official_release.added.length, 0)

  const changed = reconcileEvidenceBundles([record({
    contentDigest: 'd'.repeat(64),
    artifacts: [{ kind: 'code', url: 'https://github.com/deepseek-ai/v4', immutableUrl: 'https://github.com/deepseek-ai/v4/tree/123', revision: '123', license: 'MIT' }],
  })], repeated.events, repeated.eventHistory)
  assert.equal(changed.events[eventId].version, 2)
  assert.equal(changed.events[eventId].supersedesDigest, first[eventId].substantiveDigest)
  assert.equal(changed.eventHistory[eventId].length, 1)
  assert.equal(changed.events[eventId].changes.evidence.code.added.length, 1)
})
