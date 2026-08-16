/** Curated first-party source catalog. */

export const BUILTIN_SOURCES = Object.freeze([
  {
    id: 'arxiv-frontier-ai',
    type: 'arxiv',
    sourceClass: 'paper',
    lab: 'Independent research',
    name: 'arXiv frontier AI',
    url: 'https://export.arxiv.org/api/query',
    categories: ['cs.AI', 'cs.CL', 'cs.LG', 'cs.CV', 'cs.RO', 'cs.SE'],
    enrichPaperArtifacts: 10,
    maxItems: 30,
  },
  {
    id: 'openai-news',
    type: 'feed',
    sourceClass: 'official_lab',
    lab: 'OpenAI',
    name: 'OpenAI News',
    url: 'https://openai.com/news/rss.xml',
    maxItems: 30,
  },
  {
    id: 'anthropic-news',
    type: 'official_index',
    sourceClass: 'official_lab',
    lab: 'Anthropic',
    name: 'Anthropic Newsroom',
    url: 'https://www.anthropic.com/news',
    includePaths: ['/news/'],
    maxItems: 18,
  },
  {
    id: 'anthropic-engineering',
    type: 'sitemap',
    sourceClass: 'official_lab',
    lab: 'Anthropic',
    name: 'Anthropic Engineering',
    url: 'https://www.anthropic.com/sitemap.xml',
    includePaths: ['/engineering/'],
    maxItems: 12,
  },
  {
    id: 'google-deepmind-news',
    type: 'feed',
    sourceClass: 'official_lab',
    lab: 'Google DeepMind',
    name: 'Google DeepMind News',
    url: 'https://deepmind.google/blog/rss.xml',
    maxItems: 30,
    enrichPages: 10,
  },
  {
    id: 'deepseek-news',
    type: 'sitemap',
    sourceClass: 'official_lab',
    lab: 'DeepSeek',
    name: 'DeepSeek API News',
    url: 'https://api-docs.deepseek.com/sitemap.xml',
    includePaths: ['/news/'],
    sortByPathDate: true,
    maxItems: 20,
  },
  {
    id: 'zai-release-notes',
    type: 'page',
    sourceClass: 'official_lab',
    lab: 'Z.ai / Zhipu AI',
    name: 'Z.ai model release notes',
    url: 'https://docs.z.ai/release-notes/new-released',
    maxItems: 1,
  },
  {
    id: 'deepseek-models',
    type: 'huggingface_models',
    sourceClass: 'official_artifact',
    lab: 'DeepSeek',
    name: 'DeepSeek verified Hugging Face models',
    url: 'https://huggingface.co/api/models',
    organization: 'deepseek-ai',
    identityEvidenceUrl: 'https://huggingface.co/deepseek-ai',
    enrichModelCards: 8,
    maxItems: 20,
  },
  {
    id: 'zai-models',
    type: 'huggingface_models',
    sourceClass: 'official_artifact',
    lab: 'Z.ai / Zhipu AI',
    name: 'Z.ai verified Hugging Face models',
    url: 'https://huggingface.co/api/models',
    organization: 'zai-org',
    identityEvidenceUrl: 'https://huggingface.co/zai-org',
    enrichModelCards: 8,
    maxItems: 20,
  },
  {
    id: 'sam-altman-blog',
    type: 'feed',
    sourceClass: 'person_blog',
    lab: 'OpenAI',
    person: 'Sam Altman',
    role: 'co-founder and CEO',
    name: 'Sam Altman personal blog',
    url: 'https://blog.samaltman.com/posts.atom',
    identityEvidenceUrl: 'https://openai.com/our-structure/',
    verifiedAt: '2026-08-17',
    maxItems: 15,
  },
  {
    id: 'jack-clark-import-ai',
    type: 'feed',
    sourceClass: 'person_blog',
    lab: 'Anthropic',
    person: 'Jack Clark',
    role: 'co-founder',
    name: 'Import AI',
    url: 'https://importai.substack.com/feed',
    identityEvidenceUrl: 'https://www.anthropic.com/company',
    verifiedAt: '2026-08-17',
    maxItems: 10,
  },
  {
    id: 'sam-altman-x',
    type: 'x_user',
    sourceClass: 'person_x',
    lab: 'OpenAI',
    person: 'Sam Altman',
    role: 'co-founder and CEO',
    name: 'Sam Altman on X',
    username: 'sama',
    url: 'https://x.com/sama',
    identityEvidenceUrl: 'https://openai.com/our-structure/',
    verifiedAt: '2026-08-17',
    maxItems: 20,
  },
  {
    id: 'dario-amodei-x',
    type: 'x_user',
    sourceClass: 'person_x',
    lab: 'Anthropic',
    person: 'Dario Amodei',
    role: 'co-founder and CEO',
    name: 'Dario Amodei on X',
    username: 'DarioAmodei',
    url: 'https://x.com/DarioAmodei',
    identityEvidenceUrl: 'https://www.anthropic.com/company',
    verifiedAt: '2026-08-17',
    maxItems: 20,
  },
  {
    id: 'demis-hassabis-x',
    type: 'x_user',
    sourceClass: 'person_x',
    lab: 'Google DeepMind',
    person: 'Demis Hassabis',
    role: 'co-founder and CEO',
    name: 'Demis Hassabis on X',
    username: 'demishassabis',
    url: 'https://x.com/demishassabis',
    identityEvidenceUrl: 'https://deepmind.google/about/',
    verifiedAt: '2026-08-17',
    maxItems: 20,
  },
])

const SOURCE_TYPES = new Set(['arxiv', 'feed', 'page', 'official_index', 'sitemap', 'huggingface_models', 'x_user'])
const SOURCE_CLASSES = new Set(['paper', 'official_lab', 'official_artifact', 'person_blog', 'person_x'])
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/

/** Validate and normalize a custom source record loaded at plugin startup. */
export function validateSource(source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('each source must be an object')
  }
  if (!ID_PATTERN.test(source.id ?? '')) throw new TypeError(`invalid source id: ${String(source.id)}`)
  if (!SOURCE_TYPES.has(source.type)) throw new TypeError(`unsupported source type for ${source.id}: ${String(source.type)}`)
  if (!SOURCE_CLASSES.has(source.sourceClass)) {
    throw new TypeError(`unsupported sourceClass for ${source.id}: ${String(source.sourceClass)}`)
  }
  for (const key of ['name', 'lab', 'url']) {
    if (typeof source[key] !== 'string' || source[key].trim() === '') {
      throw new TypeError(`${source.id}.${key} must be a non-empty string`)
    }
  }
  const url = new URL(source.url)
  if (url.protocol !== 'https:') throw new TypeError(`${source.id}.url must use https`)
  if ((source.type === 'official_index' || source.type === 'sitemap')
    && (!Array.isArray(source.includePaths) || source.includePaths.length === 0)) {
    throw new TypeError(`${source.id}.includePaths must be a non-empty array`)
  }
  if (Array.isArray(source.includePaths)
    && source.includePaths.some(path => typeof path !== 'string' || !path.startsWith('/'))) {
    throw new TypeError(`${source.id}.includePaths entries must start with /`)
  }
  if (source.type === 'arxiv'
    && (!Array.isArray(source.categories) || source.categories.length === 0
      || source.categories.some(category => typeof category !== 'string' || !/^[a-z-]+\.[A-Z]+$/i.test(category)))) {
    throw new TypeError(`${source.id}.categories must contain arXiv category ids`)
  }
  if (source.type === 'huggingface_models'
    && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(source.organization ?? '')) {
    throw new TypeError(`${source.id}.organization is invalid`)
  }
  if (source.type === 'x_user' && !/^[A-Za-z0-9_]{1,15}$/.test(source.username ?? '')) {
    throw new TypeError(`${source.id}.username is invalid`)
  }
  if ((source.sourceClass === 'person_blog' || source.sourceClass === 'person_x')) {
    for (const key of ['person', 'role', 'identityEvidenceUrl']) {
      if (typeof source[key] !== 'string' || source[key].trim() === '') {
        throw new TypeError(`${source.id}.${key} is required for a person source`)
      }
    }
    const evidence = new URL(source.identityEvidenceUrl)
    if (evidence.protocol !== 'https:') throw new TypeError(`${source.id}.identityEvidenceUrl must use https`)
  }
  const maxItems = source.maxItems === undefined ? 20 : source.maxItems
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 100) {
    throw new TypeError(`${source.id}.maxItems must be an integer from 1 to 100`)
  }
  if (source.enrichPaperArtifacts !== undefined
    && (!Number.isInteger(source.enrichPaperArtifacts) || source.enrichPaperArtifacts < 0 || source.enrichPaperArtifacts > 30)) {
    throw new TypeError(`${source.id}.enrichPaperArtifacts must be an integer from 0 to 30`)
  }
  return Object.freeze({ ...source, maxItems })
}

/** Merge built-ins with custom additions. Custom ids may not shadow curated ids. */
export function mergeSources(customSources = []) {
  const merged = BUILTIN_SOURCES.map(validateSource)
  const ids = new Set(merged.map(source => source.id))
  for (const input of customSources) {
    const source = validateSource(input)
    if (ids.has(source.id)) throw new TypeError(`duplicate source id: ${source.id}`)
    ids.add(source.id)
    merged.push(source)
  }
  return Object.freeze(merged)
}
