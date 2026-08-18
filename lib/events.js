import { canonicalDigest } from './canonical.js'

const MODEL_PATTERNS = [
  /\b(deepseek)[\s/_-]*((?:r|v)\d+(?:[.-]\d+)*)/i,
  /\b(kimi)[\s/_-]*(k\d+(?:[.-]\d+)*)/i,
  /\b(minimax)[\s/_-]*((?:m|h)\d+(?:[.-]\d+)*)/i,
  /\b(glm)[\s/_-]*(\d+(?:[.-]\d+)*)/i,
  /\b(gpt)[\s/_-]*(\d+(?:[.-]\d+)*)/i,
  /\b(gemini)[\s/_-]*(\d+(?:[.-]\d+)*)/i,
  /\b(claude)[\s/_-]*((?:(?:opus|sonnet|haiku)[\s/_-]*)?\d+(?:[.-]\d+)*)/i,
  /\b(nemotron)[\s/_-]*([a-z]*\d+(?:[.-]\d+)*)/i,
  /\b(qwen)[\s/_-]*(\d+(?:[.-]\d+)*)/i,
  /\b(llama)[\s/_-]*(\d+(?:[.-]\d+)*)/i,
]

const MODEL_LABS = Object.freeze({
  deepseek: 'DeepSeek',
  kimi: 'Moonshot AI / Kimi',
  minimax: 'MiniMax',
  glm: 'Z.ai / Zhipu AI',
  gpt: 'OpenAI',
  gemini: 'Google DeepMind',
  claude: 'Anthropic',
  nemotron: 'NVIDIA',
  qwen: 'Alibaba / Qwen',
  llama: 'Meta',
})

const SLOT_ORDER = Object.freeze([
  'official_release',
  'system_card_or_paper',
  'code',
  'model',
  'dataset',
  'evaluation',
  'person_signal',
])

function cleanToken(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function modelEntity(record) {
  const candidates = [record.title, record.url, ...record.artifacts.map(artifact => artifact.repoId ?? artifact.url)]
  for (const candidate of candidates) {
    for (const pattern of MODEL_PATTERNS) {
      const match = pattern.exec(String(candidate ?? ''))
      if (match !== null) return `${cleanToken(match[1])}-${cleanToken(match[2])}`
    }
  }
  return undefined
}

function eventDescriptor(record) {
  const entity = modelEntity(record)
  if (entity !== undefined) {
    const owner = MODEL_LABS[entity.split('-')[0]] ?? record.lab
    return { identity: `${cleanToken(owner)}:${entity}`, entity, lab: owner }
  }
  return { identity: `${cleanToken(record.lab)}:record-${record.id}`, lab: record.lab }
}

function evidence(record, artifact, kind) {
  const source = artifact ?? record
  return {
    kind,
    recordId: record.id,
    sourceId: record.sourceId,
    sourceClass: record.sourceClass,
    title: record.title,
    url: source.immutableUrl ?? source.url,
    canonicalUrl: source.repositoryUrl ?? source.url,
    ...(source.revision === undefined ? {} : { revision: source.revision }),
    ...(source.license === undefined ? {} : { license: source.license }),
    ...(source.gated === undefined ? {} : { gated: source.gated }),
    immutable: source.immutableUrl !== undefined || source.revision !== undefined,
    observedAt: record.lastSeenAt ?? record.firstSeenAt,
  }
}

function addEvidence(slots, slot, item) {
  const key = `${item.kind}\0${item.url}\0${item.revision ?? ''}`
  if (!slots[slot].some(existing => `${existing.kind}\0${existing.url}\0${existing.revision ?? ''}` === key)) {
    slots[slot].push(item)
  }
}

function artifactSlot(artifact) {
  if (artifact.kind === 'code') return 'code'
  if (artifact.kind === 'model') return 'model'
  if (artifact.kind === 'dataset') return 'dataset'
  if (artifact.kind === 'evaluation') return 'evaluation'
  if (['paper', 'model_card'].includes(artifact.kind)) return 'system_card_or_paper'
  return undefined
}

function slotValues(records) {
  const slots = Object.fromEntries(SLOT_ORDER.map(slot => [slot, []]))
  for (const record of records) {
    if (record.sourceClass === 'official_lab') addEvidence(slots, 'official_release', evidence(record, undefined, 'publication'))
    if (record.sourceClass === 'paper') addEvidence(slots, 'system_card_or_paper', evidence(record, undefined, 'paper'))
    if (['person_blog', 'person_x'].includes(record.sourceClass)) addEvidence(slots, 'person_signal', evidence(record, undefined, 'signal'))
    if (/\b(?:benchmark|evaluation|eval|leaderboard|评测|基准)\b/i.test(`${record.title} ${record.summary}`)) {
      addEvidence(slots, 'evaluation', evidence(record, undefined, 'evaluation_claim'))
    }
    for (const artifact of record.artifacts) {
      const slot = artifactSlot(artifact)
      if (slot !== undefined) addEvidence(slots, slot, evidence(record, artifact, artifact.kind))
    }
  }
  for (const slot of SLOT_ORDER) slots[slot].sort((left, right) => left.url.localeCompare(right.url))
  return slots
}

function unique(values) {
  return [...new Set(values.filter(value => value !== undefined && value !== ''))].sort()
}

function reproductionLevel(slots) {
  const specification = slots.system_card_or_paper.length > 0
  const pinnedCode = slots.code.some(item => item.immutable)
  const pinnedModel = slots.model.some(item => item.immutable)
  const evaluation = slots.evaluation.length > 0
  const official = slots.official_release.length > 0
  if (specification && pinnedCode && pinnedModel && evaluation) return 'exact_candidate'
  if (specification && (pinnedCode || pinnedModel) && evaluation) return 'scaled_candidate'
  if (official && evaluation) return 'behavioral_candidate'
  return 'blocked'
}

function substantivePayload(bundle) {
  return {
    lab: bundle.lab,
    entity: bundle.entity,
    recordDigests: bundle.recordDigests,
    evidence: Object.fromEntries(SLOT_ORDER.map(slot => [slot, bundle.evidence[slot].map(item => ({
      kind: item.kind,
      url: item.url,
      revision: item.revision,
      license: item.license,
      gated: item.gated,
    }))])),
    capabilities: bundle.capabilities,
    evaluations: bundle.evaluations,
    licenses: bundle.licenses,
    missing: bundle.missing,
    reproductionLevel: bundle.reproductionLevel,
  }
}

function addedRemoved(previous = [], current = [], identity = value => typeof value === 'string' ? value : canonicalDigest(value)) {
  const before = new Set(previous.map(identity))
  const after = new Set(current.map(identity))
  return {
    added: current.filter(value => !before.has(identity(value))),
    removed: previous.filter(value => !after.has(identity(value))),
  }
}

/** Describe only evidence-bearing changes between two versions of one release bundle. */
export function diffEvidenceBundles(previous, current) {
  const evidenceIdentity = item => canonicalDigest({
    kind: item.kind,
    url: item.url,
    revision: item.revision,
    license: item.license,
    gated: item.gated,
  })
  if (previous === undefined) return {
    initial: true,
    capabilities: addedRemoved([], current.capabilities),
    evaluations: addedRemoved([], current.evaluations),
    licenses: addedRemoved([], current.licenses),
    evidence: Object.fromEntries(SLOT_ORDER.map(slot => [slot, addedRemoved([], current.evidence[slot], evidenceIdentity)])),
  }
  return {
    initial: false,
    capabilities: addedRemoved(previous.capabilities, current.capabilities),
    evaluations: addedRemoved(previous.evaluations, current.evaluations),
    licenses: addedRemoved(previous.licenses, current.licenses),
    evidence: Object.fromEntries(SLOT_ORDER.map(slot => [slot, addedRemoved(previous.evidence[slot], current.evidence[slot], evidenceIdentity)])),
  }
}

/** Cluster lab-scoped release records into conservative, immutable-evidence bundles. */
export function buildEvidenceBundles(records, previousEvents = {}) {
  const groups = new Map()
  for (const record of records) {
    const descriptor = eventDescriptor(record)
    const current = groups.get(descriptor.identity)?.members ?? []
    current.push(record)
    groups.set(descriptor.identity, { descriptor, members: current })
  }
  const events = {}
  for (const [identity, group] of groups) {
    const { descriptor, members } = group
    members.sort((left, right) => (right.publishedAt ?? right.updatedAt ?? '').localeCompare(left.publishedAt ?? left.updatedAt ?? ''))
    const id = `evt_${canonicalDigest(identity).slice(0, 20)}`
    const slots = slotValues(members)
    const sourceIds = unique(members.flatMap(record => [record.sourceId, ...(record.corroboratingSources ?? [])]))
    const sourceClasses = unique(members.map(record => record.sourceClass))
    const capabilities = unique(members
      .filter(record => ['official_lab', 'official_artifact', 'paper'].includes(record.sourceClass))
      .map(record => record.title))
    const evaluations = unique(slots.evaluation.map(item => item.url))
    const licenses = unique(Object.values(slots).flat().map(item => item.license))
    const missing = SLOT_ORDER.filter(slot => ['official_release', 'system_card_or_paper', 'code', 'model', 'evaluation'].includes(slot)
      && slots[slot].length === 0)
    const firstSeenAt = members.map(record => record.firstSeenAt).filter(Boolean).sort().at(0)
    const lastSeenAt = members.map(record => record.lastSeenAt ?? record.firstSeenAt).filter(Boolean).sort().at(-1)
    const previous = previousEvents[id]
    const base = {
      id,
      identity,
      lab: descriptor.lab,
      ...(descriptor.entity === undefined ? {} : { entity: descriptor.entity }),
      contributingLabs: unique(members.map(record => record.lab)),
      title: members[0].title,
      recordIds: members.map(record => record.id).sort(),
      recordDigests: members.map(record => record.contentDigest ?? canonicalDigest(record)).sort(),
      evidence: slots,
      capabilities,
      evaluations,
      licenses,
      missing,
      reproductionLevel: reproductionLevel(slots),
      sourceIds,
      sourceClasses,
      corroboration: {
        sourceCount: sourceIds.length,
        sourceClassCount: sourceClasses.length,
        corroborated: sourceIds.length >= 2,
      },
      firstSeenAt: previous?.firstSeenAt ?? firstSeenAt,
      lastSeenAt,
    }
    const substantiveDigest = canonicalDigest(substantivePayload(base))
    const changed = previous !== undefined && previous.substantiveDigest !== substantiveDigest
    const bundle = {
      ...base,
      version: previous === undefined ? 1 : changed ? (previous.version ?? 1) + 1 : previous.version ?? 1,
      substantiveDigest,
      ...(changed ? { supersedesDigest: previous.substantiveDigest } : previous?.supersedesDigest === undefined ? {} : { supersedesDigest: previous.supersedesDigest }),
    }
    bundle.changes = diffEvidenceBundles(previous, bundle)
    events[id] = bundle
  }
  return events
}

/** Reconcile current bundles while retaining only material predecessor snapshots. */
export function reconcileEvidenceBundles(records, previousEvents = {}, previousHistory = {}, maxHistory = 20) {
  const events = buildEvidenceBundles(records, previousEvents)
  const eventHistory = { ...previousHistory }
  for (const [id, event] of Object.entries(events)) {
    const previous = previousEvents[id]
    if (previous !== undefined && previous.substantiveDigest !== event.substantiveDigest) {
      eventHistory[id] = [...(eventHistory[id] ?? []), previous].slice(-maxHistory)
    }
  }
  return { events, eventHistory }
}

export { SLOT_ORDER }
