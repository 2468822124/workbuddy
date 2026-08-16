# 变更记录（CHANGELOG）

> **维护方**：GLM　**格式**：[Keep a Changelog](https://keepachangelog.com/) 风格，倒序（最新在上）。每条对应一个已关闭的 CR（或构建期阶段），含 CR 号 + 严重度 + 日期。
> **版本语义**：`MAJOR.MINOR.PATCH`，bump 规则见 `项目规范/变更闭环规则.md §5`（🔵→PATCH / 🟡→MINOR / 🔴或新功能→MAJOR）。
> **起点**：Day-1 GA = `0.1.0`。

---

## [Unreleased] / 维护期待发布
_（阶段 6 全部关闭、进入维护期后，已关闭的 CR 在此累积，攒够一批发版移入下方正式版本节）_

- _暂无。首个维护期 CR 待开。_

---

## [0.1.0] — 2026-08-07 · Day-1 GA（首个可安装版本）

**里程碑**：阶段 0–6 构建期全部通过，产出未签名可安装 `.exe`（`WorkBuddy-Setup-0.1.0.exe`，NSIS x64 per-user）。

**交付范围**（Day-1 MVP）：
- ✅ 视觉地基（手帐风设计系统 + Bento Grid 样张）
- ✅ 工程地基（Electron + Vue3 + TS + 强类型 IPC + better-sqlite3 + 迁移系统 + 敏感字段加密）
- ✅ 晨间唤醒 + RSS 热点 + 今日总览（3 实卡 + 2 空态）
- ✅ 项目管理（看板/列表 + 详情 + todos）
- ✅ 设置 + 数据管理（API 配置/测试连接 + 热点源 + JSON 导入导出 + 首启引导）
- ✅ 对话式热点搜索（LLM，未配则优雅降级）
- ✅ 打包 .exe（electron-builder NSIS，better-sqlite3 electron-rebuild 通过）

**已知 ⚠️ 待办（非阻断 GA，转维护期 CR）**：
- 阶段 1–5 累积 GUI 运行时未验项须用户在干净 Win11 实跑补验（冷启动<3s / 全流程 E2E / 断网错Key 降级 / 六类错误态 / 布局像素）。
- 今日总览「已完成 x/y」须随勾选动态更新（`当前状态.md §7`，待开 CR）。
- 应用图标为 electron 默认（待用户替换）；未代码签名（SmartScreen 须手动绕过）。

**关键修复（构建期内）**：
- 用户反馈1（🔴 阻断）：安装后双击无法启动 —— 根因 `settingsRepo.seedDefaults()` 动态 `require('./defaultSettings')` 在 electron-vite bundle 中解析失败 → `createWindow()` 未执行；修复为静态 import + 三项加固（启动 try/catch、`did-fail-load` 处理、grep 排查）。详见 `用户最终测试反馈/用户反馈1.md`、`审查日志/阶段6-复审1-用户反馈1.md`。

**真相源**：本版本对应 `开发阶段项目计划/项目计划.md` + 各 `规格-阶段N-*.md`；阶段状态见 `当前状态.md`。
