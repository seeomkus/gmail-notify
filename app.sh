#!/usr/bin/env sh
# Pembungkus Linux/macOS: ./app.sh {build|start|stop|restart|status|logs}
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js belum terpasang (butuh versi 18+)." >&2
  exit 1
fi

exec node scripts/app.mjs "$@"
