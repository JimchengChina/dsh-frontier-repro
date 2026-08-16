import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const EMPTY = Object.freeze({ version: 1, updatedAt: undefined, records: [], assessments: {}, runs: {} })

function cloneEmpty() {
  return { version: EMPTY.version, records: [], assessments: {}, runs: {} }
}

function validateData(value) {
  if (value === null || typeof value !== 'object' || value.version !== 1
    || !Array.isArray(value.records) || value.assessments === null || typeof value.assessments !== 'object'
    || value.runs === null || typeof value.runs !== 'object') {
    throw new TypeError('frontier repro store has an unsupported format')
  }
  return value
}

/** JSON-backed corpus with in-process serialization and atomic replacement. */
export class FrontierStore {
  constructor(filename, maxRecords = 1_000) {
    this.filename = filename
    this.maxRecords = maxRecords
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
      const byId = new Map(data.records.map(record => [record.id, record]))
      for (const record of incoming) {
        const previous = byId.get(record.id)
        byId.set(record.id, previous === undefined ? record : {
          ...previous,
          ...record,
          firstSeenAt: previous.firstSeenAt,
          artifacts: [...new Map([...previous.artifacts, ...record.artifacts].map(item => [item.url, item])).values()],
        })
      }
      data.records = [...byId.values()].sort((left, right) =>
        (right.publishedAt ?? right.updatedAt ?? '').localeCompare(left.publishedAt ?? left.updatedAt ?? ''))
        .slice(0, this.maxRecords)
      const liveIds = new Set(data.records.map(record => record.id))
      data.assessments = Object.fromEntries(Object.entries(data.assessments).filter(([id]) => liveIds.has(id)))
      data.runs = Object.fromEntries(Object.entries(data.runs).filter(([id]) => liveIds.has(id)))
      return data
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
