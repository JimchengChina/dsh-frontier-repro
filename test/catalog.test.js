import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeSources, validateSource } from '../lib/catalog.js'

function source(overrides = {}) {
  return {
    id: 'lab-feed', type: 'feed', sourceClass: 'official_lab', name: 'Lab', lab: 'Lab',
    url: 'https://lab.example/feed.xml', ...overrides,
  }
}

test('validated sources declare their runtime capabilities', () => {
  assert.deepEqual(validateSource(source()).requires, ['network:https'])
  assert.deepEqual(validateSource(source({
    id: 'person-x', type: 'x_user', sourceClass: 'person_x', username: 'Person',
    person: 'Person', role: 'research lead', identityEvidenceUrl: 'https://lab.example/team',
  })).requires, ['network:https', 'credential:x-api'])
})

test('unknown source capabilities are rejected at startup', () => {
  assert.throws(() => validateSource(source({ requires: ['network:https', 'shell:ambient'] })), /unsupported capability/)
})

test('every built-in source has a normalized capability declaration', () => {
  const sources = mergeSources()
  assert.equal(sources.length > 0, true)
  assert.equal(sources.every(item => item.requires.includes('network:https')), true)
  assert.equal(['anthropic-research', 'kimi-blog', 'deepseek-transparency', 'moonshot-models', 'minimax-research',
    'minimax-models', 'nvidia-technical-blog', 'amd-rocm-blog', 'intel-ai-news']
    .every(id => sources.some(source => source.id === id)), true)
})

test('source quality contracts are validated at startup', () => {
  const normalized = validateSource(source({
    denyCategories: ['Company'], requirePublishedAt: true, boilerplateTitles: ['Generic page'], healthStaleAfterDays: 30,
  }))
  assert.deepEqual(normalized.denyCategories, ['Company'])
  assert.equal(normalized.requirePublishedAt, true)
  assert.throws(() => validateSource(source({ allowCategories: [''] })), /allowCategories/)
})
