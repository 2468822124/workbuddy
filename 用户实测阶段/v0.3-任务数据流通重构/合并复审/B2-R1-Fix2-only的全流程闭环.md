# v0.3-B2-R1-Fix2-only-单 R direct 批次闭环

> **文档性质**：B2 批次级唯一闭环交接记录，面向 `B<N>` 模式的单 R `direct` 批次。本文补充 `B2` 的机器批次、R1 Fix2、Review3、15A 源同步和 `QA2/S2` 冻结交接事实；不是 `B2-merge` 集成复审、GPT 正式报告、用户 06 回传、测试计划、`当前代码状态.md` 或用户验收记录。
>
> **当前状态（截至 2026-09-08）**：`✅QA/S frozen（QA2/S2）`，`sourceSyncStatus=verified`，`operationalClosureStatus=verified`。B2 的 `candidateStrategy=direct`，预期集合仅为 `R1:Fix2`；`R1-Fix2-only` 是本批唯一最终候选。`R3-Fix1-only` 为 GPT 越权产生的作废历史资产，仅保留审计，不纳入候选、冻结或后续计划。`readyToMerge=false`、`mergeStatus=not-prepared`：本批**不是** `B2-merge`，未执行 `prepare-merge`/`complete-merge`，不创建 `B2-Merge-ReviewN`。本状态不等于用户验收、G1、C1、正式发布或维护期。
>
> **维护边界**：GPT 维护批次治理、候选来源、复审和冻结交接；DeepSeek 维护产品代码、测试、构建和 R 文档中的 Fix 执行事实；用户负责后续正式用户实测和最终产品决定。历史事实保留，不以本文件覆盖 R1 唯一闭环或机器状态文件。

---

## 一、批次身份、模式与不变规则

| 项目 | 当前正式值 |
|---|---|
| 批次标识 | `B2` |
| 批次模式 | `B<N>` 模式；`candidateStrategy=direct` |
| 候选类型 | 单 R `R-only` 交接；不是多 R merge |
| 预期纳入集合 | `R1:Fix2`（仅一项） |
| 版本/功能 | `v0.3` / `R1 项目投影模板与周统筹创建` |
| 基线 HEAD | `a6aa7307bb6426486059dfc01b1d17297ff3312e` |
| 批次状态 | `frozen` |
| `sourceSyncStatus` | `verified` |
| `operationalClosureStatus` | `verified` |
| `readyToFinalSync` | `true`（机器状态历史字段；15A 已执行） |
| `readyToMerge` / `mergeStatus` | `false` / `not-prepared` |
| 当前下一动作 | `15-freeze-qa-s`（批次机器指针；QA2/S2 已有冻结事实，后续为 14/E0 交接） |
| 批次状态文件 | `E:\workbuddy 复审\B2\control\batch-state.json` |
| 批次扫描文件 | `E:\workbuddy 复审\B2\control\batch-scan.json` |
| 本文档 | `E:\workspace\用户实测阶段\v0.3-任务数据流通重构\合并复审\B2-R1-Fix2-only的全流程闭环.md` |

### 1.1 direct 单 R 分流规则

- `direct` 表示 B2 只交接一个已通过的 R-only 候选；不需要把单 R 人为包装成合并批次。
- 本批未执行、也不得补写为已执行：`prepare-merge`、`complete-merge`、`B2-merge` 构建、`B2-Merge-Review1/2/...` 或合并阶段修复。
- `R1-Fix2-only` 即 B2 的最终候选；不得另造一个空的 `merge` 目录、合并指纹或 QA/S 编号。
- `R3-Fix1-only` 虽被动态扫描发现，但被批次状态显式排除；其历史文件、证据和路径不作为 B2 候选来源，不进入 05、15A、冻结或后续 R1-4。
- 历史 R1 Review2 的阻断事实保留；Review3 的补证通过解除该门禁，但不抹除 Review2 的历史记录。

### 1.2 范围与排除项

| 范围 | 处理 |
|---|---|
| `R1 Fix2` | 纳入；统一覆盖 `U-7 + U-8` |
| `U-6 / COV-R1-3-PLAN-01` | 后续覆盖/非本 Fix，未混入候选或冻结 |
| `R3-Fix1-only` | 作废越权历史资产，仅审计保留 |
| 其他 R、无关工作树改动 | 不纳入批准差异；15A 保留，不得借本文改写 |
| 用户验收、G1、C1、正式发布、维护期 | 不属于本批结论 |

---

## 二、权威输入与可追溯性

| 证据 | 关键事实 |
|---|---|
| `batch-state.json` | `status=frozen`；预期集合只有 `R1:Fix2`；`candidateStrategy=direct`；`readyToMerge=false`；`mergeStatus=not-prepared`；`sourceSyncStatus=verified`；`operationalClosureStatus=verified` |
| `batch-scan.json` | 发现 `R1-Fix2-only`、`R3-Fix1-only`；后者明确排除；`issues=[]`、`missing=[]`；`readyToFinalSync=true` |
| R1 权威闭环 | `E:\workspace\用户实测阶段\v0.3-任务数据流通重构\第1轮\v0.3-R1-项目投影模板与周统筹创建-全流程闭环记录.md`；§29 Fix2、§30 Review2、§31 Review3、§32 QA/S、§33 15A、§34 补证确认 |
| Review3 机器状态 | `E:\workbuddy 复审\B2\R1-Fix2-only\control\review-status-Review3.json`；`status=passed`；`reviewId=Review3` |
| 15A 机器结果 | `E:\workbuddy 复审\B2\control\source-sync-result.json`；`sourceSyncStatus=verified`；`conflicts=[]` |
| 当前开发指针 | `E:\workbuddy 复审\current-development-pointer.json`；B2/direct、HEAD、树指纹、源包和批准差异与 15A 一致 |

本文仅汇总已存在的权威记录，不改变这些文件的状态字段、历史章节或候选内容。

---

## 三、R1 Fix2 执行与候选边界

### 3.1 Fix 执行事实

R1 Fix2 由 07（DeepSeek）按 R1 唯一闭环 §29 执行，统一范围为 `U-7 + U-8`。执行门禁使用 B2 的 `begin-fix`/`complete-fix`，未拆分为 `Fix2a/Fix2b`，未创建新 R。完成后工作树恢复到 begin-fix 基线，HEAD 保持 `a6aa7307bb6426486059dfc01b1d17297ff3312e`，本批期间未提交新的 QA/S 专用提交。

### 3.2 U-7 修复边界与证据

- 根因是复盘派生路径已有 `carried/carryable` 口径，而周统筹 `getWeekBoard` 未查询 active 承接实例，导致源周行退化为普通未完成行、转周入口未收敛。
- 批准实现为只读派生层：周统筹按 active `carriedFrom` 承接推导“已转下周”，前端透传 `carried`，源行显示“已转下周”、划线/灰显并隐藏转周入口；不修改源实例状态，不删除历史，承接软删除后展示自动回落。
- GUI/只读证据在候选 `evidence` 中登记：`review2-U7-gui-evidence.json`、转周前后截图、W0 截图、复盘页截图和 `review2-U7-readonly.json`。只读核对确认源实例保留、W0 只有一条 active 承接、`integrity_check=ok`、外键检查为空、只读前后数据库哈希不变。
- Review3 复用 Review2 已完成且候选未变的 U-7 证据；结论为 `✅已解决`，剩余风险为 active 承接记录依赖的一般展示风险。

### 3.3 U-8 入口日期副本连续性

- U-8 是用户已作出明确决定的入口行为：同一计划、同一角色跨自然日复用已登记日期副本；不得复制/覆盖数据库、手工改 state、改变入口契约或触碰真实用户目录。
- Review2 因缺少真实 D+1 证据保留 `blocked/驳回` 历史；Review3 于 2026-09-04 通过正式选择器完成 D+1 复用，确认 `DATE`、`PREFIX`、实际 `userData` 和数据库均沿用 D 日副本。
- Review3 同时核对 R2/USER 隔离：R2 使用独立日期副本、前缀和数据库，读写边界与 R1 不互用；候选 evidence 中保留 selector、re-entry、只读和隔离证据。
- U-8 结论为 `✅已解决`；未来自然日仍有入口注册副本契约的一般风险，不把历史 B1 入口证据改写为 S2 正式测试入口。

### 3.4 批准文件范围

R1 Fix2 的批准 source 差异严格为以下 6 个文件：

1. `src/main/services/flowDerived.ts`
2. `src/renderer/src/components/flow/InstanceList.vue`
3. `src/renderer/src/components/flow/InstanceRow.vue`
4. `src/renderer/src/views/flow/FlowWeekView.vue`
5. `src/shared/flowTypes.ts`
6. `tests/r1Fix2.spec.ts`

U-8 的选择器属于 `E:\workbuddy-test` 入口基础设施，不在本次产品 source 差异内；它的复审证据仅作为 Review3 的输入事实登记。

---

## 四、Review3 复审闭环

### 4.1 状态与历史关系

| 项目 | 正式值 |
|---|---|
| 复审对象 | `B2` / `R1` / `Fix2` / `R-only` |
| `reviewId` | `Review3` |
| `reviewMode` | 用户实测 R；不是 B2-merge 集成复审 |
| 机器状态 | `status=passed` |
| R1 Fix2 结论 | `✅通过（修复复审）` |
| 历史 Review2 | `blocked/驳回`，因 U-8 缺 D+1 证据；保留原文和 `review-status.json`，未覆盖 |
| 候选指纹 | `67b3c6b65313c7fe57070e8c123d155fe068aafd9bea4160b5f40171e0465970` |
| Review3 状态文件 SHA-256 | `637E9656968E8BF3AE83B4275A890EB693ECCDF732AE39D224F5C88157CBB9A4` |
| Review3 更新时间 | `2026-09-04T05:03:45Z` |

### 4.2 复审入口、隔离与证据根

| 项目 | 路径/事实 |
|---|---|
| 候选程序 | `E:\workbuddy 复审\B2\R1-Fix2-only\app` |
| 启动包装 | `E:\workbuddy 复审\B2\R1-Fix2-only\启动复审-R1-Fix2.bat` |
| 独立 userData | `E:\workbuddy 复审\B2\R1-Fix2-only\userData` |
| 证据目录 | `E:\workbuddy 复审\B2\R1-Fix2-only\evidence` |
| U-8 D+1 证据前缀 | `R1-3-T01-C03-GPT-Review3-U8-D1-` |
| R2 隔离证据前缀 | `R1-3-T01-C03-GPT-Review3-U8-D1-isolation-R2-USER-` |
| 真实数据边界 | `%APPDATA%\workbuddy\` 禁止读取、复制、写入、清空或删除 |
| 复审结论范围 | GUI、只读持久化、重进/刷新、入口日期复用、跨 R 隔离和异常边界均有登记；不扩展为用户验收 |

Review3 登记的 14 项证据逐项存在且大小/哈希一致；证据清单以 `review-status-Review3.json` 为准，本文不复制整份哈希清单以免产生第二份易漂移记录。

---

## 五、候选构建与不可变快照

### 5.1 R1-Fix2-only 候选

| 项目 | 已核对值 |
|---|---|
| 候选目录 | `E:\workbuddy 复审\B2\R1-Fix2-only` |
| 构建目录 | `E:\workbuddy 复审\B2\R1-Fix2-only\app` |
| 全量文件 | 100 个 |
| 总字节数 | 335,403,668 |
| build tree fingerprint | `67b3c6b65313c7fe57070e8c123d155fe068aafd9bea4160b5f40171e0465970` |
| `build-manifest.json` SHA-256 | `9d3d27b389159bba9948e57d24ea3decdeb5484db295133739b833a77ea1f5e0` |
| `WorkBuddy.exe` | `E:\workbuddy 复审\B2\R1-Fix2-only\app\WorkBuddy.exe` |
| `WorkBuddy.exe` SHA-256 | `D952D488A0878D0A8B9BC65E5063FFFFD4A7EDE58C99C2981407B96E1DDC7577` |
| 包内版本字段 | `0.3.0-c0`（未伪造 QA 版本名；版本字段由 DS 维护） |
| 构建产物记录 | `E:\workbuddy 复审\B2\R1-Fix2-only\review-meta.json` |

### 5.2 QA2/S2 历史冻结快照

| 项目 | 已核对值 |
|---|---|
| QA/S 身份 | `QA2/S2` |
| S2 快照目录 | `E:\workbuddy-snapshots\v0.3.0-qa.2-r1-fix2-s2` |
| S2 构建目录 | `E:\workbuddy-snapshots\v0.3.0-qa.2-r1-fix2-s2\out` |
| S2 全量文件/字节 | 100 个 / 335,403,668 |
| S2 manifest SHA-256 | `316D3CF6318ED5F268375DC24C8CBA0EF0AEF8B6C7B11D17FE2C9841ACEAD5A0` |
| S2 `WorkBuddy.exe` SHA-256 | `D952D488A0878D0A8B9BC65E5063FFFFD4A7EDE58C99C2981407B96E1DDC7577` |
| S2 记录 | `E:\workbuddy-snapshots\v0.3.0-qa.2-r1-fix2-s2\S2-snapshot-record.json` |
| S2 包版本字段 | `0.3.0-c0` |
| 不可变核对 | 候选与 S2 逐文件 SHA-256/大小一致；快照为只读；无覆盖 QA1/S1 或其他历史快照 |
| 历史冻结时间 | `2026-09-05T19:29:39.0154404+08:00` |

QA2/S2 只是候选冻结和后续测试交接对象，不是正式发布包、用户验收包、G1、C1 或维护期版本。

---

## 六、15A 最终候选源代码同步闭环

### 6.1 同步身份与来源

15A 只执行已批准候选源差异同步，不执行代码审查、用户实测、QA/S 编号、提交/Tag 或计划创建。候选无原生 source-tree 时，机器采用已验证历史恢复包：

- 历史恢复结果：`E:\workbuddy-snapshots\B2-R1-Fix2-only-source-recovery\control\history-source-recovery-result.json`，`sourceRecoveryStatus=verified`。
- 恢复差异凭证：`E:\workbuddy-snapshots\B2-R1-Fix2-only-source-recovery\control\approved-source-diff.json`，SHA-256=`9c60d4336c56a18a722043b3ad1d57187e2825bf6960b521f811f36b6ee4245d`。
- 同步源包：`E:\workbuddy-snapshots\B2-R1-Fix2-only-source-sync`，`sourcePackageReadOnly=true`。

### 6.2 机器结果

唯一机器结果文件为 `E:\workbuddy 复审\B2\control\source-sync-result.json`：

| 字段 | 已核对值 |
|---|---|
| `sourceSyncStatus` | `verified` |
| `updatedAt` | `2026-09-08T05:18:26Z` |
| 候选源清单 SHA-256 | `e9f55313e6bbd01bf8d27e331d25b0adeb42ffc98f12fa9950b03d0dfc080ac6` |
| 源树指纹 | `0ebcc089cde20d452e81438e30e0b38d4734c72903145d6ede1063d145a36370` |
| 批准差异指纹 | `de41c7e2b57db276b5197601d82a5d639eeea215d91fb72d3fe32cda64c59d74` |
| 源包清单 SHA-256 | `e9f55313e6bbd01bf8d27e331d25b0adeb42ffc98f12fa9950b03d0dfc080ac6` |
| 同步前工作区指纹 | `98d9cbcd029b97eadf14037e19ffbc80dd4bbdb6c702174a5b3cf99e8582287e` |
| 同步后工作区指纹 | `4491996e9d615b09511249b4884d3bfd6ab32f4782470c660763f857884be6db` |
| 同步后树指纹 | `0ebcc089cde20d452e81438e30e0b38d4734c72903145d6ede1063d145a36370` |
| 同步后 HEAD | `a6aa7307bb6426486059dfc01b1d17297ff3312e` |
| 同步模式 | `applied-approved-diff` |
| 冲突/回滚 | `conflicts=[]`；无回滚异常 |

### 6.3 applied/preserved 边界

`appliedFiles` 仅为批准的 6 个文件：

- `src/main/services/flowDerived.ts`
- `src/renderer/src/components/flow/InstanceList.vue`
- `src/renderer/src/components/flow/InstanceRow.vue`
- `src/renderer/src/views/flow/FlowWeekView.vue`
- `src/shared/flowTypes.ts`
- `tests/r1Fix2.spec.ts`

15A 的 `preservedFiles` 保留其余工作区改动；不把保留项写成 B2 Fix，也不借同步清理、回滚或覆盖用户已有修改。当前开发指针 `E:\workbuddy 复审\current-development-pointer.json` 的 B2/direct、源包、HEAD、树指纹、清单哈希和批准差异均与机器结果一致。

**15A 结论**：`sourceSyncStatus=verified`。同步已形成可复核的开发基线交接，但它本身不新增 Review、不改变候选、不创建 merge、不替代用户实测。

---

## 七、冻结交接、边界与下一步

### 7.1 当前冻结结论

- B2 direct 单 R 的唯一冻结对象是 `R1-Fix2-only`，绑定既有 `QA2/S2`。
- `QA2/S2` 来源、Review3 通过状态、构建物哈希、完整清单、15A 源同步和隔离边界均已登记；候选与 S2 逐文件一致。
- 没有创建 `QA3/S3`，没有把 R3 或任何中间候选作为 S2 来源，没有覆盖历史 S2 记录。
- `R3-Fix1-only` 仅作废历史审计资产；不得进入 05、15A、冻结、R1-4 或任何用户正式测试。

### 7.2 交接字段

| 字段 | 当前值/边界 |
|---|---|
| `planStatus` | `ready`（交给 14；本文不修改测试计划正文） |
| `staticGate` | `pending`（后续 R1-4 的 E0 重新核对 S2 部署、入口、数据和隔离） |
| `testPointStatus` | `not-tested`；本批没有启动新的正式用户实测 |
| `closureStatus` | `in-progress`；不表示 R1 轮次关闭 |
| 正式测试入口 | 待 14/部署流程绑定 S2 后创建或部署；本次未覆盖 `E:\workbuddy-test\app-v0.3` |
| 正式测试数据 | 待 14 创建新的 R1-4 GPT/USER 隔离副本；Review3 的历史 `USER-20260903` 只作复审证据 |
| 真实数据边界 | `%APPDATA%\workbuddy\` 禁止触碰；R1、R2、B1、R3 目录及 GPT/USER 副本不互用 |

### 7.3 下一步与禁止事项

1. 由 `14`/部署流程将同一不可变 `QA2/S2` 绑定到后续 `R1-4` 计划，建立新的正式程序、GPT/USER 数据目录和隔离前缀。
2. 由 E0 重新核对 S2 的程序清单、入口契约、数据隔离和只读边界；通过后再按计划进入 `12 + 用户 06`。
3. 继续保留 R1 §29–34、Review2 阻断和 Review3 通过的历史链路；不得把本批单 R 交接改写成 `B2-merge`。

本文件不创建后续计划正文，不写用户验收、G1、C1、正式发布或维护期结论；也不自动提交、推送、发布或清理工作树。

---

## 八、最终审计摘要

| 类别 | 已验证事实 | 待后续动作/边界 |
|---|---|---|
| 批次 | B2 frozen；direct；仅 R1:Fix2；无 merge | 后续按 R1-4 继续，不创建 B2-merge |
| 修复复审 | Review3 passed；U-7/U-8 均有对应证据 | 用户正式实测仍由后续计划负责 |
| 构建/快照 | 候选与 QA2/S2 100 文件逐文件一致；WorkBuddy.exe 哈希一致 | S2 部署前由 E0 再核对 |
| 源同步 | 15A verified；6 个批准文件 applied；其余改动 preserved；无冲突 | 不清理或覆盖工作树 |
| 隔离 | 候选、R2 日期副本和真实用户目录边界已登记 | 新 R1-4 副本必须重新建立隔离 |
| 结论边界 | QA/S 冻结交接成立 | 不等于用户验收、G1、C1、发布或维护期 |
