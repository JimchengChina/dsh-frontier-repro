# Spatiotemporal architecture

This plugin treats a frontier-research workflow as a dynamically composed system, not as a one-shot feed reader. The design is informed by [A Programming Paradigm for Spatiotemporal Composability](https://github.com/cordiverse/paper), while keeping the plugin inside DeepSeek Harness's existing Cordis lifecycle.

## Paper-to-plugin mapping

| Paper concept | Plugin interpretation | Observable invariant |
|---|---|---|
| Revertible effect | A committed collection batch carries the bounded inverse needed to undo its record changes. | Reverting the latest live batch restores the previous corpus values without touching assessments or runs for unrelated records. |
| LIFO recovery | Collection batches may only be reverted while no newer live batch depends on their state. | Reversion is deterministic and never rewinds through a later commit. |
| Reactive coeffect | Each source declares the network or credential capabilities it needs. | Status reports missing capabilities before collection; one missing source capability does not deactivate independent sources. |
| Fiber target and inertia | Collection has an explicit idle/collecting transition and does not interleave two mutation lifecycles. | Concurrent calls are serialized and each committed batch has one start/end state. |
| Committed view | A reproduction manifest freezes the record, artifacts, assessment, and rubric it was built from. | The manifest has a canonical SHA-256 digest and is unaffected by later collection. |
| Declarative reconciliation | Stable source ids and a catalog digest identify the desired source configuration. | A status or batch can state exactly which catalog version produced it. |
| Temporal observation | Source health carries the latest successful observation plus drift/failure history across collection fibers. | Status can distinguish a quiet source from a broken or structurally changed adapter without fetching the network. |
| Dependency topology | Evidence is exposed as a graph of source, record, artifact, requirement, and run nodes. | Missing or unpinned dependencies are visible instead of hidden in prose. |
| Spatial release composition | Lab posts, papers, code, models, datasets, evaluations, and person signals occupy named evidence slots in one release bundle. | A bundle exposes corroboration and missing slots without erasing the underlying records. |
| Temporal version composition | A material capability/evaluation/license/artifact change advances the bundle version and links it with `supersedesDigest`. | Re-observation timestamps alone never create a new release version or watch alert. |
| Reactive watch coeffect | A watch stores the last acknowledged substantive digest, not an independent polling scheduler. | `changed_since_watch` is deterministic from the committed corpus and acknowledgement baseline. |
| Append-only experiment observation | Claim assessments and attempts are bounded histories; failures and negative results are not overwritten by later success. | A toy result remains `toy_only`, while `reproduced` requires exact/scaled equivalence and passing verifier evidence. |

The paper also identifies a system boundary: an inverse supplied by a component is an obligation that the runtime cannot prove. The plugin therefore makes only its own JSON corpus mutations revertible. Network requests, upstream posts, downloaded model weights, arbitrary shell commands, and external experiment trackers remain outside that boundary. A collection cannot be reverted when an affected record/bundle has a watch, assessment, run, or attempt, because doing so would orphan temporal dependents.

## Open-source practice incorporated

- [Hugging Face Paper Pages](https://huggingface.co/docs/hub/en/paper-pages) link an arXiv id to models, datasets, Spaces, a project page, and a GitHub repository. The plugin uses this relation as discovery metadata, retaining the original arXiv record as the primary specification.
- [OpenAI PaperBench](https://github.com/openai/frontier-evals/tree/main/project/paperbench) separates agent development, fresh-environment reproduction, and rubric grading. The plugin mirrors that separation: readiness, execution evidence, and criterion grading are distinct states.
- [DVC](https://github.com/iterative/dvc) compares code, data, parameters, metrics, and artifacts across experiments. Frontier Repro does not run DVC; it exports a small immutable manifest that can be handed to DVC or a science workbench.
- [MLflow](https://github.com/mlflow/mlflow) tracks parameters, metrics, artifacts, and evaluations. This plugin stores only a bounded evidence index and links; it remains complementary to a full experiment tracker.
- [Hugging Face Trackio](https://huggingface.co/docs/trackio/index) is local-first and supports grouped runs plus versioned artifacts/references. The plugin exports a scaffold containing all attempts instead of implementing another tracker or automatically publishing data.
- [RO-Crate](https://github.com/ResearchObject/ro-crate) describes research objects and their context as linked metadata. The plugin's evidence graph follows the same portability goal without claiming full RO-Crate conformance.
- [in-toto](https://github.com/in-toto/docs/blob/master/in-toto-spec.md) distinguishes materials, products, byproducts, commands, and environment metadata. Reproduction manifests use those names where their semantics match, but are not signed in-toto attestations.

## Deliberate non-goals

- No arbitrary code execution, notebook runtime, container manager, or GPU scheduler.
- No claim verification by model consensus.
- No mirroring of full papers, model weights, or datasets.
- No cryptographic attestation unless a future version integrates a real signing identity and verifier.
- No automatic rollback of external experiment artifacts.
- No fuzzy cross-lab event merging or model-consensus claim verification.

These boundaries keep the plugin composable with `dsh-science-workbench`, DVC, MLflow, PaperBench-style reproducers, and normal Harness shell/browser tools instead of duplicating them.
