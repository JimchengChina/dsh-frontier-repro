# dsh-frontier-repro

An evidence-first frontier AI radar and reproduction gate for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

This is not another generic news reader, arXiv search engine, or paper summarizer. It covers the missing path from a curated primary-source signal to an auditable reproduction decision: exact, scaled, behavioral, blocked, or insufficiently evidenced. Executed attempts are recorded separately and a `passed` verdict requires commands, artifacts, measured metrics, and a passing saved rubric.

[中文说明](README.zh-CN.md)

## What is different

Existing DSH plugins already cover literature discovery/full text (`dsh-ai4scholar`, `dsh-literature`), guided paper reading and notes (`dsh-paper-workshop`), general RSS reading (`dsh-news`), scientific-claim adjudication (`dsh-research-plugins`), and replayable experiment execution (`dsh-science-workbench`). This plugin does not duplicate those surfaces. It adds:

- a single timeline across arXiv, first-party lab releases, official model artifacts, verified personal blogs, and opt-in X API timelines;
- explicit identity provenance for person sources;
- explainable ranking rather than an opaque quality label;
- a mode-specific evidence matrix for exact, scaled, and behavioral reproduction;
- a hard separation between “prerequisites documented” and “reproduction executed”;
- run evidence that rejects unsupported success claims.
- Hugging Face paper-to-artifact expansion and immutable GitHub commit evidence;
- serialized, journaled collection batches with guarded LIFO rollback;
- an explicit evidence dependency graph and canonical reproduction handoff manifest.

See [docs/research.md](docs/research.md) for the overlap audit and [docs/architecture.md](docs/architecture.md) for the Cordis spatiotemporal mapping.

Corporate/personnel announcements and personal-life posts are filtered before persistence. Recent Hugging Face model cards are inspected only to discover paper, code, data, and evaluation links; full card text is not archived. arXiv records can also use Hugging Face Paper Pages to find linked public artifacts. GitHub repositories are resolved to the current full commit SHA, while their mutable star count is retained only as context.

## Built-in sources

- arXiv categories `cs.AI`, `cs.CL`, `cs.LG`, `cs.CV`, `cs.RO`, and `cs.SE` through the official Atom API.
- OpenAI News, Anthropic Newsroom and Engineering, Google DeepMind News, DeepSeek API News, and Z.ai model release notes. Z.ai's blog currently has no discoverable first-party index; direct blog links found in model pages remain artifact leads.
- Verified DeepSeek and Z.ai Hugging Face organizations for model artifacts.
- Sam Altman's blog and Jack Clark's Import AI.
- Sam Altman, Dario Amodei, and Demis Hassabis on X, through X API v2 only.

No unverified DeepSeek-founder or GLM-person account is preloaded. Add a custom person source only with a first-party `identityEvidenceUrl`.

## Tools

| Tool | Purpose |
|---|---|
| `frontier_repro_status` | Source, corpus, and credential status without network access |
| `frontier_repro_collect` | Refresh curated sources, persist, dedupe, and rank signals |
| `frontier_repro_search` | Search the local corpus only |
| `frontier_repro_revert_collection` | Safely undo the latest live collection batch |
| `frontier_repro_get` | Full provenance, artifacts, assessment, and run history |
| `frontier_repro_assess` | Evidence gate for exact/scaled/behavioral reproduction |
| `frontier_repro_graph` | Deterministic source/artifact/requirement/run dependency graph |
| `frontier_repro_record_result` | Persist executed commands, artifacts, metrics, deviations, and verdict |
| `frontier_repro_manifest` | Canonical reproduction handoff manifest with SHA-256 integrity |

## Install

Requires Node.js `^22.19` or `>=24` and a DSH `0.1.0-rc.6` compatible release.

```sh
pnpm install
dsh plugin --profile web add /absolute/path/to/dsh-frontier-repro
# or
dsh plugin --profile headless add /absolute/path/to/dsh-frontier-repro
```

Restart the selected profile. The default corpus is `$DSH_HOME/frontier-repro/index.json`.

## X access

Set `X_BEARER_TOKEN` in the launch environment or the DSH credentials store. The token is resolved for every collection and never enters config, the corpus, or tool output. Without X API access, the X sources report their exact missing condition and every other source continues.

No HTML scraping fallback is used.

## Configuration

```yaml
- id: frontier-repro
  config:
    defaultDays: 90
    defaultLimit: 20
    maxRecords: 1000
    maxCollections: 20
    requestTimeoutMs: 20000
    maxResponseBytes: 5242880
    pageConcurrency: 3
    githubEnrichLimit: 8
    githubTokenEnv: GITHUB_TOKEN
    xBearerTokenEnv: X_BEARER_TOKEN
    # storagePath: /absolute/path/index.json
    # sourceFile: /absolute/path/sources.json
    promptGuidance: true
    promptOrder: 145
```

`sourceFile` is trusted local administrator configuration. Tool arguments never accept arbitrary source URLs. Person sources require a name, role, and first-party identity evidence. `GITHUB_TOKEN` is optional and only raises public API limits; X API access remains explicitly required for X sources. See [sources.example.json](sources.example.json) and [docs/source-policy.md](docs/source-policy.md).

## Verification

```sh
pnpm run verify
node scripts/smoke.mjs
pnpm run smoke:plugin
node scripts/smoke.mjs openai-news google-deepmind-news zai-release-notes
```

The tests cover parsing, enrichment, digests, lifecycle serialization, transaction rollback, evidence topology, manifests, rubric grading, storage, and registration/disposal through the real DSH `ToolRuntime`. `smoke.mjs` exercises source adapters directly; `smoke:plugin` runs collection through the real tool runtime. Both perform read-only requests and never call X.

## Limitations

- First-party sites change. Source failures are isolated and reported; successful records still persist.
- OpenAI RSS is fetchable while article pages may block automated clients. The feed record remains usable and a selected page can be verified with DSH's browser/web capability.
- A primary source proves provenance, not correctness. Ranking is discovery priority, not a truth score.
- X requires the user's own API entitlement and budget; the plugin does not bypass access controls.
- Anonymous GitHub API requests have low rate limits. Configure the optional token or reduce `githubEnrichLimit`; a pinning failure is reported and does not erase the source record.
- The gate checks evidence completeness and consistency, not whether every submitted evidence statement is true.
- Manifest integrity is a deterministic content digest, not an identity signature or remote artifact checksum.
- Scheduling is deliberately left to existing DSH schedule/cron plugins.

## License

MIT
