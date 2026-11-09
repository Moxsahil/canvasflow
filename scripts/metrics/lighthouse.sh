#!/usr/bin/env bash
# Metric 8: Lighthouse (default mobile emulation) on the LOCAL production builds.
# web: next start on :3000   editor: vite preview on :3002
set -euo pipefail
cd "$(dirname "$0")"
export CHROME_PATH="$HOME/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome"
mkdir -p results/lighthouse
for target in web:http://localhost:3000/ editor:http://localhost:3002/; do
  name=${target%%:*}; url=${target#*:}
  for run in 1 2 3; do
    npx -y lighthouse@12 "$url" --quiet --only-categories=performance,accessibility,best-practices \
      --output=json --output-path="results/lighthouse/$name-$run.json" \
      --chrome-flags="--headless=new --no-sandbox"
  done
done
