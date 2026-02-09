#!/bin/bash
# 节点心跳测试脚本
# 用于验证节点认证中间件和心跳上报功能

set -e

# 配置
PANEL_URL="${PANEL_URL:-http://localhost:8080}"
API_TOKEN="${API_TOKEN}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "节点心跳测试脚本"
echo "========================================"
echo ""

# 检查 API_TOKEN
if [ -z "$API_TOKEN" ]; then
    echo -e "${RED}错误: 请设置 API_TOKEN 环境变量${NC}"
    echo "用法: API_TOKEN=your_token_here ./test-heartbeat.sh"
    echo ""
    echo "获取 API Token 的方法："
    echo "1. 登录面板"
    echo "2. 进入「节点管理」页面"
    echo "3. 点击「添加节点」"
    echo "4. 复制生成的 API Token"
    exit 1
fi

echo -e "${YELLOW}配置信息:${NC}"
echo "面板地址: $PANEL_URL"
echo "API Token: ${API_TOKEN:0:10}...${API_TOKEN: -10}"
echo ""

# 测试 1: 无认证访问（应该失败）
echo -e "${YELLOW}[测试 1] 无认证访问心跳接口...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PANEL_URL/api/node/heartbeat" \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"status":"online"}')

if [ "$HTTP_CODE" = "401" ]; then
    echo -e "${GREEN}✓ 通过 - 无认证访问被正确拒绝 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ 失败 - 预期 HTTP 401，实际 HTTP $HTTP_CODE${NC}"
fi
echo ""

# 测试 2: 错误的 Token（应该失败）
echo -e "${YELLOW}[测试 2] 使用错误的 Token...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PANEL_URL/api/node/heartbeat" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer invalid_token_12345" \
    -d '{"status":"online"}')

if [ "$HTTP_CODE" = "401" ]; then
    echo -e "${GREEN}✓ 通过 - 错误 Token 被正确拒绝 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ 失败 - 预期 HTTP 401，实际 HTTP $HTTP_CODE${NC}"
fi
echo ""

# 测试 3: 正确的 Token（应该成功）
echo -e "${YELLOW}[测试 3] 使用正确的 Token 发送心跳...${NC}"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$PANEL_URL/api/node/heartbeat" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_TOKEN" \
    -d '{
        "status": "online",
        "cpu_usage": 25.5,
        "memory_usage": 60.2,
        "disk_usage": 45.8,
        "network_in": 1024000,
        "network_out": 2048000,
        "uptime": 86400,
        "xray_status": "running",
        "gost_status": "running"
    }')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ 通过 - 心跳上报成功 (HTTP $HTTP_CODE)${NC}"
    echo "响应内容:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
    echo -e "${RED}✗ 失败 - 预期 HTTP 200，实际 HTTP $HTTP_CODE${NC}"
    echo "响应内容:"
    echo "$BODY"
fi
echo ""

# 测试 4: Query 参数方式传递 Token
echo -e "${YELLOW}[测试 4] 使用 Query 参数传递 Token...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PANEL_URL/api/node/heartbeat?token=$API_TOKEN" \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"status":"online"}')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ 通过 - Query 参数认证成功 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ 失败 - 预期 HTTP 200，实际 HTTP $HTTP_CODE${NC}"
fi
echo ""

# 测试 5: 获取节点监控数据
echo -e "${YELLOW}[测试 5] 获取节点监控数据...${NC}"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$PANEL_URL/api/node/monitor/data" \
    -H "Authorization: Bearer $API_TOKEN")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ 通过 - 获取监控数据成功 (HTTP $HTTP_CODE)${NC}"
    echo "监控数据:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
    echo -e "${RED}✗ 失败 - 预期 HTTP 200，实际 HTTP $HTTP_CODE${NC}"
    echo "响应内容:"
    echo "$BODY"
fi
echo ""

echo "========================================"
echo "测试完成"
echo "========================================"
echo ""
echo "如果所有测试都通过，说明节点认证中间件工作正常。"
echo "现在可以在实际节点上安装 agent 并观察面板状态更新。"
echo ""
