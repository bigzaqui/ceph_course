#!/usr/bin/env bash
set -euo pipefail
pkill -f "/opt/argon/serve.py" 2>/dev/null || true
nohup python3 /opt/argon/serve.py >/opt/argon/server.log 2>&1 &
sleep 0.5
echo "Server running in background (PID: $(pgrep -f '/opt/argon/serve.py' | head -n1))"
echo "Open: http://192.168.1.20:8080"
