#!/bin/bash
# Push state to Absalom face server
# Usage: ./push-state.sh <mode> [message]
# Modes: idle, listening, thinking, responding

MODE=${1:-idle}
MESSAGE=${2:-""}
PORT=${ABSALOM_PORT:-3847}
HOST=${ABSALOM_HOST:-localhost}

curl -s -X POST "http://${HOST}:${PORT}/state" \
  -H "Content-Type: application/json" \
  -d "{\"mode\": \"$MODE\", \"message\": \"$MESSAGE\"}"
