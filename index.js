import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { mergeSources } from './lib/catalog.js'
import { collectAll, filterRecords } from './lib/collector.js'
import { rankRecords } from './lib/rank.js'
import { assessClaims, assessReproduction, recordAttempt, recordRun } from './lib/repro.js'
import { FrontierStore, sourceHealthView } from './lib/store.js'
import { CollectionCoordinator } from './lib/lifecycle.js'
import { sourceCatalogDigest } from './lib/canonical.js'
import { buildEvidenceGraph } from './lib/graph.js'
import { createReproductionManifest } from './lib/manifest.js'
import { createTrackioScaffold } from './lib/trackio.js'

export const name = 'frontier-repro'
export const inject = ['systemPrompt', 'tools']

export const Config = z.object({
  dshHome: z.string(),
  storagePath: z.string(),
  sourceFile: z.string(),
  xBearerTokenEnv: z.string().role('credential-ref').default('X_BEARER_TOKEN'),
  githubTokenEnv: z.string().role('credential-ref').default('GITHUB_TOKEN'),
  defaultDays: z.natural().min(1).default(90),
  defaultLimit: z.natural().min(1).default(20),
  maxRecords: z.natural().min(1).default(1_000),
  maxCollections: z.natural().min(1).default(20),
  requestTimeoutMs: z.natural().min(1).default(20_000),
  maxResponseBytes: z.natural().min(1).default(5 * 1024 * 1024),
  pageConcurrency: z.natural().min(1).default(3),
  githubEnrichLimit: z.natural().default(8),
  huggingFaceEnrichLimit: z.natural().default(20),
  promptGuidance: z.boolean().default(true),
  promptOrder: z.number().default(145),
})

function jsonOutput() {
  return {
    schema: { type: 'json' },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }
}

function readCustomSources(filename) {
  if (filename === undefined || filename.trim() === '') return []
  const parsed = JSON.parse(readFileSync(resolve(filename), 'utf8'))
  if (!Array.isArray(parsed)) throw new TypeError('sourceFile must contain a JSON array')
  return parsed
}

function resolveStoragePath(config) {
  if (config.storagePath !== undefined && config.storagePath.trim() !== '') return resolve(config.storagePath)
  return join(resolveDshHome(config.dshHome), 'frontier-repro', 'index.json')
}

async function credentialValue(ctx, refName) {
  const ref = credentialRef(refName)
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) return (await credentials.resolve(ref))?.value
  const value = process.env[ref]
  return typeof value === 'string' && value !== '' ? value : undefined
}

async function credentialStatus(ctx, refName) {
  const ref = credentialRef(refName)
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    const description = await credentials.describe(ref)
    return { configured: description.configured, source: description.source, reference: refName }
  }
  return { configured: typeof process.env[ref] === 'string' && process.env[ref] !== '', source: 'process.env', reference: refName }
}

function boundedInteger(value, fallback, min, max) {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(`value must be an integer from ${min} to ${max}`)
  }
  return value
}

function compact(record) {
  return {
    id: record.id,
    title: record.title,
    lab: record.lab,
    source_id: record.sourceId,
    source_class: record.sourceClass,
    url: record.url,
    ...(record.publishedAt === undefined ? {} : { published_at: record.publishedAt }),
    summary: record.summary.slice(0, 700),
    artifacts: record.artifacts,
    score: record.score,
  }
}

function requireRecord(data, id) {
  const record = data.records.find(candidate => candidate.id === id)
  if (record === undefined) return { ok: false, code: 'record_not_found', message: `No frontier record has id "${id}".` }
  return { ok: true, record }
}

function requireTarget(data, id, targetType) {
  if (targetType !== 'record' && data.events[id] !== undefined) return { ok: true, type: 'event', value: data.events[id] }
  const record = data.records.find(candidate => candidate.id === id)
  if (record !== undefined && targetType !== 'event') return { ok: true, type: 'record', value: record }
  return { ok: false, code: 'target_not_found', message: `No ${targetType ?? 'event or record'} has id "${id}".` }
}

function digestTarget(target) {
  return target.type === 'event'
    ? target.value.substantiveDigest
    : target.value.contentDigest ?? canonicalDigest(target.value)
}

function materialChangeCount(event) {
  const sections = [event.changes?.capabilities, event.changes?.evaluations, event.changes?.licenses,
    ...Object.values(event.changes?.evidence ?? {})]
  return sections.reduce((count, section) => count + (section?.added?.length ?? 0) + (section?.removed?.length ?? 0), 0)
}

function eventPriority(event) {
  const filledSlots = Object.values(event.evidence).filter(items => items.length > 0).length
  const immutable = Object.values(event.evidence).flat().filter(item => item.immutable).length
  const level = { exact_candidate: 20, scaled_candidate: 12, behavioral_candidate: 6, blocked: 0 }[event.reproductionLevel] ?? 0
  return level + filledSlots * 3 + Math.min(12, immutable * 2) + event.corroboration.sourceCount * 3
}

function compactEvent(event, watch, historyLength = 0) {
  return {
    id: event.id,
    title: event.title,
    lab: event.lab,
    ...(event.entity === undefined ? {} : { entity: event.entity }),
    version: event.version,
    substantive_digest: event.substantiveDigest,
    ...(event.supersedesDigest === undefined ? {} : { supersedes_digest: event.supersedesDigest }),
    first_seen_at: event.firstSeenAt,
    last_seen_at: event.lastSeenAt,
    reproduction_level: event.reproductionLevel,
    priority_score: eventPriority(event),
    corroboration: event.corroboration,
    missing: event.missing,
    record_count: event.recordIds.length,
    history_versions: historyLength,
    material_change_count: materialChangeCount(event),
    watchlisted: watch !== undefined,
    changed_since_watch: watch !== undefined && watch.baselineDigest !== event.substantiveDigest,
  }
}

export function apply(ctx, inputConfig = {}) {
  const config = {
    ...inputConfig,
    xBearerTokenEnv: inputConfig.xBearerTokenEnv ?? 'X_BEARER_TOKEN',
    githubTokenEnv: inputConfig.githubTokenEnv ?? 'GITHUB_TOKEN',
    defaultDays: inputConfig.defaultDays ?? 90,
    defaultLimit: inputConfig.defaultLimit ?? 20,
    maxRecords: inputConfig.maxRecords ?? 1_000,
    maxCollections: inputConfig.maxCollections ?? 20,
    requestTimeoutMs: inputConfig.requestTimeoutMs ?? 20_000,
    maxResponseBytes: inputConfig.maxResponseBytes ?? 5 * 1024 * 1024,
    pageConcurrency: inputConfig.pageConcurrency ?? 3,
    githubEnrichLimit: inputConfig.githubEnrichLimit ?? 8,
    huggingFaceEnrichLimit: inputConfig.huggingFaceEnrichLimit ?? 20,
    promptGuidance: inputConfig.promptGuidance ?? true,
    promptOrder: inputConfig.promptOrder ?? 145,
  }
  const sources = mergeSources(readCustomSources(config.sourceFile))
  const catalogDigest = sourceCatalogDigest(sources)
  const sourceById = new Map(sources.map(source => [source.id, source]))
  const store = new FrontierStore(resolveStoragePath(config), config.maxRecords, config.maxCollections)
  const collectionCoordinator = new CollectionCoordinator()

  if (config.promptGuidance) {
    ctx.systemPrompt.section({
      name: 'tool:frontier-repro',
      order: config.promptOrder,
      text:
        'Use frontier_repro_collect for new frontier-AI signals from curated primary sources, and frontier_repro_search for the saved corpus. '
        + 'This plugin is not a general news or paper-summary tool: inspect a record and its primary artifacts before drawing conclusions. '
        + 'Use frontier_repro_events and frontier_repro_bundle to work with cross-source release evidence, and frontier_repro_watch to report only substantive changes. '
        + 'For reproduction work, define one observable target, gather evidence for every requirement, then call frontier_repro_assess. '
        + 'A ready_exact, ready_scaled, or ready_behavioral result means prerequisites are documented; it does not mean the feature was reproduced. '
        + 'Use normal filesystem, shell, web, and evaluation tools to implement in an isolated workspace. Pin artifact versions, begin with the smallest baseline, '
        + 'and do not upgrade scaled or behavioral equivalence to an exact-reproduction claim. Record executed commands, artifact paths, metrics, deviations, '
        + 'and the honest verdict with frontier_repro_record_result. Never mark a run passed without measurable evaluation evidence. '
        + 'For new work, prefer claim-level frontier_repro_assess_claims and frontier_repro_record_attempt; preserve failures and require a verifier. Toy outcomes remain toy_only. '
        + 'Use frontier_repro_graph to inspect missing dependencies and frontier_repro_manifest to hand a frozen plan to an execution system. '
        + 'When X sources are unavailable, report the missing X_BEARER_TOKEN/API access condition instead of scraping X pages.',
    })
  }

  ctx.tools.register(defineTool({
    name: 'frontier_repro_status',
    description: 'List the curated first-party frontier AI sources, local corpus state, and exact credential blockers. Does not fetch the network.',
    parameters: {},
    output: jsonOutput(),
    async execute() {
      const data = await store.read()
      const x = await credentialStatus(ctx, config.xBearerTokenEnv)
      const github = await credentialStatus(ctx, config.githubTokenEnv)
      const capabilities = {
        'network:https': {
          available: true,
          authority: 'host egress policy',
          note: 'Actual reachability is checked per request and failures remain source-local.',
        },
        'credential:x-api': {
          available: x.configured,
          reference: x.reference,
          source: x.source,
          ...(x.configured ? {} : { missingCondition: `Configure ${config.xBearerTokenEnv} with X API read access.` }),
        },
      }
      return {
        ok: true,
        storage_path: store.filename,
        corpus_records: data.records.length,
        evidence_bundles: Object.keys(data.events).length,
        watchlisted_bundles: Object.keys(data.watchlist).length,
        preserved_attempts: Object.values(data.attempts).reduce((sum, attempts) => sum + attempts.length, 0),
        collection_history: data.collections.length,
        ...(data.collections.at(-1) === undefined ? {} : { latest_collection: {
          id: data.collections.at(-1).id,
          state: data.collections.at(-1).state,
          digest: data.collections.at(-1).digest,
          finished_at: data.collections.at(-1).finishedAt,
        } }),
        ...(data.updatedAt === undefined ? {} : { updated_at: data.updatedAt }),
        source_health_alerts: Object.values(data.sourceHealth)
          .map(health => sourceHealthView(health).alerts.length)
          .reduce((sum, count) => sum + count, 0),
        source_catalog_digest: catalogDigest,
        collection: collectionCoordinator.snapshot(),
        credentials: {
          x_api: x,
          github_api: {
            ...github,
            required: false,
            effect: github.configured ? 'Authenticated GitHub artifact enrichment.' : 'Anonymous GitHub rate limits apply; collection still works.',
          },
        },
        capabilities,
        sources: sources.map(source => ({
          id: source.id,
          name: source.name,
          lab: source.lab,
          type: source.type,
          source_class: source.sourceClass,
          url: source.url,
          requires: source.requires,
          available: source.requires.every(capability => capabilities[capability]?.available === true),
          blockers: source.requires.filter(capability => capabilities[capability]?.available !== true).map(capability => ({
            capability,
            condition: capabilities[capability]?.missingCondition ?? `Provide capability ${capability}.`,
          })),
          ...(data.sourceHealth[source.id] === undefined ? {} : { health: sourceHealthView(data.sourceHealth[source.id]) }),
          ...(source.identityEvidenceUrl === undefined ? {} : { identity_evidence_url: source.identityEvidenceUrl }),
          ...(source.verifiedAt === undefined ? {} : { identity_verified_at: source.verifiedAt }),
        })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'frontier_repro_collect',
    description: 'Refresh selected curated primary sources, persist normalized records, and return explainably ranked frontier AI signals. One failed source does not discard successful sources.',
    parameters: {
      query: { type: 'string', description: 'Technical capability or topic. Also narrows the arXiv query.' },
      source_ids: { type: 'array', items: { type: 'string' }, description: 'Curated source ids from frontier_repro_status. Omit for all sources.' },
      days: { type: 'integer', description: 'Only return records this many days old; 1-3650.' },
      limit: { type: 'integer', description: 'Maximum returned records; 1-100.' },
    },
    output: jsonOutput(),
    async execute(args) {
      const requested = Array.isArray(args.source_ids) && args.source_ids.length > 0 ? args.source_ids : sources.map(source => source.id)
      const unknown = requested.filter(id => !sourceById.has(id))
      if (unknown.length > 0) return { ok: false, code: 'unknown_source', unknown_source_ids: unknown }
      const selected = [...new Set(requested)].map(id => sourceById.get(id))
      const query = args.query ?? ''
      const collectionInput = { query, sourceIds: selected.map(source => source.id), catalogDigest }
      return collectionCoordinator.run(collectionInput, async (transition) => {
        const xBearerToken = selected.some(source => source.type === 'x_user')
          ? await credentialValue(ctx, config.xBearerTokenEnv)
          : undefined
        const githubToken = config.githubEnrichLimit > 0 || selected.some(source => source.type === 'github_org')
          ? await credentialValue(ctx, config.githubTokenEnv)
          : undefined
        const collected = await collectAll(selected, {
          query,
          xBearerToken,
          xBearerTokenEnv: config.xBearerTokenEnv,
          timeoutMs: config.requestTimeoutMs,
          maxBytes: config.maxResponseBytes,
          pageConcurrency: config.pageConcurrency,
          githubEnrichLimit: config.githubEnrichLimit,
          huggingFaceEnrichLimit: config.huggingFaceEnrichLimit,
          githubToken,
          userAgent: 'dsh-frontier-repro/0.3.0 (+https://github.com/JimchengChina/dsh-frontier-repro)',
        })
        const partial = collected.sources.some(source => !source.ok || source.warnings.length > 0)
          || Object.values(collected.enrichments).some(report => report.warnings.length > 0)
        const committed = await store.commitCollection(collected.records, {
          ...transition,
          finishedAt: new Date().toISOString(),
          input: collectionInput,
          partial,
          sources: collected.sources,
          enrichments: collected.enrichments,
        })
        const days = boundedInteger(args.days, config.defaultDays, 1, 3_650)
        const limit = boundedInteger(args.limit, config.defaultLimit, 1, 100)
        const filtered = filterRecords(collected.records, { query, days })
        const ranked = rankRecords(filtered, query).slice(0, limit)
        const incomingIds = new Set(collected.records.map(record => record.id))
        const affectedEvents = Object.values(committed.events)
          .filter(event => event.recordIds.some(id => incomingIds.has(id)))
          .sort((left, right) => eventPriority(right) - eventPriority(left)
            || (right.lastSeenAt ?? '').localeCompare(left.lastSeenAt ?? ''))
          .map(event => compactEvent(event, committed.watchlist[event.id], committed.eventHistory[event.id]?.length ?? 0))
        return {
          ok: true,
          partial,
          collected: collected.records.length,
          returned: ranked.length,
          ranking: 'source provenance + recency + linked artifacts + reproducibility signals + topic relevance',
          records: ranked.map(compact),
          evidence_bundle_total: affectedEvents.length,
          evidence_bundles: affectedEvents.slice(0, limit),
          sources: collected.sources,
          enrichments: collected.enrichments,
        }
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'frontier_repro_events',
    description: 'List cross-source frontier release evidence bundles. Watch filters compare only capability, evaluation, license, and immutable-artifact changes.',
    parameters: {
      query: { type: 'string', description: 'Match event title, entity, lab, or capability claim.' },
      labs: { type: 'array', items: { type: 'string' } },
      watchlisted_only: { type: 'boolean' },
      changed_only: { type: 'boolean', description: 'Return only watchlisted events whose substantive digest changed since acknowledgement.' },
      limit: { type: 'integer', description: 'Maximum returned bundles; 1-100.' },
    },
    output: jsonOutput(),
    async execute(args) {
      const data = await store.read()
      const tokens = String(args.query ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(token => token.length >= 2)
      const labs = new Set((args.labs ?? []).map(lab => lab.toLowerCase()))
      const events = Object.values(data.events).filter(event => {
        const watch = data.watchlist[event.id]
        if ((args.watchlisted_only === true || args.changed_only === true) && watch === undefined) return false
        if (args.changed_only === true && watch.baselineDigest === event.substantiveDigest) return false
        if (labs.size > 0 && !labs.has(event.lab.toLowerCase())) return false
        if (tokens.length > 0) {
          const text = `${event.title} ${event.entity ?? ''} ${event.lab} ${event.capabilities.join(' ')}`.toLowerCase()
          if (!tokens.some(token => text.includes(token))) return false
        }
        return true
      }).sort((left, right) => eventPriority(right) - eventPriority(left)
        || (right.lastSeenAt ?? '').localeCompare(left.lastSeenAt ?? ''))
      const limit = boundedInteger(args.limit, config.defaultLimit, 1, 100)
      return {
        ok: true,
        total: events.length,
        returned: Math.min(limit, events.length),
        events: events.slice(0, limit).map(event => compactEvent(
          event,
          data.watchlist[event.id],
          data.eventHistory[event.id]?.length ?? 0,
        )),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'frontier_repro_bundle',
    description: 'Get one versioned release evidence bundle, its predecessor chain, source records, watch state, claim assessments, and every preserved attempt.',
    parameters: { event_id: { type: 'string', required: true } },
    output: jsonOutput(),
    async execute(args) {
      const data = await store.read()
      const event = data.events[args.event_id]
      if (event === undefined) return { ok: false, code: 'event_not_found', message: `No evidence bundle has id "${args.event_id}".` }
      const ids = new Set(event.recordIds)
      return {
        ok: true,
        bundle: event,
        history: data.eventHistory[event.id] ?? [],
        records: data.records.filter(record => ids.has(record.id)),
        ...(data.watchlist[event.id] === undefined ? {} : { watch: data.watchlist[event.id] }),
        claim_assessments: data.claimAssessments[event.id] ?? [],
        attempts: data.attempts[event.id] ?? [],
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'frontier_repro_watch',
    description: 'Add, remove, acknowledge, or list a release watch. Acknowledgement advances the substantive-digest baseline without deleting history.',
    parameters: {
      action: { type: 'string', required: true, enum: ['list', 'add', 'remove', 'acknowledge'] },
      event_id: { type: 'string', description: 'Required except for list.' },
      note: { type: 'string' },
    },
    output: jsonOutput(),
    async execute(args) {
      if (args.action === 'list') {
        const data = await store.read()
        return { ok: true, watches: Object.values(data.watchlist).map(watch => ({
          ...watch,
          event: data.events[watch.eventId] === undefined ? undefined : compactEvent(data.events[watch.eventId], watch, data.eventHistory[watch.eventId]?.length ?? 0),
        })) }
      }
      if (typeof args.event_id !== 'string' || args.event_id.trim() === '') {
        return { ok: false, code: 'event_id_required', message: `event_id is required for ${args.action}.` }
      }
      try {
        const data = await store.saveWatch(args.event_id, args.action, args.note)
        return { ok: true, action: args.action, ...(data.watchlist[args.event_id] === undefined ? {} : { watch: data.watchlist[args.event_id] }), event: compactEvent(
          data.events[args.event_id],
          data.watchlist[args.event_id],
          data.eventHistory[args.event_id]?.length ?? 0,
        ) }
      } catch (error) {
        return { ok: false, code: 'invalid_watch_action', message: error.message }
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'frontier_repro_search',
    description: 'Search and rank the saved frontier corpus without network access.',
    parameters: {
      query: { type: 'string', description: 'At least one query token must occur; the score rewards broader matches.' },
      source_ids: { type: 'array', items: { type: 'string' } },
      labs: { type: 'array', items: { type: 'string' } },
      days: { type: 'integer', description: 'Age window from 1 to 3650 days.' },
      limit: { type: 'integer', description: 'Maximum returned records; 1-100.' },
    },
    output: jsonOutput(),
    async execute(args) {
      const data = await store.read()
      const days = boundedInteger(args.days, config.defaultDays, 1, 3_650)
      const limit = boundedInteger(args.limit, config.defaultLimit, 1, 100)
      const filtered = filterRecords(data.records, {
        query: args.query ?? '',
        sourceIds: args.source_ids ?? [],
        labs: args.labs ?? [],
        days,
      })
      const ranked = rankRecords(filtered, args.query ?? '').slice(0, limit)
      return { ok: true, total: filtered.length, returned: ranked.length, records: ranked.map(compact) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'frontier_repro_revert_collection',
    description: 'Revert the latest live collection batch using its stored inverse. Refuses non-LIFO reverts, changed records, or batches with assessment/run dependents.',
    parameters: {
      collection_id: { type: 'string', required: true, description: 'Exact collection id returned by collect or status.' },
    },
    output: jsonOutput(),
    async execute(args) {
      if (typeof args.collection_id !== 'string' || args.collection_id.trim() === '') {
        return { ok: false, code: 'invalid_collection_id', message: 'collection_id must be a non-empty string' }
      }
      try {
        return await collectionCoordinator.run({ operation: 'revert', collectionId: args.collection_id }, async () => {
          const data = await store.revertLatestCollection(args.collection_id)
          const entry = data.collections.find(item => item.id === args.collection_id)
          return {
            ok: true,
            reverted: { id: entry.id, state: entry.state, commit_digest: entry.digest, reversion: entry.reversion },
            corpus_records: data.records.length,
          }
        })
      } catch (error) {
        return {
          ok: false,
          code: error.code ?? 'collection_revert_failed',
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
          lifecycle: collectionCoordinator.snapshot().last,
        }
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'frontier_repro_get',
    description: 'Get one complete frontier record with provenance, discovered artifacts, saved readiness assessment, and recorded runs.',
    parameters: {
      id: { type: 'string', required: true, description: 'Stable id returned by collect or search.' },
    },
    output: jsonOutput(),
    async execute(args) {
      const data = await store.read()
      const found = requireRecord(data, args.id)
      if (!found.ok) return found
      return {
        ok: true,
        record: found.record,
        ...(data.assessments[args.id] === undefined ? {} : { assessment: data.assessments[args.id] }),
        runs: data.runs[args.id] ?? [],
        evidence_bundles: Object.values(data.events).filter(event => event.recordIds.includes(args.id))
          .map(event => compactEvent(event, data.watchlist[event.id], data.eventHistory[event.id]?.length ?? 0)),
        claim_assessments: data.claimAssessments[args.id] ?? [],
        attempts: data.attempts[args.id] ?? [],
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'frontier_repro_assess',
    description: 'Gate an exact, scaled, or behavioral reproduction on a declared evidence matrix. Returns blockers and executable next actions; readiness is not a reproduction result.',
    parameters: {
      id: { type: 'string', required: true, description: 'Frontier record id.' },
      target: { type: 'string', required: true, description: 'One observable capability to reproduce and how success will be measured.' },
      mode: { type: 'string', required: true, enum: ['exact', 'scaled', 'behavioral'] },
      requirements: {
        type: 'json',
        required: true,
        description: 'Object keyed by specification, code, model_access, data, compute, runtime, license, evaluation, reference_access, safety_and_scope. Each value: {state: available|missing|unknown|not_required, evidence: string[], note: string}.',
      },
      environment: { type: 'json', description: 'Available GPUs/CPU/RAM/storage, OS, budget, accounts, and time window.' },
      rubric: {
        type: 'json',
        required: true,
        description: 'Array of 1-50 criteria: {id, description, metric, operator: gte|lte|equal|within, expected, tolerance?, weight?, required?}.',
      },
    },
    output: jsonOutput(),
    async execute(args) {
      const data = await store.read()
      const found = requireRecord(data, args.id)
      if (!found.ok) return found
      try {
        const assessment = assessReproduction({
          recordId: args.id,
          target: args.target,
          mode: args.mode,
          requirements: args.requirements,
          environment: args.environment ?? {},
          rubric: args.rubric,
        })
        await store.saveAssessment(args.id, assessment)
        return { ok: true, record: { id: found.record.id, title: found.record.title, url: found.record.url }, assessment }
      } catch (error) {
        return { ok: false, code: 'invalid_assessment', message: error.message }
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'frontier_repro_assess_claims',
    description: 'Create a claim-level reproduction gate for an event or record. Supports executing existing work, partial reimplementation, or from-scratch replication at exact, scaled, or toy equivalence.',
    parameters: {
      id: { type: 'string', required: true, description: 'Evidence bundle id or frontier record id.' },
      target_type: { type: 'string', enum: ['event', 'record'], description: 'Optional disambiguation.' },
      target: { type: 'string', required: true, description: 'Observable feature or result being reproduced.' },
      mode: { type: 'string', required: true, enum: ['execute_existing', 'partial_reimplementation', 'from_scratch_replication'] },
      equivalence: { type: 'string', required: true, enum: ['exact', 'scaled', 'toy'] },
      claims: {
        type: 'json',
        required: true,
        description: 'Array of 1-50 independently testable claims: {id, statement, observable?, metric, operator, expected, tolerance?, weight?, required?, evidence:string[]}.',
      },
      requirements: {
        type: 'json',
        required: true,
        description: 'Evidence matrix using the same requirement keys and states as frontier_repro_assess.',
      },
      environment: { type: 'json', description: 'Planned hardware, runtime, budget, access, and time constraints.' },
    },
    output: jsonOutput(),
    async execute(args) {
      const data = await store.read()
      const target = requireTarget(data, args.id, args.target_type)
      if (!target.ok) return target
      try {
        const assessment = assessClaims({
          targetId: args.id,
          targetType: target.type,
          targetDigest: digestTarget(target),
          targetVersion: target.type === 'event' ? target.value.version : undefined,
          target: args.target,
          mode: args.mode,
          equivalence: args.equivalence,
          claims: args.claims,
          requirements: args.requirements,
          environment: args.environment ?? {},
        })
        await store.appendClaimAssessment(args.id, assessment)
        return { ok: true, target: { id: args.id, type: target.type, title: target.value.title }, assessment }
      } catch (error) {
        return { ok: false, code: 'invalid_claim_assessment', message: error.message }
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'frontier_repro_record_attempt',
    description: 'Append one immutable reproduction attempt, including failures and negative results. A passed exact/scaled attempt requires all claim metrics plus verifier identity and evidence; toy remains toy_only.',
    parameters: {
      id: { type: 'string', required: true, description: 'Evidence bundle id or frontier record id.' },
      target_type: { type: 'string', enum: ['event', 'record'] },
      assessment_id: { type: 'string', description: 'Saved claim assessment id; defaults to the latest.' },
      mode: { type: 'string', required: true, enum: ['execute_existing', 'partial_reimplementation', 'from_scratch_replication'] },
      equivalence: { type: 'string', required: true, enum: ['exact', 'scaled', 'toy'] },
      verdict: { type: 'string', required: true, enum: ['passed', 'partial', 'failed', 'blocked', 'negative'] },
      commands: { type: 'array', items: { type: 'string' } },
      artifacts: { type: 'array', items: { type: 'string' } },
      metrics: { type: 'json' },
      claim_results: { type: 'json', description: 'Array of {claimId, actual?, passed, evidence:string[], note?}.' },
      resources: { type: 'json', description: '{gpuModel,gpuCount,vramGb,cpuModel,cpuCount,durationSeconds,costUsd,dataScale,relativeToPaper,jobUrl}.' },
      verifier: { type: 'json', description: '{kind,identity,verdict:passed|failed|inconclusive,evidence:string[]}.' },
      deviations: { type: 'array', items: { type: 'string' } },
      notes: { type: 'string' },
    },
    output: jsonOutput(),
    async execute(args) {
      const data = await store.read()
      const target = requireTarget(data, args.id, args.target_type)
      if (!target.ok) return target
      const assessments = data.claimAssessments[args.id] ?? []
      const assessment = args.assessment_id === undefined
        ? assessments.at(-1)
        : assessments.find(candidate => candidate.id === args.assessment_id)
      if (assessment !== undefined && assessment.targetDigest !== undefined && assessment.targetDigest !== digestTarget(target)) {
        return {
          ok: false,
          code: 'assessment_stale',
          message: 'The target evidence digest changed after this assessment. Review the bundle diff and create a new claim assessment.',
          assessed_digest: assessment.targetDigest,
          current_digest: digestTarget(target),
        }
      }
      try {
        const attempt = recordAttempt({
          targetId: args.id,
          targetType: target.type,
          assessment,
          mode: args.mode,
          equivalence: args.equivalence,
          verdict: args.verdict,
          commands: args.commands,
          artifacts: args.artifacts,
          metrics: args.metrics,
          claimResults: args.claim_results,
          resources: args.resources,
          verifier: args.verifier,
          deviations: args.deviations,
          notes: args.notes,
        })
        if (!attempt.accepted) return { ok: false, code: 'insufficient_attempt_evidence', problems: attempt.problems, attempt }
        const saved = await store.appendAttempt(args.id, attempt)
        return { ok: true, attempt: saved.attempts[args.id].at(-1) }
      } catch (error) {
        return { ok: false, code: 'invalid_attempt', message: error.message }
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'frontier_repro_trackio_scaffold',
    description: 'Export a file-only Hugging Face Trackio logbook scaffold for one evidence bundle and all saved claim attempts. Does not install, execute, publish, or create a competing experiment UI.',
    parameters: { event_id: { type: 'string', required: true } },
    output: jsonOutput(),
    async execute(args) {
      const data = await store.read()
      const event = data.events[args.event_id]
      if (event === undefined) return { ok: false, code: 'event_not_found', message: `No evidence bundle has id "${args.event_id}".` }
      return {
        ok: true,
        scaffold: createTrackioScaffold({
          event,
          assessments: data.claimAssessments[event.id] ?? [],
          attempts: data.attempts[event.id] ?? [],
        }),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'frontier_repro_graph',
    description: 'Return a deterministic dependency graph joining a source, record, artifacts, requirements, evidence, runs, outputs, and visible blockers.',
    parameters: {
      id: { type: 'string', required: true, description: 'Frontier record id.' },
    },
    output: jsonOutput(),
    async execute(args) {
      const data = await store.read()
      const found = requireRecord(data, args.id)
      if (!found.ok) return found
      return {
        ok: true,
        graph: buildEvidenceGraph({
          record: found.record,
          assessment: data.assessments[args.id],
          runs: data.runs[args.id] ?? [],
        }),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'frontier_repro_record_result',
    description: 'Persist evidence from an executed reproduction. A passed verdict is rejected unless it includes commands, artifacts, and measured metrics.',
    parameters: {
      id: { type: 'string', required: true, description: 'Frontier record id.' },
      mode: { type: 'string', required: true, enum: ['exact', 'scaled', 'behavioral'] },
      verdict: { type: 'string', required: true, enum: ['passed', 'partial', 'failed', 'not_run'] },
      commands: { type: 'array', items: { type: 'string' }, description: 'Commands actually executed; redact secrets.' },
      artifacts: { type: 'array', items: { type: 'string' }, description: 'Result file paths, commit ids, logs, or immutable URLs.' },
      metrics: { type: 'json', description: 'Measured values, expected values, tolerances, and dataset/split identifiers.' },
      deviations: { type: 'array', items: { type: 'string' }, description: 'Every departure from the source setup or target mode.' },
      notes: { type: 'string' },
    },
    output: jsonOutput(),
    async execute(args) {
      const data = await store.read()
      const found = requireRecord(data, args.id)
      if (!found.ok) return found
      try {
        const assessment = data.assessments[args.id]
        if (args.verdict === 'passed' && (assessment === undefined || assessment.mode !== args.mode || !assessment.status.startsWith('ready_'))) {
          return {
            ok: false,
            code: 'assessment_not_ready',
            message: 'A passed run requires a saved ready assessment for the same reproduction mode.',
          }
        }
        const run = recordRun({
          recordId: args.id,
          mode: args.mode,
          verdict: args.verdict,
          commands: args.commands,
          artifacts: args.artifacts,
          metrics: args.metrics,
          deviations: args.deviations,
          notes: args.notes,
          rubric: assessment?.rubric,
        })
        if (!run.accepted) return { ok: false, code: 'insufficient_run_evidence', problems: run.problems, run }
        await store.appendRun(args.id, run)
        return { ok: true, run }
      } catch (error) {
        return { ok: false, code: 'invalid_run', message: error.message }
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'frontier_repro_manifest',
    description: 'Return a canonical SHA-256 reproduction handoff manifest with materials, plan, rubric, products, byproducts, and evidence-graph digest. This is not a signature or execution proof.',
    parameters: {
      id: { type: 'string', required: true, description: 'Frontier record id with a saved assessment.' },
    },
    output: jsonOutput(),
    async execute(args) {
      const data = await store.read()
      const found = requireRecord(data, args.id)
      if (!found.ok) return found
      const assessment = data.assessments[args.id]
      if (assessment === undefined) {
        return { ok: false, code: 'assessment_required', message: 'Create and save a reproduction assessment before exporting a manifest.' }
      }
      return {
        ok: true,
        manifest: createReproductionManifest({
          record: found.record,
          assessment,
          runs: data.runs[args.id] ?? [],
          sourceCatalogDigest: catalogDigest,
        }),
      }
    },
  }))
}
