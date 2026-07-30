#!/usr/bin/env bash
set -euo pipefail

# Ensure we run from repo root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "Starting backend on port ${PORT:-10000}..."
exec python -m uvicorn main:app --host 0.0.0.0 --port "${PORT:-10000}" --app-dir backend
