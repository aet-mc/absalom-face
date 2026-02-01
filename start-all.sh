#!/bin/bash
# Start Absalom Face services

# Start state server
cd ~/Projects/absalom-face/server
pm2 start ecosystem.config.js --update-env 2>/dev/null || {
  node index.js &
  node activity-watcher.js &
}

# Start Cloudflare tunnel
pkill cloudflared 2>/dev/null
sleep 1
nohup cloudflared tunnel --url http://localhost:3847 > /tmp/cloudflared.log 2>&1 &
sleep 3

# Extract and display URL
grep "trycloudflare.com" /tmp/cloudflared.log | tail -1
