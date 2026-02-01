#!/bin/bash
# Restart tunnel and update ws-url.txt in GitHub repo
# Run this when tunnel needs to be restarted

REPO_DIR="/home/openclaw/Projects/absalom-face"
LOG_FILE="/tmp/cloudflared.log"

echo "Stopping existing tunnel..."
pkill cloudflared 2>/dev/null
sleep 2

echo "Starting new tunnel..."
nohup cloudflared tunnel --url http://localhost:3847 > "$LOG_FILE" 2>&1 &
sleep 5

# Extract the new URL
NEW_URL=$(grep "trycloudflare.com" "$LOG_FILE" | grep -oP 'https://[a-z-]+\.trycloudflare\.com' | head -1)

if [ -z "$NEW_URL" ]; then
  echo "ERROR: Could not find tunnel URL"
  cat "$LOG_FILE"
  exit 1
fi

WS_URL="wss://${NEW_URL#https://}"
echo "New tunnel URL: $WS_URL"

# Update ws-url.txt
echo "$WS_URL" > "$REPO_DIR/ws-url.txt"

# Push to GitHub
cd "$REPO_DIR"
git add ws-url.txt
git commit -m "Update tunnel URL: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push origin main

echo "Done! Face will auto-reconnect to: $WS_URL"
