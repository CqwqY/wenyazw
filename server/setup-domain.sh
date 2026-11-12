#!/usr/bin/env bash
# 把 back.wenyazw.top 接入 Cloudflare Tunnel -> 本机 3033
# 需要 root：sudo bash /home/cai/wenyazw/server/setup-domain.sh
# 执行前请先在 Cloudflare DNS 添加 CNAME 记录（见下方 echo 提示）。
set -euo pipefail

CONF=/etc/cloudflared/config.yml
BAK="${CONF}.bak.$(date +%Y%m%d%H%M%S)"

echo "隧道 ID: e8b505bd-7eb0-4dfc-9a06-7134465947b8"
echo "Cloudflare DNS 需添加: CNAME  back  ->  e8b505bd-7eb0-4dfc-9a06-7134465947b8.cfargotunnel.com  (代理开启/橙色云)"
echo

if grep -q "back.wenyazw.top" "$CONF"; then
  echo "ingress 已包含 back.wenyazw.top，跳过写入。"
else
  cp -a "$CONF" "$BAK"
  echo "已备份配置到 $BAK"
  awk '
    /^  - service: http_status:404/ && !inserted {
      print "  - hostname: back.wenyazw.top"
      print "    service: http://localhost:3033"
      print ""
      inserted = 1
    }
    { print }
  ' "$CONF" > "${CONF}.new"
  mv "${CONF}.new" "$CONF"
  chmod 644 "$CONF"
  echo "已写入 ingress 规则。"
fi

echo "=== 新配置 ==="
cat "$CONF"
echo

# 校验配置语法（cloudflared 自带 ingress 校验）
if cloudflared tunnel --config "$CONF" ingress validate >/dev/null 2>&1; then
  echo "ingress 配置校验通过。"
else
  echo "警告：ingress 校验未通过，请检查缩进；已保留备份 $BAK"
fi

systemctl restart cloudflared
sleep 1
echo "=== cloudflared 状态 ==="
systemctl is-active cloudflared
echo
echo "=== 本机 3033 健康检查 ==="
curl -s --noproxy '*' http://127.0.0.1:3033/api/health || true
echo
echo "完成。DNS 生效后可用 https://back.wenyazw.top/api/health 验证。"
