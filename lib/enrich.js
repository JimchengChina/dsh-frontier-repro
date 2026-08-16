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
