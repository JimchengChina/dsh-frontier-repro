# Design and overlap audit

Research checked on 2026-08-17.

The architectural follow-up is documented in [architecture.md](architecture.md). It maps Cordis's revertible effects and reactive coeffects to collection transactions, explicit source capabilities, immutable manifests, and evidence topology.

## Existing DSH plugins

The [`dsh-plugin` GitHub topic](https://github.com/topics/dsh-plugin) and repository searches show several occupied categories:

- [`dsh-ai4scholar`](https://github.com/literaf/ai4scholar-plugin-dsh): broad scholarly search, citations, full text, and scientific writing/figures.
- [`dsh-literature`](https://github.com/SihanLv/dsh-literature): merged dblp/arXiv search, authoritative BibTeX, and full-text acquisition.
- [`dsh-paper-workshop`](https://github.com/LessXi/dsh-paper-workshop): a seven-stage guided reading workflow, durable cards/notes/glossary, weekly arXiv reports, and a reproduction checklist.
- [`dsh-news`](https://github.com/SongChengMing1/dsh-news): configurable RSS/news reading with a Web UI, article proxy, cache, and reading state.
- [`dsh-research-plugins`](https://github.com/Cloudstill/dsh-research-plugins): an append-only scientific evidence ledger with separated discovery, verification, synthesis, review, and human-adjudication authority.
- [`dsh-science-workbench`](https://github.com/poplarity/dsh-science-workbench): executable scientific cells, environment locks, artifact hashes, lineage, figures, and local Git provenance.
- [`dsh-release-proof`](https://github.com/dongsheng123132/dsh-release-proof): byte/hash/version consistency proofs across release download mirrors.
- [`dsh-forge`](https://github.com/zhn1100/dsh-forge): an isolated DSH plugin-development and validation profile.
- Other repositories already cover arXiv search, chat-with-paper, literature management, generic web search, and daily news digests.

Therefore this plugin does not expose generic `arxiv_search`, `read_paper`, `news_feed`, citation, PDF, note-taking, weekly-report, or scheduler tools. Its unique state is a cross-channel primary-source record joined to (1) a mode-specific evidence matrix and (2) separately recorded execution evidence.

`dsh-paper-workshop` is the closest neighbor because it includes a reproduction stage/checklist. The boundary is intentional: Paper Workshop owns learning and paper-by-paper knowledge management; Frontier Repro owns cross-source detection, person/lab provenance, readiness gating, explicit downgrade semantics, and rejection of unsupported run-success claims. They can be installed together: use the literature/workshop tools for full-text study, then feed verified evidence into `frontier_repro_assess`.

`dsh-research-plugins` is stronger for adjudicating scientific claims; Frontier Repro does not introduce multi-agent truth authority or a citation ledger. `dsh-science-workbench` is stronger for executing and replaying scientific code; Frontier Repro does not provide a notebook, subprocess runner, figure UI, hashes, or Git automation. A useful composition is: Frontier Repro discovers a capability and gates its prerequisites, Research Plugins verifies important claims, and Science Workbench or ordinary DSH tools execute the experiment. `dsh-release-proof` verifies transport equality of already declared binary releases, not whether an AI capability can be reproduced. `dsh-forge` validates DSH plugins themselves, not the research being tracked.

## Primary endpoints

- [arXiv API documentation](https://info.arxiv.org/help/api/index.html) and the official Atom endpoint.
- [OpenAI Research](https://openai.com/research/index/) and [OpenAI News RSS](https://openai.com/news/rss.xml).
- [Anthropic Newsroom](https://www.anthropic.com/news), [Anthropic Research](https://www.anthropic.com/research), and [Anthropic Engineering](https://www.anthropic.com/engineering).
- [Google DeepMind News](https://deepmind.google/blog/) and its RSS endpoint.
- [DeepSeek API News](https://api-docs.deepseek.com/news/news250120/) plus the official [DeepSeek GitHub organization](https://github.com/deepseek-ai) and [verified Hugging Face organization](https://huggingface.co/deepseek-ai).
- [DeepSeek Transparency](https://www.deepseek.com/en/transparency/), [Kimi Blog](https://platform.kimi.com/blog), [Moonshot AI models](https://huggingface.co/moonshotai), [MiniMax Research](https://www.minimax.io/blog), and [MiniMax models](https://huggingface.co/MiniMaxAI).
- [NVIDIA Technical Blog](https://developer.nvidia.com/blog/), [AMD ROCm Blog](https://rocm.blogs.amd.com/), and [Intel Artificial Intelligence News](https://newsroom.intel.com/artificial-intelligence) for hardware/software co-design signals. Intel's community AI blog returned HTTP 403 to the plugin client, so the accessible first-party Newsroom feed is used with category and relevance filtering.
- [Z.ai model release notes](https://docs.z.ai/release-notes/new-released), direct [Z.ai Research Blog](https://z.ai/blog/glm-5.2) articles linked by releases/models, and the [verified Z.ai Hugging Face organization](https://huggingface.co/zai-org). The general `/blog` route returned 404 during validation, so the plugin does not pretend it is a working discovery index.
- [X API user-post endpoint](https://docs.x.com/x-api/users/get-posts), [user lookup](https://docs.x.com/x-api/users/lookup/introduction), and [current pricing](https://docs.x.com/x-api/getting-started/pricing).

## Reproduction method

The gate draws on reproducibility practice rather than treating “code exists” as sufficient:

- Pineau et al., [Improving Reproducibility in Machine Learning Research](https://arxiv.org/abs/2003.12206), which reports the NeurIPS reproducibility program and checklist.
- The [ACM artifact review and badging policy](https://www.acm.org/publications/policies/artifact-review-and-badging-current), which separates artifact availability, functionality, and reproduced results.
- Mitchell et al., [Model Cards for Model Reporting](https://arxiv.org/abs/1810.03993), for intended use, evaluation context, and limitations.

The resulting rule is deliberately conservative:

1. `ready_*` means required access and environment facts are documented with evidence.
2. It never means the target was executed.
3. Exact, scaled, and behavioral reproductions are different claims and cannot be silently upgraded.
4. A successful run must retain commands, artifacts, measurements, and deviations.
5. Missing licenses, access rights, evaluation, or safety scope are first-class blockers, not footnotes.

## Related implementation patterns

- Hugging Face Paper Pages provide structured paper-to-model/dataset/Space/repository links. These links are useful artifact candidates but remain community-maintained metadata, so the primary arXiv provenance is retained.
- OpenAI PaperBench separates rollout, reproduction in a fresh container, and rubric grading. Frontier Repro adopts the state separation without embedding an execution sandbox.
- DVC and MLflow already own full experiment versioning/tracking. This plugin exports bounded handoff metadata instead of becoming another experiment platform.
- RO-Crate and in-toto motivate portable entity graphs and material/product/byproduct terminology. The plugin uses canonical digests and explicit edges, but does not claim either standard's complete schema or signature guarantees.
