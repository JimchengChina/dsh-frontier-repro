import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as FrontierRepro from '../index.js'
import { FrontierStore } from '../lib/store.js'
import { MODES } from '../lib/repro.js'

const signal = new AbortController().signal

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'frontier-integration-'))
  const storagePath = join(root, 'index.json')
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
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

test('real ToolRuntime registers the evidence gate and refuses unsupported success claims', async () => {
  const { ctx, storagePath } = await setup()
  const store = new FrontierStore(storagePath)
  await store.mergeRecords([{
    id: 'paper-1', title: 'Agent Method', url: 'https://arxiv.org/abs/2608.00001',
    sourceId: 'arxiv-frontier-ai', sourceClass: 'paper', sourceType: 'arxiv', sourceName: 'arXiv',
    lab: 'Independent research', summary: 'A method', categories: ['cs.AI'], authors: [], artifacts: [],
    provenance: { canonicalUrl: 'https://arxiv.org/abs/2608.00001' }, firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(),
  }])

  const status = valueOf(await call(ctx, 'status', 'frontier_repro_status'))
  assert.equal(status.corpus_records, 1)
  assert.equal(status.credentials.x_api.configured, false)
  assert.equal(status.credentials.github_api.required, false)
  assert.equal(status.capabilities['credential:x-api'].available, false)
  assert.deepEqual(status.sources.find(source => source.id === 'sam-altman-x').blockers.map(item => item.capability), ['credential:x-api'])

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
