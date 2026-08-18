import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { canonicalDigest } from './canonical.js'
import { buildEvidenceBundles, reconcileEvidenceBundles } from './events.js'

const EMPTY = Object.freeze({
  version: 3,
  updatedAt: undefined,
  records: [],
  assessments: {},
  runs: {},
  collections: [],
  sourceHealth: {},
  events: {},
  eventHistory: {},
  watchlist: {},
  claimAssessments: {},
  attempts: {},
})

function cloneEmpty() {
  return {
    version: EMPTY.version,
    records: [],
    assessments: {},
    runs: {},
    collections: [],
    sourceHealth: {},
    events: {},
    eventHistory: {},
    watchlist: {},
    claimAssessments: {},
    attempts: {},
  }
}

function validateData(value) {
  if (value !== null && typeof value === 'object' && value.version === 1
    && Array.isArray(value.records) && value.assessments !== null && typeof value.assessments === 'object'
    && value.runs !== null && typeof value.runs === 'object') {
    value = { ...value, version: 2, collections: [], sourceHealth: {} }
  }
  if (value !== null && typeof value === 'object' && value.version === 2) {
    value = {
      ...value,
      version: 3,
      events: buildEvidenceBundles(value.records),
      eventHistory: {},
      watchlist: {},
      claimAssessments: {},
      attempts: {},
    }
  }
  if (value === null || typeof value !== 'object' || value.version !== 3
    || !Array.isArray(value.records) || value.assessments === null || typeof value.assessments !== 'object'
    || value.runs === null || typeof value.runs !== 'object' || !Array.isArray(value.collections)
    || (value.sourceHealth !== undefined && (value.sourceHealth === null || typeof value.sourceHealth !== 'object' || Array.isArray(value.sourceHealth)))
    || value.events === null || typeof value.events !== 'object' || Array.isArray(value.events)
    || value.eventHistory === null || typeof value.eventHistory !== 'object' || Array.isArray(value.eventHistory)
    || value.watchlist === null || typeof value.watchlist !== 'object' || Array.isArray(value.watchlist)
    || value.claimAssessments === null || typeof value.claimAssessments !== 'object' || Array.isArray(value.claimAssessments)
    || value.attempts === null || typeof value.attempts !== 'object' || Array.isArray(value.attempts)) {
    throw new TypeError('frontier repro store has an unsupported format')
  }
  return { ...value, sourceHealth: value.sourceHealth ?? {} }
}

function validDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined
}

/** Recompute time-sensitive source health alerts without mutating persisted observations. */
export function sourceHealthView(health, now = Date.now()) {
  if (health === undefined) return undefined
  const alerts = (health.alerts ?? []).filter(alert => alert.code !== 'stale_content')
  const newest = validDate(health.newestItemAt)
  const staleAfterDays = Number.isInteger(health.staleAfterDays) ? health.staleAfterDays : 45
  const stale = newest !== undefined && now - Date.parse(newest) > staleAfterDays * 86_400_000
  if (stale) alerts.push({ code: 'stale_content', message: `Newest accepted item is older than ${staleAfterDays} days.` })
  return { ...health, stale, alerts }
}

/** Advance one source's operational health from a bounded collection observation. */
export function updateSourceHealth(previous = {}, source, observedAt) {
  const ok = source.ok === true
  const observed = validDate(observedAt) ?? new Date().toISOString()
  const previousCount = Number.isInteger(previous.lastCount) ? previous.lastCount : undefined
  const currentCount = ok && Number.isInteger(source.count) ? source.count : previousCount
  const structureChanged = ok && typeof previous.structureFingerprint === 'string'
    && typeof source.structureFingerprint === 'string'
    && previous.structureFingerprint !== source.structureFingerprint
  const alerts = []
  if (ok && previousCount !== undefined && previousCount >= 4 && currentCount <= previousCount / 2) {
    alerts.push({ code: 'volume_drop', message: `Accepted item count fell from ${previousCount} to ${currentCount}.` })
  }
  if (structureChanged) alerts.push({ code: 'structure_changed', message: 'Source structure fingerprint changed since the previous successful collection.' })
  const consecutiveFailures = ok ? 0 : (Number.isInteger(previous.consecutiveFailures) ? previous.consecutiveFailures : 0) + 1
  if (consecutiveFailures >= 2) alerts.push({ code: 'consecutive_failures', message: `Source failed ${consecutiveFailures} consecutive collections.` })
  const next = {
    sourceId: source.id,
    lastAttemptAt: observed,
    ...(ok ? { lastSuccessAt: observed } : previous.lastSuccessAt === undefined ? {} : { lastSuccessAt: previous.lastSuccessAt }),
    consecutiveFailures,
    ...(ok || source.error === undefined ? {} : { lastError: source.error }),
    ...(currentCount === undefined ? {} : { lastCount: currentCount }),
    ...(ok && previousCount !== undefined && currentCount !== undefined ? { countDelta: currentCount - previousCount } : {}),
    ...(ok && Number.isInteger(source.rawCount)
      ? { lastRawCount: source.rawCount }
      : previous.lastRawCount === undefined ? {} : { lastRawCount: previous.lastRawCount }),
    ...(ok && Number.isInteger(source.rejectedCount)
      ? { lastRejectedCount: source.rejectedCount }
      : previous.lastRejectedCount === undefined ? {} : { lastRejectedCount: previous.lastRejectedCount }),
    ...(validDate(source.newestItemAt) === undefined && previous.newestItemAt === undefined
      ? {}
      : { newestItemAt: validDate(source.newestItemAt) ?? previous.newestItemAt }),
    ...(typeof source.structureFingerprint === 'string'
      ? { structureFingerprint: source.structureFingerprint }
      : previous.structureFingerprint === undefined ? {} : { structureFingerprint: previous.structureFingerprint }),
    structureChanged,
    staleAfterDays: Number.isInteger(source.healthStaleAfterDays) ? source.healthStaleAfterDays : (previous.staleAfterDays ?? 45),
    alerts,
  }
  return sourceHealthView(next, Date.parse(observed))
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
      ...(previous.contentDigest === undefined || previous.contentDigest === record.contentDigest
        ? {}
        : { supersedesDigest: previous.contentDigest }),
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

function updateEventData(data) {
  const reconciled = reconcileEvidenceBundles(data.records, data.events, data.eventHistory)
  data.events = reconciled.events
  data.eventHistory = reconciled.eventHistory
  return data
}

function restoreEventData(data) {
  const rebuilt = buildEvidenceBundles(data.records)
  const events = {}
  for (const [id, event] of Object.entries(rebuilt)) {
    const candidates = [data.events[id], ...(data.eventHistory[id] ?? []).toReversed()].filter(Boolean)
    const match = candidates.find(candidate => candidate.substantiveDigest === event.substantiveDigest)
    events[id] = match === undefined ? event : {
      ...event,
      ...match,
      recordIds: event.recordIds,
      recordDigests: event.recordDigests,
    }
    const history = data.eventHistory[id] ?? []
    if (data.events[id]?.substantiveDigest !== event.substantiveDigest
      && history.at(-1)?.substantiveDigest === event.substantiveDigest) {
      data.eventHistory[id] = history.slice(0, -1)
    }
  }
  data.events = events
  return data
}

function boundedSourceResult(source) {
  return {
    id: String(source.id ?? '').slice(0, 100),
    ok: source.ok === true,
    count: Number.isInteger(source.count) ? source.count : 0,
    rawCount: Number.isInteger(source.rawCount) ? source.rawCount : 0,
    rejectedCount: Number.isInteger(source.rejectedCount) ? source.rejectedCount : 0,
    rejectedReasons: source.rejectedReasons !== null && typeof source.rejectedReasons === 'object' && !Array.isArray(source.rejectedReasons)
      ? Object.fromEntries(Object.entries(source.rejectedReasons).slice(0, 20).map(([key, value]) => [String(key).slice(0, 100), Number(value) || 0]))
      : {},
    warnings: Array.isArray(source.warnings) ? source.warnings.slice(0, 20).map(item => String(item).slice(0, 500)) : [],
    ...(validDate(source.newestItemAt) === undefined ? {} : { newestItemAt: source.newestItemAt }),
    ...(typeof source.structureFingerprint !== 'string' ? {} : { structureFingerprint: source.structureFingerprint.slice(0, 128) }),
    ...(Number.isInteger(source.healthStaleAfterDays) ? { healthStaleAfterDays: source.healthStaleAfterDays } : {}),
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
    appliedDigests: metadata.appliedDigests ?? {},
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
      return updateEventData(mergeRecordData(data, incoming, this.maxRecords).data)
    })
  }

  async commitCollection(incoming, metadata) {
    return this.enqueue((data) => {
      if (typeof metadata?.id !== 'string' || metadata.id === '') throw new TypeError('collection metadata requires an id')
      if (data.collections.some(entry => entry.id === metadata.id)) throw new TypeError(`duplicate collection id: ${metadata.id}`)
      const merged = mergeRecordData(data, incoming, this.maxRecords)
      const incomingIds = new Set(incoming.map(record => record.id))
      const appliedDigests = Object.fromEntries(merged.data.records
        .filter(record => incomingIds.has(record.id))
        .map(record => [record.id, record.contentDigest ?? canonicalDigest(record)]))
      const entry = collectionEntry({ ...metadata, recordIds: [...incomingIds], appliedDigests }, merged.inverse)
      const observedAt = metadata.finishedAt ?? metadata.startedAt ?? metadata.requestedAt
      for (const source of entry.sources) {
        merged.data.sourceHealth[source.id] = updateSourceHealth(merged.data.sourceHealth[source.id], source, observedAt)
      }
      merged.data.collections = [...data.collections, entry].slice(-this.maxCollections)
      return updateEventData(merged.data)
    })
  }

  async revertLatestCollection(collectionId) {
    return this.enqueue((data) => {
      const index = data.collections.findLastIndex(entry => entry.state === 'committed')
      if (index < 0) {
        const error = new Error('no committed collection is available to revert')
        error.code = 'no_revertible_collection'
        throw error
      }
      const entry = data.collections[index]
      if (entry.id !== collectionId) {
        const error = new Error(`collection ${collectionId} is not the latest live commit`)
        error.code = 'collection_not_latest'
        error.details = { latestCollectionId: entry.id }
        throw error
      }
      const affectedRecordIds = new Set(entry.recordIds ?? entry.inverse.addedIds)
      const dependentIds = [...affectedRecordIds].filter(id => data.assessments[id] !== undefined
        || (Array.isArray(data.runs[id]) && data.runs[id].length > 0)
        || (Array.isArray(data.claimAssessments[id]) && data.claimAssessments[id].length > 0)
        || (Array.isArray(data.attempts[id]) && data.attempts[id].length > 0))
      const dependentEventIds = Object.values(data.events).filter(event => event.recordIds.some(id => affectedRecordIds.has(id))
        && (data.watchlist[event.id] !== undefined
          || (Array.isArray(data.claimAssessments[event.id]) && data.claimAssessments[event.id].length > 0)
          || (Array.isArray(data.attempts[event.id]) && data.attempts[event.id].length > 0)))
        .map(event => event.id)
      if (dependentIds.length > 0 || dependentEventIds.length > 0) {
        const error = new Error('collection has watch, assessment, run, or attempt dependents')
        error.code = 'collection_has_dependents'
        error.details = { recordIds: dependentIds, eventIds: dependentEventIds }
        throw error
      }
      const currentById = new Map(data.records.map(record => [record.id, record]))
      const conflicts = Object.entries(entry.appliedDigests ?? {}).filter(([id, digest]) => {
        const current = currentById.get(id)
        return current !== undefined && (current.contentDigest ?? canonicalDigest(current)) !== digest
      }).map(([id]) => id)
      if (conflicts.length > 0) {
        const error = new Error('collection records changed after the commit')
        error.code = 'collection_revert_conflict'
        error.details = { recordIds: conflicts }
        throw error
      }
      for (const id of entry.inverse.addedIds) currentById.delete(id)
      for (const record of [...entry.inverse.previousRecords, ...entry.inverse.evictedRecords]) {
        currentById.set(record.id, record)
      }
      data.records = [...currentById.values()].sort((left, right) =>
        (right.publishedAt ?? right.updatedAt ?? '').localeCompare(left.publishedAt ?? left.updatedAt ?? ''))
        .slice(0, this.maxRecords)
      for (const id of entry.inverse.addedIds) {
        delete data.assessments[id]
        delete data.runs[id]
      }
      Object.assign(data.assessments, entry.inverse.evictedAssessments)
      Object.assign(data.runs, entry.inverse.evictedRuns)
      const revertedAt = new Date().toISOString()
      const reversion = {
        revertedAt,
        digest: canonicalDigest({ collectionId: entry.id, commitDigest: entry.digest, revertedAt }),
      }
      data.collections[index] = { ...entry, state: 'reverted', reversion }
      return restoreEventData(data)
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

  async saveWatch(eventId, action, note = '') {
    return this.enqueue((data) => {
      const event = data.events[eventId]
      if (event === undefined) throw new TypeError(`unknown event id: ${eventId}`)
      if (action === 'remove') {
        delete data.watchlist[eventId]
        return data
      }
      const now = new Date().toISOString()
      const previous = data.watchlist[eventId]
      if (action === 'add') {
        data.watchlist[eventId] = {
          eventId,
          baselineDigest: event.substantiveDigest,
          createdAt: previous?.createdAt ?? now,
          acknowledgedAt: now,
          note: String(note ?? '').trim().slice(0, 2_000),
          onlySubstantive: true,
        }
        return data
      }
      if (action === 'acknowledge' && previous !== undefined) {
        data.watchlist[eventId] = { ...previous, baselineDigest: event.substantiveDigest, acknowledgedAt: now }
        return data
      }
      throw new TypeError(action === 'acknowledge' ? `event ${eventId} is not watchlisted` : `unsupported watch action: ${action}`)
    })
  }

  async appendClaimAssessment(targetId, assessment) {
    return this.enqueue((data) => {
      const current = Array.isArray(data.claimAssessments[targetId]) ? data.claimAssessments[targetId] : []
      data.claimAssessments[targetId] = [...current, assessment].slice(-20)
      return data
    })
  }

  async appendAttempt(targetId, attempt) {
    return this.enqueue((data) => {
      const current = Array.isArray(data.attempts[targetId]) ? data.attempts[targetId] : []
      const attemptNumber = (Number.isInteger(current.at(-1)?.attemptNumber) ? current.at(-1).attemptNumber : current.length) + 1
      data.attempts[targetId] = [...current, { ...attempt, attemptNumber }].slice(-50)
      return data
    })
  }
}
