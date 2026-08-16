# 项目规范（DeepSeek 维护）

> **维护方**：DeepSeek 创建并持续维护。GPT 审查时会核对是否遵守。

## ⏳ DeepSeek 待办：创建 `命名规则.md`

在阶段 1 首次实现时于本目录创建 `命名规则.md`，作为全工程命名约定。建议覆盖（DeepSeek 可细化）：

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
