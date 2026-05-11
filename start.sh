#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f package.json ]; then
  echo "❌ package.json не найден. Запускай скрипт из папки проекта."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "📦 Устанавливаю зависимости..."
  npm install
fi

echo "🚀 Запускаю CS2 news bot..."
node server.js
