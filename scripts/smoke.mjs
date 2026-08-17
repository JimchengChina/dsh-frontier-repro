import { BUILTIN_SOURCES } from '../lib/catalog.js'
import { collectAll } from '../lib/collector.js'

const requested = process.argv.slice(2)
const ids = requested.length > 0 ? requested : ['arxiv-frontier-ai', 'openai-news', 'deepseek-news']
const selected = BUILTIN_SOURCES.filter(source => ids.includes(source.id))
  .map(source => ({ ...source, maxItems: Math.min(3, source.maxItems) }))
const unknown = ids.filter(id => !selected.some(source => source.id === id))
if (unknown.length > 0) throw new Error(`unknown source ids: ${unknown.join(', ')}`)

const result = await collectAll(selected, {
  query: 'agent reasoning',
  xBearerTokenEnv: 'X_BEARER_TOKEN',
  timeoutMs: 30_000,
  maxBytes: 8 * 1024 * 1024,
  pageConcurrency: 2,
  userAgent: 'dsh-frontier-repro-smoke/0.3.0',
})

console.log(JSON.stringify({
  sources: result.sources,
  records: result.records.map(record => ({
    source: record.sourceId,
    title: record.title,
    url: record.url,
    artifacts: record.artifacts.length,
  })),
}, null, 2))

if (result.sources.some(source => !source.ok)) process.exitCode = 1
if (result.records.length === 0) process.exitCode = 1
