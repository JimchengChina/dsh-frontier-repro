import { load } from 'cheerio'

function textOf(node) {
  return node.text().replace(/\s+/g, ' ').trim()
}

function firstNonEmpty(...values) {
  return values.find(value => typeof value === 'string' && value.trim() !== '')?.trim()
}

export function plainText(html, maxChars = 2_000) {
  if (typeof html !== 'string' || html === '') return ''
  const $ = load(`<main>${html}</main>`)
  $('script,style,noscript,svg').remove()
  return textOf($('main')).slice(0, maxChars)
}

export function validIsoDate(input) {
  if (typeof input !== 'string' || input.trim() === '') return undefined
  const millis = Date.parse(input)
  return Number.isFinite(millis) ? new Date(millis).toISOString() : undefined
}

export function extractLinks(html, baseUrl) {
  if (typeof html !== 'string' || html === '') return []
  const $ = load(`<main>${html}</main>`)
  const urls = new Set()
  $('a[href]').each((_index, element) => {
    try {
      const url = new URL($(element).attr('href'), baseUrl)
      if (url.protocol === 'https:') urls.add(url.href)
    } catch {
      // Malformed author-provided links are ignored; the source record remains usable.
    }
  })
  return [...urls]
}

function childText($, element, selector) {
  return textOf($(element).children(selector).first())
}

/** Parse an RSS or Atom document into source-neutral items. */
export function parseFeed(xml, source) {
  const $ = load(xml, { xmlMode: true })
  const atomEntries = $('feed > entry').toArray()
  const nodes = atomEntries.length > 0 ? atomEntries : $('channel > item').toArray()
  return nodes.slice(0, source.maxItems).map((element) => {
    const node = $(element)
    const isAtom = atomEntries.length > 0
    const link = isAtom
      ? firstNonEmpty(node.children('link[rel="alternate"]').attr('href'), node.children('link').first().attr('href'))
      : firstNonEmpty(childText($, element, 'link'), childText($, element, 'guid'))
    const content = firstNonEmpty(
      childText($, element, 'content\\:encoded'),
      childText($, element, 'content'),
      childText($, element, 'summary'),
      childText($, element, 'description'),
    ) ?? ''
    const authors = node.children('author').toArray()
      .map(author => firstNonEmpty(childText($, author, 'name'), textOf($(author))))
      .filter(Boolean)
    const dcCreator = childText($, element, 'dc\\:creator')
    if (authors.length === 0 && dcCreator !== '') authors.push(dcCreator)
    const categories = node.children('category').toArray()
      .map(category => firstNonEmpty($(category).attr('term'), textOf($(category))))
      .filter(Boolean)
    return {
      title: childText($, element, 'title'),
      url: link,
      publishedAt: validIsoDate(firstNonEmpty(
        childText($, element, 'published'),
        childText($, element, 'pubDate'),
        childText($, element, 'updated'),
      )),
      updatedAt: validIsoDate(childText($, element, 'updated')),
      summary: plainText(content),
      authors,
      categories,
      discoveredLinks: extractLinks(content, link ?? source.url),
    }
  }).filter(item => item.title !== '' && item.url !== undefined)
}

/** Parse arXiv Atom output and retain paper-specific identifiers and links. */
export function parseArxiv(xml, source) {
  const $ = load(xml, { xmlMode: true })
  return $('feed > entry').toArray().slice(0, source.maxItems).map((element) => {
    const node = $(element)
    const idUrl = childText($, element, 'id')
    const alternate = node.children('link[rel="alternate"]').attr('href') ?? idUrl
    const pdf = node.children('link[type="application/pdf"]').attr('href')
    const arxivId = /\/abs\/([^?#]+)/.exec(alternate)?.[1]?.replace(/v\d+$/, '')
    return {
      title: childText($, element, 'title'),
      url: alternate,
      publishedAt: validIsoDate(childText($, element, 'published')),
      updatedAt: validIsoDate(childText($, element, 'updated')),
      summary: childText($, element, 'summary').slice(0, 4_000),
      authors: node.children('author').toArray().map(author => childText($, author, 'name')).filter(Boolean),
      categories: node.children('category').toArray().map(category => $(category).attr('term')).filter(Boolean),
      arxivId,
      discoveredLinks: [alternate, pdf].filter(Boolean),
    }
  }).filter(item => item.title !== '' && item.url !== undefined)
}

/** Parse an official page and collect its published metadata and outbound artifact links. */
export function parseOfficialPage(html, url) {
  const $ = load(html)
  const meta = (selector, attr = 'content') => $(selector).first().attr(attr)?.trim()
  let jsonLd = {}
  $('script[type="application/ld+json"]').each((_index, element) => {
    try {
      const candidate = JSON.parse($(element).text())
      const values = Array.isArray(candidate) ? candidate : [candidate]
      const article = values.find(value => value && typeof value === 'object'
        && ['Article', 'NewsArticle', 'BlogPosting', 'TechArticle'].includes(value['@type']))
      if (article !== undefined) jsonLd = article
    } catch {
      // Sites sometimes ship multiple or invalid JSON-LD blocks; HTML metadata still works.
    }
  })
  const title = firstNonEmpty(
    meta('meta[property="og:title"]'),
    typeof jsonLd.headline === 'string' ? jsonLd.headline : undefined,
    textOf($('h1').first()),
    textOf($('title').first()),
  )
  const summary = firstNonEmpty(
    meta('meta[property="og:description"]'),
    meta('meta[name="description"]'),
    typeof jsonLd.description === 'string' ? jsonLd.description : undefined,
    textOf($('main p').first()),
  ) ?? ''
  const authorValue = jsonLd.author
  const jsonAuthors = Array.isArray(authorValue) ? authorValue : authorValue === undefined ? [] : [authorValue]
  const authors = jsonAuthors.map(author => typeof author === 'string' ? author : author?.name).filter(Boolean)
  const metaAuthor = meta('meta[name="author"]')
  if (authors.length === 0 && metaAuthor !== undefined) authors.push(metaAuthor)
  const publishedAt = validIsoDate(firstNonEmpty(
    meta('meta[property="article:published_time"]'),
    typeof jsonLd.datePublished === 'string' ? jsonLd.datePublished : undefined,
    $('time[datetime]').first().attr('datetime'),
  ))
  return {
    title,
    url,
    publishedAt,
    updatedAt: validIsoDate(firstNonEmpty(
      meta('meta[property="article:modified_time"]'),
      typeof jsonLd.dateModified === 'string' ? jsonLd.dateModified : undefined,
    )),
    summary: plainText(summary),
    authors,
    categories: [],
    discoveredLinks: extractLinks(html, url),
  }
}

/** Collect matching first-party article URLs from a lab index page. */
export function parseIndexLinks(html, source) {
  const $ = load(html)
  const result = []
  const seen = new Set()
  $('a[href]').each((_index, element) => {
    if (result.length >= source.maxItems) return
    try {
      const url = new URL($(element).attr('href'), source.url)
      const allowed = url.origin === new URL(source.url).origin
        && source.includePaths.some(prefix => url.pathname.startsWith(prefix))
      url.search = ''
      url.hash = ''
      if (allowed && !seen.has(url.href)) {
        seen.add(url.href)
        result.push(url.href)
      }
    } catch {
      // Ignore non-URL anchors.
    }
  })
  return result
}

/** Parse matching URLs and last-modified values from a sitemap. */
export function parseSitemap(xml, source) {
  const $ = load(xml, { xmlMode: true })
  const entries = $('url').toArray().map((element) => ({
    url: childText($, element, 'loc'),
    modifiedAt: validIsoDate(childText($, element, 'lastmod')),
  })).filter(entry => {
    try {
      const url = new URL(entry.url)
      return source.includePaths.some(prefix => url.pathname.startsWith(prefix))
    } catch {
      return false
    }
  })
  if (source.sortByPathDate) {
    const pathDate = (entry) => /(?:^|\D)(\d{6})(?:\D|$)/.exec(new URL(entry.url).pathname)?.[1] ?? ''
    entries.sort((left, right) => pathDate(right).localeCompare(pathDate(left))
      || (right.modifiedAt ?? '').localeCompare(left.modifiedAt ?? ''))
  } else {
    entries.sort((left, right) => (right.modifiedAt ?? '').localeCompare(left.modifiedAt ?? ''))
  }
  return entries.slice(0, source.maxItems)
}

/** Normalize the Hugging Face public models API. */
export function parseHuggingFaceModels(json, source) {
  if (!Array.isArray(json)) throw new TypeError('Hugging Face models response must be an array')
  return json.slice(0, source.maxItems).map(model => ({
    title: model.id,
    url: `https://huggingface.co/${model.id}`,
    publishedAt: validIsoDate(model.createdAt),
    updatedAt: validIsoDate(model.lastModified),
    summary: [model.pipeline_tag, ...(Array.isArray(model.tags) ? model.tags : [])].filter(Boolean).join(' · ').slice(0, 2_000),
    authors: [source.organization],
    categories: Array.isArray(model.tags) ? model.tags.slice(0, 20) : [],
    discoveredLinks: [`https://huggingface.co/${model.id}`],
  })).filter(item => item.title !== 'undefined')
}

/** Normalize X API v2 user timeline output. */
export function parseXPosts(json, source) {
  if (!Array.isArray(json?.data)) return []
  return json.data.slice(0, source.maxItems).map(post => ({
    title: `${source.person}: ${String(post.text ?? '').replace(/\s+/g, ' ').slice(0, 120)}`,
    url: `https://x.com/${source.username}/status/${post.id}`,
    publishedAt: validIsoDate(post.created_at),
    summary: String(post.text ?? '').slice(0, 2_000),
    authors: [source.person],
    categories: ['X'],
    discoveredLinks: Array.isArray(post.entities?.urls)
      ? post.entities.urls.map(url => url.expanded_url).filter(value => typeof value === 'string')
      : [],
  })).filter(item => item.url.endsWith('/undefined') === false)
}
