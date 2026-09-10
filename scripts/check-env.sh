#!/bin/bash

echo "=== WorkBuddy 开发环境检查 ==="
echo ""

# 检查 Node 版本
echo "检查 Node.js 版本..."
NODE_VERSION=$(node -v | cut -d 'v' -f 2)
if [[ "$NODE_VERSION" =~ ^22\. ]]; then
    echo "✅ Node.js 版本: v$NODE_VERSION (要求: 22.x)"
else
    echo "❌ Node.js 版本不匹配！要求: 22.x，当前: v$NODE_VERSION"
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
