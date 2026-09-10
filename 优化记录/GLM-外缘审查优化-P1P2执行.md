# GLM 执行：外缘审查优化建议 - P1/P2 后续处理

> **执行者**：GLM / DeepSeek  
> **前置条件**：GPT 已完成代码层面审查（✅通过）和治理层面优化（✅完成）  
> **执行日期**：2026-09-10  
> **工作目录**：`E:\workspace\`（文档根）+ `E:\workspace\workbuddy\`（代码根）

---

## 一、执行背景

### 1.1 已完成工作

**GLM 代码层面优化**（已完成，GPT 已审查通过）：
- ✅ Vitest 覆盖率配置
- ✅ 版本管理文件（.nvmrc / .python-version）
- ✅ GitHub Actions CI 配置
- ✅ 代码审计工具（tools/code_audit.py）
- ✅ 覆盖率追踪工具（tools/track_coverage.py）
- ✅ ESLint 规则配置

**GPT 治理层面优化**（已完成）：
- ✅ 三级治理模式文档（L1/L2/L3）
- ✅ 项目状态看板
- ✅ 治理变更日志
- ✅ 文档版本化

**用户决策**（2026-09-10）：
- ✅ P1：批准安装 `@vitest/coverage-v8`
- ✅ P2：以本机为准（Node 22.x）- 已由 GPT 完成修改

### 1.2 当前状态

**P2 已完成**（GPT 执行）：
- ✅ `.nvmrc` 改为 `22.16.0`
- ✅ `package.json` engines 改为 `>=22.16.0 <23.0.0`
- ✅ `.github/workflows/ci.yml` 改为 `22.16.0`
- ✅ `scripts/check-env.sh` 改为 `22.x`

**P1 待处理**：
- ⚠️ npm 安装失败（`Cannot read properties of null (reading 'edgesOut')`）
- 需 GLM 诊断并完成依赖安装

---

## 二、GLM 任务清单

### 任务 1：诊断并修复 npm 安装问题（P1）

**问题现象**：
```
npm error Cannot read properties of null (reading 'edgesOut')
```

**已尝试的修复**（均失败）：
1. `rm -rf node_modules package-lock.json && npm install`
2. `npm cache clean --force && npm install`

**要求**：
1. 诊断根本原因（可能是 npm 版本、依赖冲突或缓存损坏）
2. 提供有效的修复方案
3. 成功安装 `@vitest/coverage-v8`
4. 验证安装成功

**验证标准**：
```bash
cd /e/workspace/workbuddy
npm list @vitest/coverage-v8  # 应显示已安装
npm run test:coverage  # 应生成覆盖率报告
```

---

### 任务 2：验证门禁三件套（更新后的 Node 22.x）

**要求**：
在 P1 完成后，重新验证门禁三件套以确保 Node 22.x 下一切正常。

**验证命令**：
```bash
cd /e/workspace/workbuddy

# 1. 测试
npm test
# 预期：404/404 通过

# 2. 覆盖率（P1 完成后）
npm run test:coverage
# 预期：生成 coverage/ 目录和报告

# 3. 类型检查（node）
npx tsc -p tsconfig.node.json --noEmit
# 预期：11 基线错误，零新增

# 4. 类型检查（web）
npx tsc -p tsconfig.web.json --noEmit
# 预期：11 基线错误，零新增

# 5. 构建
npm run build
# 预期：成功
```

---

### 任务 3：环境验证脚本测试

**要求**：
验证更新后的环境检查脚本是否正确识别 Node 22.x。

**验证命令**：
```bash
cd /e/workspace
bash scripts/check-env.sh
```

**预期输出**：
```
=== WorkBuddy 开发环境检查 ===

检查 Node.js 版本...
✅ Node.js 版本: v22.16.0 (要求: 22.x)

检查 npm 版本...
✅ npm 版本: v10.x.x (要求: >=10.2.0)

检查 Python 版本...
✅ Python 版本: 3.10.11 (要求: 3.10.x)

检查工作目录...
✅ 工作目录正确: /e/workspace

=== 环境检查完成 ===
```

---

### 任务 4：运行代码审计和覆盖率追踪

**要求**：
验证自动化工具在 Node 22.x 和安装覆盖率依赖后正常工作。

**验证命令**：
```bash
cd /e/workspace

# 1. 代码审计
python tools/code_audit.py
# 预期：生成 代码质量审计报告.md，0 超长文件，0 超长函数

# 2. 覆盖率追踪（P1 完成后）
cd workbuddy
npm run test:coverage
cd ..
python tools/track_coverage.py
# 预期：更新 workbuddy/coverage/history.jsonl，显示趋势
```

---

### 任务 5：更新 `当前代码状态.md`

**要求**：
完成 P1/P2 后，更新 `当前代码状态.md` 记录最终状态。

**更新内容**：
```markdown
## 外缘审查优化建议实施（最终状态）

**执行时间**：2026-09-10

### 完成清单

- ✅ Vitest 覆盖率配置
- ✅ 版本管理文件（Node 22.16.0）
- ✅ GitHub Actions CI 配置（Node 22.16.0）
- ✅ 代码审计工具
- ✅ 覆盖率追踪工具
- ✅ ESLint 配置
- ✅ P1：@vitest/coverage-v8 已安装
- ✅ P2：Node 版本统一为 22.x

### 最终门禁验证（Node 22.x）

- ✅ 测试：404/404 通过
- ✅ 覆盖率：报告生成成功
- ✅ 构建：成功
- ✅ 类型检查：零新增错误
- ✅ 代码审计：0 超长文件、0 超长函数
- ✅ 环境检查：Node 22.x 识别正确

### 执行记录

- GLM 代码优化：`优化记录/2026-09-10-外缘审查优化实施记录.md`
- GPT 审查报告：`优化记录/2026-09-10-GPT审查报告-GLM代码层面.md`
- GPT 治理优化：`优化记录/2026-09-10-GPT治理层面执行记录.md`
- GLM P1/P2 处理：`优化记录/2026-09-10-GLM-P1P2处理记录.md`（本次执行需创建）

**更新时间**：2026-09-10
**执行者**：GLM / DeepSeek
```

---

### 任务 6：创建 GLM 执行记录

**要求**：
创建 `优化记录/2026-09-10-GLM-P1P2处理记录.md`，记录 P1 诊断和修复过程。

**记录内容**：
- npm 安装问题的根本原因
- 采取的修复步骤
- 验证结果（包括截图或命令输出）
- 遇到的问题和解决方案
- 最终门禁验证结果

---

## 三、执行约束

### 3.1 文件修改边界

**允许修改**：
- `workbuddy/package.json`（仅限 devDependencies）
- `workbuddy/package-lock.json`（npm 自动生成）
- `当前代码状态.md`
- 创建 `优化记录/2026-09-10-GLM-P1P2处理记录.md`

**禁止修改**：
- 产品代码（`workbuddy/src/`）
- 测试代码（`workbuddy/tests/`）
- 配置文件（vitest.config.ts、.eslintrc.json 等）
- 治理文档（`规范类/`）
- Git 操作（不提交、不推送）

### 3.2 验证标准

**成功标准**：
1. ✅ `@vitest/coverage-v8` 安装成功
2. ✅ `npm run test:coverage` 生成覆盖率报告
3. ✅ 门禁三件套全部通过（Node 22.x）
4. ✅ 环境检查脚本识别 Node 22.x
5. ✅ 代码审计和覆盖率追踪工具正常工作
6. ✅ `当前代码状态.md` 已更新
7. ✅ 执行记录已创建

---

## 四、常见问题排查

### Q1：npm 安装仍然失败怎么办？

**可能原因**：
1. npm 版本过旧或损坏
2. 依赖树循环引用
3. package-lock.json 损坏
4. 全局 npm 配置问题

**诊断步骤**：
```bash
# 1. 检查 npm 版本
npm -v  # 应 >= 10.2.0

# 2. 尝试升级 npm
npm install -g npm@latest

# 3. 清理所有缓存
npm cache clean --force
rm -rf ~/.npm

# 4. 删除 node_modules 和 lock 文件
cd /e/workspace/workbuddy
rm -rf node_modules package-lock.json

# 5. 重新安装
npm install

# 6. 单独安装覆盖率包
npm install -D @vitest/coverage-v8
```

### Q2：覆盖率报告生成失败怎么办？

**检查清单**：
1. `@vitest/coverage-v8` 是否已安装
2. `vitest.config.ts` 中 coverage.provider 是否为 'v8'
3. vitest 版本是否兼容（当前 4.1.10）
4. 运行 `npm test` 是否先通过

### Q3：类型检查出现新错误怎么办？

**原因**：Node 22.x 可能引入新的类型定义

**处理**：
1. 记录新错误的具体内容
2. 判断是否为 Node 22.x 导致的类型变化
3. 如果是基础设施问题（非产品代码），可以临时标记
4. 向用户报告，等待 GPT 决策是否需要修复

---

## 五、执行完成后

### 5.1 向用户汇报

**汇报内容**：
1. P1 npm 安装问题诊断结果和修复方案
2. 所有验证结果（门禁三件套、环境检查、工具验证）
3. 创建的执行记录路径
4. 是否有遗留问题需要用户决策

### 5.2 后续建议

1. **CI 推送**：P1/P2 完成后，可以推送到 GitHub 激活 CI 流水线
2. **依赖更新**：考虑定期更新 npm 依赖以避免安全漏洞
3. **覆盖率目标**：当前测试覆盖率未知，建议先运行一次确认基线

---

## 六、参考文档

- **L1 快速入门**：`规范类/00-快速开始.md`
- **L2 日常流程**：`规范类/01-日常开发流程.md`
- **技术栈规范**：`规范类/技术栈规范.md`
- **项目状态看板**：`项目状态看板.md`
- **GLM 原始执行记录**：`优化记录/2026-09-10-外缘审查优化实施记录.md`
- **GPT 审查报告**：`优化记录/2026-09-10-GPT审查报告-GLM代码层面.md`

---

**执行开始时间**：等待 GLM 确认后开始  
**预估完成时间**：30-60 分钟

> 本 prompt 由 GPT 于 2026-09-10 创建，供 GLM/DeepSeek 继续完成外缘审查优化的 P1/P2 处理。
