<p align="center">
  <img src="docs/assets/frontier-repro-hero.png" alt="Frontier Repro turns primary AI signals into versioned evidence bundles and verified reproduction decisions" width="100%">
</p>

<h1 align="center">dsh-frontier-repro</h1>

<p align="center"><strong>Primary signals in. Auditable reproduction out.</strong></p>

<p align="center">
  <a href="https://github.com/JimchengChina/dsh-frontier-repro/stargazers"><img src="https://img.shields.io/github/stars/JimchengChina/dsh-frontier-repro?style=flat-square&logo=github&label=Stars" alt="GitHub stars"></a>
  <a href="https://github.com/JimchengChina/dsh-frontier-repro/releases/latest"><img src="https://img.shields.io/github/v/release/JimchengChina/dsh-frontier-repro?style=flat-square&label=Release" alt="Latest release"></a>
  <a href="https://github.com/JimchengChina/dsh-frontier-repro/releases"><img src="https://img.shields.io/github/downloads/JimchengChina/dsh-frontier-repro/total?style=flat-square&label=Downloads" alt="Release downloads"></a>
  <a href="https://github.com/awesome-dsh-plugin/awesome-dsh-plugin#workflow"><img src="https://img.shields.io/badge/Awesome_DSH-Workflow-6f5cff?style=flat-square" alt="Listed in Awesome DSH"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-f2a65a?style=flat-square" alt="MIT license"></a>
</p>

<p align="center">
  <a href="README.zh-CN.md">中文</a> ·
  <a href="https://github.com/JimchengChina/dsh-frontier-repro/releases/latest">Download</a> ·
  <a href="https://github.com/JimchengChina/dsh-frontier-repro/stargazers">Star the project</a>
</p>

An evidence-first frontier AI radar and reproduction gate for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

This is not another generic news reader, arXiv search engine, or paper summarizer. It covers the missing path from a curated primary-source signal to a versioned release evidence bundle and then to an auditable reproduction decision. Executed attempts are retained—including failures and negative results—and a successful exact/scaled claim requires commands, artifacts, measured claim results, and independent verifier evidence.

| Discover what matters | Build evidence, not hype | Reproduce without overclaiming |
|---|---|---|
| Curated arXiv, first-party lab, GitHub, Hugging Face, hardware-vendor, verified blog, and optional X signals. | Cross-source release bundles retain immutable revisions, provenance, missing evidence, and substantive change history. | Claim-level protocols preserve commands, artifacts, metrics, resources, verifiers, failures, and negative results. |

> [!TIP]
> If this makes a frontier release easier to trust or reproduce, [give the repository a star](https://github.com/JimchengChina/dsh-frontier-repro/stargazers). It helps more DSH users find the project.

## What is different

Existing DSH plugins already cover literature discovery/full text (`dsh-ai4scholar`, `dsh-literature`), guided paper reading and notes (`dsh-paper-workshop`), general RSS reading (`dsh-news`), scientific-claim adjudication (`dsh-research-plugins`), and replayable experiment execution (`dsh-science-workbench`). This plugin does not duplicate those surfaces. It adds:

- a single timeline across arXiv, first-party lab releases, official model artifacts, verified personal blogs, and opt-in X API timelines;
- explicit identity provenance for person sources;
- explainable ranking rather than an opaque quality label;
- a mode-specific evidence matrix for exact, scaled, and behavioral reproduction;
- a hard separation between “prerequisites documented” and “reproduction executed”;
- run evidence that rejects unsupported success claims.
- Hugging Face paper-to-artifact expansion and immutable GitHub commit evidence;
- immutable arXiv versions and Hugging Face model/dataset repository SHAs;
- persistent source health with volume, structure, failure-streak, and staleness alerts;
- conservative lab-scoped clustering into Frontier Release Evidence Bundles, with corroboration and explicit missing evidence;
- capability/evaluation/license diffs, `firstSeenAt` / `lastSeenAt` / `supersedesDigest` version chains, and substantive-only watchlists;
- a first-party GitHub organization adapter for new repositories, releases, tags, immutable commits, and release-asset digests;
- claim-level `execute_existing`, `partial_reimplementation`, and `from_scratch_replication` protocols;
- preserved multi-attempt resource records (GPU/CPU/VRAM/time/cost/data scale/job URL) and mandatory verifiers for success;
- a file-only Hugging Face Trackio logbook scaffold instead of a duplicate experiment UI;
- serialized, journaled collection batches with guarded LIFO rollback;
- an explicit evidence dependency graph and canonical reproduction handoff manifest.

See [docs/research.md](docs/research.md) for the overlap audit and [docs/architecture.md](docs/architecture.md) for the Cordis spatiotemporal mapping.

Corporate/personnel announcements, placeholder titles, missing-date records from date-contracted sources, and personal-life posts are filtered before persistence. Sources may declare category allow/deny lists and known boilerplate titles. Recent Hugging Face model cards are inspected only to discover paper, code, data, and evaluation links; full card text is not archived. arXiv records retain both a stable paper id and the observed immutable `vN`. GitHub repositories and public Hugging Face models/datasets are resolved to full SHAs, while mutable popularity counts remain context only.

## Built-in sources

- arXiv categories `cs.AI`, `cs.CL`, `cs.LG`, `cs.CV`, `cs.RO`, and `cs.SE` through the official Atom API.
- OpenAI News; Anthropic Newsroom, Research, and Engineering; Google DeepMind News; MiniMax Research; Kimi Blog; DeepSeek API News and Transparency; and Z.ai model release notes.
- NVIDIA Technical Blog, AMD ROCm Blog, and the filtered Intel Artificial Intelligence News feed for training, inference, accelerator, compiler, and benchmark signals.
- Verified DeepSeek, Moonshot AI, MiniMax, and Z.ai Hugging Face organizations for model artifacts, plus the official DeepSeek GitHub organization for repository/release/tag changes.
- Sam Altman's blog and Jack Clark's Import AI.
- Sam Altman, Dario Amodei, and Demis Hassabis on X, through X API v2 only.

No unverified DeepSeek-founder or GLM-person account is preloaded. Add a custom person source only with a first-party `identityEvidenceUrl`.

## Tools

| Tool | Purpose |
|---|---|
| `frontier_repro_status` | Source, corpus, credential, and persisted source-health status without network access |
| `frontier_repro_collect` | Refresh curated sources, persist, dedupe, and rank signals |
| `frontier_repro_events` | List versioned cross-source release evidence bundles and substantive watch changes |
| `frontier_repro_bundle` | Inspect one bundle, predecessor chain, source records, claims, and all attempts |
| `frontier_repro_watch` | Add/remove/acknowledge release watches by substantive digest |
| `frontier_repro_search` | Search the local corpus only |
| `frontier_repro_revert_collection` | Safely undo the latest live collection batch |
| `frontier_repro_get` | Full provenance, artifacts, assessment, and run history |
| `frontier_repro_assess` | Evidence gate for exact/scaled/behavioral reproduction |
| `frontier_repro_assess_claims` | Claim-level gate for execute/partial/from-scratch modes and exact/scaled/toy equivalence |
| `frontier_repro_graph` | Deterministic source/artifact/requirement/run dependency graph |
| `frontier_repro_record_result` | Persist executed commands, artifacts, metrics, deviations, and verdict |
| `frontier_repro_record_attempt` | Preserve one claim-level attempt, resources, verifier, and honest outcome |
| `frontier_repro_manifest` | Canonical reproduction handoff manifest with SHA-256 integrity |
| `frontier_repro_trackio_scaffold` | Export a local-first Trackio logbook scaffold without executing or publishing |

## Install

Requires Node.js `^22.19` or `>=24` and DeepSeek Harness `0.1.0-rc.7` or newer within the `0.1.x` line. The in-app X credential card uses the plugin-settings extension introduced in rc.7.

```sh
dsh plugin --profile web add "https://github.com/JimchengChina/dsh-frontier-repro/releases/latest/download/dsh-frontier-repro.tgz"
```

For source development, clone the repository, run `pnpm install`, and add its absolute path instead. Headless profiles can install the same release with `--profile headless`.

Restart the selected profile. The default corpus is `$DSH_HOME/frontier-repro/index.json`.

During installation, the plugin reminds you that X API access is optional. In DSH Web, open **Settings → Plugins → Plugin configuration → Frontier Repro** to save an X API bearer token. If you do not configure one, X sources are disabled and skipped by default; arXiv, official lab blogs, GitHub, Hugging Face, and all other sources continue normally.

Tagged releases attach a verified package tarball and SHA-256 file. Storefronts can use `https://github.com/JimchengChina/dsh-frontier-repro/releases/latest/download/dsh-frontier-repro.tgz` without running a source build.

## X access

Use **Settings → Plugins → Plugin configuration → Frontier Repro** in DSH Web, set `X_BEARER_TOKEN` in the launch environment, or write the same reference through the DSH credentials store. The token is resolved for every collection and never enters config, the corpus, or tool output. Without X API access, default collection skips X sources and every other source continues. Explicitly requesting an X source still returns its exact missing condition.

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
    huggingFaceEnrichLimit: 20
    githubTokenEnv: GITHUB_TOKEN
    xBearerTokenEnv: X_BEARER_TOKEN
    # storagePath: /absolute/path/index.json
    # sourceFile: /absolute/path/sources.json
    promptGuidance: true
    promptOrder: 145
```

`sourceFile` is trusted local administrator configuration. Tool arguments never accept arbitrary source URLs. Custom sources may declare `allowCategories`, `denyCategories`, `requirePublishedAt`, `boilerplateTitles`, and `healthStaleAfterDays`. A `github_org` source declares an organization plus bounded `releaseRepoLimit` / `releasesPerRepo`; person sources require a name, role, and first-party identity evidence. `GITHUB_TOKEN` is optional and only raises public API limits; X API access remains explicitly required for X sources. See [sources.example.json](sources.example.json) and [docs/source-policy.md](docs/source-policy.md).

## P1 workflow: release bundle to verified attempt

1. Collect first-party signals, then select a release with `frontier_repro_events` / `frontier_repro_bundle`.
2. Watch it. Later collections set `changed_since_watch` only when capability claims, evaluation evidence, licenses, or immutable artifacts changed; acknowledge after review.
3. Define independently testable claims with primary evidence and choose `execute_existing`, `partial_reimplementation`, or `from_scratch_replication`, plus `exact`, `scaled`, or `toy` equivalence.
4. Record every attempt. `passed` requires all required claim metrics and a passing verifier with identity/evidence. A toy pass is always stored as `toy_only`, never `reproduced`.
5. Export the Trackio scaffold to visualize the preserved attempts locally or, only when intended, in a Hugging Face Space. The scaffold does not execute the experiment or change verdicts.

## Verification

```sh
pnpm run verify
node scripts/smoke.mjs
pnpm run smoke:plugin
node scripts/smoke.mjs openai-news google-deepmind-news zai-release-notes
```

The tests cover parsing, enrichment, event clustering/versioning, GitHub organization releases, watch rollback safety, claim grading, multi-attempt/verifier enforcement, Trackio export, digests, lifecycle serialization, transaction rollback, evidence topology, manifests, storage, and registration/disposal through the real DSH `ToolRuntime`. `smoke.mjs` exercises source adapters directly; `smoke:plugin` runs collection through the real tool runtime. Both perform read-only requests and never call X.

## Limitations

- First-party sites change. Source failures are isolated and reported; successful records still persist.
- Source-health alerts indicate collection drift or staleness, not that an upstream publication is false or abandoned.
- OpenAI RSS is fetchable while article pages may block automated clients. The feed record remains usable and a selected page can be verified with DSH's browser/web capability.
- A primary source proves provenance, not correctness. Ranking is discovery priority, not a truth score.
- X requires the user's own API entitlement and budget; the plugin does not bypass access controls.
- Anonymous GitHub API requests have low rate limits. Configure the optional token or reduce `githubEnrichLimit`; Hugging Face pinning can be bounded with `huggingFaceEnrichLimit`. A pinning failure is reported and does not erase the source record.
- Release clustering is deliberately conservative and lab-scoped. Unrecognized model names remain one-record bundles rather than being merged by vague semantic similarity.
- A Trackio scaffold is an export. The plugin does not install Python packages, run jobs, upload to Spaces, or treat dashboard logging as verification.
- The gate checks evidence completeness and consistency, not whether every submitted evidence statement is true.
- Manifest integrity is a deterministic content digest, not an identity signature or remote artifact checksum.
- Scheduling is deliberately left to existing DSH schedule/cron plugins.

## License

MIT
