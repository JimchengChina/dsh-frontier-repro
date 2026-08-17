# dsh-frontier-repro

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的“一手信源 → 复现证据档案”插件。

它不是另一个 AI 新闻阅读器，也不是另一个 arXiv 搜索/论文总结插件。它只做现有 DSH 插件尚未完整覆盖的一段链路：从经过身份约束的一手渠道发现前沿能力，把同一次模型/能力发布整理成可追溯版本的证据包，再进入 claim 级复现协议。每次尝试都会保留，包括失败和负结果；成功结论必须带命令、产物、逐项指标和 verifier 证据。

## 为什么不是重复项目

DSH 生态已经有很强的论文和资讯工具：`dsh-ai4scholar`、`dsh-literature` 负责检索、全文与引用，`dsh-paper-workshop` 负责精读、知识库和教学式复现清单，`dsh-news` 负责通用 RSS 阅读；更新的 `dsh-research-plugins` 负责科研主张审查，`dsh-science-workbench` 负责可回放实验执行。这个插件刻意不复制这些能力：

| 已有能力 | 本插件不做 | 本插件补上的环节 |
|---|---|---|
| arXiv / Semantic Scholar / dblp 检索 | 不做全库学术搜索、引用网络或 PDF 阅读 | 把 arXiv 与实验室发布放进同一条“能力信号”时间线 |
| AI 新闻/RSS 面板 | 不做通用订阅、全文阅读 UI 或媒体聚合 | 只接一手源，展示身份依据、来源等级和可解释评分 |
| 论文精读与学习笔记 | 不做七阶段教学、术语表或 Obsidian 管理 | 把文章/模型/代码线索转成模式化复现条件矩阵 |
| 复现清单 | 不用口头打勾代表成功 | 条件准备度与运行结果分离；`passed` 必须附命令、产物和指标 |

详细去重审计见 [docs/research.md](docs/research.md)。

## 默认一手来源

- arXiv：`cs.AI`、`cs.CL`、`cs.LG`、`cs.CV`、`cs.RO`、`cs.SE`，使用官方 Atom API。
- 实验室官网：OpenAI News，Anthropic Newsroom / Research / Engineering，Google DeepMind News，MiniMax Research，Kimi Blog，DeepSeek API News / Transparency，以及 Z.ai 模型发布记录。
- 硬件与系统：NVIDIA Technical Blog、AMD ROCm Blog、经过类别与技术相关性过滤的 Intel Artificial Intelligence News，用于捕捉训练、推理、加速器、编译器和基准更新。
- 官方复现产物：DeepSeek、Moonshot AI、MiniMax 和 Z.ai 的已验证 Hugging Face 组织模型流，以及 DeepSeek 官方 GitHub 组织的新仓库、Release、Tag 与固定 commit。
- 核心人员博客：Sam Altman 个人博客、Anthropic 联合创始人 Jack Clark 的 Import AI。
- 核心人员 X：Sam Altman、Dario Amodei、Demis Hassabis。只走 X API v2；无凭证时明确报告缺失条件，绝不退化成网页抓取。

DeepSeek 创始人和 GLM 核心人员没有被硬塞进默认 X 清单：目前没有足够稳定、可由实验室官网交叉验证的公开个人流时，宁可留空，也不收录同名或搬运账号。可以通过受信任的本地 `sourceFile` 添加，并必须给出 `identityEvidenceUrl`。

## 工具

| 工具 | 用途 |
|---|---|
| `frontier_repro_status` | 查看来源、语料库状态和缺失凭证；不联网 |
| `frontier_repro_collect` | 刷新指定一手源，去重、落盘并返回可解释排序 |
| `frontier_repro_events` | 查看跨来源发布证据包与 watch 的实质变化 |
| `frontier_repro_bundle` | 读取一个证据包、前序版本、原始记录、claims 和全部尝试 |
| `frontier_repro_watch` | 添加、删除或确认基于实质摘要的 watch |
| `frontier_repro_search` | 只搜索本地语料库，不联网 |
| `frontier_repro_revert_collection` | 带冲突/依赖保护地回滚最近一次有效采集 |
| `frontier_repro_get` | 读取完整来源、实现产物、准备度和运行记录 |
| `frontier_repro_assess` | 对 exact / scaled / behavioral 模式执行条件门禁 |
| `frontier_repro_assess_claims` | 对 execute / partial / from-scratch 和 exact / scaled / toy 做 claim 级门禁 |
| `frontier_repro_graph` | 输出来源、产物、条件、证据与运行的确定性依赖图 |
| `frontier_repro_record_result` | 记录实际命令、产物、指标、偏差和结果 |
| `frontier_repro_record_attempt` | 追加一次 claim 级尝试、资源消耗、verifier 和真实结果 |
| `frontier_repro_manifest` | 导出带 canonical SHA-256 的复现交接清单 |
| `frontier_repro_trackio_scaffold` | 导出本地优先的 Trackio logbook 脚手架，不执行也不发布 |

采集阶段会先剔除实验室人事/商务公告、占位标题、要求日期却缺失日期的记录和人员生活动态；每个来源还可配置类别允许/拒绝清单和已知模板标题。排序也不是模型黑箱。返回值逐项显示：信源等级、时效、实现产物、复现关键词、前沿主题和查询相关性。Hugging Face 模型流会读取最近模型的 README，只提取论文、代码、数据和评测链接，不保存全文；arXiv 条目同时保留稳定论文 id 与实际观测到的 `vN`。GitHub 代码、公开 Hugging Face 模型和数据集会尽力钉到完整 SHA，stars 等可变指标仅作为参考。

每次采集还会持久化 `source_health`：最近尝试/成功时间、最新有效内容、数量突降、页面结构指纹变化、连续失败、陈旧状态和最近错误。它用于发现适配器或上游页面漂移，不代表对发布内容真实性作判断。

同一 Lab 内，带有明确模型家族/版本标识的官网、论文、GitHub、Hugging Face、评测和人员线索会被保守聚类成 `Frontier Release Evidence Bundle`。证据包记录缺失项、corroboration、许可证、可复现等级候选，以及 `firstSeenAt`、`lastSeenAt`、`supersedesDigest`。watch 只比较能力声明、评测、许可证和不可变产物；单纯再次抓取不会制造提醒。无法可靠识别模型实体的内容保持单记录证据包，不做模糊语义硬合并。

采集本身使用单一生命周期状态机，批次以原子事务写入并保存有界逆操作。只有最近的有效批次可以 LIFO 回滚；若新增记录已有 assessment/run 依赖，或记录后来发生冲突修改，回滚会明确拒绝。论文到实现的完整映射见 [docs/architecture.md](docs/architecture.md)。

## 安装

要求 Node.js `^22.19` 或 `>=24`，以及 DeepSeek Harness `0.1.0-rc.6` 兼容版本。

```bash
pnpm install
dsh plugin --profile web add /absolute/path/to/dsh-frontier-repro
# 或用于 CLI
dsh plugin --profile headless add /absolute/path/to/dsh-frontier-repro
```

重启对应 profile。默认数据保存在 `$DSH_HOME/frontier-repro/index.json`，文件和目录分别以 `0600` / `0700` 创建。

每个 tag release 会附带验证后的固定名安装包 `dsh-frontier-repro.tgz` 和 SHA-256 文件，插件市场可以直接使用 GitHub Release 包，无需现场源码构建。

## 典型工作流

先说：

> 收集最近 30 天关于 long-horizon coding agent 的一手前沿信息，优先找有代码、权重和评测的项目。

选中一条后：

> 我要复现它的长任务断点恢复能力。先给我 exact / scaled / behavioral 三档可行性，不够的信息继续查一手材料；条件满足后在独立目录做最小实现和对照评测。

插件会要求把条件写成如下矩阵。`available` 必须带证据；`not_required` 必须有理由：

```json
{
  "specification": { "state": "available", "evidence": ["https://arxiv.org/abs/..."], "note": "固定到 v2" },
  "code": { "state": "available", "evidence": ["https://github.com/org/repo/tree/COMMIT"], "note": "固定 commit" },
  "model_access": { "state": "missing", "evidence": [], "note": "原始权重未发布" },
  "data": { "state": "unknown", "evidence": [], "note": "未找到训练集声明" },
  "compute": { "state": "available", "evidence": ["local:nvidia-smi 4xA100-80GB"], "note": "可用 48 小时" },
  "runtime": { "state": "available", "evidence": ["local:env-lock.json"], "note": "CUDA/依赖已锁定" },
  "license": { "state": "available", "evidence": ["https://github.com/org/repo/blob/COMMIT/LICENSE"], "note": "允许研究使用" },
  "evaluation": { "state": "available", "evidence": ["https://github.com/org/repo/tree/COMMIT/eval"], "note": "主指标容差 ±1" },
  "reference_access": { "state": "not_required", "evidence": [], "note": "exact 模式直接运行权重" },
  "safety_and_scope": { "state": "available", "evidence": ["local:SCOPE.md"], "note": "仅隔离测试数据" }
}
```

准备度只有三层含义：

- `ready_exact`：原始实现所需条件已有证据，可以开始执行；不代表已复现。
- `ready_scaled`：允许明确记录过的规模/替代品差异；不得宣传成 exact。
- `ready_behavioral`：只比较可观察行为、接口和指标；不声称还原内部机制。
- `blocked` / `insufficient_evidence`：列出缺失条件和下一步动作，不能开始成功叙述。

完成执行后，只有提供实际命令、结果文件/提交、测量指标时，`frontier_repro_record_result` 才接受 `passed`。

新工作建议使用 claim 级协议：

- `execute_existing`：运行作者已有实现；
- `partial_reimplementation`：保留可用实现并补写缺失部分；
- `from_scratch_replication`：只依据规范、数据和评测重新实现；
- 等价层级分为 `exact`、`scaled`、`toy`。即使 toy 的全部指标通过，结果也只能是 `toy_only`，绝不会自动升级为 `reproduced`。

每次 `frontier_repro_record_attempt` 都记录 GPU/CPU、显存、时长、费用、数据规模、相对论文规模、Job URL、claim 结果和 verifier。`failed`、`blocked`、`negative_result` 与成功尝试一起保留。随后可导出 Trackio scaffold；它默认只写本地 Trackio，只有显式传入 Space 才会发布，而且不会执行实验或改变原判定。

此外，assessment 必须给出至少一条量化 rubric，例如：

```json
[
  {
    "id": "accuracy",
    "description": "在官方测试集达到参考精度下限",
    "metric": "accuracy",
    "operator": "gte",
    "expected": 0.9,
    "weight": 3,
    "required": true
  }
]
```

`operator` 支持 `gte`、`lte`、`equal`、`within`。`passed` 还要求同模式 assessment 处于 `ready_*`，且所有 required criterion 通过。

## X API 条件

设置凭证引用 `X_BEARER_TOKEN`：

```bash
export X_BEARER_TOKEN='...'
dsh web
```

也可以通过 DSH 的 credentials 存储同名引用。插件每次采集重新解析凭证，不把值写进配置、语料库或工具输出。X 的访问和计费由 X API 账户决定；缺 token、账户无读取权限、额度不足时，`frontier_repro_status` / `collect` 会列明条件，其余来源继续工作。

## 配置

在 profile 的 patch 中覆盖插件行：

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

`sourceFile` 是启动时读取的本地管理员配置，不接受模型在工具参数中传入任意 URL。支持 `feed`、`page`、`official_index`、`dated_index`、`model_index`、`sitemap`、`arxiv`、`huggingface_models`、`github_org`、`x_user`；GitHub 组织适配器可用 `releaseRepoLimit` / `releasesPerRepo` 限制额外请求。可选质量字段包括 `allowCategories`、`denyCategories`、`requirePublishedAt`、`boilerplateTitles` 和 `healthStaleAfterDays`。人员来源强制要求姓名、角色和官网身份依据。`GITHUB_TOKEN` 是可选的公开 API 限流增强，不会取代 X 来源必须具备的 X 凭证。参见 [sources.example.json](sources.example.json) 与 [docs/source-policy.md](docs/source-policy.md)。

## 验证

```bash
pnpm run verify
node scripts/smoke.mjs
pnpm run smoke:plugin
# 指定来源
node scripts/smoke.mjs openai-news google-deepmind-news zai-release-notes
```

`verify` 包含语法、解析与增强、发布事件聚类/版本链、GitHub Org Release/Tag、watch 回滚保护、claim 评分、多次尝试/verifier、Trackio 导出、指纹、生命周期、事务回滚、证据图、manifest、存储和复现门禁测试，以及通过真实 DSH `ToolRuntime` 的装配与卸载测试。`smoke.mjs` 直接验证各来源，`smoke:plugin` 则通过真实工具调用验证“采集 → 落盘 → 排序”；两者都是只读网络冒烟，不会调用 X。

## 已知限制

- 官网结构会变化。各来源独立失败，成功结果仍会保存；失败和页面级警告会原样列出。
- 来源健康告警只表示抓取漂移、数量异常或内容陈旧，不等于上游项目失效或发布内容不可信。
- OpenAI RSS 可以稳定获取，但正文页面可能拒绝自动客户端；插件保留 RSS 元数据，选中后可让 DSH 的浏览器/网页工具继续核验。
- arXiv 条目只证明论文存在，不证明结论正确；官方博客也属于发布方自述。评分是发现优先级，不是可信度结论。
- X API 需要用户自己的凭证、权限和预算；插件不绕过访问控制。
- GitHub 匿名 API 限流较低；可配置可选 token 或降低 `githubEnrichLimit`，Hugging Face 固定数量可用 `huggingFaceEnrichLimit` 控制。钉住失败会报告，但不会删除原始来源记录。
- 发布聚类刻意保守且限定在同一 Lab 内；不认识的模型命名宁可不合并。
- Trackio 是导出目标，不是成功证明；插件不会安装 Python 依赖、执行 Job 或自动上传 Space。
- 准备度基于 agent 提交的证据矩阵。插件检查完整性和一致性，不替代人工验证证据内容。
- manifest 的 integrity 是确定性内容摘要，不是身份签名，也不等于远端大文件校验和。
- 当前没有后台定时器；可用 DSH 已有的 schedule/cron 能力定期调用 `frontier_repro_collect`，避免重复实现调度平台。

## License

MIT
