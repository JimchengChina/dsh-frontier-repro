import { createHash } from 'node:crypto'

function normalize(value, seen) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON does not support non-finite numbers')
    return value
  }
  if (Array.isArray(value)) return value.map(item => normalize(item, seen))
  if (typeof value !== 'object') return undefined
  if (seen.has(value)) throw new TypeError('canonical JSON does not support cyclic values')
  seen.add(value)
  const result = {}
  for (const key of Object.keys(value).sort()) {
    const item = normalize(value[key], seen)
    if (item !== undefined) result[key] = item
  }
  seen.delete(value)
  return result
}

/** Serialize JSON data with stable object-key ordering. Arrays retain semantic order. */
export function canonicalStringify(value) {
  return JSON.stringify(normalize(value, new Set()))
}

/** Return a lowercase SHA-256 digest over canonical UTF-8 JSON. */
export function canonicalDigest(value) {
  return createHash('sha256').update(canonicalStringify(value), 'utf8').digest('hex')
}

/** Select stable research content while excluding observation timestamps and ranking. */
export function recordContentDigest(record) {
  return canonicalDigest({
    sourceId: record.sourceId,
    canonicalUrl: record.provenance?.canonicalUrl ?? record.url,
    title: record.title,
    publishedAt: record.publishedAt,
    updatedAt: record.updatedAt,
    summary: record.summary,
    authors: [...(record.authors ?? [])].sort(),
    categories: [...(record.categories ?? [])].sort(),
    arxivId: record.arxivId,
    artifacts: [...(record.artifacts ?? [])]
      .map(({ kind, url, immutableUrl, revision }) => ({ kind, url, immutableUrl, revision }))
      .sort((left, right) => `${left.kind}:${left.url}`.localeCompare(`${right.kind}:${right.url}`)),
  })
}

/** Fingerprint the declarative source configuration without runtime credential values. */
export function sourceCatalogDigest(sources) {
  return canonicalDigest(sources.map(source => ({ ...source })).sort((left, right) => left.id.localeCompare(right.id)))
}
