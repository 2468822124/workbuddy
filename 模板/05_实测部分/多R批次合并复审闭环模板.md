# 多 R 批次合并复审闭环模板

> 本模板只用于一个修复批次的跨 R 候选、合并、集成复审和最终交接。每个 R 的用户事实、Fix 和 R-only Review 仍写入各自唯一 R 闭环文档。

## 1. 批次身份

| 字段 | 内容 |
|---|---|
| 批次标识 | B<N> |
| 版本/功能 |  |
| 批次文档绝对路径 |  |
| 共同 C0 |  |
| 共同 S0 |  |
| 预期 R/Fix 集合 | R1:Fix1；R2:Fix1 |
| 创建时间/维护者 |  |
| 当前状态 | in-progress |
| planStatus |  |
| staticGate/E0 |  |
| testPointStatus |  |
| closureStatus |  |
| 当前指针 |  |

## 2. 机器交接与目录清单

| 对象 | 绝对路径 | 状态/哈希 |
|---|---|---|
| 编排器 | E:\workspace\tools\r_fix_review.py |  |
| 批次状态 | E:\workbuddy 复审\<B<N>>\control\batch-state.json |  |
| 动态扫描结果 | E:\workbuddy 复审\<B<N>>\control\batch-scan.json |  |
| 合并交接 | E:\workbuddy 复审\<B<N>>\control\merge-ready.json |  |
| 基线快照根 | E:\workbuddy-snapshots\ |  |
| R-only 候选 | E:\workbuddy 复审\<B<N>>\R<N>-Fix<M>-only\ |  |
| 合并候选 | E:\workbuddy 复审\<B<N>>\merge\ |  |
| GPT 合并入口 |  |  |
| GPT 合并 userData |  |  |
| GPT 合并 evidence |  |  |

机器状态必须包含：batchId、rId、fixId、baseCommit、来源目录、候选/整合工作树指纹、构建物 SHA-256、全量清单哈希、evidence、userData、restoreStatus、reviewStatus、updatedAt 和 nextAction。

## 3. R-only 修复候选登记

| R | Fix | 候选目录 | 来源/基线 | 候选变更文件 | 构建物/清单哈希 | 恢复结果 | Review |
|---|---|---|---|---|---|---|---|
| R<N> | Fix<M> |  | C0 /  |  |  | verified |  |

每个 R-only 必须从同一 C0 独立生成，使用独立 app、启动包装、userData 和 evidence。候选只允许包含该 R 的批准差异；发现未归属文件、重复 R、缺失 Review 或恢复指纹不一致时，批次保持阻塞。

### R-only Review 记录

| Review | R/Fix | Review 文档 | GUI/只读/构建/隔离证据 | 结论 | updatedAt | nextAction |
|---|---|---|---|---|---|---|
| Review<N> | R<N>/Fix<M> |  |  |  |  |  |

## 4. 动态批次门禁

- 批次预期集合以 control/batch-state.json 冻结，但实际候选集合必须每次由 scan-batch 动态枚举。
- 未登记 R、重复 R、孤立或格式错误目录、缺失 Review、构建哈希不一致、恢复未验证，均禁止 merge。
- 只有所有预期 R-only 的 Review 状态均为 passed，且每个 passed 状态有可定位证据，才可生成 merge-ready.json。
- R-only 通过不代表 QA/S 冻结；中间候选不得单独冻结 QA/S。

## 5. GLM+DS 整合与合并候选

| 字段 | 内容 |
|---|---|
| GLM+DS 整合开始时间/实际执行者 |  |
| 合并基线 |  |
| 批准变更并集 |  |
| 变更并集来源 |  |
| 冲突解决文件及批准 |  |
| 整合工作树指纹 |  |
| merge 构建目录 |  |
| merge 构建物 SHA-256 |  |
| merge 全量清单及哈希 |  |
| 开发区是否保留 | true |
| restoreStatus | not-applicable-after-merge |

GLM+DS 只能在全部 R-only 通过后整合。合并候选部署在同一批次的 merge 目录；合并完成后不恢复 E:\workspace\workbuddy，必须保留整合工作树并记录其指纹。

## 6. B<N>-merge 集成复审

### 6.1 输入和证据

- 唯一闭环文档：
- GPT 使用的 Prompt 13/05：
- merge 候选 review-meta.json：
- R-only 候选及其 Review：
- GPT GUI 证据：
- GPT 只读持久化证据：
- 构建、来源、清单和 SHA-256 证据：
- userData 与真实用户数据隔离证据：

### 6.2 逐项复审

| 集成项 | 来源 R/Fix | 原始失败/预期 | 实际操作和稳定态 | 持久化/刷新/重进 | 安全/隔离 | 结论 | 证据 |
|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |

### 6.3 结论

| 字段 | 内容 |
|---|---|
| reviewId | B<N>-Merge-Review<N> |
| reviewMode | B-batch-merge |
| 结论 |  |
| planStatus |  |
| staticGate/E0 |  |
| testPointStatus |  |
| closureStatus |  |
| updatedAt/updatedBy | / GPT |
| 未解决/待环境补证（05复审未完成，未进入用户实测）/待补证 |  |
| 新引入或越界问题 |  |
| nextAction |  |

失败时只在本批次文档追加 B<N>-merge 修复记录，不回流 R1/R2，不拆分批次，不创建新的 R Fix。只有 R-only 和最终 merge 均通过后，才交 15A 同步最终 merge 源树；`sourceSyncStatus=verified` 后再交 15 冻结一个全局 QA/S。

## 7. QA/S 交接

### 7.1 15A 最终候选源代码同步

| 字段 | 内容 |
|---|---|
| 同步命令 | `python E:\workspace\tools\r_fix_review.py sync-final-candidate --batch-id B<N> --candidate-strategy merge --candidate-dir E:\workbuddy 复审\<B<N>>\merge --review-status E:\workbuddy 复审\<B<N>>\merge\control\review-status.json --code-root E:\workspace\workbuddy --review-root "E:\workbuddy 复审" --snapshot-root E:\workbuddy-snapshots` |
| Review 前置 | `B<N>-Merge-Review<N>` 为 `passed`，候选类型为 `merge` |
| 同步结果 | `E:\workbuddy 复审\<B<N>>\control\source-sync-result.json`；必须为 `sourceSyncStatus=verified` |
| 源包 | `E:\workbuddy-snapshots\<B<N>>-merge-source-sync\`；完整 source-tree、候选源清单和 approved-source-diff，只读 |
| 当前开发指针 | `E:\workbuddy 复审\current-development-pointer.json`；候选、策略、源包、HEAD、工作树指纹和清单哈希一致 |
| 同步核对 | 同步前后工作树指纹、逐文件 applied/preserved、批准差异、新增/删除、Git index、冲突和回滚结果 |
| 失败处理 | `blocked`/`failed` 留在 15A；不得冻结 QA/S、部署 S 或创建后续计划；回滚失败必须记录残留文件 |

### 7.2 QA/S 冻结交接

最终冻结对象只能是 B<N>-merge 合并包。R-only 和其他中间候选均未冻结，也不得作为 B 的最终同步对象。15A 成功后，15 才能冻结全局 QA/S；冻结后由 14 为纳入的各 R 创建绑定同一 S 的后续计划；该事实不等于用户验收、G1、C1 或维护期。
