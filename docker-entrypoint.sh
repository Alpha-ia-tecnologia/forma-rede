#!/usr/bin/env bash
# Sobe a API (so dentro do container) e a web (porta publica) da imagem unica.
# Se um dos dois parar, o container sai e o Easypanel o reinicia inteiro.
set -u
cd "$(dirname "$0")"

node apps/api/dist/main.js &
api=$!
node apps/web/.next/standalone/apps/web/server.js &
web=$!

trap 'kill -TERM "$api" "$web" 2>/dev/null' TERM INT
wait -n "$api" "$web"
status=$?
kill -TERM "$api" "$web" 2>/dev/null
wait
exit "$status"
