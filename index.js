import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { mergeSources } from './lib/catalog.js'
import { collectAll, filterRecords } from './lib/collector.js'
import { rankRecords } from './lib/rank.js'
import { assessReproduction, recordRun } from './lib/repro.js'
import { FrontierStore } from './lib/store.js'

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
  requestTimeoutMs: z.natural().min(1).default(20_000),
  maxResponseBytes: z.natural().min(1).default(5 * 1024 * 1024),
  pageConcurrency: z.natural().min(1).default(3),
  githubEnrichLimit: z.natural().default(8),
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
    published_at: record.publishedAt,
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

export function apply(ctx, inputConfig = {}) {
  const config = {
    ...inputConfig,
    xBearerTokenEnv: inputConfig.xBearerTokenEnv ?? 'X_BEARER_TOKEN',
    githubTokenEnv: inputConfig.githubTokenEnv ?? 'GITHUB_TOKEN',
    defaultDays: inputConfig.defaultDays ?? 90,
    defaultLimit: inputConfig.defaultLimit ?? 20,
    maxRecords: inputConfig.maxRecords ?? 1_000,
    requestTimeoutMs: inputConfig.requestTimeoutMs ?? 20_000,
    maxResponseBytes: inputConfig.maxResponseBytes ?? 5 * 1024 * 1024,
    pageConcurrency: inputConfig.pageConcurrency ?? 3,
    githubEnrichLimit: inputConfig.githubEnrichLimit ?? 8,
    promptGuidance: inputConfig.promptGuidance ?? true,
    promptOrder: inputConfig.promptOrder ?? 145,
  }
  const sources = mergeSources(readCustomSources(config.sourceFile))
  const sourceById = new Map(sources.map(source => [source.id, source]))
  const store = new FrontierStore(resolveStoragePath(config), config.maxRecords)

  if (config.promptGuidance) {
    ctx.systemPrompt.section({
      name: 'tool:frontier-repro',
      order: config.promptOrder,
      text:
        'Use frontier_repro_collect for new frontier-AI signals from curated primary sources, and frontier_repro_search for the saved corpus. '
        + 'This plugin is not a general news or paper-summary tool: inspect a record and its primary artifacts before drawing conclusions. '
        + 'For reproduction work, define one observable target, gather evidence for every requirement, then call frontier_repro_assess. '
        + 'A ready_exact, ready_scaled, or ready_behavioral result means prerequisites are documented; it does not mean the feature was reproduced. '
        + 'Use normal filesystem, shell, web, and evaluation tools to implement in an isolated workspace. Pin artifact versions, begin with the smallest baseline, '
        + 'and do not upgrade scaled or behavioral equivalence to an exact-reproduction claim. Record executed commands, artifact paths, metrics, deviations, '
        + 'and the honest verdict with frontier_repro_record_result. Never mark a run passed without measurable evaluation evidence. '
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
        updated_at: data.updatedAt,
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
      const xBearerToken = selected.some(source => source.type === 'x_user')
        ? await credentialValue(ctx, config.xBearerTokenEnv)
        : undefined
      const githubToken = config.githubEnrichLimit > 0
        ? await credentialValue(ctx, config.githubTokenEnv)
        : undefined
      const collected = await collectAll(selected, {
        query: args.query ?? '',
        xBearerToken,
        xBearerTokenEnv: config.xBearerTokenEnv,
        timeoutMs: config.requestTimeoutMs,
        maxBytes: config.maxResponseBytes,
        pageConcurrency: config.pageConcurrency,
        githubEnrichLimit: config.githubEnrichLimit,
        githubToken,
        userAgent: 'dsh-frontier-repro/0.1 (+https://github.com/topics/dsh-plugin)',
      })
      await store.mergeRecords(collected.records)
      const days = boundedInteger(args.days, config.defaultDays, 1, 3_650)
      const limit = boundedInteger(args.limit, config.defaultLimit, 1, 100)
      const filtered = filterRecords(collected.records, { query: args.query ?? '', days })
      const ranked = rankRecords(filtered, args.query ?? '').slice(0, limit)
      return {
        ok: true,
        partial: collected.sources.some(source => !source.ok || source.warnings.length > 0),
        collected: collected.records.length,
        returned: ranked.length,
        ranking: 'source provenance + recency + linked artifacts + reproducibility signals + topic relevance',
        records: ranked.map(compact),
        sources: collected.sources,
        enrichments: collected.enrichments,
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
        assessment: data.assessments[args.id],
        runs: data.runs[args.id] ?? [],
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
        })
        await store.saveAssessment(args.id, assessment)
        return { ok: true, record: { id: found.record.id, title: found.record.title, url: found.record.url }, assessment }
      } catch (error) {
        return { ok: false, code: 'invalid_assessment', message: error.message }
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
        const run = recordRun({
          recordId: args.id,
          mode: args.mode,
          verdict: args.verdict,
          commands: args.commands,
          artifacts: args.artifacts,
          metrics: args.metrics,
          deviations: args.deviations,
          notes: args.notes,
        })
        if (!run.accepted) return { ok: false, code: 'insufficient_run_evidence', problems: run.problems, run }
        await store.appendRun(args.id, run)
        return { ok: true, run }
      } catch (error) {
        return { ok: false, code: 'invalid_run', message: error.message }
      }
    },
  }))
}
