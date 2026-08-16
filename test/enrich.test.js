import assert from 'node:assert/strict'
import test from 'node:test'
import { githubRepositoryIdentity, huggingFacePaperEnrichment } from '../lib/enrich.js'

test('Hugging Face paper metadata becomes bounded public artifact candidates', () => {
  const result = huggingFacePaperEnrichment({
    id: '2504.01848', githubRepo: 'https://github.com/openai/frontier-evals', projectPage: 'http://unsafe.example',
    upvotes: 37, githubStars: 1_283, numTotalModels: 1, numTotalDatasets: 1, numTotalSpaces: 1,
    linkedModels: [{ id: 'lab/model', private: false, gated: 'auto', lastModified: '2026-01-01T00:00:00Z' }],
    linkedDatasets: [{ id: 'lab/data', private: false, gated: false }],
    linkedSpaces: [{ id: 'lab/demo', private: false }],
  }, '2504.01848')
  assert.deepEqual(result.artifacts.map(item => item.kind), ['code', 'model', 'dataset', 'demo'])
  assert.equal(result.artifacts.some(item => item.url === 'http://unsafe.example/'), false)
  assert.equal(result.artifacts.find(item => item.kind === 'model').gated, 'auto')
  assert.equal(result.paperDiscovery.githubStars, 1_283)
})

test('private Hub repositories and mismatched paper ids are rejected', () => {
  const result = huggingFacePaperEnrichment({ id: '2608.00001', linkedModels: [{ id: 'lab/private', private: true }] }, '2608.00001')
  assert.deepEqual(result.artifacts, [])
  assert.throws(() => huggingFacePaperEnrichment({ id: 'wrong' }, '2608.00001'), /did not match/)
})

test('GitHub repository roots are normalized without trusting subpaths', () => {
  assert.deepEqual(githubRepositoryIdentity('https://github.com/OpenAI/frontier-evals/tree/main/project'), {
    owner: 'OpenAI', repo: 'frontier-evals', rootUrl: 'https://github.com/OpenAI/frontier-evals',
  })
  assert.equal(githubRepositoryIdentity('https://gitlab.com/openai/frontier-evals'), undefined)
})
