import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { rankRecords } from '../lib/rank.js'
import { FrontierStore } from '../lib/store.js'
import { isFrontierItem } from '../lib/collector.js'

function record(overrides = {}) {
  return {
    id: 'r1',
    title: 'Open agent model with code and benchmark',
    summary: 'Weights, dataset, GitHub implementation, inference recipe and evaluation.',
    categories: ['agent'],
    sourceClass: 'official_lab',
    publishedAt: '2026-08-15T00:00:00.000Z',
    updatedAt: undefined,
    artifacts: [{ kind: 'code', url: 'https://github.com/lab/repo' }],
    firstSeenAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  }
}

test('ranking exposes the score breakdown and favors primary reproducible records', () => {
  const ranked = rankRecords([
    record(),
    record({ id: 'r2', title: 'Opinion', summary: '', sourceClass: 'person_x', artifacts: [] }),
  ], 'agent', Date.UTC(2026, 7, 16))
  assert.equal(ranked[0].id, 'r1')
  assert.ok(ranked[0].score.source > ranked[1].score.source)
  assert.ok(ranked[0].score.artifacts > 0)
  assert.equal(Object.values(ranked[0].score).every(Number.isFinite), true)
})

test('frontier admission removes corporate and personal noise before persistence', () => {
  assert.equal(isFrontierItem({ sourceClass: 'official_lab' }, {
    title: 'Appoints a new chief revenue officer', summary: 'A company leadership update.', categories: [], url: 'https://lab.example/news/cro', discoveredLinks: [],
  }), false)
  assert.equal(isFrontierItem({ sourceClass: 'official_lab' }, {
    title: 'New reasoning model release', summary: 'Weights and benchmark details.', categories: [], url: 'https://lab.example/news/model', discoveredLinks: [],
  }), true)
  assert.equal(isFrontierItem({ sourceClass: 'person_blog' }, {
    title: 'Family photo', summary: 'A personal update.', categories: [], url: 'https://person.example/family', discoveredLinks: [],
  }), false)
})

test('store merges records atomically and retains assessments and runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'frontier-store-'))
  const store = new FrontierStore(join(root, 'index.json'), 2)
  await store.mergeRecords([record()])
  await store.mergeRecords([record({ summary: 'updated', artifacts: [{ kind: 'model', url: 'https://huggingface.co/lab/model' }] })])
  await store.saveAssessment('r1', { status: 'ready_scaled' })
  await store.appendRun('r1', { verdict: 'partial' })
  const data = await store.read()
  assert.equal(data.records.length, 1)
  assert.equal(data.records[0].summary, 'updated')
  assert.deepEqual(data.records[0].artifacts.map(item => item.kind).sort(), ['code', 'model'])
  assert.equal(data.assessments.r1.status, 'ready_scaled')
  assert.equal(data.runs.r1[0].verdict, 'partial')
})

test('concurrent store mutations do not overwrite each other', async () => {
  const root = await mkdtemp(join(tmpdir(), 'frontier-store-concurrent-'))
  const store = new FrontierStore(join(root, 'index.json'), 10)
  await Promise.all([
    store.mergeRecords([record({ id: 'a' })]),
    store.mergeRecords([record({ id: 'b' })]),
    store.saveAssessment('a', { status: 'blocked' }),
    store.appendRun('b', { verdict: 'failed' }),
  ])
  const data = await store.read()
  assert.deepEqual(data.records.map(item => item.id).sort(), ['a', 'b'])
  assert.equal(data.assessments.a.status, 'blocked')
  assert.equal(data.runs.b[0].verdict, 'failed')
})
