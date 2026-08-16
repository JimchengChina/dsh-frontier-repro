import { isIP } from 'node:net'
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici'

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain'])
const ENV_PROXY_DISPATCHER = new EnvHttpProxyAgent()

function defaultFetch(input, init) {
  return undiciFetch(input, { ...init, dispatcher: ENV_PROXY_DISPATCHER })
}

function isPrivateIp(hostname) {
  if (isIP(hostname) === 4) {
    const parts = hostname.split('.').map(Number)
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
  }
  if (isIP(hostname) === 6) {
    const lower = hostname.toLowerCase()
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')
  }
  return false
}

/** Reject non-public or non-HTTPS fetch targets. */
export function assertPublicHttps(input) {
  const url = new URL(input)
  if (url.protocol !== 'https:') throw new TypeError(`only HTTPS sources are allowed: ${url.href}`)
  if (BLOCKED_HOSTS.has(url.hostname.toLowerCase()) || isPrivateIp(url.hostname)) {
    throw new TypeError(`private-network source is not allowed: ${url.hostname}`)
  }
  if (url.username !== '' || url.password !== '') throw new TypeError('embedded URL credentials are not allowed')
  return url
}

async function readBoundedBody(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`response declares ${declared} bytes; limit is ${maxBytes}`)
  }
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > maxBytes) {
      await reader.cancel('response too large')
      throw new Error(`response exceeded ${maxBytes} bytes`)
    }
    result += decoder.decode(value, { stream: true })
  }
  return result + decoder.decode()
}

/** Fetch one bounded public HTTPS document with redirect re-validation. */
export async function fetchText(input, options = {}) {
  const start = assertPublicHttps(input)
  const timeoutMs = options.timeoutMs ?? 20_000
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024
  const maxRedirects = options.maxRedirects ?? 4
  const fetchImpl = options.fetchImpl ?? defaultFetch
  let current = start
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await fetchImpl(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: options.accept ?? 'application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.9, application/json;q=0.8',
        'user-agent': options.userAgent ?? 'dsh-frontier-repro/0.1',
        ...options.headers,
      },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (location === null) throw new Error(`redirect ${response.status} omitted Location`)
      current = assertPublicHttps(new URL(location, current).href)
      continue
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    return {
      body: await readBoundedBody(response, maxBytes),
      contentType: response.headers.get('content-type') ?? '',
      url: current.href,
    }
  }
  throw new Error(`too many redirects (limit ${maxRedirects})`)
}
