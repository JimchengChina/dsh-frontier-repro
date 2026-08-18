import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as FrontierRepro from '../index.js'
import { FrontierStore } from '../lib/store.js'
import { CLAIM_MODES, MODES } from '../lib/repro.js'

const signal = new AbortController().signal

class EmptyCredentials extends CredentialProvider {
  async resolve() { return undefined }
  async describe() { return { configured: false, writable: true } }
  async set() {}
  async unset() {}
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'frontier-integration-'))
  const storagePath = join(root, 'index.json')
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(FrontierRepro, { storagePath })
  return { ctx, storagePath }
}

async function setupWithEmptyCredentials() {
  const root = await mkdtemp(join(tmpdir(), 'frontier-integration-'))
  const storagePath = join(root, 'index.json')
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(EmptyCredentials)
  await ctx.plugin(FrontierRepro, { storagePath })
  return { ctx, storagePath }
}

function valueOf(result) {
  assert.equal(result.isError, false, result.isError ? result.error.message : undefined)
  return result.value
}

function call(ctx, callId, name, argumentsValue = {}) {
  return ctx.tools.execute({ callId, name, arguments: argumentsValue, signal })
}

function available(mode) {
  return Object.fromEntries(MODES[mode].map(key => [key, {
    state: 'available', evidence: [`checked:${key}`], note: 'verified for test',
  }]))
}

function availableClaims(mode) {
  return Object.fromEntries(CLAIM_MODES[mode].map(key => [key, {
    state: 'available', evidence: [`checked:${key}`], note: 'verified for test',
  }]))
}

test('status remains lossless JSON when optional credential source is absent', async () => {
  const { ctx } = await setupWithEmptyCredentials()
  const status = valueOf(await call(ctx, 'status-empty-credentials', 'frontier_repro_status'))
  assert.equal(status.credentials.x_api.configured, false)
  assert.equal(Object.hasOwn(status.credentials.x_api, 'source'), false)
  assert.equal(Object.hasOwn(status.capabilities['credential:x-api'], 'source'), false)
})

test('default collection selection skips optional X sources until the credential exists', () => {
  const sources = [
    { id: 'official', requires: ['network:https'] },
    { id: 'person-x', requires: ['network:https', 'credential:x-api'] },
  ]
  const withoutX = FrontierRepro.selectCollectionSources(sources, undefined, false)
  assert.deepEqual(withoutX.selected.map(source => source.id), ['official'])
  assert.deepEqual(withoutX.skipped.map(source => source.id), ['person-x'])

  const explicitlyRequested = FrontierRepro.selectCollectionSources(sources, ['person-x'], false)
  assert.deepEqual(explicitlyRequested.selected.map(source => source.id), ['person-x'])
  assert.deepEqual(explicitlyRequested.skipped, [])

  const withX = FrontierRepro.selectCollectionSources(sources, undefined, true)
  assert.deepEqual(withX.selected.map(source => source.id), ['official', 'person-x'])
})

test('real ToolRuntime registers the evidence gate and refuses unsupported success claims', async () => {
  const { ctx, storagePath } = await setup()
  const store = new FrontierStore(storagePath)
  await store.mergeRecords([{
    id: 'paper-1', title: 'Agent Method', url: 'https://arxiv.org/abs/2608.00001',
    sourceId: 'arxiv-frontier-ai', sourceClass: 'paper', sourceType: 'arxiv', sourceName: 'arXiv',
    lab: 'Independent research', summary: 'A method', categories: ['cs.AI'], authors: [], artifacts: [],
    provenance: { canonicalUrl: 'https://arxiv.org/abs/2608.00001' }, firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(),
  }])
  await store.commitCollection([], {
    id: 'health-observation', finishedAt: new Date().toISOString(), input: {}, enrichments: {},
    sources: [{ id: 'openai-news', ok: true, count: 5, rawCount: 8, rejectedCount: 3, newestItemAt: new Date().toISOString(), structureFingerprint: 'fixture', healthStaleAfterDays: 45 }],
  })

  const status = valueOf(await call(ctx, 'status', 'frontier_repro_status'))
  assert.equal(status.corpus_records, 1)
  assert.equal(status.credentials.x_api.configured, false)
  assert.equal(status.credentials.github_api.required, false)
  assert.equal(status.capabilities['credential:x-api'].available, false)
  assert.equal(status.source_health_alerts, 0)
  assert.equal(status.sources.find(source => source.id === 'openai-news').health.lastCount, 5)
  assert.deepEqual(status.sources.find(source => source.id === 'sam-altman-x').blockers.map(item => item.capability), ['credential:x-api'])

  const events = valueOf(await call(ctx, 'events', 'frontier_repro_events', { limit: 5 }))
  assert.equal(events.returned, 1)
  const eventId = events.events[0].id
  const watched = valueOf(await call(ctx, 'watch', 'frontier_repro_watch', { action: 'add', event_id: eventId }))
  assert.equal(watched.event.watchlisted, true)

  const claimAssessment = valueOf(await call(ctx, 'claim-assess', 'frontier_repro_assess_claims', {
    id: eventId,
    target_type: 'event',
    target: 'Match the public evaluation on a toy slice',
    mode: 'from_scratch_replication',
    equivalence: 'toy',
    requirements: availableClaims('from_scratch_replication'),
    claims: [{
      id: 'accuracy', statement: 'Match accuracy', metric: 'accuracy', operator: 'gte', expected: 0.9,
      evidence: ['https://arxiv.org/abs/2608.00001'],
    }],
  }))
  assert.equal(claimAssessment.assessment.status, 'ready')

  const attempt = valueOf(await call(ctx, 'attempt', 'frontier_repro_record_attempt', {
    id: eventId,
    target_type: 'event',
    mode: 'from_scratch_replication',
    equivalence: 'toy',
    verdict: 'passed',
    commands: ['node eval.mjs'],
    artifacts: ['results/eval.json'],
    metrics: { accuracy: 0.91 },
    claim_results: [{ claimId: 'accuracy', actual: 0.91, passed: true, evidence: ['results/eval.json'] }],
    resources: { cpuModel: 'test CPU', cpuCount: 2, durationSeconds: 1, costUsd: 0, dataScale: 'fixture', relativeToPaper: 0.001 },
    verifier: { kind: 'benchmark', identity: 'fixture-eval', verdict: 'passed', evidence: ['results/eval.json'] },
  }))
  assert.equal(attempt.attempt.outcome, 'toy_only')
  assert.equal(attempt.attempt.attemptNumber, 1)

  const bundle = valueOf(await call(ctx, 'bundle', 'frontier_repro_bundle', { event_id: eventId }))
  assert.equal(bundle.attempts.length, 1)
  const trackio = valueOf(await call(ctx, 'trackio', 'frontier_repro_trackio_scaffold', { event_id: eventId }))
  assert.equal(JSON.parse(trackio.scaffold.files['attempts.json']).length, 1)

  const currentRecord = (await store.read()).records.find(record => record.id === 'paper-1')
  await store.mergeRecords([{ ...currentRecord, summary: 'A materially revised method', lastSeenAt: new Date(Date.now() + 1_000).toISOString() }])
  const changedEvents = valueOf(await call(ctx, 'events-changed', 'frontier_repro_events', { changed_only: true }))
  assert.equal(changedEvents.returned, 1)
  assert.equal(changedEvents.events[0].version, 2)
  const staleAttempt = valueOf(await call(ctx, 'attempt-stale', 'frontier_repro_record_attempt', {
    id: eventId, target_type: 'event', assessment_id: claimAssessment.assessment.id,
    mode: 'from_scratch_replication', equivalence: 'toy', verdict: 'blocked',
  }))
  assert.equal(staleAttempt.code, 'assessment_stale')
  valueOf(await call(ctx, 'watch-ack', 'frontier_repro_watch', { action: 'acknowledge', event_id: eventId }))
  const acknowledged = valueOf(await call(ctx, 'events-acknowledged', 'frontier_repro_events', { changed_only: true }))
  assert.equal(acknowledged.returned, 0)

  const assessed = valueOf(await call(ctx, 'assess', 'frontier_repro_assess', {
    id: 'paper-1', target: 'Match the released eval', mode: 'behavioral', requirements: available('behavioral'),
    rubric: [{ id: 'accuracy', description: 'Match accuracy', metric: 'accuracy', operator: 'gte', expected: 0.9 }],
  }))
  assert.equal(assessed.assessment.status, 'ready_behavioral')

  const rejected = valueOf(await call(ctx, 'run-bad', 'frontier_repro_record_result', {
    id: 'paper-1', mode: 'behavioral', verdict: 'passed', commands: [], artifacts: [], metrics: {},
  }))
  assert.equal(rejected.code, 'insufficient_run_evidence')

  const recorded = valueOf(await call(ctx, 'run-good', 'frontier_repro_record_result', {
    id: 'paper-1', mode: 'behavioral', verdict: 'passed', commands: ['node eval.mjs'],
    artifacts: ['results/eval.json'], metrics: { accuracy: 0.91 }, deviations: ['Used public API'],
  }))
  assert.equal(recorded.ok, true)
  const detail = valueOf(await call(ctx, 'get', 'frontier_repro_get', { id: 'paper-1' }))
  assert.equal(detail.runs.length, 1)

  const tools = ctx.tools
  await ctx.root.fiber.dispose()
  assert.equal(tools.get('frontier_repro_assess'), undefined)
})
