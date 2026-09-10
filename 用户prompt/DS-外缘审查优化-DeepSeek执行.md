# GLM+DS 执行：外缘审查优化建议实施（代码层面；文件名保留兼容）

> **执行者**：GLM+DS（代码执行；实际任务填写 GLM / DS / GLM+DS）  
> **前置阅读**：`E:\workspace\外缘审查及优化建议.md`（已生成）  
> **工作目录**：`E:\workspace\workbuddy\`（代码根）  
> **文档根**：`E:\workspace\`（工具脚本、报告输出位置）  
> **执行时间**：2026-09-07  
> **预计工期**：1周（分3个批次完成）

---

## 执行范围声明（严格边界）

### ✅ 允许操作

1. **代码根**（`E:\workspace\workbuddy\`）：
   - 修改 `package.json`、`vitest.config.ts`
   - 创建 `.nvmrc`、`.python-version`
   - 创建 `.github/workflows/ci.yml`
   - 创建 `.eslintrc.json`（如不存在）

2. **文档根**（`E:\workspace\`）：
   - 创建 `tools/code_audit.py`
   - 创建 `tools/track_coverage.py`
   - 创建 `scripts/check-env.sh`
   - 生成 `代码质量审计报告.md`

3. **测试与验证**：
   - 运行 `npm test`
   - 运行 `npm run build`
   - 运行 `npx tsc` 检查
   - 运行自己创建的审计工具

### ❌ 禁止操作

1. **不得修改**：
   - 任何 `src/` 下的业务代码（.ts / .vue）
   - 任何测试文件（`tests/` 下的 .spec.ts）
   - 任何数据库迁移文件（`src/main/db/migrations/`）
   - `当前代码状态.md`、`当前审查状态.md`、`工作流.md`
   - 任何治理规范文档（`规范类/`）
   - 任何用户实测文档（`用户实测阶段/`）

2. **不得执行**：
   - Git commit / push / tag
   - npm install / npm update（依赖不变）
   - 删除任何现有文件
   - 修改 Electron 版本或核心依赖

3. **不得创建**：
   - 新的业务功能代码
   - 新的测试用例
   - Docker 相关文件（留待后续）

---

## 批次 1：基础设施配置（第1-2天）

### 任务 1.1：配置 Vitest 覆盖率报告

**目标**：启用测试覆盖率报告，设置阈值为 80%

**执行步骤**：

1. 修改 `workbuddy/vitest.config.ts`（如果不存在则创建）：

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // 现有配置保持不变
    environment: 'jsdom',
    
    // 新增覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.spec.ts',
        'src/main/db/migrations/', // 迁移脚本不测试
        'src/main/index.ts', // 入口文件
        'out/',
        'dist/',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
```

2. 更新 `package.json` 添加覆盖率脚本：

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "preview": "electron-vite preview",
    "rebuild": "electron-rebuild -f -w better-sqlite3",
    "pack:win": "electron-vite build && electron-builder --win --x64 --dir",
    "dist:win": "electron-vite build && electron-builder --win --x64"
  }
}
```

3. 验证执行：

```bash
cd E:\workspace\workbuddy
npm run test:coverage
```

4. 检查输出：
   - 确认生成 `coverage/index.html`
   - 确认终端输出覆盖率百分比
   - 确认未破坏现有 392 个测试

**预期结果**：
- 覆盖率报告生成在 `workbuddy/coverage/`
- 终端输出类似：`Lines: 85.2% | Functions: 82.1% | Branches: 78.3%`
- 所有 392 测试仍然通过

---

### 任务 1.2：创建版本管理文件

**目标**：明确 Node 和 Python 版本要求

**执行步骤**：

1. 创建 `workbuddy/.nvmrc`：

```
20.11.0
```

2. 创建 `E:\workspace\.python-version`（注意是文档根）：

```
3.10.11
```

3. 更新 `workbuddy/package.json` 引擎声明：

```json
{
  "name": "workbuddy",
  "version": "0.3.0-c0",
  "description": "AI 原生个人工作台 — WorkBuddy",
  "main": "./out/main/index.js",
  "engines": {
    "node": ">=20.11.0 <21.0.0",
    "npm": ">=10.2.0"
  },
  "scripts": {
    // ... 保持现有脚本不变
  }
}
```

4. 创建 `E:\workspace\scripts\check-env.sh`：

```bash
#!/bin/bash

echo "=== WorkBuddy 开发环境检查 ==="
echo ""

# 检查 Node 版本
echo "检查 Node.js 版本..."
NODE_VERSION=$(node -v | cut -d 'v' -f 2)
if [[ "$NODE_VERSION" =~ ^20\. ]]; then
    echo "✅ Node.js 版本: v$NODE_VERSION (要求: 20.x)"
else
    echo "❌ Node.js 版本不匹配！要求: 20.x，当前: v$NODE_VERSION"
    exit 1
fi

# 检查 npm 版本
echo "检查 npm 版本..."
NPM_VERSION=$(npm -v)
if [[ $(echo "$NPM_VERSION >= 10.2.0" | bc -l) -eq 1 ]]; then
    echo "✅ npm 版本: v$NPM_VERSION (要求: >=10.2.0)"
else
    echo "⚠️  npm 版本: v$NPM_VERSION (建议: >=10.2.0)"
fi

# 检查 Python 版本
echo "检查 Python 版本..."
if command -v python &> /dev/null; then
    PYTHON_VERSION=$(python --version 2>&1 | cut -d ' ' -f 2)
    if [[ "$PYTHON_VERSION" =~ ^3\.10\. ]]; then
        echo "✅ Python 版本: $PYTHON_VERSION (要求: 3.10.x)"
    else
        echo "⚠️  Python 版本: $PYTHON_VERSION (建议: 3.10.x)"
    fi
else
    echo "⚠️  Python 未安装（工具脚本需要）"
fi

# 检查工作目录
echo ""
echo "检查工作目录..."
if [ -f "workbuddy/package.json" ]; then
    echo "✅ 工作目录正确: $(pwd)"
else
    echo "❌ 工作目录错误！请在 E:\\workspace 下执行"
    exit 1
fi

echo ""
echo "=== 环境检查完成 ==="
```

5. 验证（Windows 使用 Git Bash）：

```bash
cd E:\workspace
bash scripts/check-env.sh
```

**预期结果**：
- `.nvmrc` 和 `.python-version` 创建成功
- `package.json` 包含 engines 字段
- `check-env.sh` 可执行且输出环境信息

---

### 任务 1.3：创建 GitHub Actions CI 配置

**目标**：自动化门禁检查（测试、构建、类型检查）

**执行步骤**：

1. 创建 `workbuddy/.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    name: Test & Build
    runs-on: windows-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20.11.0'
        cache: 'npm'
        cache-dependency-path: workbuddy/package-lock.json
    
    - name: Install dependencies
      working-directory: ./workbuddy
      run: npm ci
    
    - name: Run tests
      working-directory: ./workbuddy
      run: npm test
    
    - name: Run tests with coverage
      working-directory: ./workbuddy
      run: npm run test:coverage
    
    - name: Type check (node)
      working-directory: ./workbuddy
      run: npx tsc -p tsconfig.node.json --noEmit
      continue-on-error: true  # 存量诊断允许，但记录
    
    - name: Type check (web)
      working-directory: ./workbuddy
      run: npx tsc -p tsconfig.web.json --noEmit
      continue-on-error: true  # 存量诊断允许，但记录
    
    - name: Build
      working-directory: ./workbuddy
      run: npm run build
    
    - name: Git diff check
      run: git diff --check
      continue-on-error: true
    
    - name: Upload coverage report
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: coverage-report
        path: workbuddy/coverage/
    
    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: test-results
        path: workbuddy/test-results/

    - name: Comment coverage on PR
      if: github.event_name == 'pull_request'
      uses: actions/github-script@v7
      with:
        script: |
          const fs = require('fs');
          try {
            const summary = JSON.parse(fs.readFileSync('workbuddy/coverage/coverage-summary.json', 'utf8'));
            const lines = summary.total.lines.pct;
            const functions = summary.total.functions.pct;
            const branches = summary.total.branches.pct;
            
            const comment = `## 📊 测试覆盖率报告
            
            | 类型 | 覆盖率 | 阈值 | 状态 |
            |------|--------|------|------|
            | 行覆盖率 | ${lines.toFixed(1)}% | 80% | ${lines >= 80 ? '✅' : '❌'} |
            | 函数覆盖率 | ${functions.toFixed(1)}% | 80% | ${functions >= 80 ? '✅' : '❌'} |
            | 分支覆盖率 | ${branches.toFixed(1)}% | 75% | ${branches >= 75 ? '✅' : '❌'} |
            `;
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
          } catch (error) {
            console.log('无法读取覆盖率报告:', error.message);
          }
```

2. 验证语法（本地不运行，等待 Push 后触发）：

```bash
# 检查 YAML 语法
cd E:\workspace\workbuddy
# 如果有 yamllint 可以验证：
# yamllint .github/workflows/ci.yml
```

**预期结果**：
- `.github/workflows/ci.yml` 创建成功
- YAML 格式正确（无语法错误）
- 注意：CI 实际运行需要推送到 GitHub 仓库

---

## 批次 2：代码审计工具（第3-4天）

### 任务 2.1：创建代码质量审计脚本

**目标**：自动检测超长文件和函数

**执行步骤**：

1. 创建 `E:\workspace\tools\code_audit.py`：

```python
#!/usr/bin/env python3
"""
WorkBuddy 代码质量审计工具
用途：检测文件长度、函数长度违规
"""

import os
import re
from pathlib import Path
from typing import List, Dict, Tuple

# 配置
WORKBUDDY_SRC = Path("E:/workspace/workbuddy/src")
FILE_LENGTH_LIMIT = 800
FUNCTION_LENGTH_LIMIT = 50

class AuditResult:
    def __init__(self):
        self.file_violations = []
        self.function_violations = []
        self.summary = {
            "total_files": 0,
            "total_lines": 0,
            "files_over_limit": 0,
            "functions_over_limit": 0,
        }

def count_file_lines(file_path: Path) -> int:
    """统计文件行数（不包含空行和纯注释行）"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        # 简单统计：所有非空行
        non_empty_lines = [line for line in lines if line.strip()]
        return len(non_empty_lines)
    except Exception as e:
        print(f"⚠️  无法读取文件 {file_path}: {e}")
        return 0

def estimate_function_length(file_path: Path) -> List[Dict]:
    """
    估算函数长度（简化版，仅供参考）
    TypeScript/Vue 函数检测：
    - function xxx() { ... }
    - const xxx = () => { ... }
    - async function xxx() { ... }
    """
    violations = []
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 简单的函数检测正则（不完美，但够用）
        function_pattern = re.compile(
            r'(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*\{',
            re.MULTILINE
        )
        
        matches = function_pattern.finditer(content)
        
        for match in matches:
            func_name = match.group(1) or match.group(2)
            start_pos = match.start()
            
            # 查找函数结束的 }（简化版：统计大括号平衡）
            brace_count = 1
            current_pos = match.end()
            func_end = current_pos
            
            while brace_count > 0 and current_pos < len(content):
                if content[current_pos] == '{':
                    brace_count += 1
                elif content[current_pos] == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        func_end = current_pos
                current_pos += 1
            
            # 统计函数内行数
            func_content = content[start_pos:func_end+1]
            func_lines = len([line for line in func_content.split('\n') if line.strip()])
            
            if func_lines > FUNCTION_LENGTH_LIMIT:
                violations.append({
                    "function": func_name,
                    "lines": func_lines,
                    "limit": FUNCTION_LENGTH_LIMIT,
                    "excess": func_lines - FUNCTION_LENGTH_LIMIT
                })
    
    except Exception as e:
        print(f"⚠️  无法分析函数 {file_path}: {e}")
    
    return violations

def audit_directory(src_dir: Path) -> AuditResult:
    """审计整个源代码目录"""
    result = AuditResult()
    
    # 查找所有 .ts 和 .vue 文件
    ts_files = list(src_dir.rglob("*.ts"))
    vue_files = list(src_dir.rglob("*.vue"))
    all_files = ts_files + vue_files
    
    # 排除测试文件
    all_files = [f for f in all_files if ".spec." not in f.name]
    
    print(f"📊 开始审计 {len(all_files)} 个文件...")
    print("")
    
    for file_path in all_files:
        result.summary["total_files"] += 1
        
        # 检查文件长度
        line_count = count_file_lines(file_path)
        result.summary["total_lines"] += line_count
        
        if line_count > FILE_LENGTH_LIMIT:
            result.file_violations.append({
                "file": str(file_path.relative_to(src_dir.parent)),
                "lines": line_count,
                "limit": FILE_LENGTH_LIMIT,
                "excess": line_count - FILE_LENGTH_LIMIT
            })
            result.summary["files_over_limit"] += 1
        
        # 检查函数长度（仅 .ts 文件，.vue 跳过）
        if file_path.suffix == ".ts":
            func_violations = estimate_function_length(file_path)
            if func_violations:
                for violation in func_violations:
                    violation["file"] = str(file_path.relative_to(src_dir.parent))
                result.function_violations.extend(func_violations)
                result.summary["functions_over_limit"] += len(func_violations)
    
    return result

def generate_markdown_report(result: AuditResult, output_path: Path):
    """生成 Markdown 报告"""
    lines = [
        "# WorkBuddy 代码质量审计报告",
        "",
        f"> **生成时间**：{__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"> **审计范围**：`workbuddy/src/`",
        "",
        "## 📊 统计摘要",
        "",
        "| 指标 | 数值 |",
        "|------|------|",
        f"| 总文件数 | {result.summary['total_files']} |",
        f"| 总代码行数 | {result.summary['total_lines']:,} |",
        f"| 超长文件数 | {result.summary['files_over_limit']} |",
        f"| 超长函数数 | {result.summary['functions_over_limit']} |",
        "",
    ]
    
    # 文件长度违规
    if result.file_violations:
        lines.extend([
            "## 🔴 文件长度违规（>800行）",
            "",
            "| 文件 | 行数 | 超出 | 建议 |",
            "|------|------|------|------|",
        ])
        
        # 按超出行数排序
        sorted_files = sorted(result.file_violations, key=lambda x: x["excess"], reverse=True)
        for violation in sorted_files:
            lines.append(
                f"| `{violation['file']}` | {violation['lines']} | +{violation['excess']} | 拆分为多个文件 |"
            )
        lines.append("")
    else:
        lines.extend([
            "## ✅ 文件长度",
            "",
            "所有文件均符合 <800 行规范。",
            "",
        ])
    
    # 函数长度违规
    if result.function_violations:
        lines.extend([
            "## 🟡 函数长度违规（>50行）",
            "",
            "| 文件 | 函数 | 行数 | 超出 |",
            "|------|------|------|------|",
        ])
        
        # 按超出行数排序，取前 20 个
        sorted_funcs = sorted(result.function_violations, key=lambda x: x["excess"], reverse=True)[:20]
        for violation in sorted_funcs:
            lines.append(
                f"| `{violation['file']}` | `{violation['function']}` | {violation['lines']} | +{violation['excess']} |"
            )
        
        if len(result.function_violations) > 20:
            lines.append(f"| ... | ... | ... | 共 {len(result.function_violations)} 个超长函数 |")
        
        lines.append("")
    else:
        lines.extend([
            "## ✅ 函数长度",
            "",
            "所有函数均符合 <50 行规范。",
            "",
        ])
    
    # 建议
    lines.extend([
        "## 💡 优化建议",
        "",
    ])
    
    if result.file_violations:
        lines.extend([
            "### 文件拆分策略",
            "",
            "对于超长文件，建议按以下方式拆分：",
            "",
            "1. **按功能域拆分**：将不同业务逻辑分离到独立文件",
            "2. **按层次拆分**：将派生查询、统计逻辑等分层",
            "3. **提取工具函数**：将纯函数提取到 `lib/` 或 `utils/`",
            "",
        ])
    
    if result.function_violations:
        lines.extend([
            "### 函数重构策略",
            "",
            "对于超长函数，建议：",
            "",
            "1. **提取子函数**：将独立逻辑块提取为命名函数",
            "2. **简化条件**：使用提前返回（early return）减少嵌套",
            "3. **拆分职责**：一个函数只做一件事",
            "",
        ])
    
    lines.extend([
        "---",
        "",
        "**审计工具**：`E:\\workspace\\tools\\code_audit.py`",
    ])
    
    # 写入文件
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

def main():
    print("=" * 60)
    print("WorkBuddy 代码质量审计工具")
    print("=" * 60)
    print("")
    
    if not WORKBUDDY_SRC.exists():
        print(f"❌ 源代码目录不存在: {WORKBUDDY_SRC}")
        return 1
    
    # 执行审计
    result = audit_directory(WORKBUDDY_SRC)
    
    # 输出到终端
    print("")
    print("=" * 60)
    print("审计完成")
    print("=" * 60)
    print(f"✅ 总文件数: {result.summary['total_files']}")
    print(f"✅ 总代码行数: {result.summary['total_lines']:,}")
    
    if result.summary['files_over_limit'] > 0:
        print(f"⚠️  超长文件数: {result.summary['files_over_limit']}")
    else:
        print(f"✅ 超长文件数: 0")
    
    if result.summary['functions_over_limit'] > 0:
        print(f"⚠️  超长函数数: {result.summary['functions_over_limit']}")
    else:
        print(f"✅ 超长函数数: 0")
    
    # 生成报告
    output_path = Path("E:/workspace/代码质量审计报告.md")
    generate_markdown_report(result, output_path)
    print("")
    print(f"📄 详细报告已生成: {output_path}")
    
    return 0

if __name__ == "__main__":
    exit(main())
```

2. 运行审计：

```bash
cd E:\workspace
python tools/code_audit.py
```

3. 检查输出：
   - 终端显示统计摘要
   - 生成 `E:\workspace\代码质量审计报告.md`

**预期结果**：
- 审计工具可执行
- 生成详细的 Markdown 报告
- 识别出所有超长文件和函数

---

### 任务 2.2：创建覆盖率趋势追踪工具

**目标**：保存覆盖率历史，支持趋势分析

**执行步骤**：

1. 创建 `E:\workspace\tools\track_coverage.py`：

```python
#!/usr/bin/env python3
"""
WorkBuddy 测试覆盖率趋势追踪工具
用途：保存覆盖率快照，生成趋势图
"""

import json
import os
from datetime import datetime
from pathlib import Path

COVERAGE_SUMMARY = Path("E:/workspace/workbuddy/coverage/coverage-summary.json")
HISTORY_FILE = Path("E:/workspace/workbuddy/coverage/history.jsonl")

def get_git_commit():
    """获取当前 Git commit（如果可用）"""
    try:
        import subprocess
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            cwd="E:/workspace/workbuddy"
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "unknown"

def save_coverage_snapshot():
    """保存当前覆盖率快照"""
    if not COVERAGE_SUMMARY.exists():
        print(f"❌ 覆盖率摘要不存在: {COVERAGE_SUMMARY}")
        print("请先运行: npm run test:coverage")
        return False
    
    # 读取覆盖率摘要
    with open(COVERAGE_SUMMARY, 'r') as f:
        summary = json.load(f)
    
    # 构造快照
    snapshot = {
        "timestamp": datetime.now().isoformat(),
        "commit": get_git_commit(),
        "lines": summary["total"]["lines"]["pct"],
        "functions": summary["total"]["functions"]["pct"],
        "branches": summary["total"]["branches"]["pct"],
        "statements": summary["total"]["statements"]["pct"],
    }
    
    # 追加到历史文件
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(HISTORY_FILE, 'a', encoding='utf-8') as f:
        f.write(json.dumps(snapshot) + '\n')
    
    print("✅ 覆盖率快照已保存")
    print(f"   行覆盖率: {snapshot['lines']:.1f}%")
    print(f"   函数覆盖率: {snapshot['functions']:.1f}%")
    print(f"   分支覆盖率: {snapshot['branches']:.1f}%")
    print(f"   提交: {snapshot['commit']}")
    
    return True

def load_history():
    """加载覆盖率历史"""
    if not HISTORY_FILE.exists():
        return []
    
    history = []
    with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                history.append(json.loads(line))
    
    return history

def generate_trend_report():
    """生成趋势报告"""
    history = load_history()
    
    if not history:
        print("⚠️  暂无历史数据")
        return
    
    print(f"\n📈 覆盖率趋势（最近 {len(history)} 次）\n")
    print(f"{'日期':<20} {'提交':<10} {'行':<8} {'函数':<8} {'分支':<8}")
    print("-" * 60)
    
    for snapshot in history[-10:]:  # 只显示最近 10 次
        date = snapshot['timestamp'][:19].replace('T', ' ')
        commit = snapshot['commit'][:7]
        lines = f"{snapshot['lines']:.1f}%"
        functions = f"{snapshot['functions']:.1f}%"
        branches = f"{snapshot['branches']:.1f}%"
        
        print(f"{date:<20} {commit:<10} {lines:<8} {functions:<8} {branches:<8}")

def main():
    print("=" * 60)
    print("WorkBuddy 测试覆盖率趋势追踪")
    print("=" * 60)
    print("")
    
    # 保存当前快照
    if save_coverage_snapshot():
        print("")
        # 显示趋势
        generate_trend_report()
        print("")
        print(f"📁 历史记录: {HISTORY_FILE}")
    
    return 0

if __name__ == "__main__":
    exit(main())
```

2. 使用方式（在运行测试后）：

```bash
cd E:\workspace\workbuddy
npm run test:coverage

cd E:\workspace
python tools/track_coverage.py
```

**预期结果**：
- 覆盖率快照保存到 `history.jsonl`
- 终端显示覆盖率趋势

---

## 批次 3：ESLint 规则配置（第5-6天）

### 任务 3.1：配置 ESLint 禁止 `any` 扩散

**目标**：添加 ESLint 规则，强制 `any` 使用必须有注释

**执行步骤**：

1. 检查 `workbuddy/.eslintrc.json` 是否存在，如果不存在则创建：

```json
{
  "root": true,
  "env": {
    "browser": true,
    "es2021": true,
    "node": true
  },
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "plugins": [
    "@typescript-eslint"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "warn",
    "@typescript-eslint/no-unsafe-member-access": "warn",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }
    ]
  },
  "ignorePatterns": [
    "node_modules/",
    "out/",
    "dist/",
    "coverage/",
    "*.spec.ts"
  ]
}
```

2. 如果 ESLint 依赖未安装，**不要安装**（本次不修改依赖）。

3. 仅创建配置文件，注释说明：

在 `.eslintrc.json` 顶部添加注释：

```json
{
  "// NOTE": "ESLint 配置已创建，但依赖未安装。后续需要执行: npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin",
  "root": true,
  ...
}
```

**预期结果**：
- `.eslintrc.json` 创建成功
- 配置合理，待安装依赖后可用

---

## 执行后验证清单

完成所有批次后，执行以下验证：

### ✅ 批次 1 验证

```bash
cd E:\workspace\workbuddy

# 1. 测试覆盖率
npm run test:coverage
# 预期：生成 coverage/index.html，所有 392 测试通过

# 2. 版本检查
cd E:\workspace
bash scripts/check-env.sh
# 预期：输出环境检查信息

# 3. CI 配置
cat workbuddy/.github/workflows/ci.yml
# 预期：文件存在且格式正确
```

### ✅ 批次 2 验证

```bash
cd E:\workspace

# 4. 代码审计
python tools/code_audit.py
# 预期：生成 代码质量审计报告.md

# 5. 覆盖率追踪
python tools/track_coverage.py
# 预期：保存快照到 history.jsonl
```

### ✅ 批次 3 验证

```bash
# 6. ESLint 配置
cat workbuddy/.eslintrc.json
# 预期：文件存在且包含 any 规则
```

---

## 完成后报告

完成所有任务后，更新 `E:\workspace\当前代码状态.md`：

```markdown
# 当前代码状态（GLM+DS 第一份阅读文件）

> **维护**：GLM+DS（**代码执行联合维护；同一时刻单写者并记录 `updatedBy`**）
> **更新方式**：覆盖式更新，只记录最近一次代码任务情况

---

## 当前状态
**任务类型**：外缘审查优化建议实施（代码层面）
**任务名称**：基础设施配置 + 审计工具 + ESLint 规则
**状态**：✅ 已完成（2026-09-07）
**更新时间**：2026-09-07

## 关联文档（必读）
**优化建议**：`E:\workspace\外缘审查及优化建议.md`
**执行 Prompt**：`E:\workspace\用户prompt\DS-外缘审查优化-DeepSeek执行.md`（文件名保留兼容；正文角色为 GLM+DS）

## 当前事实（完成清单）

### 批次 1：基础设施配置 ✅

- ✅ Vitest 覆盖率配置（vitest.config.ts）
- ✅ 版本管理文件（.nvmrc / .python-version / engines）
- ✅ 环境检查脚本（scripts/check-env.sh）
- ✅ GitHub Actions CI 配置（.github/workflows/ci.yml）

### 批次 2：审计工具 ✅

- ✅ 代码质量审计工具（tools/code_audit.py）
- ✅ 覆盖率趋势追踪工具（tools/track_coverage.py）
- ✅ 审计报告生成（代码质量审计报告.md）

### 批次 3：ESLint 规则 ✅

- ✅ ESLint 配置文件（.eslintrc.json）
- ⚠️  ESLint 依赖未安装（待后续 npm install）

## 测试与验证

- **测试**：392/392 通过 ✅
- **构建**：npm run build 通过 ✅
- **覆盖率**：已启用，报告生成成功 ✅
- **审计工具**：可执行，报告正常 ✅

## 未修改项（保持原样）

- 业务代码（src/ 下所有 .ts / .vue）
- 测试文件（tests/ 下所有 .spec.ts）
- 依赖清单（package.json dependencies）
- 数据库迁移（migrations/）
- 治理文档（规范类/ 等）

## 下一步

交由 GPT 执行：
1. 审查本次改动（03/05 流程）
2. 执行 GPT 部分的优化任务
3. 创建三级治理模式文档
4. 合并状态文档
```

---

## 重要提醒

1. **不要修改业务代码**：本次任务只涉及配置和工具，不改 `src/` 业务逻辑
2. **不要安装新依赖**：ESLint 依赖暂不安装，只创建配置文件
3. **不要提交 Git**：所有改动留待 GPT 审查后统一归档
4. **保持测试通过**：每个批次完成后运行 `npm test` 确认 392/392 通过
5. **文档根 vs 代码根**：工具脚本放文档根（`E:\workspace\tools\`），配置文件放代码根（`workbuddy/`）

---

**执行完成后，将控制权交给 GPT 进行审查和后续优化。**
