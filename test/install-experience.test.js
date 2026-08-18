import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import test from 'node:test'

const run = promisify(execFile)

test('package exposes a DSH Web settings client', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings-plugins'))
})

test('install reminder says X is optional and disabled by default', async () => {
  const { stdout } = await run(process.execPath, [new URL('../scripts/postinstall.mjs', import.meta.url).pathname])
  assert.match(stdout, /X API access is optional/)
  assert.match(stdout, /X sources stay disabled/)
  assert.match(stdout, /设置 > 插件 > 插件配置 > Frontier Repro/)
})
