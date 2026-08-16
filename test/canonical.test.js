import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalDigest, canonicalStringify, recordContentDigest, sourceCatalogDigest } from '../lib/canonical.js'

test('canonical JSON is independent of object insertion order', () => {
  assert.equal(canonicalStringify({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}')
  assert.equal(canonicalDigest({ a: 1, b: 2 }), canonicalDigest({ b: 2, a: 1 }))
})

test('record content digest ignores observation timestamps and artifact order', () => {
  const base = {
    sourceId: 'arxiv', url: 'https://arxiv.org/abs/2608.00001',
    provenance: { canonicalUrl: 'https://arxiv.org/abs/2608.00001', collectedAt: 'first' },
    title: 'Method', summary: 'Details', authors: ['B', 'A'], categories: ['cs.LG', 'cs.AI'],
    artifacts: [{ kind: 'code', url: 'https://github.com/lab/repo' }, { kind: 'paper', url: 'https://arxiv.org/abs/2608.00001' }],
    firstSeenAt: 'first', lastSeenAt: 'first',
  }
  const observedLater = {
    ...base,
    provenance: { ...base.provenance, collectedAt: 'later' },
    authors: [...base.authors].reverse(),
    artifacts: [...base.artifacts].reverse(),
    firstSeenAt: 'later', lastSeenAt: 'later',
  }
  assert.equal(recordContentDigest(base), recordContentDigest(observedLater))
})

test('source catalog digest is stable across source ordering', () => {
  const first = [{ id: 'b', url: 'https://b.example' }, { id: 'a', url: 'https://a.example' }]
  assert.equal(sourceCatalogDigest(first), sourceCatalogDigest([...first].reverse()))
})
