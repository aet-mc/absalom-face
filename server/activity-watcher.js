#!/usr/bin/env node
/**
 * Activity Watcher - Monitors OpenClaw activity and syncs state
 * 
 * Watches a state file that gets updated by exec hooks
 * Falls back to process monitoring
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const STATE_FILE = process.env.STATE_FILE || '/tmp/absalom-activity.json';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3847';
const POLL_INTERVAL = 500; // ms

let lastState = 'idle';
let lastActivity = Date.now();
const IDLE_TIMEOUT = 15000; // 15 seconds of no activity = idle

function pushState(mode) {
  if (mode === lastState) return;
  
  lastState = mode;
  
  const req = http.request(`${SERVER_URL}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  
  req.on('error', () => {}); // Ignore errors
  req.write(JSON.stringify({ mode }));
  req.end();
  
  console.log(`[${new Date().toISOString()}] State -> ${mode}`);
}

function checkActivity() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      
      if (data.timestamp > lastActivity) {
        lastActivity = data.timestamp;
        pushState(data.mode || 'thinking');
      }
    }
    
    // Auto-idle after timeout
    if (Date.now() - lastActivity > IDLE_TIMEOUT && lastState !== 'idle') {
      pushState('idle');
    }
  } catch (e) {
    // Ignore parse errors
  }
}

// Poll for activity
setInterval(checkActivity, POLL_INTERVAL);

console.log('Activity watcher started');
console.log(`  Watching: ${STATE_FILE}`);
console.log(`  Server: ${SERVER_URL}`);

// Initial state
pushState('idle');
