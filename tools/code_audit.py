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
