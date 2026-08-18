import assert from 'node:assert/strict'
import test from 'node:test'
import { validateSource } from '../lib/catalog.js'
import { collectAll } from '../lib/collector.js'

function json(value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

test('GitHub organization adapter emits pinned repository and release records with asset digests', async () => {
  const source = validateSource({
    id: 'lab-github', type: 'github_org', sourceClass: 'official_artifact', lab: 'Lab', name: 'Lab GitHub',
    url: 'https://api.github.com/orgs/lab-ai/repos', organization: 'lab-ai', maxItems: 1,
    releaseRepoLimit: 1, releasesPerRepo: 1,
  })
  const repository = {
    full_name: 'lab-ai/model-v1', html_url: 'https://github.com/lab-ai/model-v1', private: false, archived: false, fork: false,
    default_branch: 'main', created_at: '2026-08-01T00:00:00Z', pushed_at: '2026-08-17T00:00:00Z',
    description: 'Model release and benchmark', topics: ['model'], owner: { login: 'lab-ai' }, license: { spdx_id: 'MIT' },
  }
  const release = {
    name: 'Model v1', tag_name: 'v1.0.0', html_url: 'https://github.com/lab-ai/model-v1/releases/tag/v1.0.0',
    published_at: '2026-08-17T00:00:00Z', body: 'Release evaluation.', author: { login: 'lab-ai' },
    assets: [{ browser_download_url: 'https://github.com/lab-ai/model-v1/releases/download/v1.0.0/model.bin', digest: `sha256:${'a'.repeat(64)}`, size: 42 }],
  }
  const fetchImpl = async (input) => {
    const url = String(input)
    if (url.includes('/orgs/lab-ai/repos')) return json([repository])
    if (url.includes('/releases?')) return json([release])
    if (url.endsWith('/commits/main')) return json({ sha: 'b'.repeat(40) })
    if (url.endsWith('/commits/v1.0.0')) return json({ sha: 'c'.repeat(40) })
    return new Response('not found', { status: 404 })
  }
  const result = await collectAll([source], {
    fetchImpl, githubEnrichLimit: 0, huggingFaceEnrichLimit: 0, pageConcurrency: 1,
  }, Date.UTC(2026, 7, 17))
  assert.equal(result.sources[0].ok, true)
  assert.equal(result.records.length, 2)
  const repositoryRecord = result.records.find(record => record.categories.includes('repository'))
  const releaseRecord = result.records.find(record => record.categories.includes('release'))
  assert.equal(repositoryRecord.artifacts.find(artifact => artifact.kind === 'code').revision, 'b'.repeat(40))
  assert.equal(releaseRecord.artifacts.find(artifact => artifact.kind === 'code' && artifact.revision !== undefined).revision, 'c'.repeat(40))
  assert.equal(releaseRecord.artifacts.find(artifact => artifact.kind === 'release_asset').checksum, `sha256:${'a'.repeat(64)}`)
})
