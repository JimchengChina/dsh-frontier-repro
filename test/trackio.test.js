import assert from 'node:assert/strict'
import test from 'node:test'
import { createTrackioScaffold } from '../lib/trackio.js'

test('Trackio scaffold exports evidence, all attempts, and a local-first importer', () => {
  const scaffold = createTrackioScaffold({
    event: {
      id: 'evt_1', version: 2, substantiveDigest: 'a'.repeat(64),
      evidence: { code: [{ url: 'https://github.com/lab/repo/tree/abc' }] },
    },
    assessments: [{ id: 'assessment-1' }],
    attempts: [{ id: 'attempt-1', verdict: 'failed' }, { id: 'attempt-2', verdict: 'passed' }],
  })
  assert.equal(scaffold.format, 'trackio-logbook-scaffold/v1')
  assert.equal(JSON.parse(scaffold.files['attempts.json']).length, 2)
  assert.match(scaffold.files['trackio_logbook.py'], /trackio\.Artifact/)
  assert.match(scaffold.files['trackio_logbook.py'], /checksum=False/)
  assert.match(scaffold.files['README.md'], /local by default/i)
  assert.equal(scaffold.digest.length, 64)
})
