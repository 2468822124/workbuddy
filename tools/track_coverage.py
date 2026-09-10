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
