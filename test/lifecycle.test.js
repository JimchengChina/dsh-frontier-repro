import assert from 'node:assert/strict'
import test from 'node:test'
import { CollectionCoordinator } from '../lib/lifecycle.js'

test('collection lifecycle serializes transitions and exposes queued work', async () => {
  let timestamp = Date.parse('2026-08-17T00:00:00Z')
  const coordinator = new CollectionCoordinator(() => timestamp++)
  const events = []
  let releaseFirst
  const firstGate = new Promise(resolve => { releaseFirst = resolve })
  const first = coordinator.run({ query: 'first' }, async () => {
    events.push('first:start')
    await firstGate
    events.push('first:end')
    return { value: 1 }
  })
  const second = coordinator.run({ query: 'second' }, async () => {
    events.push('second:start')
    events.push('second:end')
    return { value: 2 }
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(coordinator.snapshot().phase, 'collecting')
  assert.equal(coordinator.snapshot().queued, 1)
  releaseFirst()
  const [one, two] = await Promise.all([first, second])
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end'])
  assert.equal(one.lifecycle.outcome, 'committed')
  assert.equal(two.value, 2)
  assert.equal(coordinator.snapshot().phase, 'idle')
  assert.equal(coordinator.snapshot().last.input.query, 'second')
})

test('failed transitions restore idle state before the next transition', async () => {
  const coordinator = new CollectionCoordinator()
  await assert.rejects(coordinator.run({}, async () => { throw new Error('network down') }), /network down/)
  assert.equal(coordinator.snapshot().phase, 'idle')
  assert.equal(coordinator.snapshot().last.outcome, 'failed')
  const recovered = await coordinator.run({}, async () => ({ ok: true }))
  assert.equal(recovered.ok, true)
})
