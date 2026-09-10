# 05 - GPT&Claude 复审（开发单元、用户实测 Fix 与多 R 批次模式）

> **用途**：GPT&Claude 对 GLM+DS 已完成的开发修复或用户实测统一 `FixN` 做独立复审，并把结论追加到同一权威文档。用户实测 Fix 通过后，下一步固定交给 `15A-最终候选同步开发基线.md`；05 不自行同步源代码、冻结 QA/S 或创建测试计划。

> **阶段门禁卡**：05 有三种模式：开发单元、用户实测 R、B<N> 批次。开发单元开启条件是 `03/04` 已交审且原失败与验收可复核；R 开启条件是 `07` 已完成完整统一 `FixN`；B1 开启条件是所有 R-only 候选和最终 merge 候选已具备各自最新 Review 范围。完成状态分别是 `✅开发闭环`、`✅通过（修复复审）待 15A`、`✅通过（修复复审）待 15A`；失败回退分别是 `04`、`07`、批次文档的 `B<N>-merge 修复记录N`。目标 `ReviewN` 必须是当前模式下尚未写入的下一正式复审，不得覆盖历史 Review。

## 发送给 GPT&Claude 的输入

```text
待复审文档绝对路径：E:\workspace\<开发单元或用户实测 R 唯一闭环文档>.md
复审批次：Review<N>
复审模式：开发单元 / 用户实测 R / B<N> 批次
B<N> 模式批次状态：E:\workbuddy 复审\<B<N>>\control\batch-state.json
B<N> 模式 merge 候选：E:\workbuddy 复审\<B<N>>\merge\
B<N> 模式批次闭环文档：E:\workspace\用户实测阶段\vX-功能名\合并复审\B<N>-merge的全流程闭环.md
```

路径必须指向唯一权威全流程文档，不能填写 GPT 报告、测试计划、`当前代码状态.md` 或新建审查日志。

## 一、识别模式并读取依据

先读取 `规范类/项目代称.md`、`规范类/阶段闭环门禁规则.md`、适用模板和输入文档，确认文档模式：

- **开发单元模式**：按开发规格、03 审查、04 修复、`当前代码状态.md`、`当前审查状态.md` 和技术栈规范复审；
- **用户实测 R 模式**：按 R 唯一闭环的事项处置总表、统一 `FixN`、原始计划、GPT 报告、用户 06、用户证据、补充核验证据、替代/删除决策、Fix 执行事实、代码状态和技术栈规范复审。

无法判断模式、目标 `ReviewN` 已存在或试图覆盖、Fix 缺失、R 文档不唯一、关键事实冲突或正式证据缺失时停止，列出“需补充信息”。不能用代码阅读、历史截图、GLM+DS 自测或 GPT 报告文字替代当前复审 GUI 证据。

### 最新 Review 识别与状态记录

1. 先读取权威文档底部，按模式找到最后一条正式 `ReviewN` 或 `B<N>-Merge-ReviewN`；顶部旧 Review 和历史失败状态不能覆盖底部最新结论。
2. 核对当前输入的 Fix、候选、版本、S、入口、数据副本和报告是否与该最新 Review 对应；若代码、依赖或构建输入在 Review 后改变，不能直接复审，先回到对应 Fix/候选准备。
3. 新增复审必须记录 `reviewId`、`reviewMode`、`planStatus`、`staticGate`、`testPointStatus`、`closureStatus`、`updatedAt`、`updatedBy=GPT&Claude`、证据和 `nextAction`；若用户实测计划尚未创建，还要单独记录 `reviewItemStatus`，不得用它覆盖 `testPointStatus=not-tested`。

## 二、用户实测 R 的完整批次复审

### 2.1 复审前置

1. `FixN` 必须是该 R 事项处置总表允许的统一批次；不能把被 07 拒绝的部分 Fix 当作完整批次。
2. 本 R 的代码 Fix、批准的替代和批准的删除必须全部列入本批次；覆盖补充项不进入代码 Fix，但必须核对其已登记为后续计划纳入项。
3. 仍有待核实、环境/产品决策、待用户确认或缺少关键验收条件的事项时，停止依赖该事项的复审，不能写批次通过。
4. 核对 16 的用户决定、责任人、截止日期/复评点、替代或删除边界；GPT 不重新替用户作决定。

### 2.2 CI 状态检查（如果项目已激活 CI）

在执行本地复审前，先检查 CI 状态：

1. **访问 GitHub Actions**，查看最近推送的 CI 运行结果：
   - 找到对应 Fix 分支的最新 push
   - 查看 CI 运行状态（✅ Success / ❌ Failure / 🟡 In progress）

2. **CI 状态判定**：
   - **CI ✅**：自动化检查已通过（测试 404/404、构建、类型检查、覆盖率），继续本地 GUI 复审
   - **CI ❌**：自动化检查失败
     - 记录失败的检查项（测试失败/构建失败/类型错误/覆盖率不足）
     - 判定为 `🟡仍需修复`，要求 GLM+DS 修复后重新推送
     - 在复审记录中注明：CI run ID、失败原因、要求重新推送
     - 停止本次复审，等待修复
   - **CI 🟡**：正在运行中
     - 等待 CI 完成（通常 3-5 分钟）
     - 完成后按 ✅/❌ 结果继续

3. **未激活 CI**：跳过此步骤，直接执行本地门禁三件套（2.3）

### 2.3 本地门禁三件套（CI 未激活时必须执行）

```bash
cd workbuddy
npm test                                      # 404/404 通过
npm run build                                 # 构建成功
npx tsc -p tsconfig.node.json --noEmit       # 零新增诊断
npx tsc -p tsconfig.web.json --noEmit        # 零新增诊断
```

任一失败 → 🟡需修复 或 🔴驳回

### 2.4 必须实地复审

对统一 Fix 中每一项逐条：

1. 按原始失败步骤重新运行，核对原始预期、当前实际、页面稳定态和持久化结果；
2. 覆盖修复范围要求的取消/确认、错误降级、刷新/离开重进、数据一致性、幂等和安全边界；
3. 对替代方案核对旧入口/旧行为按批准范围停用、新方案可用、迁移/保留边界正确；
4. 对删除方案核对删除对象、软删除/数据保留、不可逆风险和恢复条件，不把删除后的“看不见”直接写成数据正确；
5. 检查崩溃、白屏、错误反馈、数据丢失/重复、敏感泄露、技术栈红线和无关越界改动；
6. 使用计划要求的可见窗口、正式入口和测试专用数据。代码测试、历史截图和 GLM+DS 自测只能作为辅助，不能替代 GUI 或用户主观验收。

用户补充问题沿用 13 建立的稳定问题 ID和来源标签。用户未列出的用例仍只记为“本次暂未发现问题（用户未回传详细记录）”；不能把它写成完整用户通过或轮次关闭。计划覆盖缺口必须先在覆盖补充计划中有明确脚本和预期，不能用旧的未定义步骤判定通过。

如果原生对话框、日期选择器、安装环境或当前桌面条件无法真实操作，记录 `⏸️待环境补证（05复审未完成，未进入用户实测）` 和复现步骤。此时不得创建或启动用户实测计划，也不得把该状态写成等待用户进入实测阶段；补证后回到 `05` 使用下一正式 `ReviewN`。出现 `🔴阻断` 或 `🟡需修复` 时停止依赖该问题的后续验证，独立安全项可以继续但必须说明依赖。

## 三、复审记录落点

在输入的同一权威文档末尾追加 `ReviewN`，每个 Fix 项至少写：

- Fix/事项 ID、原始失败场景、原始预期、复审操作和实际结果；
- GPT GUI/只读/构建证据路径及等待条件；
- `✅已解决`、`❌未解决`、`⏸️待环境补证（05复审未完成，未进入用户实测）` 或 `ℹ️非本次复审范围`；
- 替代/删除结果、覆盖补充登记核对、严重度、剩余风险和新引入/越界问题；
- 技术栈、数据隔离、来源指纹和候选构建信息；
- 下一步是回到 07、交 15A 或补证；05 通过后不得直接进入 15。

覆盖更新 `当前审查状态.md` 的最新审查任务、门禁结论和活跃 R 队列；不得在该文件追加按日期的状态章节。不得修改 `当前代码状态.md` 的既有实现事实、测试计划正文、GPT 正式报告或用户回传，不创建 `审查日志/`。历史复审事实只追加到输入的同一权威全流程文档。

## 四、结论规则

### 4.1 开发单元模式

- `✅通过（开发单元闭环）`：全部修复要求实际通过，无未关闭高风险、越界或技术栈违规；按开发流程进入下一阶段。
- `🟡仍需修复`：有未解决、新引入或越界问题，回到 04 和对应开发单元 Fix。

### 4.2 用户实测 R 模式

- `✅通过（修复复审）`：整个统一 FixN 的修复、替代、删除和必要回归均有证据通过，覆盖补充项已正确登记，无未关闭阻断/需修复/决策缺口。此时只报告“待 15A 最终候选同步”，不写下一测试计划。
- `🟡仍需修复`：列出事项 ID、严重度、复现步骤、证据和回到 07 的下一 Fix 条件；不能拆批次绕过未解决事项。
- `🔴驳回`：无法启动、隔离/安全边界失效、数据损坏或核心范围无法可靠验证；说明恢复条件。

05 通过不等于源代码已同步或 QA/S 已冻结。只有 `15A` 产生并核对 `sourceSyncStatus=verified`，再由 `15` 完成候选快照核对和冻结后，R 才能进入 `🟢等待下一轮测试`，随后由 `14` 创建同一 R 的修复后计划或覆盖补充计划。复审通过不等于用户验收、G1、C1 或维护期。

### 4.3 多 R 批次复审模式（B1）

当输入明确属于一个包含多个 R 的修复批次时，先按批次唯一文档核对批次范围、共同 `C0/S0`、各 R 的统一 Fix 和候选来源。初始复审次数固定为“批次 R 数 + 1”：每个 R-only 候选各完成一次完整 R 复审，最后对已通过候选的 B1-merge 完成一次集成复审。

- R-only 复审仍回写对应 R 唯一闭环文档；不能将批次复审结果写入 GPT 报告、测试计划、`当前代码状态.md` 或新建 `审查日志/`。
- 已有前置停止的 Review 不覆盖。R2 若已有 `Review1` 前置停止，当前 R2-only 必须使用 `Review2`。
- R-only 候选必须从 C0 独立生成并使用独立程序/`userData`；不得用混合工作树、代码阅读、自动化测试或历史截图代替当前 GUI 证据。
- B1-merge 的复审写入 B1-merge 唯一文档，结果只能是 `✅通过（修复复审）`、`🟡仍需修复` 或 `🔴驳回`。失败时停止依赖合并包的后续验证，修复回到该文档的“B1-merge 修复记录N”，不回流 R1/R2。
- 全部 R-only 与最终 B1-merge 复审通过后，05 只报告“待 15A 最终候选同步”；不得在 05 中调用 15、创建后续计划或写成用户验收/G1/C1。

## 五、多 R 批次的机器门禁与 Review 状态

05 进入 B<N> 模式后，GPT 不以文档中声明的 R 数量代替实际目录检查。由 GLM+DS 完成 R-only 候选后，先冻结批次预期集合：

    python E:\workspace\tools\r_fix_review.py finalize-batch --batch-id B<N> --expected R1:Fix<M> --expected R2:Fix<M>

随后每次复审前、准备整合前都执行动态扫描：

    python E:\workspace\tools\r_fix_review.py scan-batch --batch-id B<N>

scan-batch 必须枚举 E:\workbuddy 复审\<B<N>> 下全部 R<N>-Fix<M>-only 目录，并阻断未登记 R、重复 R、孤立/格式错误目录、缺失 review-meta、恢复未验证、构建清单或 SHA-256 不一致、缺失 Review 以及非 passed Review。只有返回 readyToMerge=true，05 才能允许 GLM+DS 调用 prepare-merge：

    python E:\workspace\tools\r_fix_review.py prepare-merge --batch-id B<N>

R-only GUI 复审完成后，GPT 仍须把完整事实追加到对应 R 唯一闭环文档；机器状态只记录终态和证据定位：

    python E:\workspace\tools\r_fix_review.py set-review-status --batch-id B<N> --r-id R<N> --fix-id Fix<M> --review-id Review<N> --status passed --evidence <候选 evidence 内的证据文件>

合并候选完成后，GPT 必须把 B<N>-Merge-Review<N> 追加到批次唯一闭环文档，并使用 candidate-kind=merge 记录合并 Review：

    python E:\workspace\tools\r_fix_review.py set-review-status --batch-id B<N> --candidate-kind merge --review-id B<N>-Merge-Review<N> --status passed --evidence <merge evidence 内的证据文件>

passed 不能没有可定位证据；failed、blocked 和 passed 一旦写入均不可被另一个 Review 或重复调用覆盖。脚本状态不替代 GUI 复审结论，GPT 必须先取得真实入口、独立 userData、页面稳定态、刷新/重进、只读持久化、错误反馈、数据一致性和隔离证据，再写入 Review。

## 五-A、05 通过后的 15A 交接

05 的最终 Review 通过后，下一步固定调用 `用户prompt/15A-最终候选同步开发基线.md`。15A 使用 `sync-final-candidate` 核对 Review、B 状态、构建清单、完整源包、批准差异、Git index 和当前开发指针，并将唯一机器结果写入 `E:\workbuddy 复审\<B>\control\source-sync-result.json`。

只有 `sourceSyncStatus=verified` 且 `current-development-pointer.json` 与同步后工作树一致时，才可交给 15。`blocked` 或 `failed` 必须留在 15A 补证/解决冲突；不得写成 QA/S 已冻结、`🟢等待下一轮测试` 或交给 14。15A 的成功记录追加到唯一权威 B/R 全流程文档，文档只引用机器结果，不重复维护另一套哈希。

## 六、B<N>-merge 复审输入与文档唯一性

在最终整合候选生成后，若批次文档不存在，GPT 使用 13 的 B<N> 批次合并模式创建：

    python E:\workspace\tools\r_fix_review.py create-merge-document --batch-id B<N> --version-feature vX-功能名

目标为 E:\workspace\用户实测阶段\vX-功能名\合并复审\B<N>-merge的全流程闭环.md。工具只在目标不存在时创建最小骨架；已有文件只验证 batch 标记，不覆盖历史内容。目录中出现第二个同批次 merge 闭环文件时停止。05 的完整集成复审必须写入这个唯一批次文档，不能新建审查日志、GPT 报告或测试计划代替它。

批次顺序固定为：finalize-batch → 动态 scan → 各 R-only Review → readyToMerge → GLM+DS prepare/complete-merge → 13 创建或验证批次闭环 → B<N>-Merge-Review → 15A → 15 → 14。R-only 通过前不得整合；任一 R-only 失败不得生成 merge；merge 失败只追加批次级 B<N>-merge 修复记录，不回流或拆分 R。
