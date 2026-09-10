# 项目规范（分域维护）

> **维护方**：GPT 维护治理规则；GLM+DS 维护代码命名和实现侧规范。GPT 审查时会核对是否遵守。

> **治理代称例外**：`项目代称.md` 由 GPT 维护，集中定义 `C0/S/QA/R/Fix/Review/G1/C1/CR` 和角色、技术缩写；它不属于 GLM+DS 的代码命名规范。

## 活跃规范

| 文件 | 维护方 | 用途 |
|---|---|---|
| `项目代称.md` | GPT | 项目治理代称、版本节点、编号作用域和历史同名兼容 |
| `阶段闭环门禁规则.md` | GPT | 开发闭环、C0、功能实测、G1、C1 和维护期门禁 |
| `git提交规范.md` | GPT | C0/C1 归档、QA/S 快照和 Git 提交规则 |
| `文档治理总纲.md` | GPT | 双根、文档归属和治理总章程 |
| `变更闭环规则.md` | GPT | 维护期 CR 闭环和正式版本发布规则 |
| `技术栈规范.md` | GPT | 技术栈红线和审查基准 |

## ⏳ GLM+DS 待办：创建并维护 `命名规则.md`

在阶段 1 首次实现时于本目录创建 `命名规则.md`，作为全工程命名约定。建议覆盖（GLM+DS 可细化）：

| 对象 | 约定建议 |
|---|---|
| 目录/文件 | kebab-case（如 `todo-row.vue`、`settings-repo.ts`） |
| Vue 组件 | PascalCase（`BaseCard.vue`、`AppSidebar.vue`） |
| 组合式函数 | `use` 前缀 + camelCase（`useApi.ts`） |
| 常量 | UPPER_SNAKE_CASE（`IPC_CHANNELS`） |
| 变量/函数 | camelCase |
| 类型/接口 | PascalCase |
| IPC 通道 | `domain:action`（`settings:get`、`db:health`） |
| 数据库表 | snake_case（`todos`、`workout_logs`） |
| DB 字段 | camelCase（与原始定义一致；仓储层做映射） |
| CSS 类 | kebab-case（`.todo-row`） |
| CSS 变量 | `--kebab-case`（`--accent`、`--text-strong`） |
| 迁移文件 | `{4位序号}_{描述}.ts`（`0001_init.ts`） |

> 命名规则一经建立，后续所有阶段必须遵守；GPT 审查会据此核对。
