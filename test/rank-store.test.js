import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { rankRecords } from '../lib/rank.js'
import { FrontierStore, sourceHealthView } from '../lib/store.js'
import { applySourceQuality, isFrontierItem, normalizeItem } from '../lib/collector.js'

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

test('source contracts reject boilerplate, missing dates, and denied categories before persistence', () => {
  const quality = applySourceQuality({
    requirePublishedAt: true,
    denyCategories: ['Company'],
    boilerplateTitles: ['Generic Blog'],
  }, [
    { title: '-', publishedAt: '2026-08-01', categories: [] },
    { title: 'Generic Blog', publishedAt: '2026-08-01', categories: [] },
    { title: 'Model release', categories: [] },
    { title: 'Executive update', publishedAt: '2026-08-01', categories: ['Company'] },
    { title: 'New reasoning model', publishedAt: '2026-08-01', categories: ['Research'] },
  ])
  assert.deepEqual(quality.items.map(item => item.title), ['New reasoning model'])
  assert.deepEqual(quality.rejectedReasons, {
    invalid_title: 1, boilerplate_title: 1, missing_published_at: 1, denied_category: 1,
  })
})

test('arXiv stable identity retains version-pinned paper artifacts', () => {
  const normalized = normalizeItem({
    id: 'arxiv', name: 'arXiv', sourceClass: 'paper', type: 'arxiv', lab: 'Research', url: 'https://export.arxiv.org/api/query',
  }, {
    title: 'Versioned paper', url: 'https://arxiv.org/abs/2608.12345v2', arxivId: '2608.12345',
    arxivVersionedId: '2608.12345v2', arxivVersion: 'v2', discoveredLinks: ['https://arxiv.org/pdf/2608.12345v2'],
    authors: [], categories: [],
  }, Date.UTC(2026, 7, 17))
  assert.equal(normalized.url, 'https://arxiv.org/abs/2608.12345')
  assert.equal(normalized.arxivVersion, 'v2')
  assert.deepEqual(normalized.artifacts[0], {
    kind: 'paper', url: 'https://arxiv.org/pdf/2608.12345v2', revision: 'v2', immutableUrl: 'https://arxiv.org/pdf/2608.12345v2',
  })
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

test('collection commits journal their bounded inverse and migrate version one stores', async () => {
  const root = await mkdtemp(join(tmpdir(), 'frontier-store-journal-'))
  const store = new FrontierStore(join(root, 'index.json'), 2, 3)
  await store.mergeRecords([record({ id: 'old', publishedAt: '2026-08-01T00:00:00Z' })])
  const committed = await store.commitCollection([
    record({ id: 'old', summary: 'updated', publishedAt: '2026-08-01T00:00:00Z' }),
    record({ id: 'new', publishedAt: '2026-08-17T00:00:00Z' }),
  ], {
    id: 'collection-1', requestedAt: '2026-08-17T00:00:00Z', startedAt: '2026-08-17T00:00:01Z',
    finishedAt: '2026-08-17T00:00:02Z', input: { query: 'agents' }, partial: false,
    sources: [{ id: 'arxiv', ok: true, count: 2, warnings: [] }], enrichments: {},
  })
  assert.equal(committed.version, 2)
  assert.equal(committed.collections.length, 1)
  assert.equal(committed.collections[0].digest.length, 64)
  assert.deepEqual(committed.collections[0].inverse.addedIds, ['new'])
  assert.equal(committed.collections[0].inverse.previousRecords[0].summary, record().summary)
})

test('latest collection reversion restores prior records in LIFO order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'frontier-store-revert-'))
  const store = new FrontierStore(join(root, 'index.json'), 3, 5)
  await store.mergeRecords([record({ id: 'old', summary: 'original' })])
  await store.commitCollection([record({ id: 'old', summary: 'changed' }), record({ id: 'new' })], {
    id: 'batch-1', input: {}, sources: [], enrichments: {},
  })
  const reverted = await store.revertLatestCollection('batch-1')
  assert.deepEqual(reverted.records.map(item => item.id), ['old'])
  assert.equal(reverted.records[0].summary, 'original')
  assert.equal(reverted.collections[0].state, 'reverted')
  assert.equal(reverted.collections[0].reversion.digest.length, 64)
})

test('collection reversion refuses to orphan later evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'frontier-store-dependent-revert-'))
  const store = new FrontierStore(join(root, 'index.json'), 3, 5)
  await store.commitCollection([record({ id: 'new' })], { id: 'batch-1', input: {}, sources: [], enrichments: {} })
  await store.saveAssessment('new', { status: 'ready_behavioral' })
  await assert.rejects(store.revertLatestCollection('batch-1'), error => {
    assert.equal(error.code, 'collection_has_dependents')
    assert.deepEqual(error.details.recordIds, ['new'])
    return true
  })
  assert.equal((await store.read()).collections[0].state, 'committed')
})

test('source health tracks drift, failure streaks, and dynamic staleness', async () => {
  const root = await mkdtemp(join(tmpdir(), 'frontier-store-health-'))
  const store = new FrontierStore(join(root, 'index.json'), 3, 8)
  await store.commitCollection([], {
    id: 'health-1', finishedAt: '2026-08-01T00:00:00Z', input: {}, enrichments: {},
    sources: [{ id: 'lab', ok: true, count: 10, rawCount: 12, rejectedCount: 2, newestItemAt: '2026-08-01T00:00:00Z', structureFingerprint: 'a', healthStaleAfterDays: 5 }],
  })
  await store.commitCollection([], {
    id: 'health-2', finishedAt: '2026-08-02T00:00:00Z', input: {}, enrichments: {},
    sources: [{ id: 'lab', ok: true, count: 3, rawCount: 8, rejectedCount: 5, newestItemAt: '2026-08-02T00:00:00Z', structureFingerprint: 'b', healthStaleAfterDays: 5 }],
  })
  await store.commitCollection([], { id: 'health-3', finishedAt: '2026-08-03T00:00:00Z', input: {}, enrichments: {}, sources: [{ id: 'lab', ok: false, count: 0 }] })
  await store.commitCollection([], { id: 'health-4', finishedAt: '2026-08-04T00:00:00Z', input: {}, enrichments: {}, sources: [{ id: 'lab', ok: false, count: 0, error: { code: 'source_failed', message: 'HTTP 500' } }] })
  const health = (await store.read()).sourceHealth.lab
  assert.equal(health.consecutiveFailures, 2)
  assert.equal(health.lastCount, 3)
  assert.equal(health.alerts.some(alert => alert.code === 'consecutive_failures'), true)
  assert.equal(health.lastError.code, 'source_failed')
  assert.equal(sourceHealthView(health, Date.parse('2026-08-10T00:00:00Z')).stale, true)
})
