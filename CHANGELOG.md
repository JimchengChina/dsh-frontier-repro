# Changelog

## 0.3.1

- Add a DSH Web **Frontier Repro** plugin-settings card for write-only X API bearer-token configuration and configured/disabled status.
- Print a bilingual installation reminder that X access is optional and identify the in-app configuration path.
- Skip X sources from default collection when no X credential is configured; an explicit X-source request still returns the precise credential blocker.
- Require DeepSeek Harness rc.7 for the external plugin-settings extension and test against the matching rc.7 runtime packages.
- Add a focused project identity, direct release installation path, and clearer evidence-to-reproduction value proposition.

## 0.3.0

- Cluster lab-scoped model releases into versioned Frontier Release Evidence Bundles spanning official posts, system cards/papers, code, models, datasets, evaluations, and verified person signals.
- Add corroboration, missing-evidence slots, reproduction-level candidates, capability/evaluation/license diffs, and `firstSeenAt` / `lastSeenAt` / `supersedesDigest` version chains.
- Add substantive-digest watchlists with explicit acknowledgement and rollback dependency protection.
- Add a GitHub organization adapter for public repositories, Releases, Tags, pinned commits, licenses, and release-asset digests; include the official DeepSeek organization.
- Add claim-level `execute_existing`, `partial_reimplementation`, and `from_scratch_replication` assessments at exact/scaled/toy equivalence.
- Preserve up to 50 attempts per target with claim results, verifier evidence, GPU/CPU/VRAM/time/cost/data-scale/job metadata, failures, blockers, and negative results.
- Enforce that a toy pass remains `toy_only`; exact/scaled success requires every required claim metric and a passing identified verifier.
- Export a file-only, local-first Hugging Face Trackio logbook scaffold containing the frozen bundle, assessments, and all attempts.
- Migrate v1/v2 stores to schema v3 while retaining existing record assessments and runs.

## 0.2.1

- Add Anthropic Research, Kimi Blog, MiniMax Research, DeepSeek Transparency, NVIDIA Technical Blog, AMD ROCm Blog, Intel AI News, and verified Moonshot/MiniMax Hugging Face model sources.
- Enforce per-source category allow/deny rules, required publication dates, excluded paths, and boilerplate-title rejection before persistence.
- Track persistent source health: last success, newest accepted item, volume drift, structure fingerprint changes, consecutive failures, staleness, and last error.
- Preserve arXiv versioned identities and URLs while retaining stable paper ids for deduplication.
- Pin Hugging Face models and datasets to full repository SHAs, including linked artifacts discovered through papers and official pages.
- Fix Sam Altman feed placeholder titles, DeepSeek API News fallback pages, Kimi generic child-page titles, and deterministic date-only parsing.

## 0.2.0

- Enrich arXiv records through Hugging Face Paper Pages with linked public models, datasets, Spaces, project pages, and repositories.
- Resolve GitHub code artifacts to immutable default-branch commits and retain license/archive metadata.
- Add explicit source capability declarations and structured credential blockers.
- Serialize collection lifecycles, journal atomic batches, and support guarded LIFO rollback.
- Add deterministic record/catalog digests and a source-record-artifact-requirement-run evidence graph.
- Require measurable weighted rubrics before readiness and before accepting a passed run.
- Export canonical reproduction handoff manifests with materials, products, byproducts, and SHA-256 integrity.
- Document the Cordis spatiotemporal design mapping and related open-source patterns.

## 0.1.0

- Add curated arXiv, lab, official artifact, person blog, and opt-in X sources.
- Add explainable ranking and bounded persistent corpus.
- Add exact/scaled/behavioral readiness gates and missing-condition actions.
- Add executed-run evidence with unsupported-success rejection.
- Add DSH ToolRuntime integration tests and official-source smoke test.
