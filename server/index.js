#!/usr/bin/env node
/**
 * Absalom State Sync Server
 * 
 * WebSocket server that broadcasts state to connected face clients
 * HTTP endpoint for OpenClaw to push state updates
 */

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3847;

// Current state
let state = {
  mode: 'idle', // idle, listening, thinking, responding
  lastUpdate: Date.now(),
  message: ''
};

// Connected clients
const clients = new Set();

// HTTP server for state updates
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // GET /state - current state
  if (req.method === 'GET' && req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
    return;
  }
  
  // POST /state - update state
  if (req.method === 'POST' && req.url === '/state') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        if (update.mode) {
          state.mode = update.mode;
          state.lastUpdate = Date.now();
          state.message = update.message || '';
          
          // Broadcast to all connected clients
          broadcast({ type: 'state', ...state });
          
          console.log(`[${new Date().toISOString()}] State: ${state.mode}`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, state }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: clients.size, state: state.mode }));
    return;
  }
  
  res.writeHead(404);
  res.end('Not found');
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[${new Date().toISOString()}] Client connected (${clients.size} total)`);
  
  // Send current state immediately
  ws.send(JSON.stringify({ type: 'state', ...state }));
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[${new Date().toISOString()}] Client disconnected (${clients.size} total)`);
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    clients.delete(ws);
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// Auto-idle after 30 seconds of no updates
setInterval(() => {
  if (state.mode !== 'idle' && Date.now() - state.lastUpdate > 30000) {
    state.mode = 'idle';
    state.lastUpdate = Date.now();
    broadcast({ type: 'state', ...state });
    console.log(`[${new Date().toISOString()}] Auto-idle after timeout`);
  }
}, 5000);

server.listen(PORT, () => {
  console.log(`Absalom State Server running on port ${PORT}`);
  console.log(`  WebSocket: ws://localhost:${PORT}`);
  console.log(`  HTTP API:  http://localhost:${PORT}/state`);
});
