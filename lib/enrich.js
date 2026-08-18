function asPublicHubArtifact(entry, kind, prefix) {
  if (entry === null || typeof entry !== 'object' || entry.private === true || typeof entry.id !== 'string') return undefined
  return {
    kind,
    url: `https://huggingface.co/${prefix}${entry.id}`,
    provider: 'huggingface-paper-pages',
    repoId: entry.id,
    ...(entry.gated === undefined ? {} : { gated: entry.gated }),
    ...(typeof entry.lastModified !== 'string' ? {} : { lastModified: entry.lastModified }),
  }
}

function safeHttps(input) {
  if (typeof input !== 'string') return undefined
  try {
    const url = new URL(input)
    return url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

/** Parse a public Hugging Face model or dataset URL into its repository identity. */
export function huggingFaceRepositoryIdentity(input) {
  try {
    const url = new URL(input)
    const parts = url.pathname.split('/').filter(Boolean)
    if (url.hostname.toLowerCase() !== 'huggingface.co') return undefined
    const repoType = parts[0] === 'datasets' ? 'dataset' : 'model'
    if (repoType === 'model' && ['api', 'blog', 'collections', 'docs', 'join', 'login', 'models', 'organizations', 'papers', 'pricing', 'settings', 'spaces', 'tasks'].includes(parts[0])) {
      return undefined
    }
    const offset = repoType === 'dataset' ? 1 : 0
    if (parts.length < offset + 2 || ['spaces', 'papers'].includes(parts[0])) return undefined
    const owner = parts[offset]
    const repo = parts[offset + 1]
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return undefined
    const prefix = repoType === 'dataset' ? 'datasets/' : ''
    return { repoType, repoId: `${owner}/${repo}`, rootUrl: `https://huggingface.co/${prefix}${owner}/${repo}` }
  } catch {
    return undefined
  }
}

/** Validate Hub API metadata and pin an artifact URL to the returned repository SHA. */
export function huggingFaceRepositoryEnrichment(repository, identity, artifactUrl = identity.rootUrl) {
  if (repository === null || typeof repository !== 'object') {
    throw new TypeError('Hugging Face repository enrichment requires repository metadata')
  }
  if (String(repository.id ?? '').toLowerCase() !== identity.repoId.toLowerCase()) {
    throw new TypeError(`Hugging Face response did not match ${identity.repoId}`)
  }
  if (repository.private === true) throw new TypeError(`Hugging Face repository ${identity.repoId} is private`)
  if (!/^[0-9a-f]{40}$/i.test(repository.sha ?? '')) {
    throw new TypeError('Hugging Face repository response omitted a full SHA')
  }
  const revision = repository.sha.toLowerCase()
  const input = new URL(artifactUrl)
  const root = new URL(identity.rootUrl)
  const suffix = input.pathname.slice(root.pathname.length)
  const immutableSuffix = suffix.replace(/^\/(blob|tree)\/[^/]+/, `/$1/${revision}`)
  const immutableUrl = immutableSuffix === suffix && suffix !== ''
    ? `${identity.rootUrl}/tree/${revision}`
    : `${identity.rootUrl}${immutableSuffix || `/tree/${revision}`}`
  return {
    provider: 'huggingface-hub',
    repositoryUrl: identity.rootUrl,
    repoId: identity.repoId,
    repoType: identity.repoType,
    immutableUrl,
    revision,
    ...(repository.gated === undefined ? {} : { gated: repository.gated }),
    ...(typeof repository.cardData?.license !== 'string' ? {} : { license: repository.cardData.license }),
    ...(typeof repository.lastModified !== 'string' ? {} : { lastModified: repository.lastModified }),
  }
}

/** Convert Hugging Face Paper Pages metadata into bounded artifact candidates and discovery context. */
export function huggingFacePaperEnrichment(payload, arxivId) {
  if (payload === null || typeof payload !== 'object' || String(payload.id ?? '') !== arxivId) {
    throw new TypeError(`Hugging Face paper response did not match arXiv ${arxivId}`)
  }
  const artifacts = []
  const githubRepo = safeHttps(payload.githubRepo)
  if (githubRepo !== undefined) artifacts.push({ kind: 'code', url: githubRepo, provider: 'huggingface-paper-pages' })
  const projectPage = safeHttps(payload.projectPage)
  if (projectPage !== undefined) artifacts.push({ kind: 'project', url: projectPage, provider: 'huggingface-paper-pages' })
  for (const entry of Array.isArray(payload.linkedModels) ? payload.linkedModels : []) {
    const artifact = asPublicHubArtifact(entry, 'model', '')
    if (artifact !== undefined) artifacts.push(artifact)
  }
  for (const entry of Array.isArray(payload.linkedDatasets) ? payload.linkedDatasets : []) {
    const artifact = asPublicHubArtifact(entry, 'dataset', 'datasets/')
    if (artifact !== undefined) artifacts.push(artifact)
  }
  for (const entry of Array.isArray(payload.linkedSpaces) ? payload.linkedSpaces : []) {
    const artifact = asPublicHubArtifact(entry, 'demo', 'spaces/')
    if (artifact !== undefined) artifacts.push(artifact)
  }
  const byUrl = new Map(artifacts.map(artifact => [artifact.url, artifact]))
  return {
    artifacts: [...byUrl.values()].slice(0, 100),
    paperDiscovery: {
      provider: 'huggingface-paper-pages',
      url: `https://huggingface.co/papers/${arxivId}`,
      upvotes: Number.isInteger(payload.upvotes) ? payload.upvotes : 0,
      githubStars: Number.isInteger(payload.githubStars) ? payload.githubStars : undefined,
      linkedModels: Number.isInteger(payload.numTotalModels) ? payload.numTotalModels : 0,
      linkedDatasets: Number.isInteger(payload.numTotalDatasets) ? payload.numTotalDatasets : 0,
      linkedSpaces: Number.isInteger(payload.numTotalSpaces) ? payload.numTotalSpaces : 0,
    },
  }
}

/** Parse owner/repository from a GitHub artifact root, excluding issue/tree/blob subpages. */
export function githubRepositoryIdentity(input) {
  try {
    const url = new URL(input)
    const parts = url.pathname.split('/').filter(Boolean)
    if (url.hostname.toLowerCase() !== 'github.com' || parts.length < 2) return undefined
    if (!/^[A-Za-z0-9_.-]+$/.test(parts[0]) || !/^[A-Za-z0-9_.-]+$/.test(parts[1])) return undefined
    return { owner: parts[0], repo: parts[1].replace(/\.git$/i, ''), rootUrl: `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/i, '')}` }
  } catch {
    return undefined
  }
}

/** Validate GitHub REST responses and return an immutable repository evidence patch. */
export function githubRepositoryEnrichment(repository, commit, identity, response = {}) {
  if (repository === null || typeof repository !== 'object' || commit === null || typeof commit !== 'object') {
    throw new TypeError('GitHub repository enrichment requires repository and commit objects')
  }
  const expected = `${identity.owner}/${identity.repo}`.toLowerCase()
  const actual = String(repository.full_name ?? '').toLowerCase()
  const redirected = typeof response.requestedUrl === 'string' && typeof response.responseUrl === 'string'
    && response.requestedUrl !== response.responseUrl
  if (actual !== expected && !redirected) {
    throw new TypeError(`GitHub response did not match ${identity.owner}/${identity.repo}`)
  }
  if (!/^[0-9a-f]{40}$/i.test(commit.sha ?? '')) throw new TypeError('GitHub commit response omitted a full SHA')
  const rootUrl = safeHttps(repository.html_url) ?? identity.rootUrl
  const canonicalIdentity = githubRepositoryIdentity(rootUrl)
  if (canonicalIdentity === undefined || `${canonicalIdentity.owner}/${canonicalIdentity.repo}`.toLowerCase() !== actual) {
    throw new TypeError('GitHub canonical repository URL did not match full_name')
  }
  return {
    provider: 'github-rest',
    repositoryUrl: rootUrl.replace(/\/$/, ''),
    immutableUrl: `${rootUrl.replace(/\/$/, '')}/tree/${commit.sha.toLowerCase()}`,
    revision: commit.sha.toLowerCase(),
    defaultBranch: typeof repository.default_branch === 'string' ? repository.default_branch : undefined,
    license: typeof repository.license?.spdx_id === 'string' && repository.license.spdx_id !== 'NOASSERTION'
      ? repository.license.spdx_id
      : undefined,
    archived: repository.archived === true,
    disabled: repository.disabled === true,
    fork: repository.fork === true,
    stars: Number.isInteger(repository.stargazers_count) ? repository.stargazers_count : undefined,
    pushedAt: typeof repository.pushed_at === 'string' ? repository.pushed_at : undefined,
    ...(actual === expected ? {} : { redirectedFrom: identity.rootUrl }),
  }
}
