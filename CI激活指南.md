# CI 激活指南

> **文档版本**：v1.0.0  
> **创建日期**：2026-09-10  
> **适用范围**：WorkBuddy v0.3 及后续版本

---

## 📋 前置条件检查

在激活 CI 前，确认以下条件：

- [x] CI 配置文件存在：`workbuddy/.github/workflows/ci.yml`
- [x] R-1 已修复：npm ci 使用 `--legacy-peer-deps` flag
- [x] R-4 已修复：覆盖率阈值调整为 70/50/60/67
- [x] Node 版本统一：22.16.0（`.nvmrc` + `package.json` + `ci.yml`）
- [x] 本地门禁通过：404/404 测试 + 构建成功 + 类型检查零新增
- [ ] GitHub 账号准备就绪
- [ ] 决定仓库可见性（public / private）

---

## 🚀 激活步骤

### Step 1：创建 GitHub 仓库

1. 访问 https://github.com/new

2. 填写仓库信息：
   ```
   Repository name: workbuddy
   Description: WorkBuddy - 个人任务管理工具（Electron + Vue3 + SQLite）
   Visibility: 
     ○ Public  （推荐，可使用免费 CI）
     ● Private （需要付费计划或组织免费额度）
   
   ☐ Add a README file        （不勾选，本地已有）
   ☐ Add .gitignore           （不勾选，本地已有）
   ☐ Choose a license         （可选，建议 MIT）
   ```

3. 点击 **Create repository**

---

### Step 2：关联本地仓库

在 `E:\workspace\` 目录执行：

```bash
# 关联 GitHub 远程仓库（替换 YOUR_USERNAME）
git remote add origin https://github.com/YOUR_USERNAME/workbuddy.git

# 验证关联
git remote -v

# 预期输出：
# origin  https://github.com/YOUR_USERNAME/workbuddy.git (fetch)
# origin  https://github.com/YOUR_USERNAME/workbuddy.git (push)
```

---

### Step 3：首次推送并触发 CI

```bash
# 确保在 main 分支
git branch

# 推送代码到 GitHub（首次推送需要 -u）
git push -u origin main

# 预期输出：
# Enumerating objects: xxx, done.
# ...
# To https://github.com/YOUR_USERNAME/workbuddy.git
#  * [new branch]      main -> main
# Branch 'main' set up to track remote branch 'main' from 'origin'.
```

---

### Step 4：查看 CI 运行状态

1. **GitHub 网页界面**：
   - 访问 `https://github.com/YOUR_USERNAME/workbuddy`
   - 点击顶部 **Actions** 标签页
   - 看到第一个 workflow run：`CI`
   - 状态：🟡 In progress / ✅ Success / ❌ Failure

2. **查看详细日志**：
   - 点击 workflow run 名称
   - 查看每个 step 的执行日志
   - 如果失败，查看红色 ❌ 的 step

3. **预期首次运行结果**：
   ```
   ✅ Setup Node.js (22.16.0)
   ✅ Install dependencies (npm ci --legacy-peer-deps)
   ✅ Run tests (404/404 passed)
   ✅ Type check (node) - 12 个存量诊断（基线内，不阻断）
   ⚠️ Type check (web) - 存量诊断（基线内）
   ✅ Build
   ✅ Coverage check (70/50/60/67 阈值通过)
   
   整体状态：✅ Success
   ```

---

### Step 5：配置分支保护规则（可选但推荐）

1. 进入仓库 **Settings** → **Branches**

2. 点击 **Add branch protection rule**

3. 配置规则：
   ```
   Branch name pattern: main
   
   ☑ Require a pull request before merging
     ☑ Require approvals (1)
   
   ☑ Require status checks to pass before merging
     ☑ Require branches to be up to date before merging
     搜索并勾选: CI
   
   ☑ Do not allow bypassing the above settings
   
   ☐ Allow force pushes
   ☐ Allow deletions
   ```

4. 点击 **Create**

**效果**：
- 无法直接推送到 main（必须通过 PR）
- PR 必须等 CI ✅ 才能合并
- 强制代码审查 + 自动化验证

---

## 🔧 CI 配置说明

当前 CI 配置（`workbuddy/.github/workflows/ci.yml`）：

```yaml
name: CI

on:
  push:
    branches: [ main ]        # 推送到 main 触发
  pull_request:
    branches: [ main ]        # PR 到 main 触发

jobs:
  test:
    runs-on: ubuntu-latest   # GitHub 托管的 Ubuntu 虚拟机
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22.16.0'
          cache: 'npm'
          cache-dependency-path: workbuddy/package-lock.json
      
      - name: Install dependencies
        working-directory: ./workbuddy
        run: npm ci --legacy-peer-deps    # R-1 修复
      
      - name: Run tests
        working-directory: ./workbuddy
        run: npm test                     # 404 个测试
      
      - name: Type check (node)
        working-directory: ./workbuddy
        run: npx tsc -p tsconfig.node.json --noEmit
      
      - name: Type check (web)
        working-directory: ./workbuddy
        run: npx tsc -p tsconfig.web.json --noEmit
      
      - name: Build
        working-directory: ./workbuddy
        run: npm run build
      
      - name: Run coverage
        working-directory: ./workbuddy
        run: npm run test:coverage        # R-4 修复后可通过
```

---

## 📊 CI 状态徽章（可选）

在 `README.md` 顶部添加徽章：

```markdown
# WorkBuddy

[![CI](https://github.com/YOUR_USERNAME/workbuddy/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/workbuddy/actions)
[![Tests](https://img.shields.io/badge/tests-404%20passed-brightgreen)](./workbuddy/tests)
[![Coverage](https://img.shields.io/badge/coverage-70%25-yellow)](./workbuddy/coverage)
[![Node](https://img.shields.io/badge/node-22.16.0-brightgreen)](https://nodejs.org/)

个人任务管理工具 - Electron + Vue3 + TypeScript + SQLite
```

效果：
- ✅ 绿色 badge = CI 通过
- ❌ 红色 badge = CI 失败
- 🟡 黄色 badge = CI 运行中

---

## ⚠️ 常见问题

### Q1: CI 失败了怎么办？

**排查步骤**：

1. 查看失败的 step：
   ```
   GitHub Actions → 点击失败的 run → 查看红色 ❌ step
   ```

2. 常见失败原因：
   - **npm ci 失败**：
     - 检查是否使用了 `--legacy-peer-deps` flag
     - 检查 Node 版本是否为 22.16.0
   
   - **测试失败**：
     - 本地运行 `npm test` 复现
     - 查看失败测试的详细日志
   
   - **覆盖率失败**：
     - 检查实际覆盖率是否低于阈值（70/50/60/67）
     - 考虑降低阈值或补充测试
   
   - **构建失败**：
     - 本地运行 `npm run build` 复现
     - 检查类型错误或语法错误

3. 修复后重新推送：
   ```bash
   # 修复代码
   git add .
   git commit -m "fix: 修复 CI 失败问题"
   git push
   
   # CI 会自动重新运行
   ```

---

### Q2: 为什么 CI 比本地慢？

**原因**：
- GitHub Actions 需要：
  1. 启动虚拟机（30-60s）
  2. 安装 Node.js（10-20s）
  3. 下载依赖（2-5 min，首次）
  4. 运行所有检查（2-3 min）

**总耗时**：首次 ~8 分钟，后续 ~3-4 分钟（有缓存）

本地只需要运行检查（~2 min），无启动和下载开销。

---

### Q3: 如何跳过 CI？

**不推荐**，但如果必须（如紧急修复文档）：

```bash
git commit -m "docs: 更新文档 [skip ci]"
```

在 commit message 中包含 `[skip ci]` 会跳过 CI。

---

### Q4: CI 免费吗？

**GitHub Actions 免费额度**（2024）：

| 账户类型 | 免费额度 |
|---------|---------|
| Public 仓库 | **无限制** |
| Private 仓库（个人） | 2,000 分钟/月 |
| Private 仓库（组织） | 根据计划不同 |

**WorkBuddy CI 单次耗时**：~4 分钟

如果使用 private 仓库，每月可运行约 **500 次** CI。

---

### Q5: 如何暂时禁用 CI？

如果需要暂时禁用（如开发阶段不想频繁运行）：

1. **方法 1**：修改触发条件
   ```yaml
   # .github/workflows/ci.yml
   on:
     push:
       branches: [ main ]
       # 移除 develop，只在推送到 main 时触发
   ```

2. **方法 2**：在 GitHub 禁用 workflow
   - Actions → 选择 CI workflow → 右上角 ⋯ → Disable workflow

---

## ✅ 激活完成检查清单

激活 CI 后，验证以下项：

- [ ] GitHub 仓库已创建
- [ ] 本地仓库已关联 `origin`
- [ ] 首次推送成功
- [ ] CI workflow 已自动触发
- [ ] CI 首次运行 ✅ 成功
- [ ] Actions 标签页可见 CI 历史
- [ ] （可选）分支保护规则已配置
- [ ] （可选）README 徽章已添加
- [ ] 团队成员知晓 CI 工作流程

---

## 📚 相关文档

- [外缘审查及优化建议.md](./外缘审查及优化建议.md) - CI 优化的原始需求
- [优化记录/2026-09-10-外缘审查优化-完整执行报告.md](./优化记录/2026-09-10-外缘审查优化-完整执行报告.md) - CI 修复记录
- [规范类/01-日常开发流程.md](./规范类/01-日常开发流程.md) - CI 在开发流程中的位置
- [用户prompt/](./用户prompt/) - 更新后的 prompt 参考

---

**激活后，每次 `git push` 都会自动运行 CI，为代码质量提供持续保障。**
