import assert from 'node:assert/strict'
import test from 'node:test'
import { parseArxiv, parseFeed, parseIndexLinks, parseOfficialPage, parseSitemap } from '../lib/parse.js'

test('RSS parsing preserves provenance fields and discovers artifact links', () => {
  const source = { url: 'https://lab.example/feed.xml', maxItems: 5 }
  const items = parseFeed(`<?xml version="1.0"?><rss version="2.0"><channel><item>
    <title>Open model release</title><link>https://lab.example/news/model</link>
    <description><![CDATA[Weights at <a href="https://huggingface.co/lab/model">HF</a>]]></description>
    <pubDate>Fri, 14 Aug 2026 10:00:00 GMT</pubDate><category>Research</category>
  </item></channel></rss>`, source)
  assert.equal(items.length, 1)
  assert.equal(items[0].title, 'Open model release')
  assert.equal(items[0].publishedAt, '2026-08-14T10:00:00.000Z')
  assert.deepEqual(items[0].categories, ['Research'])
  assert.deepEqual(items[0].discoveredLinks, ['https://huggingface.co/lab/model'])
})

test('arXiv parsing strips version suffix for stable identity', () => {
  const source = { maxItems: 5 }
  const items = parseArxiv(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><id>https://arxiv.org/abs/2608.12345v2</id><title>A Method</title>
    <published>2026-08-10T00:00:00Z</published><updated>2026-08-11T00:00:00Z</updated>
    <summary>Method details.</summary><author><name>A. Researcher</name></author>
    <category term="cs.AI"/><link href="https://arxiv.org/abs/2608.12345v2" rel="alternate"/>
    <link href="https://arxiv.org/pdf/2608.12345v2" type="application/pdf"/>
    </entry></feed>`, source)
  assert.equal(items[0].arxivId, '2608.12345')
  assert.deepEqual(items[0].authors, ['A. Researcher'])
  assert.deepEqual(items[0].categories, ['cs.AI'])
})

test('official page, index, and sitemap parsers remain first-party scoped', () => {
  const source = {
    url: 'https://lab.example/news',
    includePaths: ['/news/'],
    maxItems: 5,
  }
  const page = parseOfficialPage(`<!doctype html><html><head>
    <meta property="og:title" content="Agent release"><meta name="description" content="Technical details">
    <meta property="article:published_time" content="2026-08-01T12:00:00Z"></head>
    <body><a href="https://github.com/lab/agent">Code</a></body></html>`, 'https://lab.example/news/agent')
  assert.equal(page.title, 'Agent release')
  assert.equal(page.publishedAt, '2026-08-01T12:00:00.000Z')
  assert.deepEqual(page.discoveredLinks, ['https://github.com/lab/agent'])

  const links = parseIndexLinks('<a href="/news/new">New</a><a href="https://evil.example/news/x">Offsite</a>', source)
  assert.deepEqual(links, ['https://lab.example/news/new'])

  const sitemap = parseSitemap(`<?xml version="1.0"?><urlset>
    <url><loc>https://lab.example/about</loc><lastmod>2026-08-15</lastmod></url>
    <url><loc>https://lab.example/news/old</loc><lastmod>2026-07-01</lastmod></url>
    <url><loc>https://lab.example/news/new</loc><lastmod>2026-08-01</lastmod></url>
  </urlset>`, source)
  assert.deepEqual(sitemap.map(item => item.url), ['https://lab.example/news/new', 'https://lab.example/news/old'])
})
