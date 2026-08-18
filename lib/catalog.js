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
    denyCategories: ['Company', 'Global Affairs', 'Startup'],
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
    id: 'anthropic-research',
    type: 'official_index',
    sourceClass: 'official_lab',
    lab: 'Anthropic',
    name: 'Anthropic Research',
    url: 'https://www.anthropic.com/research',
    includePaths: ['/research/'],
    excludePaths: ['/research/team/'],
    requirePublishedAt: true,
    maxItems: 20,
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
    id: 'minimax-research',
    type: 'official_index',
    sourceClass: 'official_lab',
    lab: 'MiniMax',
    name: 'MiniMax Research',
    url: 'https://www.minimax.io/blog',
    includePaths: ['/blog/'],
    requirePublishedAt: true,
    maxItems: 15,
  },
  {
    id: 'kimi-blog',
    type: 'dated_index',
    sourceClass: 'official_lab',
    lab: 'Moonshot AI / Kimi',
    name: 'Kimi official blog',
    url: 'https://platform.kimi.com/blog',
    includePaths: ['/blog/posts/'],
    itemSelector: '.post-item',
    requirePublishedAt: true,
    maxItems: 20,
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
    boilerplateTitles: ['Your First API Call | DeepSeek API Docs'],
    maxItems: 20,
  },
  {
    id: 'deepseek-transparency',
    type: 'model_index',
    sourceClass: 'official_lab',
    lab: 'DeepSeek',
    name: 'DeepSeek Transparency Center',
    url: 'https://www.deepseek.com/en/transparency/',
    titleSelector: '.ds-text-title',
    dateSelector: '.ds-text-caption',
    requirePublishedAt: true,
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
    id: 'nvidia-technical-blog',
    type: 'feed',
    sourceClass: 'official_lab',
    lab: 'NVIDIA',
    name: 'NVIDIA Technical Blog',
    url: 'https://developer.nvidia.com/blog/feed/',
    maxItems: 30,
  },
  {
    id: 'amd-rocm-blog',
    type: 'feed',
    sourceClass: 'official_lab',
    lab: 'AMD',
    name: 'AMD ROCm Blog',
    url: 'https://rocm.blogs.amd.com/blog/atom.xml',
    maxItems: 30,
  },
  {
    id: 'intel-ai-news',
    type: 'feed',
    sourceClass: 'official_lab',
    lab: 'Intel',
    name: 'Intel Artificial Intelligence News',
    url: 'https://newsroom.intel.com/artificial-intelligence/feed',
    denyCategories: ['Corporate', 'Intel Foundry'],
    maxItems: 25,
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
    id: 'deepseek-github',
    type: 'github_org',
    sourceClass: 'official_artifact',
    lab: 'DeepSeek',
    name: 'DeepSeek GitHub repositories and releases',
    url: 'https://api.github.com/orgs/deepseek-ai/repos',
    organization: 'deepseek-ai',
    identityEvidenceUrl: 'https://github.com/deepseek-ai',
    releaseRepoLimit: 4,
    releasesPerRepo: 2,
    maxItems: 10,
  },
  {
    id: 'minimax-models',
    type: 'huggingface_models',
    sourceClass: 'official_artifact',
    lab: 'MiniMax',
    name: 'MiniMax verified Hugging Face models',
    url: 'https://huggingface.co/api/models',
    organization: 'MiniMaxAI',
    identityEvidenceUrl: 'https://huggingface.co/MiniMaxAI',
    enrichModelCards: 8,
    maxItems: 20,
  },
  {
    id: 'moonshot-models',
    type: 'huggingface_models',
    sourceClass: 'official_artifact',
    lab: 'Moonshot AI / Kimi',
    name: 'Moonshot AI verified Hugging Face models',
    url: 'https://huggingface.co/api/models',
    organization: 'moonshotai',
    identityEvidenceUrl: 'https://huggingface.co/moonshotai',
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

const SOURCE_TYPES = new Set(['arxiv', 'feed', 'page', 'official_index', 'dated_index', 'model_index', 'sitemap', 'huggingface_models', 'github_org', 'x_user'])
const SOURCE_CLASSES = new Set(['paper', 'official_lab', 'official_artifact', 'person_blog', 'person_x'])
const SOURCE_CAPABILITIES = new Set(['network:https', 'credential:x-api'])
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/

function normalizeCapabilities(source) {
  const requires = Array.isArray(source.requires) ? [...new Set(source.requires)] : ['network:https']
  if (!requires.includes('network:https')) requires.unshift('network:https')
  if (source.type === 'x_user' && !requires.includes('credential:x-api')) requires.push('credential:x-api')
  if (requires.some(item => typeof item !== 'string' || !SOURCE_CAPABILITIES.has(item))) {
    throw new TypeError(`${source.id}.requires contains an unsupported capability`)
  }
  return requires
}

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
  if ((source.type === 'official_index' || source.type === 'dated_index' || source.type === 'sitemap')
    && (!Array.isArray(source.includePaths) || source.includePaths.length === 0)) {
    throw new TypeError(`${source.id}.includePaths must be a non-empty array`)
  }
  if (Array.isArray(source.includePaths)
    && source.includePaths.some(path => typeof path !== 'string' || !path.startsWith('/'))) {
    throw new TypeError(`${source.id}.includePaths entries must start with /`)
  }
  if (Array.isArray(source.excludePaths)
    && source.excludePaths.some(path => typeof path !== 'string' || !path.startsWith('/'))) {
    throw new TypeError(`${source.id}.excludePaths entries must start with /`)
  }
  if (source.type === 'model_index') {
    for (const key of ['titleSelector', 'dateSelector']) {
      if (typeof source[key] !== 'string' || source[key].trim() === '') {
        throw new TypeError(`${source.id}.${key} must be a non-empty CSS selector`)
      }
    }
  }
  for (const key of ['allowCategories', 'denyCategories', 'boilerplateTitles']) {
    if (source[key] !== undefined && (!Array.isArray(source[key])
      || source[key].some(value => typeof value !== 'string' || value.trim() === ''))) {
      throw new TypeError(`${source.id}.${key} must contain non-empty strings`)
    }
  }
  if (source.requirePublishedAt !== undefined && typeof source.requirePublishedAt !== 'boolean') {
    throw new TypeError(`${source.id}.requirePublishedAt must be a boolean`)
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
  if (source.type === 'github_org'
    && !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(source.organization ?? '')) {
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
  for (const [key, maximum] of [['releaseRepoLimit', 20], ['releasesPerRepo', 10]]) {
    if (source[key] !== undefined && (!Number.isInteger(source[key]) || source[key] < 0 || source[key] > maximum)) {
      throw new TypeError(`${source.id}.${key} must be an integer from 0 to ${maximum}`)
    }
  }
  const healthStaleAfterDays = source.healthStaleAfterDays ?? 45
  if (!Number.isInteger(healthStaleAfterDays) || healthStaleAfterDays < 1 || healthStaleAfterDays > 3_650) {
    throw new TypeError(`${source.id}.healthStaleAfterDays must be an integer from 1 to 3650`)
  }
  return Object.freeze({
    ...source,
    maxItems,
    healthStaleAfterDays,
    requires: Object.freeze(normalizeCapabilities(source)),
  })
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
