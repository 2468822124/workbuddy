# v0.3-B1-merge-双 R 修复批次合并复审-全流程闭环

> **文档性质**：B1 批次级唯一全流程闭环文档。它不是 GPT 正式报告、用户 06 回传、测试计划、`当前代码状态.md` 或 `审查日志`。
>
> **当前状态**：`✅批次闭环（closureStatus=closed）`。B1-Merge-Review2 已通过，15/15A 已将最终 B1-merge 合并包冻结并交接为 `QA1/S1`；B1 纳入的 R1 Fix1、R2 Fix1、B1-merge 复审及冻结交接事项均已获得对应处置。原“🟢等待下一轮测试”仅为历史阶段状态；后续 R1-4/B2 与独立 R3 路径不属于 B1，由各自 R/B 独立推进。该状态不等于所有产品问题解决，也不等于用户验收、G1、C1、最终发布或维护期。
>
> **维护方**：GPT 维护批次治理、候选来源、复审、冻结交接；DeepSeek 维护产品代码、测试、构建和 R 文档中的 Fix 执行事实；用户负责 06 用户实测和最终产品决定。

---

## 一、批次元信息与不变规则

| 项目 | 内容 |
|---|---|
| 批次标识 | `B1` |
| 版本目标 | `v0.3` |
| 纳入 R | `R1 + R2` |
| 共同基线 | `C0 / S0` |
| C0 提交 | `34f155a1886c52dae278fbc71d037975646b2563` |
| C0 Tag | `v0.3.0-c0` |
| R-only 程序版本 | `0.3.0-c0`；不修改 C0 版本字段 |
| B1-merge 程序版本 | `0.3.0-qa.1`；最终 B1-merge 合并包已完成 B1-Merge-Review2，冻结对象为 QA1/S1 |
| 初始复审次数 | `3 = 2 个 R-only 复审 + 1 个 B1-merge 集成复审` |
| 预计冻结编号 | `QA1/S1`；执行 15 时重新核对全局编号 |
| 批次唯一文档 | `E:\workspace\用户实测阶段\v0.3-任务数据流通重构\合并复审\B1-merge的全流程闭环.md` |

### 1.1 批次边界

- `B1-R1` 只包含 `C0 + R1 Fix1`：`U-2`、`U-3 UI` 和批准的 `F-ISO-01` 入口替代。
- `B1-R2` 只包含 `C0 + R2 Fix1`：`U-4` 月目标到周核心目标的同周同月目标幂等修复。
- `COV-R2-01` 是后续覆盖补充项，不进入任何代码候选或 Fix。
- R1 的 `Review1` 与 R2 的前置停止 `Review1` 都是各自 R 文档中的历史事实，不能覆盖。R2-only 复审使用 `Review2`。
- R-only 复审结果写回对应 R 唯一闭环；B1-merge 的集成复审、失败、修复和重建只写本文件。
- B1-merge 失败不回流 R1/R2，不新建 R，不创建新的 R `FixN`；合并阶段修复命名为 `B1-merge 修复记录N`。

---

## 二、关联 R 与输入事实

| R | 唯一闭环文档 | Fix | 单 R 复审 | 当前输入事实 |
|---|---|---|---|---|
| `R1` | `E:\workspace\用户实测阶段\v0.3-任务数据流通重构\第1轮\v0.3-R1-项目投影模板与周统筹创建-全流程闭环记录.md` | `R1 Fix1`，已由 07 执行 | `Review1` 已于 R1 文档 §24 通过 | `U-2 + U-3 UI + F-ISO-01`；U-3 持久化已关闭，U-1 已撤销，U-4 已分流 R2 |
| `R2` | `E:\workspace\用户实测阶段\v0.3-任务数据流通重构\第2轮\v0.3-R2-月目标重复选取-全流程闭环记录.md` | `R2 Fix1`，已由 07 执行 | `Review1` 前置停止保留；`Review2` 已于 R2 文档 §16 通过 | `U-4`；`COV-R2-01` 只进后续覆盖计划 |

### 2.1 R-only 允许差异

| 候选 | 允许的产品代码差异 | 允许的测试差异 | 明确排除 |
|---|---|---|---|
| `B1-R1` | `src/main/db/repositories/flowWeekRepo.ts`、`src/main/services/flowReviewDerived.ts`、`src/renderer/src/components/flow/review/ReviewTaskList.vue`、`src/shared/flowTypes.ts` | `tests/reviewComponents.spec.ts`、`tests/r1Fix1.spec.ts` | `flowGoalRepo.ts`、`flowRepos.spec.ts` 的 R2 改动；所有无关文档/代码 |
| `B1-R2` | `src/main/db/repositories/flowGoalRepo.ts` | `tests/flowRepos.spec.ts` | R1 的四个产品文件和两个测试文件；所有无关文档/代码 |
| `B1-merge` | 上述两个 R-only 的批准差异组合 | 上述两个 R-only 的回归测试组合 | 未批准改动、覆盖项、历史数据清理和无关重构 |

---

## 三、C0/S0 基线与保留证据

| 证据 | 路径/值 | 状态 |
|---|---|---|
| C0 提交 | `34f155a1886c52dae278fbc71d037975646b2563` | `✅已核对` |
| C0 Tag | `v0.3.0-c0` | `✅已核对` |
| S0 构建目录 | `E:\workbuddy-snapshots\v0.3.0-c0-r1-2-s0\out` | `✅已保留` |
| S0 `WorkBuddy.exe` SHA-256 | `B9F75D623F13069DCA8CE042737924905B62EE2BDD6418527C26365B5019B127` | `✅已核对` |
| S0 备份 | `E:\workbuddy-test\app-v0.3-before-r1fix1-review` | `✅已保留` |
| 当前正式测试包 | `E:\workbuddy-test\app-v0.3`，实际为 R1 候选，SHA-256 `061CC5416D050C85BB4FB9133770FF27E1634FBE338FDEC77ADE977131A6D782` | `⚠️不是 S0；不得按 S0 记录` |
| 真实用户数据 | `%APPDATA%\workbuddy\` | `禁止读取、复制、修改、删除` |

S0、当前 R1 候选和现有 R2 混合候选均保留为历史/参考证据，不覆盖、不清空、不迁移。B1 候选必须从 C0 独立生成。

---

## 四、候选构建追踪

| 候选 | 独立来源副本 | 构建目录 | 版本字段 | 构建物 SHA-256 | 清单/清单哈希 | 状态 |
|---|---|---|---|---|---|---|
| `B1-R1` | `E:\workbuddy-snapshots\v0.3.0-c0-b1-r1-only-source` | `E:\workbuddy-snapshots\v0.3.0-c0-b1-r1-only\out` | `0.3.0-c0` | `03DC13650C71BEE03847A5A7EC2D8407E5D9E1F2C5F183B47C49202C49C7AC06` | `candidate-record.json`；清单哈希 `332A2691E22DAB4F4F4E640B54454F7FCCE7E2317D518735AFE013C967E7F59F` | `✅构建并 Review1 通过` |
| `B1-R2` | `E:\workbuddy-snapshots\v0.3.0-c0-b1-r2-only-source` | `E:\workbuddy-snapshots\v0.3.0-c0-b1-r2-only\out` | `0.3.0-c0` | `735B4E33334BB2840A990B1AC020A031FA096A7FCF9BB6239B53A44A59EBA270` | `candidate-record.json`；清单哈希 `F561A938E8C5A043DA6D76120CA226CF6EB5C0DF1D1C62DBAA621C3FBDF2E773` | `✅构建并 Review2 通过` |
| `B1-merge` | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-source` | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge\out` | `待 DS 设置为 0.3.0-qa.1`；当前源为 `0.3.0-c0` | `待 QA 版本重建` | `待 QA 版本重建` | `⏸️合并源已生成；待版本字段门禁` |

候选构建必须记录：完整来源提交/工作树指纹、实际版本字段、独立构建目录、全量文件清单、`WorkBuddy.exe` SHA-256、清单哈希和构建时间。构建结果不等于 QA/S 冻结。

---

## 五、独立复审部署与证据目录

| 复审对象 | 程序目录 | 启动包装 | 独立 `userData` | 当前状态 |
|---|---|---|---|---|
| `B1-R1` | `E:\workbuddy 复审\B1\R1-only\app` | `E:\workbuddy 复审\B1\R1-only\启动复审.bat` | `E:\workbuddy 复审\B1\R1-only\userData` | `✅已使用并完成 Review1` |
| `B1-R2` | `E:\workbuddy 复审\B1\R2-only\app` | `E:\workbuddy 复审\B1\R2-only\启动复审.bat` | `E:\workbuddy 复审\B1\R2-only\userData` | `✅已使用并完成 Review2` |
| `B1-merge` | `E:\workbuddy 复审\B1\merge\app` | `E:\workbuddy 复审\B1\merge\启动复审.bat` | `E:\workbuddy 复审\B1\merge\userData` | `目录已建立；待 QA 版本程序部署` |

每个启动包装必须显式设置对应的 `WORKBUDDY_APP` 和 `WORKBUDDY_USER_DATA`，只启动对应副本并等待退出；禁止直接双击 exe 作为复审入口。三个 `userData` 不互用、不从真实用户目录复制，证据前缀必须分别标识 R1-only、R2-only 或 merge。

---

## 六、初始复审计划与门禁

### 6.1 R1-only：R1 `Review1`

- 依据：R1 唯一闭环中的 `R1 Fix1`、R1-2 原始失败场景和批准的 F-ISO-01 替代。
- 必须实测：U-2 复盘统计口径；U-3 UI 转下周后的历史项收敛、确认/取消和重复提交；F-ISO-01 唯一 bat 入口、进程/环境/数据目录和关闭重进。
- 必须核对：页面稳定态、只读持久化、刷新/离开重进、错误反馈、数据隔离、技术栈和无关越界改动。
- 当前结论：`✅通过（修复复审）`，详见 R1 唯一闭环 §24；不得把该 R-only 通过扩展为 B1 或 QA/S 通过。

### 6.2 R2-only：R2 `Review2`

- 依据：R2 唯一闭环中的 `R2 Fix1`、R2 Review1 前置停止记录、U-4 原始失败场景和 COV-R2-01 登记。
- 必须实测：同一周同一月目标首次选取、重复点击/提交、刷新/离开重进、页面计数与列表一致、手动目标不受影响、跨周独立、软删除后重选。
- 必须核对：每次操作后的稳定状态、只读 active 行数、错误反馈、数据隔离、历史重复行保留边界、技术栈和无关越界改动。
- 当前结论：`✅通过（修复复审）`，详见 R2 唯一闭环 §16；既有 Review1 前置停止仍保留，不能被覆盖。

### 6.3 B1-merge：`B1-Merge-Review1`

- 前置：R1 `Review1` 和 R2 `Review2` 均为 `✅通过（修复复审）`。
- 候选：从两个通过的 R-only 批准差异重新合并；由 DS 在该复审前设置 `0.3.0-qa.1` 并重建。
- 必须实测：R1/R2 修复组合、跨功能回归、刷新/重进、取消/确认、重复操作、只读持久化、数据隔离、入口、安全边界、崩溃/白屏/错误反馈和技术栈。
- 当前结论：`⏸️等待 QA 版本合并候选`；合并源已建立并完成辅助预检，但因版本字段仍为 `0.3.0-c0`，尚未执行集成 GUI 复审。

---

## 七、合并阶段失败与修复规则

| 事件 | 本文档动作 | 禁止动作 |
|---|---|---|
| `B1-Merge-Review1` 发现未解决问题 | 追加逐项失败事实、严重度、复现和证据 | 不把失败改写成 R1/R2 回归，不调用 15 |
| 合并候选需要修复 | 追加 `B1-merge 修复记录1`，写允许/排除范围、执行、测试、构建、指纹和哈希 | 不创建新的 R，不创建 R3，不回流 R1/R2 Fix |
| 修复后复审 | 追加 `B1-Merge-Review2` 或下一个可用合并复审编号 | 不覆盖历史 Review，不使用新 R `FixN` |
| 合并修复再次失败 | 继续在本文件追加下一条 merge 修复/复审 | 不拆批次绕过未解决项 |

出现 `🔴阻断` 或 `🟡需修复` 时停止依赖该合并问题的后续验证；独立安全项可以继续，但必须说明依赖。所有合并阶段事实、证据、修复和重建均留在本文件。

---

## 八、15 冻结交接

15 只有在以下条件全部满足后才能调用：

1. R1-only `Review1` 通过；
2. R2-only `Review2` 通过；
3. B1-merge 最终合并复审通过；如有合并修复，所有追加复审均通过；
4. 最终合并包只有一个确定构建物哈希，来源指纹、版本字段、完整清单和独立目录可复核；
5. 无未关闭阻断、需修复、待核实、环境/产品决策、用户待确认、技术栈红线或隔离风险；
6. COV-R2-01 已登记为后续计划覆盖项，未混入代码 Fix；
7. 当前版本全局 QA/S 编号重新核对，确认中间 R-only 候选不占用冻结编号。

预计冻结对象为最终 B1-merge，预计编号 `QA1/S1`，但编号以 15 执行时全局检索结果为准。15 只冻结最终合并包，不冻结 R-only 中间包；15 完成前不得覆盖 `E:\workbuddy-test\app-v0.3`。

### 8.1 冻结后部署与计划

- 15 冻结后的 S1 程序包覆盖部署到 `E:\workbuddy-test\app-v0.3`；部署前保留 S0 和当前候选，部署前后核对全量清单和 `WorkBuddy.exe` SHA-256。
- 不覆盖、清空或迁移 `E:\workbuddy-test\userData`；真实 `%APPDATA%\workbuddy\` 仍禁止触碰。
- 由 14 创建绑定同一 S1 的 R1 后续 `R1-3` 和 R2 首份 `R2-1` 计划；COV-R2-01 作为 R2 覆盖补充范围写入计划。
- 计划创建完成后，GPT 执行 12，用户执行 06；两者继续使用唯一正式入口 `E:\workbuddy-test\启动实测.bat`。
- 以上均不等于 R 关闭、用户验收、G1、C1 或维护期。

---

## 九、批次时间线

| 日期 | 事件 | 证据/落点 | 结论 |
|---|---|---|---|
| `2026-08-22` | C0/S0 建立并保留 | C0 提交、Tag、S0 构建目录和哈希 | `✅基线可追溯` |
| `2026-08-27` | R1 Fix1 执行完成 | R1 唯一闭环第 22 节、R1 候选历史包 | `待 Review1` |
| `2026-08-27` | R2 Fix1 执行完成 | R2 唯一闭环第七节、R2 候选历史包 | `待 Review2；Review1 前置停止保留` |
| `2026-08-28` | B1-R1 独立构建和 Review1 | R1 唯一闭环 §24；`E:\workbuddy 复审\B1\R1-only\evidence` | `✅R-only 通过` |
| `2026-08-28` | B1-R2 独立构建和 Review2 | R2 唯一闭环 §16；`E:\workbuddy 复审\B1\R2-only\evidence` | `✅R-only 通过` |
| `2026-08-28` | 从 C0 生成 B1-merge 独立组合源并完成非复审预检 | 本文档第 11 节；`E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-source`；`E:\workbuddy 复审\B1\merge\evidence\B1-merge-precheck-vitest.log`、`B1-merge-precheck-build.log` | `⏸️版本字段仍为 0.3.0-c0，不得进入 GUI Review` |
| `待执行` | B1-merge QA 版本构建和 Merge-Review1 | 本文档第 4、6、7 节 | `⏸️待 DS 设置版本并重建` |
| `待执行` | 15 冻结最终合并包 | 本文档第八节 | `预计 QA1/S1；待全局核对` |

---

## 十、当前正式结论

- B1 已被定义为 `R1 + R2` 的同一修复批次，共同基线为 `C0/S0`。
- B1 初始复审次数为 `3`；R2 的既有前置停止 `Review1` 不覆盖，R2-only 使用 `Review2`。
- R1-only `Review1` 与 R2-only `Review2` 已形成独立 GUI/只读/构建证据；B1-merge 仍未完成第三次集成复审。
- B1-merge 已从 C0 按两项批准差异生成独立组合源；组合源的辅助测试和 build 通过，但版本字段仍为 `0.3.0-c0`，不能作为 `0.3.0-qa.1` 合并候选或启动 GUI 复审。
- 不得调用 15，不得覆盖正式 `E:\workbuddy-test` 程序包，不得创建 R1 后续计划或 R2-1，直到 B1-merge 最终复审通过并完成 15。
- B1-merge 任何失败与修复均追加本文件，下一步只允许：补候选/补证、R-only Review、B1-Merge-Review、B1-merge 修复记录或 15 条件核对。

---

## 十一、B1-merge 独立组合源与非复审预检（2026-08-28）

### 11.1 来源与差异边界

- 独立源目录：`E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-source`；Git HEAD 为 C0 `34f155a1886c52dae278fbc71d037975646b2563`，未使用主工作树作为来源。
- 组合方式：从 C0 新建独立 worktree，再复制已通过的 B1-R1-only 与 B1-R2-only 批准差异；两组差异无重叠，未带入 `COV-R2-01`、未带入无关文档或历史数据清理。
- 组合差异文件共 8 个：R1 的 `flowWeekRepo.ts`、`flowReviewDerived.ts`、`ReviewTaskList.vue`、`flowTypes.ts`、`reviewComponents.spec.ts`、`r1Fix1.spec.ts`；R2 的 `flowGoalRepo.ts`、`flowRepos.spec.ts`。
- 合并源 `git status` 仅显示上述 7 个已跟踪修改和 R1 新增测试 `r1Fix1.spec.ts`；`git diff --check` 无空白错误。独立源使用主项目 `node_modules` 联结，仅用于复现既有构建依赖，不改变依赖内容。

### 11.2 辅助预检结果

| 项目 | 实际结果 | 证据 |
|---|---|---|
| 合并源版本字段 | `0.3.0-c0` | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-source\workbuddy\package.json` |
| 测试 | 28 个测试文件，`384/384` 通过 | `E:\workbuddy 复审\B1\merge\evidence\B1-merge-precheck-vitest.log` |
| 构建 | `npm run build` 退出码 `0` | `E:\workbuddy 复审\B1\merge\evidence\B1-merge-precheck-build.log` |
| GUI 复审 | 未启动 | 版本字段不满足 `0.3.0-qa.1`，本预检不能替代 `B1-Merge-Review1` |

### 11.3 当前门禁

本节只记录合并源准备和辅助预检，不构成 `B1-Merge-Review1`，不产生合并复审通过结论。待 DS 在该独立合并源中按治理边界同步 `package.json`/`package-lock.json` 的 `0.3.0-qa.1` 版本字段后，必须重新计算完整来源指纹、差异哈希、构建物清单和 `WorkBuddy.exe` 哈希，重新构建并部署到本文件第五节的 merge 复审目录；版本变化后的构建物才可执行第三次 GUI 集成复审。

---

## 十二、B1-Merge-Review1（2026-08-28，GPT；B1-merge）

> 本节是 B1 批次第三次、也是本次唯一的合并包集成复审记录。前置的 B1-R1-only `Review1`、B1-R2-only `Review2` 均已通过；R2 唯一闭环中的既有 `Review1` 前置停止继续保留。本次只复审从共同 C0 独立生成、版本字段为 `0.3.0-qa.1` 的 B1-merge 候选，不覆盖任何历史 Review，不把结果写入 GPT 报告、测试计划、`当前代码状态.md` 或新建审查日志。

### 12.1 前置、范围和候选核对

| 项目 | 本次核对事实 | 结论 |
|---|---|---|
| 复审模式 | 多 R 批次 `B1-merge` 集成复审；初始次数 `3 = B1-R1-only + B1-R2-only + B1-merge` | `✅` |
| 统一 Fix | `R1 Fix1`：`U-2`、`U-3 UI`、批准替代 `F-ISO-01`；`R2 Fix1`：`U-4` | `✅整批纳入` |
| 覆盖补充 | `COV-R2-01`“每周固定”已在 R2 唯一闭环登记为后续 `14` 覆盖补充，不进入代码 Fix 或本次产品结论 | `✅已登记；ℹ️非本次复审范围` |
| 替代/删除决策 | `F-ISO-01` 沿用 R1 §20 的用户批准替代边界；本批次无批准的产品删除方案。U-4 的删除操作按既有产品软删除规则核对，不把“页面看不见”直接当作数据正确 | `✅无未决策项` |
| R-only 前置 | R1 `Review1` 和 R2 `Review2` 均有各自唯一闭环中的当前 GUI/只读/构建证据并通过；R2 历史 `Review1` 前置停止未覆盖 | `✅` |
| 共同基线 | C0 提交 `34f155a1886c52dae278fbc71d037975646b2563`，Tag `v0.3.0-c0`；R-only 与 merge 均从该基线独立生成 | `✅` |
| 合并源 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-source`，Git HEAD 为 C0，未使用主工作树作为来源 | `✅` |
| 批准差异边界 | 8 个功能/测试差异文件：R1 的 `flowWeekRepo.ts`、`flowReviewDerived.ts`、`ReviewTaskList.vue`、`flowTypes.ts`、`reviewComponents.spec.ts`、`r1Fix1.spec.ts`；R2 的 `flowGoalRepo.ts`、`flowRepos.spec.ts`；另有 `package.json`/`package-lock.json` 仅同步批准的 QA 版本字段 | `✅无未批准代码差异` |
| 来源指纹 | `sourceTreeFingerprint=C4FE05CA90C25450652E939DECF9B9CFD3B88C01F56EF693B1E86F9162167964`；`trackedDiffSha256=EBD0A6FE3C7138F8D978E8171748FE26A5375A464E537017FF6DFABA260248` | `✅可追溯` |
| 版本/候选构建 | `package.json` 与 `package-lock.json` 顶层版本均为 `0.3.0-qa.1`；候选记录为 `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge\candidate-record.json` | `✅版本门禁满足` |
| 构建物 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge\out`，100 个文件；`WorkBuddy.exe` SHA-256 `EEC94A500952CC83A15A9BE1907B0059D8A6262BE63503FA9E54F94716011874`；清单哈希 `BF624DE35CC1D31B9D159D31B45DBD548E1D3F4B1B908E1031F329C2B245BCE7` | `✅` |
| 候选与复审程序一致性 | `E:\workbuddy 复审\B1\merge\app\WorkBuddy.exe` 与构建物 SHA-256 一致；复审 wrapper 为 `E:\workbuddy 复审\B1\merge\启动复审.bat`，显式绑定 `app` 与 `userData` | `✅` |
| 辅助测试/构建 | `B1-merge-qa-vitest.log`：28 files、`384/384`；`B1-merge-qa-build.log`：`electron-vite build` 通过；候选记录的 `npm run pack:win` 退出码为 `0`，构建时间 `2026-08-28T18:11:29+08:00` | `✅` |

本次没有把自动化测试、代码阅读或候选记录当作 GUI 通过依据；它们只用于候选来源和构建可追溯。实际产品判断以下列出的可见 Electron GUI、页面稳定态和应用关闭后的只读核验为准。

### 12.2 `U-2` / `R1-2-T05-C03`：复盘统计与场次完成态

- **原始失败场景**：场次型任务 I2 完成 `3/3` 后，原复盘概览显示 `0%/0`，计划分母、完成分子、日明细、趋势和任务状态不一致。
- **原始预期**：完成凭据、计划场次、日安排、周摘要、趋势和任务卡片使用同一完成场次集合；刷新、离开和重新进入后仍一致。
- **复审操作**：在同一 merge 测试副本用可见 GUI 创建 `B1-merge-U2-I2-3`，目标次数为 `3`；周五安排并完成一场，再用“标记一场完成”补足到 `3/3`；进入“复盘趋势”，观察稳定态，刷新，离开“周统筹”后重新进入复盘并核对任务状态。
- **当前实际**：复盘稳定态为 `100%`、`1/1 已完成`，周五为 `1/1`、`100%`，任务卡显示 `3/3`；刷新和离开重进后未改变。没有白屏、崩溃或异常错误反馈。
- **GUI 证据**：`E:\workbuddy 复审\B1\merge\evidence\B1-merge-U2-task-form.png`、`B1-merge-U2-day-selection.png`、`B1-merge-U2-friday-assigned.png`、`B1-merge-U2-session-1.png`、`B1-merge-U2-session-2.png`、`B1-merge-U2-session-3-complete.png`、`B1-merge-U2-review-stable.png`、`B1-merge-U2-review-refresh.png`、`B1-merge-U2-review-reenter.png`。
- **只读与持久化**：应用关闭后使用 `readOnly=true` 读取 `E:\workbuddy 复审\B1\merge\userData\workbuddy.db`；`B1-merge-readonly.json` 的 `integrity=ok`，可见 U2 实例为 `kind=multi`、`targetCount=3`，有 1 条日安排和 3 条 active 凭据（1 条日完成、2 条额外场次），与 GUI `3/3` 一致；未通过写库造证。
- **结论**：`✅已解决`。原严重度为 `🟡需修复` 的统计不一致本次未复现；无新引入问题。无替代或删除方案，剩余风险仅是未列出的用户用例仍不写成用户验收通过。

### 12.3 `U-3 UI` / `R1-2-T05-C05`：取消、确认、转周和历史项收敛

- **原始失败场景**：确认转周成功并生成承接任务后，W34 原行仍显示“未完成/未安排”，并保留“转下周”确认入口，存在重复操作风险。
- **原始预期**：取消时不生成承接；确认成功后 W34 原行保留为历史记录、划掉并变灰、状态为“已转下周”，确认条和入口消失/不可操作；W35 只生成一条带 `carriedFrom` 的一次性承接；刷新、离开重进保持。
- **复审操作与实际**：在 W34 创建 `B1-merge-U3-Historical-H1`；第一次打开确认条后点击“取消”，确认条消失且原行仍在，没有可见承接；再次打开确认条并点击“确认”，页面出现成功后的稳定态，W34 原行划线变灰并显示“已转下周”，确认条和“转下周”入口不再提供；W35 显示唯一承接任务。刷新 W34、离开并回到周统筹后，状态仍保持。
- **GUI 证据**：确认/取消过程为 `E:\workbuddy 复审\B1\merge\evidence\B1-merge-U3-confirmation-visible.png`、`B1-merge-U3-confirmation-2.png`、`B1-merge-U3-after-cancel.png`；成功稳定态和刷新为 `B1-merge-U3-after-confirm-stable.png`、`B1-merge-U3-after-refresh-W34.png`；承接为 `B1-merge-U3-W35-carried-visible.png`。
- **只读与持久化**：同一 `B1-merge-readonly.json` 显示 W34 源实例 `id=2`，W35 唯一承接实例 `id=3`、`carriedFrom=2`、`isDeleted=0`；未见第二条承接，数据库 `integrity=ok`。该只读结果同时回归核对了 R1 已关闭的 U-3 持久化子范围，没有把它重新拆成新的 Fix。
- **结论**：`✅已解决`。取消/确认边界、成功反馈、入口生命周期、幂等、承接关联和刷新/离开重进均通过；原 `🔴阻断` UI 风险未复现，无新引入问题。无批准替代或删除方案；不把用户未详细回传的其他 C05 步骤写成用户全量通过。

### 12.4 `F-ISO-01`：批准入口替代与数据隔离

- **原始事实/预期**：直接双击 exe 历史上可能绕过 `WORKBUDDY_USER_DATA` 并进入另一数据源；R1 §20 已批准的边界是测试和复审只使用包装入口，直接双击不作为通过依据，并保留原 exe/数据/历史差异证据。
- **复审操作与实际**：两次均通过 `E:\workbuddy 复审\B1\merge\启动复审.bat` 启动同一候选；wrapper 使用 `%~dp0app\WorkBuddy.exe` 和 `%~dp0userData`，应用可见启动；关闭后再次用同一 wrapper 启动，首页仍显示已建立的 `B1-merge` 测试数据。没有直接双击 exe，没有读取、复制、修改、清空或删除 `%APPDATA%\workbuddy\`，也没有使用 `E:\workbuddy-test\userData`。
- **证据**：`E:\workbuddy 复审\B1\merge\evidence\B1-merge-boot.png`、`B1-merge-wrapper-reopen.png`；wrapper 本身为 `E:\workbuddy 复审\B1\merge\启动复审.bat`，独立业务数据目录为 `E:\workbuddy 复审\B1\merge\userData`。
- **替代/删除结果**：批准的“只使用包装入口”替代边界可用；未删除 exe，未迁移或清空数据，未把显式参数入口或直接 exe 改写为正式入口。官方用户测试入口 `E:\workbuddy-test\启动实测.bat` 仍按门禁留待 15 冻结 S1 后部署，不以当前 merge wrapper 冒充用户最终入口。
- **结论**：`✅已解决`（B1-merge 候选的入口替代和隔离复审）。原 `🔴阻断` 环境风险在本候选复审中未复现；剩余部署等待是 15 的流程前置，不是本次未解决产品问题。

### 12.5 `U-4` / `R1-2-T02-C02`：同周同月目标幂等及合法边界

- **原始失败场景**：同一用户、同一周、同一月目标重复选取后出现多条 active `flow_week_focus`；原始预期是同一 `(weekStart, monthGoalId)` 始终只有一条 active 关联，重复提交、刷新和离开重进不新增。
- **W35 同周重复复审**：通过“月指导”创建 `B1-merge-U4-Month-M1`，在 W35 首次从月目标选取；随后对同一目标连续重复打开/提交三次。每次可见反馈为已添加，列表计数始终为 `1`，没有第二条同月关联；刷新 W35、离开月指导再回到 W35 后仍为 `1`。证据：`E:\workbuddy 复审\B1\merge\evidence\B1-merge-U4-month-created.png`、`B1-merge-U4-first-select.png`、`B1-merge-U4-repeat-1.png`、`B1-merge-U4-repeat-3.png`、`B1-merge-U4-after-refresh-W35.png`、`B1-merge-U4-leave-month.png`、`B1-merge-U4-reenter-W35.png`。
- **跨周和手写边界**：进入 W36 再次选取同一月目标，页面只有一条月关联；随后通过手写入口创建同标题目标，页面合法显示两条同标题目标。证据：`B1-merge-U4-W36-empty.png`、`B1-merge-U4-W36-linked.png`、`B1-merge-U4-W36-manual-same-title.png`。
- **软删除后重选**：在 W36 删除月关联前出现确认条；确认后页面只剩手写目标；再次从月指导选取后恢复两条。证据：`B1-merge-U4-soft-delete-confirm.png`、`B1-merge-U4-after-soft-delete.png`、`B1-merge-U4-after-reselect.png`。只读结果没有把删除后的“看不见”当成正确，而是核对旧关联保留为 `isDeleted=1`，新 active 关联重新生成。
- **最终刷新/离开重进**：重启同一 merge wrapper 后进入 W36，刷新，再从“月指导”离开并回到 W36；两次页面均显示两条合法目标。准确的周统筹截图为 `E:\workbuddy 复审\B1\merge\evidence\B1-merge-U4-W36-reselected-refresh.png` 和 `B1-merge-U4-W36-reselected-reenter.png`。
- **只读与持久化**：`B1-merge-readonly.json` 的 `integrity=ok`；月目标 1 条；周核心目标 4 条：W35 1 条 active 月关联，W36 1 条历史软删除月关联（`isDeleted=1`）、1 条 active 手写同标题（`monthGoalId=null`）和 1 条 active 月关联。该结果证明同周同月无重复 active 关联、跨周可分别存在、手写同标题不受月关联幂等约束，且软删除数据保留边界正确。
- **结论**：`✅已解决`。原 `🟡需修复` 的重复选取/重复提交、刷新/离开重进和页面计数问题均未复现；跨周、手写同标题、确认删除、软删除保留和删除后重选均通过。无批准替代方案或新的产品删除方案；无数据损坏、重复 active 数据、崩溃、白屏、错误反馈缺失或敏感泄露。

### 12.6 跨功能回归、技术栈、隔离与越界核对

- **跨功能回归**：U-2 的场次完成与复盘统计、U-3 的 W34→W35 承接、U-4 的 W35/W36 目标关联在同一 merge `userData` 中连续存在，导航、刷新、重启未互相覆盖；wrapper 重开后仍能看到既有测试任务。
- **错误/页面稳定态**：已实际覆盖 U-3 的取消/确认和成功后的入口收敛、U-4 的删除确认/软删除/重选、U-2 的刷新/离开重进；操作链路未见崩溃、白屏、重复写入、静默失败或敏感信息。计划未定义的额外错误降级用例和用户未回传的用例不在本次结论中，不伪造为完整用户通过。
- **技术栈**：候选保持 Electron/Vue/vue-router/better-sqlite3/electron-vite/electron-builder/Vitest 既定栈；没有引入新依赖，没有修改冻结区或 IPC 必填校验。`npx vitest run` 为 `384/384`，build/pack 通过，`git diff --check` 通过。正确命令 `npx tsc --noEmit -p tsconfig.node.json` 仅报告存量 `src/main/services/news.ts:22`；`tsconfig.web.json` 仅报告既有项目/路由类型诊断，未命中本批次 8 个批准差异文件，按存量基线记录，不构成新增技术栈红线。
- **数据层与隔离**：任务事实均通过可见 GUI 写入结构化表；删除结果为软删除，未物理清理历史数据。应用关闭后只读 helper 以 `readOnly=true` 读取 `E:\workbuddy 复审\B1\merge\userData\workbuddy.db`，最终数据库 SHA-256 为 `14948FA5E2D8F2D2F9D9F9349A2626F275B36C870D724B183D7C9216D676F20E`；未读取、复制、修改、删除真实 `%APPDATA%\workbuddy\`，未触碰 `E:\workbuddy-test` 数据。
- **来源与越界**：候选只含本节 12.1 列出的 R1/R2 批准差异和 QA 版本字段；未带入 `COV-R2-01`、历史数据清理、无关重构或另一 R 的额外代码。未创建新 R、未创建新 `FixN`、未回流 R1/R2、未修改 GPT 正式报告、测试计划、用户回传或 `当前代码状态.md`。

### 12.7 未列用例、覆盖登记与新问题

- 用户 06 未列出的用例仍记为：`ℹ️本次暂未发现问题（用户未回传详细记录）`；这不等同于用户全量通过、用户验收或轮次关闭。
- `COV-R2-01` 继续保留为 R2 后续覆盖补充，必须由合法节点 `14` 在 15 冻结后建立明确脚本、预期、刷新/重进和证据要求；本次没有用旧的未定义步骤判定它通过。
- 本次未发现新的 `🔴阻断`、`🟡需修复`、环境/产品决策缺口、隔离风险、技术栈红线或无关越界改动。没有需要回到 07 的合并阶段 Fix。

### 12.8 B1-merge 正式结论

- **复审结论**：`✅通过（修复复审）`。`R1 Fix1` 的 U-2、U-3 UI、批准替代 F-ISO-01 与 `R2 Fix1` 的 U-4 均已在同一 B1-merge 候选上完成当前 GUI、稳定态、刷新/离开重进、只读持久化、隔离和回归核对；R-only 前置均已通过，覆盖补充项已正确登记，无未关闭阻断、需修复、决策缺口或越界问题。
- **下一步**：`待 15 冻结 QA/S`。由 15 重新核对全局 QA/S 编号、候选来源指纹、完整清单、构建物和独立目录后，才可冻结最终合并包；本次不调用 15，不覆盖 `E:\workbuddy-test\app-v0.3`，不创建 `R1-3`、`R2-1` 或覆盖补充计划。
- **边界声明**：本结论不等于用户验收、`G1`、`C1`、正式版本发布或维护期；15 完成前，B1 仅处于“合并修复复审通过、等待 QA/S 冻结”。

### 12.9 本次合并复审证据索引

| 证据类型 | 绝对路径 |
|---|---|
| 候选记录 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge\candidate-record.json` |
| 候选源 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-source` |
| 构建输出 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge\out` |
| 合并 GUI/只读/构建证据目录 | `E:\workbuddy 复审\B1\merge\evidence` |
| 合并程序入口 | `E:\workbuddy 复审\B1\merge\启动复审.bat` |
| 合并测试数据 | `E:\workbuddy 复审\B1\merge\userData` |
| 只读结果 | `E:\workbuddy 复审\B1\merge\evidence\B1-merge-readonly.json` |
| QA 测试日志 | `E:\workbuddy 复审\B1\merge\evidence\B1-merge-qa-vitest.log` |
| QA 构建日志 | `E:\workbuddy 复审\B1\merge\evidence\B1-merge-qa-build.log` |

---

## 十三、B1-merge 修复记录1（2026-08-28，候选来源记录与构建重建）

### 13.1 触发原因与修复边界

- 15 冻结前核对发现旧候选记录 `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge\candidate-record.json` 把 `workbuddy/package.json` 记录为 `D`，而同一 B1-merge 源当前实际为 `M`；旧记录的 `trackedDiffSha256=EBD0A6FE3C7138F8D978E8171748FE26A5375A464E53701737FF6DFABA260248` 与当前源复算值不一致。
- 旧候选输出时间早于 `package.json` 最后写入时间，不能证明旧构建物来自当前稳定源；旧候选、旧构建物和 Review1 证据保留为历史参考，不作为本次最终冻结对象。
- 本记录只修复 B1-merge 候选来源记录、构建和追溯链，不新增产品代码 Fix，不回流 R1/R2，不创建新 R，不纳入 `COV-R2-01`。

### 13.2 稳定源核对

| 项目 | 重建前稳定源结果 | 结论 |
|---|---|---|
| 源目录 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-source` | `✅` |
| HEAD | `34f155a1886c52dae278fbc71d037975646b2563` | `✅保持 C0` |
| 实际状态 | 9 个已跟踪修改 + `workbuddy/tests/r1Fix1.spec.ts` 1 个未跟踪文件 | `✅` |
| 允许差异 | R1/R2 已批准 8 个功能/测试文件 + 两个版本文件 | `✅无额外差异` |
| 版本文件 | `package.json`、`package-lock.json` 顶层和 `packages[""]` 均为 `0.3.0-qa.1`；版本差异之外无内容变化 | `✅` |
| `git diff --check` | 通过 | `✅` |

### 13.3 重建候选与可复算记录

| 项目 | `rebuild1` 结果 |
|---|---|
| 候选记录 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-rebuild1\candidate-record.json` |
| 构建目录 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-rebuild1\out` |
| 测试 | `npx vitest run`；28 files，384/384 通过；日志 `E:\workbuddy 复审\B1\merge\evidence\B1-merge-rebuild1-vitest.log` |
| 构建 | `npm run pack:win`；exit 0；日志 `E:\workbuddy 复审\B1\merge\evidence\B1-merge-rebuild1-pack.log` |
| 来源工作树指纹 | `32FDCB473A3920FEC422D1BB021FAEC4651497C5221CF68E121665227663AA5B` |
| `trackedDiffSha256` | `443C31131B4802EE0ABD0C5A4D68646E345C53361B51D47D0D220989FD332754` |
| 构建物 | 100 个文件；`WorkBuddy.exe` 188,784,128 bytes，SHA-256 `EEC94A500952CC83A15A9BE1907B0059D8A6262BE63503FA9E54F94716011874` |
| 全量清单哈希 | `1ABAD3E47CF69DD9D167EC01E6834A51FC42B96AEE971DC5A5E6CB551DE6AB6F` |
| 来源证据 | `E:\workbuddy 复审\B1\merge\evidence\B1-merge-rebuild1-source-status.txt`、`B1-merge-rebuild1-tracked-diff.patch` |

候选记录已用同一源状态和同一构建输出重新复算：HEAD、`sourceStatus`、来源工作树指纹、tracked diff、版本字段、允许差异、完整清单和 `WorkBuddy.exe` 哈希均逐项一致。此记录完成后，仍需对 `rebuild1` 候选追加 `B1-Merge-Review2`；在 Review2 和 15 完成前，不创建 S1、不覆盖正式测试包。

---

## 十四、B1-Merge-Review2（2026-08-28，GPT；重建候选修复复审）

> 本节是在第十二节 `B1-Merge-Review1` 和第十三节 `B1-merge 修复记录1` 之后追加的批次级复审，不能覆盖历史结论。复审对象是 `rebuild1` 最终 B1-merge 候选；旧候选和旧 Review1 证据保留为历史参考，不作为本次最终冻结对象。

### 14.1 复审身份、前置与范围

| 项目 | 复审事实 |
|---|---|
| 复审模式 | 用户实测多 R 批次 `B1-merge` 集成复审 |
| 版本/功能 | `v0.3 / 任务数据流通重构`；候选版本字段 `0.3.0-qa.1` |
| 权威文档 | `E:\workspace\用户实测阶段\v0.3-任务数据流通重构\合并复审\B1-merge的全流程闭环.md` |
| 关联 Fix | `R1 Fix1 + R2 Fix1`；B1-merge 无新增合并代码 Fix；`COV-R2-01` 不纳入 |
| R-only 前置 | B1-R1-only `Review1`：`✅通过（修复复审）`；B1-R2-only `Review2`：`✅通过（修复复审）`；R2 历史 `Review1` 前置停止保留，未被覆盖 |
| 复审原因 | 15 前置核对发现旧候选 `sourceStatus` 与实际源状态不一致，且版本文件写入晚于旧候选构建；按第十三节重建后必须使用下一批次复审编号 |
| 最终复审编号 | `B1-Merge-Review2`；不覆盖 `B1-Merge-Review1` |
| 共同基线 | `C0=34f155a1886c52dae278fbc71d037975646b2563`，Tag `v0.3.0-c0`，共同 `S0` 保留 |

### 14.2 重建候选来源和构建身份

| 项目 | 当前可复核事实 |
|---|---|
| 候选源目录 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-source` |
| HEAD | `34f155a1886c52dae278fbc71d037975646b2563` |
| 来源工作树指纹 | `32FDCB473A3920FEC422D1BB021FAEC4651497C5221CF68E121665227663AA5B` |
| `trackedDiffSha256` | `443C31131B4802EE0ABD0C5A4D68646E345C53361B51D47D0D220989FD332754`；与 `B1-merge-rebuild1-tracked-diff.patch` SHA-256 一致 |
| 实际源状态 | `package.json`、`package-lock.json` 为 `M`；其余 7 个已跟踪批准文件为 `M`；`workbuddy/tests/r1Fix1.spec.ts` 为批准范围内新增文件；无额外差异 |
| 允许差异 | R1 Fix1 的 6 个代码/测试文件、R2 Fix1 的 2 个代码/测试文件，以及两个版本文件；未包含 `COV-R2-01`、未批准改动、历史数据清理或无关重构 |
| 版本核对 | `package.json` 为 `0.3.0-qa.1`；`package-lock.json` 顶层与 `packages[""]` 版本字段为 `0.3.0-qa.1`；版本文件写入早于 `builtAt` |
| 候选记录 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-rebuild1\candidate-record.json`；`files` 为 100 个文件的全量清单 |
| 构建输出 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-rebuild1\out` |
| 构建时间 | `2026-08-28T20:55:22+08:00`（候选记录随后生成；记录写入时间 `2026-08-28T20:56:02+08:00`） |
| 构建结果 | `npx vitest run`：28 files，`384/384` 通过；`npm run pack:win` exit 0；日志分别为 `E:\workbuddy 复审\B1\merge\evidence\B1-merge-rebuild1-vitest.log`、`E:\workbuddy 复审\B1\merge\evidence\B1-merge-rebuild1-pack.log` |
| 构建物 | 100 个文件；`WorkBuddy.exe` 188,784,128 bytes；SHA-256 `EEC94A500952CC83A15A9BE1907B0059D8A6262BE63503FA9E54F94716011874` |
| 全量清单 | `candidate-record.json` 内嵌 `files` 全量清单，共 100 个文件；清单哈希 `1ABAD3E47CF69DD9D167EC01E6834A51FC42B96AEE971DC5A5E6CB551DE6AB6F` |

### 14.3 独立程序、GUI 复审和只读证据

Review2 全程使用独立副本：程序目录 `E:\workbuddy 复审\B1\merge\review2\app`，启动包装 `E:\workbuddy 复审\B1\merge\review2\启动复审-Review2.bat`，独立 `userData` 为 `E:\workbuddy 复审\B1\merge\review2\userData`，证据目录为 `E:\workbuddy 复审\B1\merge\review2\evidence`，测试数据前缀为 `B1-merge-review2-`。包装设置 `WORKBUDDY_APP`、`WORKBUDDY_USER_DATA` 并只启动该副本；副本 `WorkBuddy.exe` 与 `rebuild1\out\WorkBuddy.exe` SHA-256 一致。

- **U-2 原始失败场景与复审**：在同一 Review2 副本创建场次型任务，完成 3 场并进入复盘；当前稳定态显示复盘 `100%`、`1/1 已完成`，周五显示 `1/1`、`100%`，任务卡显示 `3/3`。刷新、离开周统筹后重新进入复盘均保持。证据：`B1-merge-review2-U2-multi-form.png`、`B1-merge-review2-U2-task-created-W35.png`、`B1-merge-review2-U2-session-1.png`、`B1-merge-review2-U2-session-2.png`、`B1-merge-review2-U2-session-3-complete.png`、`B1-merge-review2-U2-review-stable.png`、`B1-merge-review2-U2-review-refresh.png`、`B1-merge-review2-U2-review-reenter.png`。对应只读结果见 `B1-merge-review2-final-readonly-reopen.json`，`integrity=ok`，与页面完成态一致。结论：`✅已解决`。
- **U-3 UI 原始失败场景与复审**：历史 W34 任务先取消转周确认，再确认转周；取消不生成承接，确认后原项收敛为“已转下周”并只生成一条 W35 承接，确认入口消失。刷新、离开和重新进入后状态保持。证据：`B1-merge-review2-U3-H4-confirm-open.png`、`B1-merge-review2-U3-H5-confirm-open.png`、`B1-merge-review2-U3-H5-after-cancel.png`、`B1-merge-review2-U3-H5-after-confirm-W34.png`、`B1-merge-review2-U3-H5-W35-carried.png`、`B1-merge-review2-U3-H5-after-refresh-W34.png`、`B1-merge-review2-U3-H5-after-leave-reenter-W34.png`、`B1-merge-review2-U3-review-W35.png`。只读持久化与 `carriedFrom` 边界正确。结论：`✅已解决`。
- **F-ISO-01 批准替代与隔离**：按 16 的批准边界只使用 Review2 包装入口，不直接双击 exe；包装指向 `review2\app\WorkBuddy.exe` 和 `review2\userData`，重开后仍显示 Review2 前缀数据。证据：`B1-merge-review2-boot.png`、`B1-merge-review2-F-ISO-01-wrapper-reopen.png`、启动包装本身。未读取、复制、修改、清空或删除真实 `%APPDATA%\workbuddy\`，未使用 `E:\workbuddy-test\userData`。结论：批准替代和隔离边界通过。
- **U-4 原始失败场景与合法边界**：W35 同周同月目标重复打开/提交多次后始终只有 1 条 active；W36 跨周选取成功；手写同标题目标合法保留；删除月关联经过确认并软删除；旧关联保留 `isDeleted=1`，删除后重选生成新的 active 关联；最终刷新、离开月指导再进入 W36 仍显示两条合法目标。证据：`B1-merge-review2-U4-month-created.png`、`B1-merge-review2-U4-first-select.png`、`B1-merge-review2-U4-repeat-3.png`、`B1-merge-review2-U4-W36-manual-same-title.jpg`、`B1-merge-review2-U4-soft-delete-confirmation.jpg`、`B1-merge-review2-U4-soft-delete-confirmation-reopen.jpg`、`B1-merge-review2-U4-after-soft-delete.jpg`、`B1-merge-review2-U4-W36-reselected.jpg`、`B1-merge-review2-U4-W36-reselected-refresh.jpg`、`B1-merge-review2-U4-W36-reselected-reenter.jpg`。不引用实际为 JPEG 的错误扩展名文件 `B1-merge-review2-U4-W36-linked.png`，也不引用之前的空白截图。结论：`✅已解决`。

最终只读证据为 `E:\workbuddy 复审\B1\merge\review2\evidence\B1-merge-review2-final-readonly-reopen.json`：`integrity=ok`，Electron `33.4.11`，22 张表；`flow_week_focus` 共 4 条，其中 W35 1 条 active、W36 1 条 active 月关联、1 条 active 手写同标题、1 条 `isDeleted=1` 历史关联；`flow_week_instances` 9 条、`flow_day_entries` 3 条、`flow_vouchers` 3 条。该文件由复审副本重开后正常关闭再以 `readonly=true` 生成；与此前 `B1-merge-review2-final-readonly.json` 内容一致，未出现业务数据漂移。

### 14.4 回归、技术栈和边界结论

- U-2 的场次完成与复盘统计、U-3 的 W34→W35 承接、U-4 的 W35/W36 目标关联在同一 Review2 `userData` 中连续存在；导航、刷新、重启未互相覆盖。
- 已覆盖页面稳定态、刷新、离开重进、只读持久化、取消/确认、删除反馈、数据一致性、入口和隔离；未见崩溃、白屏、静默失败、重复 active 写入或敏感信息。用户 06 未列出的用例仍只记为“本次暂未发现问题（用户未回传详细记录）”，不解释为用户全量通过或用户验收。
- 候选继续使用 Electron/Vue/vue-router/better-sqlite3/electron-vite/electron-builder/Vitest 既定技术栈；没有引入新依赖、没有修改冻结区或 IPC 必填校验。`COV-R2-01` 继续登记为后续覆盖补充，由 15 冻结后合法交 14 建立计划。
- 本节未创建新 R、未创建新 R `FixN`、未回流 R1/R2、未修改产品代码、数据库、测试计划、GPT 正式报告、用户回传、`当前代码状态.md` 或正式测试入口。

### 14.5 批次级复审结论

- **复审结论**：`✅通过（修复复审）`。R1-only `Review1`、R2-only `Review2` 和当前最终 B1-merge `B1-Merge-Review2` 均已通过；当前 `rebuild1` 候选身份、版本、构建、GUI、只读、隔离和合并边界可复核。
- **冻结对象边界**：下一步 15 只允许冻结最终 `B1-merge` 合并包；R1-only、R2-only、旧 B1 候选及其他中间候选均不得占用 QA/S。
- **当前状态**：`待 15 冻结 QA/S`。本节不等于 QA/S 已冻结、用户验收、`G1`、`C1`、正式发布或维护期；在 15 完成前不覆盖 `E:\workbuddy-test\app-v0.3`，不创建 `R1-3`、`R2-1` 或 `COV-R2-01` 覆盖计划。

---

## 十五、QA/S 冻结记录（B1-Merge-Review2）

### 15.1 冻结结论与编号

- **模式**：用户实测多 R 批次 `B1-merge`；版本/功能为 `v0.3 / 任务数据流通重构`。
- **唯一权威文档**：`E:\workspace\用户实测阶段\v0.3-任务数据流通重构\合并复审\B1-merge的全流程闭环.md`。
- **关联 Fix/Review**：`R1 Fix1 + R2 Fix1`；B1-merge 无新增合并代码 Fix；`B1-merge 修复记录1` 已记录重建事实；最终集成复审为 `B1-Merge-Review2`，结论 `✅通过（修复复审）`。
- **QA/S**：本版本全局编号核对确认 `QA1/S1` 为下一个未占用编号；本次只冻结 `QA1/S1`，不复用既有 QA/S。R1-only、R2-only、旧 B1 候选和其他中间候选均未冻结为 QA/S，也未占用批次最终编号。
- **冻结时间**：`2026-08-28 23:49:27 +08:00`（`2026-08-28T15:49:27.9863137Z`）。

### 15.2 批次范围和前置门禁

- 纳入 R 为 `R1`、`R2`，共同基线为 `C0=34f155a1886c52dae278fbc71d037975646b2563`、Tag `v0.3.0-c0`，共同 `S0` 保留。
- B1-R1-only 的 `Review1`、B1-R2-only 的 `Review2` 和最终 B1-merge 的 `B1-Merge-Review2` 均为 `✅通过（修复复审）`；R2 历史 `Review1` 前置停止保留，未被覆盖。
- `COV-R2-01` 是后续覆盖补充项，未进入 `R2 Fix1`、B1-merge 代码候选或本次 QA/S 冻结；后续由 `14` 在 `R2-1` 计划中登记脚本、预期、分支和证据要求。
- 最终冻结对象明确为 **B1-merge 合并包**。最终包只包含批准的 R1/R2 差异和 QA 版本字段，未带入未批准改动、历史数据清理、无关重构或覆盖补充项。

### 15.3 候选来源、版本和构建身份

| 项目 | 冻结事实 |
|---|---|
| 候选源目录 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-source` |
| HEAD / baseCommit | `34f155a1886c52dae278fbc71d037975646b2563` |
| sourceTreeFingerprint | `32FDCB473A3920FEC422D1BB021FAEC4651497C5221CF68E121665227663AA5B` |
| trackedDiffSha256 | `443C31131B4802EE0ABD0C5A4D68646E345C53361B51D47D0D220989FD332754`；与 `B1-merge-rebuild1-tracked-diff.patch` 一致 |
| 源状态 | 10 条状态与候选记录完全一致：两个版本文件和 7 个已跟踪批准文件为 `M`，`workbuddy/tests/r1Fix1.spec.ts` 为批准范围内 `??`；无 COV 或未批准路径 |
| 批准差异范围 | R1 Fix1 的 6 个代码/测试文件、R2 Fix1 的 2 个代码/测试文件，以及 `package.json`、`package-lock.json` 的 `0.3.0-qa.1` 版本字段 |
| 候选记录 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-rebuild1\candidate-record.json` |
| 候选版本 | `0.3.0-qa.1`；`package.json`、`package-lock.json` 顶层和 `packages[""]` 均一致 |
| 构建目录 / 时间 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-rebuild1\out`；`2026-08-28T20:55:22+08:00` |
| 构建结果 | `npx vitest run`：28 files、`384/384` 通过；`npm run pack:win` exit 0 |
| 全量构建清单 | 候选记录 `files` 全量清单，共 100 个文件；清单哈希 `1ABAD3E47CF69DD9D167EC01E6834A51FC42B96AEE971DC5A5E6CB551DE6AB6F` |
| 构建物 | `WorkBuddy.exe` SHA-256 `EEC94A500952CC83A15A9BE1907B0059D8A6262BE63503FA9E54F94716011874` |

候选身份、源状态、版本、构建时间先后、完整清单、构建物哈希和 Review2 程序副本已由 `E:\workbuddy 复审\B1\merge\evidence\B1-merge-qa1-s1-freeze-verification-final.json` 记录，并经独立现场复算确认 `allChecksPassed=true`。旧的失败核对文件 `B1-merge-qa1-s1-freeze-verification.json` 保留为历史，不作为冻结依据。

### 15.4 S1 快照和程序隔离

| 项目 | 冻结事实 |
|---|---|
| S1 快照目录 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-s1`；只从最终 B1-merge `rebuild1` 候选复制，不从 R-only 或主工作树复制 |
| S1 构建目录 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-s1\out`；100 个文件，335,401,715 bytes |
| S1 全量清单 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-s1\S1-manifest.sha256`；SHA-256 `0044A2AE3A0075C3733748006308FD3E5F05B19388C5CDEAF02C584DA94FE581` |
| S1 记录 | `E:\workbuddy-snapshots\v0.3.0-qa.1-b1-merge-s1\S1-snapshot-record.json`；记录来源、版本、构建物、入口、数据目录和边界 |
| S1 不可变性 | 快照根目录 102/102 个文件均为只读；候选构建物、S1 和 Review2 `app` 三份 100 文件逐文件一致 |
| 复审入口 | `E:\workbuddy 复审\B1\merge\review2\启动复审-Review2.bat`；程序副本 `E:\workbuddy 复审\B1\merge\review2\app`；`userData` `E:\workbuddy 复审\B1\merge\review2\userData`；证据前缀 `B1-merge-review2-` |
| 冻结后正式入口 | `E:\workbuddy-test\启动实测.bat`；正式程序目录 `E:\workbuddy-test\app-v0.3`；正式 `userData` `E:\workbuddy-test\userData`；R1-3/R2-1 前缀由 `14` 分别确定 |
| 隔离边界 | Review2 未使用正式测试 `userData`，正式入口未被覆盖；未读取、复制、修改、清空或删除真实 `%APPDATA%\workbuddy\` |
| 操作系统 | Windows 11 家庭中文版，`10.0.22631`，x64 |

### 15.5 复审证据、替代/删除和剩余范围

- Review2 GUI 证据、只读证据、构建日志、隔离证据和技术栈边界见本文件 §14.3–§14.4；只读最终证据为 `E:\workbuddy 复审\B1\merge\review2\evidence\B1-merge-review2-final-readonly-reopen.json`，`integrity=ok`。GUI 证据定位到 U-2、U-3 UI、F-ISO-01、U-4 的原始失败、预期、复审操作、稳定态、刷新/离开重进、只读持久化、错误反馈、数据一致性和隔离边界。
- 构建/来源证据为 `E:\workbuddy 复审\B1\merge\evidence\B1-merge-rebuild1-source-status.txt`、`B1-merge-rebuild1-tracked-diff.patch`、`B1-merge-rebuild1-vitest.log`、`B1-merge-rebuild1-pack.log`；均与候选记录和最终构建物核对一致。
- `F-ISO-01` 使用 R1/16 已批准的“仅使用包装入口”替代边界：复审和后续正式测试均以明确入口、独立 `userData`、关闭重开和数据保留条件为验收；不删除 exe、不迁移/清空业务数据，不把直接双击 exe 作为通过依据。U-4 的软删除行为已在 R2 Review2 中按产品边界核对，不构成未批准删除。
- 未列出的用户用例仍只保留“本次暂未发现问题（用户未回传详细记录）”，不解释为用户全量通过、用户验收或轮次关闭。当前无待核实、环境/产品决策、待用户确认、阻断、数据损坏、安全风险或越界改动。
- 15 未修改产品代码、数据库、测试计划正文、GPT 正式报告、用户回传、`当前代码状态.md` 或正式测试入口；未创建计划。

### 15.6 冻结结果和下一步

- **冻结结果**：`QA1/S1 已冻结`，冻结对象仅为最终 `B1-merge` 合并包；R1-only、R2-only、旧候选和其他中间候选均未冻结。
- **当前状态**：B1 进入 `🟢等待下一轮测试`。该状态不等于用户验收、功能实测轮次关闭、`G1`、`C1`、正式发布或维护期。
- **下一步**：交给 `14` 创建 R1 后续 `R1-3` 和 R2 首份 `R2-1` 计划，二者均绑定同一个 `S1` 构建物；`COV-R2-01` 只在合法后续覆盖计划中纳入。GPT 和用户后续测试可使用不同数据副本，但必须使用同一 S1 构建物。
- 若冻结后发现 B1 合并包问题，不拆批、不回流 R1/R2、不新建 R-only `FixN`，只在本批次文档追加下一条 `B1-merge 修复记录N`，并按批次级下一次 Review 处理。

---

## 十六、B1 批次闭环裁决（2026-09-08，GPT）

- **批次范围**：B1 仅负责本次纳入的 `R1 Fix1`、`R2 Fix1`、`B1-merge Review`、`15A` 以及 `QA1/S1` 交接事项。
- **处置结论**：B1 范围内事项均已获得对应处置。R1-3 的 T01 用户侧未发现问题，按用户明确决议登记为用户侧通过；R2-1 的双方事实已在其唯一闭环文档 §17.19 合并并关闭；B1-merge Review2 已通过；QA1/S1 已冻结。
- **责任边界**：`R1 Fix2/R1-4`（含 QA2/S2、后续 T01-T06）及独立 `R3` 路径不属于 B1；其后续修复、复测和交接由各自 R/后续 B 负责，不回溯为 B1 未完成事项。
- **正式状态**：B1 文档层 `closureStatus=closed`，即 B1 批次闭环。该状态仅表示 B1 纳入事项均已处置，不代表所有产品问题解决，也不等于功能用户实测全量闭环、`G1`、`C1`、最终验收、正式发布或维护期完成。
- **入口同步**：长期入口机器闸门 `E:\workbuddy-test\current\phase-switch.json` 尚未切换；机器开关需另行按现行门禁同步，本裁决不直接修改该外部文件。
