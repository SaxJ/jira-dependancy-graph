#! /usr/bin/bash
set -e
cd "$(dirname "$0")"
npm ci
(cd static/dep-graph && npm ci && npm run build)
forge deploy -e "${1:-development}"
