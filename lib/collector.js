import { createHash } from 'node:crypto'
import {
  parseArxiv,
  parseDatedIndex,
  parseFeed,
  parseHuggingFaceModels,
  parseIndexLinks,
  parseModelIndex,
  parseOfficialPage,
  parseSitemap,
  parseXPosts,
  structureFingerprint,
} from './parse.js'
import { fetchText } from './http.js'
import { canonicalDigest, recordContentDigest } from './canonical.js'
import {
  githubRepositoryEnrichment,
  githubRepositoryIdentity,
  huggingFacePaperEnrichment,
  huggingFaceRepositoryEnrichment,
  huggingFaceRepositoryIdentity,
} from './enrich.js'

const ARTIFACT_RULES = [
  ['paper', url => /(^|\.)arxiv\.org$/.test(url.hostname) || /doi\.org$/.test(url.hostname)],
  ['paper', url => url.hostname === 'huggingface.co' && url.pathname.startsWith('/papers/')],
  ['model_card', url => /model[-_]?card/i.test(url.pathname) && /\.pdf$/i.test(url.pathname)],
  ['dataset', url => url.hostname === 'huggingface.co' && url.pathname.startsWith('/datasets/')],
  ['demo', url => url.hostname === 'huggingface.co' && url.pathname.startsWith('/spaces/')],
  ['model', url => url.hostname === 'huggingface.co' && url.pathname.split('/').filter(Boolean).length >= 2
    && !['api', 'blog', 'collections', 'datasets', 'docs', 'join', 'login', 'models', 'organizations', 'papers', 'pricing', 'settings', 'spaces', 'tasks']
      .includes(url.pathname.split('/').filter(Boolean)[0])],
  ['model', url => url.hostname === 'modelscope.cn' && /\/models\//.test(url.pathname)],
  ['code', url => ['github.com', 'gitlab.com', 'codeberg.org'].includes(url.hostname)],
  ['api_docs', url => /(^|\.)docs\./.test(url.hostname) || /api-docs/.test(url.hostname)],
  ['evaluation', url => /benchmark|leaderboard|eval/i.test(url.href)],
]

const LAB_TECHNICAL_SIGNALS = [
  'agent', 'benchmark', 'code', 'coding', 'context', 'dataset', 'engineering', 'evaluation', 'inference',
  'model', 'multimodal', 'reasoning', 'release', 'research', 'robot', 'safety', 'training', 'weights',
  'architecture', 'open source', 'open-source', 'reinforcement learning', 'tool use', 'api',
  '智能体', '基准', '代码', '上下文', '数据集', '工程', '评测', '推理', '模型', '多模态', '发布', '研究', '安全', '训练', '权重', '架构', '开源', '强化学习',
]

const PERSON_TECHNICAL_SIGNALS = [...LAB_TECHNICAL_SIGNALS, ' ai ', 'llm', 'gpt', 'claude', 'gemini', 'deepseek', 'glm', 'sora', 'openai', 'anthropic', 'deepmind']

function canonicalUrl(input, { preserveArxivVersion = false } = {}) {
  const url = new URL(input)
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|ref$|source$|_bhlid$)/i.test(key)) url.searchParams.delete(key)
  }
  url.pathname = url.pathname.replace(/\/$/, '') || '/'
  if (url.hostname === 'arxiv.org' && !preserveArxivVersion) url.pathname = url.pathname.replace(/v\d+$/, '')
  return url.href
}

function classifyArtifacts(links, primaryUrl) {
  const byUrl = new Map()
  const primary = new URL(primaryUrl)
  for (const link of links) {
    try {
      const url = new URL(link)
      if (url.protocol !== 'https:') continue
      const kind = ARTIFACT_RULES.find(([, matches]) => matches(url))?.[0]
      const canonical = canonicalUrl(url.href, { preserveArxivVersion: true })
      if (kind === 'api_docs' && url.origin === primary.origin && canonical !== canonicalUrl(primary.href)) continue
      if (kind !== undefined) {
        const revision = url.hostname === 'arxiv.org' ? /v\d+$/.exec(url.pathname)?.[0] : undefined
        byUrl.set(canonical, {
          kind,
          url: canonical,
          ...(revision === undefined ? {} : { revision, immutableUrl: canonical }),
        })
      }
    } catch {
      // Bad outbound links do not invalidate an otherwise useful official record.
    }
  }
  return [...byUrl.values()].slice(0, 100)
}

function includesSignal(text, signals) {
  const normalized = ` ${text.toLowerCase()} `
  return signals.some(signal => normalized.includes(signal))
}

/** Admit primary papers/artifacts and filter non-technical lab/person updates from the frontier corpus. */
export function isFrontierItem(source, item) {
  if (source.sourceClass === 'paper' || source.sourceClass === 'official_artifact') return true
  const text = `${item.title ?? ''} ${item.summary ?? ''} ${(item.categories ?? []).join(' ')}`
  const artifacts = item.url === undefined ? [] : classifyArtifacts([item.url, ...(item.discoveredLinks ?? [])], item.url)
  if (artifacts.length > 0) return true
  if (source.sourceClass === 'official_lab') return includesSignal(text, LAB_TECHNICAL_SIGNALS)
  return includesSignal(text, PERSON_TECHNICAL_SIGNALS)
}

const INVALID_TITLES = new Set(['', '-', 'undefined', 'null', 'untitled'])

function normalizedLabel(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Apply declarative source contracts before relevance ranking or persistence. */
export function applySourceQuality(source, items) {
  const allow = new Set((source.allowCategories ?? []).map(normalizedLabel))
  const deny = new Set((source.denyCategories ?? []).map(normalizedLabel))
  const boilerplate = new Set((source.boilerplateTitles ?? []).map(normalizedLabel))
  const rejectedReasons = {}
  const accepted = []
  const reject = (reason) => { rejectedReasons[reason] = (rejectedReasons[reason] ?? 0) + 1 }
  for (const item of items) {
    const title = normalizedLabel(item.title)
    const categories = (item.categories ?? []).map(normalizedLabel)
    if (INVALID_TITLES.has(title)) reject('invalid_title')
    else if (boilerplate.has(title)) reject('boilerplate_title')
    else if (source.requirePublishedAt === true && item.publishedAt === undefined) reject('missing_published_at')
    else if (deny.size > 0 && categories.some(category => deny.has(category))) reject('denied_category')
    else if (allow.size > 0 && !categories.some(category => allow.has(category))) reject('category_not_allowed')
    else accepted.push(item)
  }
  return { items: accepted, rejectedCount: items.length - accepted.length, rejectedReasons }
}

function jsonStructureFingerprint(value) {
  const signatures = new Set()
  function visit(item, path, depth) {
    if (depth > 8) return
    if (Array.isArray(item)) {
      signatures.add(`${path}:array`)
      for (const child of item.slice(0, 5)) visit(child, `${path}[]`, depth + 1)
    } else if (item !== null && typeof item === 'object') {
      signatures.add(`${path}:object:${Object.keys(item).sort().join(',')}`)
      for (const [key, child] of Object.entries(item)) visit(child, `${path}.${key}`, depth + 1)
    } else {
      signatures.add(`${path}:${item === null ? 'null' : typeof item}`)
    }
  }
  visit(value, '$', 0)
  return canonicalDigest([...signatures].sort())
}

function combinedFingerprint(...fingerprints) {
  return canonicalDigest(fingerprints.filter(Boolean).sort())
}

function markdownLinks(markdown) {
  const links = new Set()
  for (const match of markdown.matchAll(/https:\/\/[^\s<>"'\])}]+/g)) {
    try {
      links.add(new URL(match[0].replace(/[.,;:]+$/, '')).href)
    } catch {
      // Ignore malformed README text.
    }
  }
  return [...links]
}

function recordId(source, item) {
  const identity = item.arxivId === undefined ? canonicalUrl(item.url) : `arxiv:${item.arxivId}`
  return createHash('sha256').update(`${source.id}\0${identity}`).digest('hex').slice(0, 20)
}

export function normalizeItem(source, item, now) {
  const url = canonicalUrl(item.url)
  const links = item.arxivId === undefined ? [url, ...(item.discoveredLinks ?? [])] : (item.discoveredLinks ?? [])
  const record = {
    id: recordId(source, item),
    sourceId: source.id,
    sourceName: source.name,
    sourceClass: source.sourceClass,
    sourceType: source.type,
    lab: source.lab,
    ...(source.person === undefined ? {} : { person: source.person, role: source.role }),
    provenance: {
      canonicalUrl: url,
      sourceUrl: source.url,
      ...(source.identityEvidenceUrl === undefined ? {} : { identityEvidenceUrl: source.identityEvidenceUrl }),
      ...(item.arxivVersion === undefined ? {} : { observedRevision: item.arxivVersion }),
      collectedAt: new Date(now).toISOString(),
    },
    title: item.title.replace(/\s+/g, ' ').trim().slice(0, 500),
    url,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    summary: String(item.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 4_000),
    authors: [...new Set((item.authors ?? []).filter(Boolean))].slice(0, 100),
    categories: [...new Set((item.categories ?? []).filter(Boolean))].slice(0, 50),
    ...(item.arxivId === undefined ? {} : { arxivId: item.arxivId }),
    ...(item.arxivVersionedId === undefined ? {} : { arxivVersionedId: item.arxivVersionedId }),
    ...(item.arxivVersion === undefined ? {} : { arxivVersion: item.arxivVersion }),
    artifacts: [...new Map([
      ...classifyArtifacts(links, url),
      ...(Array.isArray(item.artifacts) ? item.artifacts : []),
    ].map(artifact => [artifact.url, artifact])).values()].slice(0, 100),
    ...(item.paperDiscovery === undefined ? {} : { paperDiscovery: item.paperDiscovery }),
    firstSeenAt: new Date(now).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
  }
  return { ...record, contentDigest: recordContentDigest(record) }
}

async function fetchJsonDocument(url, options) {
  const response = await fetchText(url, { ...options, accept: 'application/json' })
  try {
    return { data: JSON.parse(response.body), requestedUrl: url, responseUrl: response.url }
  } catch {
    throw new Error(`invalid JSON from ${new URL(url).hostname}`)
  }
}

async function fetchJson(url, options) {
  return (await fetchJsonDocument(url, options)).data
}

async function mapConcurrent(values, limit, mapper) {
  const result = new Array(values.length)
  let cursor = 0
  async function worker() {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      result[index] = await mapper(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker))
  return result
}

async function enrichHuggingFaceArtifacts(records, options) {
  const limit = Number.isInteger(options.huggingFaceEnrichLimit)
    ? Math.max(0, Math.min(50, options.huggingFaceEnrichLimit))
    : 0
  const identities = new Map()
  for (const record of records) {
    for (const artifact of record.artifacts) {
      if (!['model', 'dataset'].includes(artifact.kind) || /^[0-9a-f]{40}$/i.test(artifact.revision ?? '')) continue
      const identity = huggingFaceRepositoryIdentity(artifact.url)
      if (identity !== undefined) identities.set(`${identity.repoType}:${identity.repoId}`.toLowerCase(), identity)
    }
  }
  const selected = [...identities.values()].slice(0, limit)
  const settled = await mapConcurrent(selected, options.pageConcurrency ?? 3, async (identity) => {
    const apiType = identity.repoType === 'dataset' ? 'datasets' : 'models'
    try {
      const path = identity.repoId.split('/').map(encodeURIComponent).join('/')
      const repository = await fetchJson(`https://huggingface.co/api/${apiType}/${path}`, options)
      huggingFaceRepositoryEnrichment(repository, identity)
      return { key: `${identity.repoType}:${identity.repoId}`.toLowerCase(), repository, identity }
    } catch (error) {
      return { key: `${identity.repoType}:${identity.repoId}`.toLowerCase(), error: `${identity.rootUrl}: ${error.message}` }
    }
  })
  const repositories = new Map(settled.filter(item => item.error === undefined).map(item => [item.key, item]))
  const enriched = records.map((record) => {
    const artifacts = record.artifacts.map((artifact) => {
      const identity = ['model', 'dataset'].includes(artifact.kind) ? huggingFaceRepositoryIdentity(artifact.url) : undefined
      const entry = identity === undefined ? undefined : repositories.get(`${identity.repoType}:${identity.repoId}`.toLowerCase())
      return entry === undefined ? artifact : { ...artifact, ...huggingFaceRepositoryEnrichment(entry.repository, identity, artifact.url) }
    })
    const next = { ...record, artifacts }
    return { ...next, contentDigest: recordContentDigest(next) }
  })
  return {
    records: enriched,
    report: {
      attempted: selected.length,
      pinned: repositories.size,
      skippedByLimit: Math.max(0, identities.size - selected.length),
      warnings: settled.filter(item => item.error !== undefined).map(item => item.error),
    },
  }
}

async function enrichGitHubArtifacts(records, options) {
  const limit = Number.isInteger(options.githubEnrichLimit) ? Math.max(0, Math.min(20, options.githubEnrichLimit)) : 0
  const identities = new Map()
  for (const record of records) {
    for (const artifact of record.artifacts) {
      if (artifact.kind !== 'code') continue
      const identity = githubRepositoryIdentity(artifact.url)
      if (identity !== undefined) identities.set(identity.rootUrl.toLowerCase(), identity)
    }
  }
  const selected = [...identities.values()].slice(0, limit)
  const headers = options.githubToken === undefined
    ? { accept: 'application/vnd.github+json' }
    : { accept: 'application/vnd.github+json', authorization: `Bearer ${options.githubToken}` }
  const settled = await mapConcurrent(selected, options.pageConcurrency ?? 3, async (identity) => {
    const path = `${encodeURIComponent(identity.owner)}/${encodeURIComponent(identity.repo)}`
    try {
      const repositoryDocument = await fetchJsonDocument(`https://api.github.com/repos/${path}`, { ...options, headers })
      const repository = repositoryDocument.data
      const branch = encodeURIComponent(repository.default_branch ?? 'main')
      const canonicalIdentity = githubRepositoryIdentity(`https://github.com/${String(repository.full_name ?? '')}`)
      if (canonicalIdentity === undefined) throw new Error('GitHub repository response omitted a valid full_name')
      const canonicalPath = `${encodeURIComponent(canonicalIdentity.owner)}/${encodeURIComponent(canonicalIdentity.repo)}`
      const commit = await fetchJson(`https://api.github.com/repos/${canonicalPath}/commits/${branch}`, { ...options, headers })
      return {
        key: identity.rootUrl.toLowerCase(),
        patch: githubRepositoryEnrichment(repository, commit, identity, repositoryDocument),
      }
    } catch (error) {
      return { key: identity.rootUrl.toLowerCase(), error: `${identity.rootUrl}: ${error.message}` }
    }
  })
  const patches = new Map(settled.filter(item => item.error === undefined).map(item => [item.key, item.patch]))
  const enriched = records.map((record) => {
    const artifacts = record.artifacts.map((artifact) => {
      if (artifact.kind !== 'code') return artifact
      const identity = githubRepositoryIdentity(artifact.url)
      const patch = identity === undefined ? undefined : patches.get(identity.rootUrl.toLowerCase())
      return patch === undefined ? artifact : { ...artifact, ...patch }
    })
    const next = { ...record, artifacts }
    return { ...next, contentDigest: recordContentDigest(next) }
  })
  return {
    records: enriched,
    report: {
      attempted: selected.length,
      pinned: patches.size,
      skippedByLimit: Math.max(0, identities.size - selected.length),
      warnings: settled.filter(item => item.error !== undefined).map(item => item.error),
    },
  }
}

function arxivUrl(source, query) {
  const categories = source.categories.map(category => `cat:${category}`).join(' OR ')
  const tokens = typeof query === 'string'
    ? query.replace(/["\\]/g, ' ').split(/\s+/).filter(token => token.length >= 2).slice(0, 8)
    : []
  const search = tokens.length === 0
    ? `(${categories})`
    : `(${categories}) AND (${tokens.map(token => `all:"${token}"`).join(' AND ')})`
  const params = new URLSearchParams({
    search_query: search,
    start: '0',
    max_results: String(source.maxItems),
    sortBy: 'submittedDate',
    sortOrder: 'descending',
  })
  return `${source.url}?${params}`
}

async function collectOfficialPages(urls, source, options) {
  const settled = await mapConcurrent(urls, options.pageConcurrency ?? 3, async (entry) => {
    const url = typeof entry === 'string' ? entry : entry.url
    try {
      const { body } = await fetchText(url, options)
      const parsed = parseOfficialPage(body, url)
      if (parsed.publishedAt === undefined && typeof entry !== 'string') parsed.updatedAt ??= entry.modifiedAt
      return parsed.title === undefined || parsed.title === '' ? undefined : {
        item: parsed,
        structureFingerprint: structureFingerprint(body),
      }
    } catch (error) {
      return { pageError: `${url}: ${error.message}` }
    }
  })
  return {
    items: settled.filter(item => item !== undefined && item.pageError === undefined).map(item => item.item),
    warnings: settled.filter(item => item?.pageError !== undefined).map(item => item.pageError),
    structureFingerprint: combinedFingerprint(...settled.map(item => item?.structureFingerprint)),
  }
}

async function collectX(source, options) {
  if (options.xBearerToken === undefined) {
    const error = new Error(`credential ${options.xBearerTokenEnv} is required for X API reads`)
    error.code = 'missing_credential'
    throw error
  }
  const headers = { authorization: `Bearer ${options.xBearerToken}` }
  const userUrl = `https://api.x.com/2/users/by/username/${encodeURIComponent(source.username)}?user.fields=verified,verified_type`
  const user = await fetchJson(userUrl, { ...options, headers })
  if (typeof user?.data?.id !== 'string') throw new Error(`X user lookup failed for @${source.username}`)
  const params = new URLSearchParams({
    max_results: String(Math.max(5, Math.min(100, source.maxItems))),
    'tweet.fields': 'created_at,entities,referenced_tweets',
    exclude: 'replies,retweets',
  })
  const posts = await fetchJson(`https://api.x.com/2/users/${user.data.id}/tweets?${params}`, { ...options, headers })
  return {
    items: parseXPosts(posts, source),
    warnings: [],
    structureFingerprint: combinedFingerprint(jsonStructureFingerprint(user), jsonStructureFingerprint(posts)),
  }
}

function githubHeaders(options) {
  return options.githubToken === undefined
    ? { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }
    : { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', authorization: `Bearer ${options.githubToken}` }
}

function githubCodeArtifact(repository, revision) {
  if (!/^[0-9a-f]{40}$/i.test(revision ?? '')) return undefined
  const root = String(repository.html_url ?? '').replace(/\/$/, '')
  if (!root.startsWith('https://github.com/')) return undefined
  return {
    kind: 'code',
    url: root,
    provider: 'github-rest',
    repositoryUrl: root,
    immutableUrl: `${root}/tree/${revision.toLowerCase()}`,
    revision: revision.toLowerCase(),
    defaultBranch: repository.default_branch,
    ...(typeof repository.license?.spdx_id !== 'string' || repository.license.spdx_id === 'NOASSERTION'
      ? {}
      : { license: repository.license.spdx_id }),
  }
}

function githubRepositoryItem(repository, revision) {
  const artifact = githubCodeArtifact(repository, revision)
  return {
    title: `${repository.full_name}: repository update`,
    url: repository.html_url,
    publishedAt: validGithubDate(repository.created_at),
    updatedAt: validGithubDate(repository.pushed_at ?? repository.updated_at),
    summary: `${repository.description ?? ''} ${(repository.topics ?? []).join(' ')}`.trim(),
    authors: [repository.owner?.login].filter(Boolean),
    categories: ['repository', ...(repository.topics ?? [])],
    discoveredLinks: [repository.html_url, repository.homepage].filter(link => typeof link === 'string' && link.startsWith('https://')),
    artifacts: artifact === undefined ? [] : [artifact],
  }
}

function validGithubDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined
}

function githubReleaseItem(repository, release, revision) {
  const code = githubCodeArtifact(repository, revision)
  const assets = (Array.isArray(release.assets) ? release.assets : []).filter(asset => typeof asset.browser_download_url === 'string')
    .slice(0, 20).map(asset => ({
      kind: 'release_asset',
      url: asset.browser_download_url,
      ...(typeof asset.digest === 'string' ? { checksum: asset.digest } : {}),
      ...(Number.isInteger(asset.size) ? { size: asset.size } : {}),
    }))
  return {
    title: `${repository.full_name} ${release.name || release.tag_name}`,
    url: release.html_url,
    publishedAt: validGithubDate(release.published_at ?? release.created_at),
    updatedAt: validGithubDate(release.updated_at),
    summary: String(release.body ?? '').slice(0, 4_000),
    authors: [release.author?.login].filter(Boolean),
    categories: ['release', release.prerelease === true ? 'prerelease' : 'stable', release.tag_name].filter(Boolean),
    discoveredLinks: [release.html_url, repository.html_url],
    artifacts: [code, ...assets].filter(Boolean),
  }
}

function githubTagItem(repository, tag) {
  const code = githubCodeArtifact(repository, tag.commit?.sha)
  return {
    title: `${repository.full_name} tag ${tag.name}`,
    url: code?.immutableUrl ?? `${repository.html_url}/tags`,
    publishedAt: undefined,
    updatedAt: validGithubDate(repository.pushed_at),
    summary: `Immutable Git tag ${tag.name}.`,
    authors: [repository.owner?.login].filter(Boolean),
    categories: ['tag', tag.name],
    discoveredLinks: [repository.html_url],
    artifacts: code === undefined ? [] : [code],
  }
}

async function collectGitHubOrg(source, options) {
  const headers = githubHeaders(options)
  const params = new URLSearchParams({ type: 'public', sort: 'pushed', direction: 'desc', per_page: String(source.maxItems) })
  const repositories = await fetchJson(`${source.url}?${params}`, { ...options, headers })
  if (!Array.isArray(repositories)) throw new TypeError(`GitHub organization ${source.organization} did not return a repository array`)
  const selected = repositories.filter(repository => repository?.private !== true && repository?.archived !== true
    && repository?.fork !== true && String(repository?.full_name ?? '').toLowerCase().startsWith(`${source.organization.toLowerCase()}/`))
    .slice(0, source.maxItems)
  const settled = await mapConcurrent(selected, options.pageConcurrency ?? 3, async (repository, index) => {
    const path = repository.full_name.split('/').map(encodeURIComponent).join('/')
    const warnings = []
    let revision
    try {
      const commit = await fetchJson(`https://api.github.com/repos/${path}/commits/${encodeURIComponent(repository.default_branch ?? 'main')}`, { ...options, headers })
      revision = commit.sha
    } catch (error) {
      warnings.push(`${repository.html_url}: default-branch pin failed: ${error.message}`)
    }
    const items = [githubRepositoryItem(repository, revision)]
    if (index >= (source.releaseRepoLimit ?? 0) || (source.releasesPerRepo ?? 0) < 1) return { items, warnings }
    try {
      const releaseParams = new URLSearchParams({ per_page: String(source.releasesPerRepo ?? 2) })
      const releases = await fetchJson(`https://api.github.com/repos/${path}/releases?${releaseParams}`, { ...options, headers })
      const publicReleases = Array.isArray(releases) ? releases.filter(release => release?.draft !== true) : []
      if (publicReleases.length > 0) {
        for (const release of publicReleases.slice(0, source.releasesPerRepo ?? 2)) {
          let releaseRevision
          try {
            const commit = await fetchJson(`https://api.github.com/repos/${path}/commits/${encodeURIComponent(release.tag_name)}`, { ...options, headers })
            releaseRevision = commit.sha
          } catch (error) {
            warnings.push(`${release.html_url}: tag pin failed: ${error.message}`)
          }
          items.push(githubReleaseItem(repository, release, releaseRevision))
        }
      } else {
        const tags = await fetchJson(`https://api.github.com/repos/${path}/tags?${releaseParams}`, { ...options, headers })
        items.push(...(Array.isArray(tags) ? tags.slice(0, source.releasesPerRepo ?? 2).map(tag => githubTagItem(repository, tag)) : []))
      }
    } catch (error) {
      warnings.push(`${repository.html_url}: release/tag discovery failed: ${error.message}`)
    }
    return { items, warnings }
  })
  return {
    items: settled.flatMap(result => result.items),
    warnings: settled.flatMap(result => result.warnings),
    structureFingerprint: jsonStructureFingerprint(repositories),
  }
}

/** Collect one curated source. */
export async function collectSource(source, options = {}) {
  if (source.type === 'arxiv') {
    const response = await fetchText(arxivUrl(source, options.query), options)
    const items = parseArxiv(response.body, source)
    const limit = Number.isInteger(source.enrichPaperArtifacts) ? source.enrichPaperArtifacts : 0
    const sourceFingerprint = structureFingerprint(response.body, true)
    if (limit < 1) return { items, warnings: [], structureFingerprint: sourceFingerprint }
    const settled = await mapConcurrent(items.slice(0, limit), options.pageConcurrency ?? 3, async (item) => {
      try {
        const payload = await fetchJson(`https://huggingface.co/api/papers/${encodeURIComponent(item.arxivId)}`, options)
        return { arxivId: item.arxivId, ...huggingFacePaperEnrichment(payload, item.arxivId) }
      } catch (error) {
        return { arxivId: item.arxivId, ...(error.message.startsWith('HTTP 404') ? { notIndexed: true } : { error: error.message }) }
      }
    })
    const byId = new Map(settled.map(item => [item.arxivId, item]))
    return {
      items: items.map((item) => {
        const enrichment = byId.get(item.arxivId)
        if (enrichment === undefined || enrichment.notIndexed || enrichment.error !== undefined) return item
        return {
          ...item,
          artifacts: enrichment.artifacts,
          paperDiscovery: enrichment.paperDiscovery,
          discoveredLinks: [...new Set([...item.discoveredLinks, ...enrichment.artifacts.map(artifact => artifact.url)])],
        }
      }),
      warnings: settled.filter(item => item.error !== undefined)
        .map(item => `Hugging Face paper ${item.arxivId}: ${item.error}`),
      structureFingerprint: sourceFingerprint,
    }
  }
  if (source.type === 'feed') {
    const response = await fetchText(source.url, options)
    const items = parseFeed(response.body, source)
    const sourceFingerprint = structureFingerprint(response.body, true)
    if (!Number.isInteger(source.enrichPages) || source.enrichPages < 1) {
      return { items, warnings: [], structureFingerprint: sourceFingerprint }
    }
    const enriched = await collectOfficialPages(items.slice(0, source.enrichPages).map(item => item.url), source, options)
    const detailByUrl = new Map(enriched.items.map(item => [canonicalUrl(item.url), item]))
    return {
      items: items.map((item) => {
        const detail = detailByUrl.get(canonicalUrl(item.url))
        if (detail === undefined) return item
        return {
          ...item,
          summary: item.summary || detail.summary,
          authors: item.authors.length > 0 ? item.authors : detail.authors,
          discoveredLinks: [...new Set([...item.discoveredLinks, ...detail.discoveredLinks])],
        }
      }),
      warnings: enriched.warnings,
      structureFingerprint: combinedFingerprint(sourceFingerprint, enriched.structureFingerprint),
    }
  }
  if (source.type === 'page') {
    const response = await fetchText(source.url, options)
    const item = parseOfficialPage(response.body, source.url)
    return {
      items: item.title === undefined || item.title === '' ? [] : [item],
      warnings: [],
      structureFingerprint: structureFingerprint(response.body),
    }
  }
  if (source.type === 'official_index') {
    const index = await fetchText(source.url, options)
    const collected = await collectOfficialPages(parseIndexLinks(index.body, source), source, options)
    return {
      ...collected,
      structureFingerprint: combinedFingerprint(structureFingerprint(index.body), collected.structureFingerprint),
    }
  }
  if (source.type === 'dated_index') {
    const index = await fetchText(source.url, options)
    return { items: parseDatedIndex(index.body, source), warnings: [], structureFingerprint: structureFingerprint(index.body) }
  }
  if (source.type === 'model_index') {
    const index = await fetchText(source.url, options)
    return { items: parseModelIndex(index.body, source), warnings: [], structureFingerprint: structureFingerprint(index.body) }
  }
  if (source.type === 'sitemap') {
    const sitemap = await fetchText(source.url, options)
    const collected = await collectOfficialPages(parseSitemap(sitemap.body, source), source, options)
    return {
      ...collected,
      structureFingerprint: combinedFingerprint(structureFingerprint(sitemap.body, true), collected.structureFingerprint),
    }
  }
  if (source.type === 'huggingface_models') {
    const params = new URLSearchParams({
      author: source.organization,
      sort: 'lastModified',
      direction: '-1',
      limit: String(source.maxItems),
      full: 'true',
    })
    const json = await fetchJson(`${source.url}?${params}`, options)
    const items = parseHuggingFaceModels(json, source)
    if (!Number.isInteger(source.enrichModelCards) || source.enrichModelCards < 1) {
      return { items, warnings: [], structureFingerprint: jsonStructureFingerprint(json) }
    }
    const settled = await mapConcurrent(items.slice(0, source.enrichModelCards), options.pageConcurrency ?? 3, async (item) => {
      try {
        const revision = item.hubRevision ?? 'main'
        const card = await fetchText(`${item.url}/raw/${revision}/README.md`, { ...options, accept: 'text/plain, text/markdown' })
        return { url: item.url, links: markdownLinks(card.body) }
      } catch (error) {
        return { url: item.url, error: `${item.url}: ${error.message}` }
      }
    })
    const cardByUrl = new Map(settled.filter(item => item.error === undefined).map(item => [item.url, item.links]))
    return {
      items: items.map(item => ({
        ...item,
        discoveredLinks: [...new Set([...item.discoveredLinks, ...(cardByUrl.get(item.url) ?? [])])],
      })),
      warnings: settled.filter(item => item.error !== undefined).map(item => item.error),
      structureFingerprint: jsonStructureFingerprint(json),
    }
  }
  if (source.type === 'github_org') return collectGitHubOrg(source, options)
  if (source.type === 'x_user') return collectX(source, options)
  throw new TypeError(`unsupported source type: ${source.type}`)
}

/** Collect selected sources independently; one unavailable source never erases the others. */
export async function collectAll(sources, options = {}, now = Date.now()) {
  const settled = await Promise.all(sources.map(async (source) => {
    try {
      const result = await collectSource(source, options)
      const quality = applySourceQuality(source, result.items)
      const frontierItems = quality.items.filter(item => isFrontierItem(source, item))
      const relevanceRejected = quality.items.length - frontierItems.length
      return {
        source,
        records: frontierItems.map(item => normalizeItem(source, item, now)),
        rawCount: result.items.length,
        rejectedCount: quality.rejectedCount + relevanceRejected,
        rejectedReasons: {
          ...quality.rejectedReasons,
          ...(relevanceRejected < 1 ? {} : { relevance_filter: relevanceRejected }),
        },
        warnings: result.warnings,
        structureFingerprint: result.structureFingerprint,
      }
    } catch (error) {
      return {
        source,
        records: [],
        rawCount: 0,
        rejectedCount: 0,
        rejectedReasons: {},
        warnings: [],
        error: { code: error.code ?? 'source_failed', message: error.message },
      }
    }
  }))
  const byIdentity = new Map()
  for (const record of settled.flatMap(result => result.records)) {
    const identity = record.arxivId === undefined ? record.url : `arxiv:${record.arxivId}`
    const existing = byIdentity.get(identity)
    if (existing === undefined) byIdentity.set(identity, record)
    else {
      byIdentity.set(identity, {
        ...existing,
        artifacts: [...new Map([...existing.artifacts, ...record.artifacts].map(item => [item.url, item])).values()],
        corroboratingSources: [...new Set([...(existing.corroboratingSources ?? []), record.sourceId])],
      })
    }
  }
  const huggingFace = await enrichHuggingFaceArtifacts([...byIdentity.values()], options)
  const github = await enrichGitHubArtifacts(huggingFace.records, options)
  return {
    records: github.records,
    sources: settled.map((result) => {
      const newestItemAt = result.records
        .map(record => record.publishedAt ?? record.updatedAt)
        .filter(Boolean)
        .sort()
        .at(-1)
      return {
        id: result.source.id,
        name: result.source.name,
        count: result.records.length,
        rawCount: result.rawCount,
        rejectedCount: result.rejectedCount,
        rejectedReasons: result.rejectedReasons,
        warnings: result.warnings,
        ...(Number.isInteger(result.source.healthStaleAfterDays) ? { healthStaleAfterDays: result.source.healthStaleAfterDays } : {}),
        ...(result.structureFingerprint === undefined ? {} : { structureFingerprint: result.structureFingerprint }),
        ...(newestItemAt === undefined ? {} : { newestItemAt }),
        ...(result.error === undefined ? { ok: true } : { ok: false, error: result.error }),
      }
    }),
    enrichments: { huggingFace: huggingFace.report, github: github.report },
  }
}

/** Apply deterministic local filters to the persistent corpus. */
export function filterRecords(records, { query = '', sourceIds = [], labs = [], days, now = Date.now() } = {}) {
  const sourceSet = new Set(sourceIds)
  const labSet = new Set(labs.map(lab => lab.toLowerCase()))
  const tokens = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(token => token.length >= 2)
  const cutoff = days === undefined ? undefined : now - days * 86_400_000
  return records.filter((record) => {
    if (sourceSet.size > 0 && !sourceSet.has(record.sourceId)) return false
    if (labSet.size > 0 && !labSet.has(record.lab.toLowerCase())) return false
    const date = Date.parse(record.publishedAt ?? record.updatedAt ?? record.firstSeenAt)
    if (cutoff !== undefined && Number.isFinite(date) && date < cutoff) return false
    if (tokens.length === 0) return true
    const text = `${record.title} ${record.summary} ${record.categories.join(' ')} ${record.lab}`.toLowerCase()
    return tokens.some(token => text.includes(token))
  })
}
