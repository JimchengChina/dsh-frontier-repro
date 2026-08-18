# Changelog

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
