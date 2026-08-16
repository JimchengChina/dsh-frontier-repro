const SOURCE_WEIGHT = Object.freeze({
  official_lab: 32,
  official_artifact: 32,
  paper: 27,
  person_blog: 23,
  person_x: 16,
})

const REPRO_SIGNALS = [
  'open source', 'open-source', 'weights', 'model card', 'dataset', 'github', 'hugging face',
  'huggingface', 'benchmark', 'evaluation', 'technical report', 'paper', 'arxiv', 'code',
  'checkpoint', 'license', 'inference', 'training', 'architecture', 'implementation', 'recipe',
  '开源', '权重', '数据集', '评测', '论文', '代码', '训练', '推理',
]

const FRONTIER_SIGNALS = [
  'agent', 'reasoning', 'multimodal', 'long context', 'coding', 'robotics', 'reinforcement learning',
  'inference', 'training', 'alignment', 'interpretability', 'safety', 'model', 'tool use',
  '智能体', '推理', '多模态', '长上下文', '强化学习', '对齐', '可解释', '安全', '模型',
]

function countSignals(text, signals, cap) {
  const lower = text.toLowerCase()
  return Math.min(cap, signals.reduce((score, signal) => score + (lower.includes(signal) ? 1 : 0), 0))
}

function queryScore(record, query) {
  if (typeof query !== 'string' || query.trim() === '') return 0
  const haystack = `${record.title} ${record.summary} ${record.categories.join(' ')}`.toLowerCase()
  const tokens = [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(token => token.length >= 2))]
  if (tokens.length === 0) return 0
  return Math.round(15 * tokens.filter(token => haystack.includes(token)).length / tokens.length)
}

function recencyScore(record, now) {
  const input = record.publishedAt ?? record.updatedAt
  if (input === undefined) return 2
  const days = Math.max(0, (now - Date.parse(input)) / 86_400_000)
  return Math.max(0, Math.round(20 * Math.exp(-days / 45)))
}

/** Produce an explainable quality/reproduction ranking; no model judgment is hidden in the score. */
export function scoreRecord(record, query = '', now = Date.now()) {
  const text = `${record.title} ${record.summary} ${record.categories.join(' ')}`
  const source = SOURCE_WEIGHT[record.sourceClass] ?? 0
  const freshness = recencyScore(record, now)
  const artifacts = Math.min(18, record.artifacts.length * 4)
  const reproducibility = countSignals(text, REPRO_SIGNALS, 10)
  const frontier = countSignals(text, FRONTIER_SIGNALS, 8)
  const relevance = queryScore(record, query)
  const total = source + freshness + artifacts + reproducibility + frontier + relevance
  return { total, source, freshness, artifacts, reproducibility, frontier, relevance }
}

/** Sort records by score, recency, then stable id. */
export function rankRecords(records, query = '', now = Date.now()) {
  return records.map(record => ({ ...record, score: scoreRecord(record, query, now) }))
    .sort((left, right) => right.score.total - left.score.total
      || (right.publishedAt ?? '').localeCompare(left.publishedAt ?? '')
      || left.id.localeCompare(right.id))
}
