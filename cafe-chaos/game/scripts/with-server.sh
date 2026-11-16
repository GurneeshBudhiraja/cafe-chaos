#!/usr/bin/env bash
# Run a command with the dev server up for just as long as it takes:
#   scripts/with-server.sh node scripts/sim-run.mjs
# If a dev server is already on the port it is used and left running.
set -u
cd "$(dirname "$0")/.."
PORT="${PORT:-8082}"
started=""
if ! curl -sk -o /dev/null "https://localhost:${PORT}/"; then
  rm -rf .iwsdk/runtime
  npx vite --port "${PORT}" >/dev/null 2>&1 &
  started=$!
  for _ in $(seq 1 60); do
    curl -sk -o /dev/null "https://localhost:${PORT}/" && break
    sleep 1
  done
fi
"$@"
status=$?
# npx starts vite as a child: stop the server itself, not only its launcher.
if [ -n "${started}" ]; then kill "${started}" 2>/dev/null; pkill -f "vite --port ${PORT}" 2>/dev/null; fi
exit "${status}"
