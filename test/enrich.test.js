import assert from 'node:assert/strict'
import test from 'node:test'
import {
  githubRepositoryEnrichment,
  githubRepositoryIdentity,
  huggingFacePaperEnrichment,
  huggingFaceRepositoryEnrichment,
  huggingFaceRepositoryIdentity,
} from '../lib/enrich.js'

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

test('Hugging Face model and dataset URLs are pinned to repository SHAs', () => {
  const sha = 'c'.repeat(40)
  const model = huggingFaceRepositoryIdentity('https://huggingface.co/lab/model/blob/main/report.pdf')
  assert.deepEqual(model, { repoType: 'model', repoId: 'lab/model', rootUrl: 'https://huggingface.co/lab/model' })
  const patch = huggingFaceRepositoryEnrichment({
    id: 'lab/model', sha, private: false, gated: false, cardData: { license: 'mit' },
  }, model, 'https://huggingface.co/lab/model/blob/main/report.pdf')
  assert.equal(patch.immutableUrl, `https://huggingface.co/lab/model/blob/${sha}/report.pdf`)
  assert.equal(patch.revision, sha)
  assert.equal(patch.license, 'mit')
  assert.deepEqual(huggingFaceRepositoryIdentity('https://huggingface.co/datasets/lab/data'), {
    repoType: 'dataset', repoId: 'lab/data', rootUrl: 'https://huggingface.co/datasets/lab/data',
  })
  assert.equal(huggingFaceRepositoryIdentity('https://huggingface.co/collections/lab'), undefined)
})

test('GitHub repository roots are normalized without trusting subpaths', () => {
  assert.deepEqual(githubRepositoryIdentity('https://github.com/OpenAI/frontier-evals/tree/main/project'), {
    owner: 'OpenAI', repo: 'frontier-evals', rootUrl: 'https://github.com/OpenAI/frontier-evals',
  })
  assert.equal(githubRepositoryIdentity('https://gitlab.com/openai/frontier-evals'), undefined)
})

test('GitHub metadata pins code to a full immutable commit', () => {
  const identity = githubRepositoryIdentity('https://github.com/openai/frontier-evals')
  const patch = githubRepositoryEnrichment({
    full_name: 'openai/frontier-evals', html_url: 'https://github.com/openai/frontier-evals',
    default_branch: 'main', license: { spdx_id: 'MIT' }, archived: false, disabled: false,
    fork: false, stargazers_count: 1_283, pushed_at: '2026-04-21T20:53:31Z',
  }, { sha: 'A'.repeat(40) }, identity)
  assert.equal(patch.revision, 'a'.repeat(40))
  assert.equal(patch.immutableUrl, `https://github.com/openai/frontier-evals/tree/${'a'.repeat(40)}`)
  assert.equal(patch.license, 'MIT')
  assert.equal(patch.archived, false)
})

test('GitHub enrichment rejects a mismatched repository response', () => {
  const identity = githubRepositoryIdentity('https://github.com/openai/frontier-evals')
  assert.throws(() => githubRepositoryEnrichment({ full_name: 'attacker/repo' }, { sha: 'a'.repeat(40) }, identity), /did not match/)
})

test('GitHub enrichment accepts a canonical rename only after an API redirect', () => {
  const identity = githubRepositoryIdentity('https://github.com/lobehub/lobe-chat')
  const patch = githubRepositoryEnrichment({
    full_name: 'lobehub/lobehub', html_url: 'https://github.com/lobehub/lobehub', default_branch: 'canary',
  }, { sha: 'b'.repeat(40) }, identity, {
    requestedUrl: 'https://api.github.com/repos/lobehub/lobe-chat',
    responseUrl: 'https://api.github.com/repositories/599536282',
  })
  assert.equal(patch.repositoryUrl, 'https://github.com/lobehub/lobehub')
  assert.equal(patch.redirectedFrom, 'https://github.com/lobehub/lobe-chat')
})
