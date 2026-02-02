#!/bin/bash
# Absalom Infrastructure Startup Script
# Run this on boot or after restart to bring up all services

set -e

echo "=== Starting Absalom Infrastructure ==="

# Kill any existing tunnels
pkill -f "cloudflared.*3847" 2>/dev/null || true
pkill -f "ngrok.*8080" 2>/dev/null || true

# Start HTTP server for city visualization
cd ~/Projects/absalom-face
if ! lsof -i :8080 > /dev/null 2>&1; then
    echo "[1/4] Starting HTTP server on port 8080..."
    nohup python3 -m http.server 8080 > /tmp/absalom-http.log 2>&1 &
    sleep 2
else
    echo "[1/4] HTTP server already running on port 8080"
fi

# Start ngrok tunnel for city (public access)
echo "[2/4] Starting ngrok tunnel for city..."
nohup ngrok http 8080 --log=stdout > /tmp/ngrok-city.log 2>&1 &
sleep 5

# Get ngrok URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url' 2>/dev/null || echo "pending...")
echo "    City URL: $NGROK_URL"

# Start PM2 services
echo "[3/4] Starting PM2 services..."
pm2 stop absalom-state 2>/dev/null || true
pm2 restart absalom-knowledge 2>/dev/null || pm2 start ~/Projects/absalom-face/knowledge-engine/ecosystem.config.js --only absalom-knowledge
pm2 restart absalom-watcher 2>/dev/null || true
sleep 3

# Start cloudflared tunnel for Knowledge Engine API
echo "[4/4] Starting cloudflared tunnel for API..."
nohup cloudflared tunnel --url http://localhost:3847 > /tmp/cloudflared-api.log 2>&1 &
sleep 8

# Get cloudflared URL
CF_URL=$(grep -o 'https://[^"]*\.trycloudflare\.com' /tmp/cloudflared-api.log | head -1 || echo "pending...")
echo "    API URL: $CF_URL"

# Update city HTML with new API URL if we got one
if [[ "$CF_URL" == https://* ]]; then
    echo "    Updating city API_URL..."
    sed -i "s|const API_URL = 'https://[^']*'|const API_URL = '$CF_URL'|g" ~/Projects/absalom-face/renderer/city/absalom-city.html
fi

echo ""
echo "=== Absalom Infrastructure Ready ==="
echo "City:     $NGROK_URL/renderer/city/absalom-city.html"
echo "API:      $CF_URL"
echo "PM2:      pm2 status"
echo ""
echo "Logs:"
echo "  HTTP:       /tmp/absalom-http.log"
echo "  ngrok:      /tmp/ngrok-city.log"  
echo "  cloudflared: /tmp/cloudflared-api.log"
echo "  PM2:        pm2 logs"
