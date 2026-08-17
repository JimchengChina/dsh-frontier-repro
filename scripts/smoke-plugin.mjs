import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as FrontierRepro from '../index.js'

const root = await mkdtemp(join(tmpdir(), 'frontier-repro-smoke-'))
const ctx = new Context()
await ctx.plugin(SystemPrompt)
await ctx.plugin(ToolRuntime)
await ctx.plugin(FrontierRepro, { storagePath: join(root, 'index.json') })

const result = await ctx.tools.execute({
  callId: 'frontier-repro-smoke',
  name: 'frontier_repro_collect',
  arguments: {
    query: 'agent reasoning',
    source_ids: ['arxiv-frontier-ai', 'openai-news', 'deepseek-news'],
    days: 30,
    limit: 5,
  },
  signal: new AbortController().signal,
})

if (result.isError) throw result.error
const events = await ctx.tools.execute({
  callId: 'frontier-repro-events-smoke',
  name: 'frontier_repro_events',
  arguments: { limit: 5 },
  signal: new AbortController().signal,
})
if (events.isError) throw events.error
console.log(JSON.stringify({ collection: result.value, events: events.value }, null, 2))
if (result.value.ok !== true || result.value.collected < 1 || events.value.returned < 1) process.exitCode = 1
await ctx.root.fiber.dispose()
