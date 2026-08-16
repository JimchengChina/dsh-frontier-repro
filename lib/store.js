import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { canonicalDigest } from './canonical.js'

const EMPTY = Object.freeze({ version: 2, updatedAt: undefined, records: [], assessments: {}, runs: {}, collections: [] })

function cloneEmpty() {
  return { version: EMPTY.version, records: [], assessments: {}, runs: {}, collections: [] }
}

function validateData(value) {
  if (value !== null && typeof value === 'object' && value.version === 1
    && Array.isArray(value.records) && value.assessments !== null && typeof value.assessments === 'object'
    && value.runs !== null && typeof value.runs === 'object') {
    return { ...value, version: 2, collections: [] }
  }
  if (value === null || typeof value !== 'object' || value.version !== 2
    || !Array.isArray(value.records) || value.assessments === null || typeof value.assessments !== 'object'
    || value.runs === null || typeof value.runs !== 'object' || !Array.isArray(value.collections)) {
    throw new TypeError('frontier repro store has an unsupported format')
  }
  return value
}

function mergeRecordData(data, incoming, maxRecords) {
  const beforeById = new Map(data.records.map(record => [record.id, record]))
  const byId = new Map(beforeById)
  for (const record of incoming) {
    const previous = byId.get(record.id)
    byId.set(record.id, previous === undefined ? record : {
      ...previous,
      ...record,
      firstSeenAt: previous.firstSeenAt,
      artifacts: [...new Map([...previous.artifacts, ...record.artifacts].map(item => [item.url, item])).values()],
    })
  }
  const records = [...byId.values()].sort((left, right) =>
    (right.publishedAt ?? right.updatedAt ?? '').localeCompare(left.publishedAt ?? left.updatedAt ?? ''))
    .slice(0, maxRecords)
  const liveIds = new Set(records.map(record => record.id))
  const addedIds = records.filter(record => !beforeById.has(record.id)).map(record => record.id)
  const previousRecords = records
    .filter(record => beforeById.has(record.id) && JSON.stringify(beforeById.get(record.id)) !== JSON.stringify(record))
    .map(record => beforeById.get(record.id))
  const evictedRecords = data.records.filter(record => !liveIds.has(record.id))
  const evictedIds = new Set(evictedRecords.map(record => record.id))
  const evictedAssessments = Object.fromEntries(Object.entries(data.assessments).filter(([id]) => evictedIds.has(id)))
  const evictedRuns = Object.fromEntries(Object.entries(data.runs).filter(([id]) => evictedIds.has(id)))
  return {
    data: {
      ...data,
      records,
      assessments: Object.fromEntries(Object.entries(data.assessments).filter(([id]) => liveIds.has(id))),
      runs: Object.fromEntries(Object.entries(data.runs).filter(([id]) => liveIds.has(id))),
    },
    inverse: { addedIds, previousRecords, evictedRecords, evictedAssessments, evictedRuns },
  }
}

function boundedSourceResult(source) {
  return {
    id: String(source.id ?? '').slice(0, 100),
    ok: source.ok === true,
    count: Number.isInteger(source.count) ? source.count : 0,
    warnings: Array.isArray(source.warnings) ? source.warnings.slice(0, 20).map(item => String(item).slice(0, 500)) : [],
    ...(source.error === undefined ? {} : { error: {
      code: String(source.error.code ?? 'source_failed').slice(0, 100),
      message: String(source.error.message ?? '').slice(0, 500),
    } }),
  }
}

function collectionEntry(metadata, inverse) {
  const entry = {
    id: metadata.id,
    state: 'committed',
    requestedAt: metadata.requestedAt,
    startedAt: metadata.startedAt,
    finishedAt: metadata.finishedAt,
    input: metadata.input,
    partial: metadata.partial === true,
    sources: (metadata.sources ?? []).map(boundedSourceResult),
    enrichments: metadata.enrichments ?? {},
    recordIds: [...new Set(metadata.recordIds ?? [])].slice(0, 500),
    inverse,
  }
  return { ...entry, digest: canonicalDigest(entry) }
}

/** JSON-backed corpus with in-process serialization and atomic replacement. */
export class FrontierStore {
  constructor(filename, maxRecords = 1_000, maxCollections = 20) {
    this.filename = filename
    this.maxRecords = maxRecords
    this.maxCollections = maxCollections
    this.queue = Promise.resolve()
  }

  async readUnlocked() {
    try {
      return validateData(JSON.parse(await readFile(this.filename, 'utf8')))
    } catch (error) {
      if (error?.code === 'ENOENT') return cloneEmpty()
      throw error
    }
  }

  async read() {
    await this.queue
    return this.readUnlocked()
  }

  async writeUnlocked(data) {
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    const next = { ...data, updatedAt: new Date().toISOString() }
    const temporary = `${this.filename}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, this.filename)
    return next
  }

  enqueue(mutator) {
    const operation = this.queue.then(async () => {
      const data = await this.readUnlocked()
      return this.writeUnlocked(await mutator(data))
    })
    this.queue = operation.catch(() => {})
    return operation
  }

  async write(data) {
    return this.enqueue(() => data)
  }

  async mergeRecords(incoming) {
    return this.enqueue((data) => {
      return mergeRecordData(data, incoming, this.maxRecords).data
    })
  }

  async commitCollection(incoming, metadata) {
    return this.enqueue((data) => {
      if (typeof metadata?.id !== 'string' || metadata.id === '') throw new TypeError('collection metadata requires an id')
      if (data.collections.some(entry => entry.id === metadata.id)) throw new TypeError(`duplicate collection id: ${metadata.id}`)
      const merged = mergeRecordData(data, incoming, this.maxRecords)
      const entry = collectionEntry({ ...metadata, recordIds: incoming.map(record => record.id) }, merged.inverse)
      merged.data.collections = [...data.collections, entry].slice(-this.maxCollections)
      return merged.data
    })
  }

  async saveAssessment(recordId, assessment) {
    return this.enqueue((data) => {
      data.assessments[recordId] = assessment
      return data
    })
  }

  async appendRun(recordId, run) {
    return this.enqueue((data) => {
      const current = Array.isArray(data.runs[recordId]) ? data.runs[recordId] : []
      data.runs[recordId] = [...current, run].slice(-20)
      return data
    })
  }
}
