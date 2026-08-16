import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEvidenceGraph } from '../lib/graph.js'

function input() {
  return {
    record: {
      id: 'paper-1', sourceId: 'arxiv', sourceClass: 'paper', sourceName: 'arXiv', title: 'Method',
      url: 'https://arxiv.org/abs/2608.00001', contentDigest: 'digest', provenance: { sourceUrl: 'https://export.arxiv.org/api/query' },
      artifacts: [
        { kind: 'code', url: 'https://github.com/lab/repo' },
        { kind: 'model', url: 'https://huggingface.co/lab/model', gated: 'auto' },
      ],
    },
    assessment: {
      id: 'paper-1:behavioral', mode: 'behavioral', status: 'insufficient_evidence', target: 'match output',
      requirements: {
        specification: { state: 'available', evidence: ['https://arxiv.org/abs/2608.00001'], note: 'v1' },
        evaluation: { state: 'unknown', evidence: [], note: '' },
      },
      missingConditions: [{ requirement: 'evaluation', action: 'Define the metric.' }],
    },
    runs: [{ id: 'run-1', mode: 'behavioral', verdict: 'partial', artifacts: ['results.json'], recordedAt: '2026-08-17T00:00:00Z' }],
  }
}

test('evidence graph is deterministic and surfaces spatial blockers', () => {
  const first = buildEvidenceGraph(input())
  const second = buildEvidenceGraph(input())
  assert.equal(first.digest, second.digest)
  assert.deepEqual(first.issues.map(issue => issue.code).sort(), ['gated_artifact', 'requirement_unknown', 'unpinned_code'])
  assert.equal(first.edges.some(edge => edge.relation === 'supported_by'), true)
  assert.equal(first.edges.some(edge => edge.relation === 'produced'), true)
})

test('pinning code removes the unpinned-code blocker', () => {
  const data = input()
  data.record.artifacts[0].revision = 'a'.repeat(40)
  data.record.artifacts[0].immutableUrl = `https://github.com/lab/repo/tree/${'a'.repeat(40)}`
  assert.equal(buildEvidenceGraph(data).issues.some(issue => issue.code === 'unpinned_code'), false)
})
