#!/usr/bin/env node
/**
 * Absalom State Sync Server
 * 
 * WebSocket server that broadcasts state and graph updates to connected face clients
 * HTTP endpoints for OpenClaw to push state updates and graph data
 */

const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const PORT = process.env.PORT || 3847;

// Current state
let state = {
  mode: 'idle', // idle, listening, thinking, responding
  lastUpdate: Date.now(),
  message: ''
};

// Knowledge graph (populated by knowledge-engine)
let graph = {
  nodes: [],
  edges: [],
  lastUpdate: null
};

// Tide level (context fullness)
let tideLevel = 0.3;

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
          broadcast({ type: 'state', state: state.mode, mode: state.mode });
          
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
  
  // GET /graph - current knowledge graph
  if (req.method === 'GET' && req.url === '/graph') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(graph));
    return;
  }
  
  // POST /graph - update full graph
  if (req.method === 'POST' && req.url === '/graph') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        if (update.nodes && update.edges) {
          graph = {
            nodes: update.nodes,
            edges: update.edges,
            lastUpdate: Date.now()
          };
          
          // Broadcast full graph to all clients
          broadcast({ type: 'graph:full', graph });
          
          console.log(`[${new Date().toISOString()}] Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, nodes: graph.nodes.length, edges: graph.edges.length }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // POST /activate - activate specific nodes
  if (req.method === 'POST' && req.url === '/activate') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        if (update.nodeIds && Array.isArray(update.nodeIds)) {
          const intensity = update.intensity ?? 1;
          
          broadcast({ type: 'activate', nodeIds: update.nodeIds, intensity });
          
          console.log(`[${new Date().toISOString()}] Activate: ${update.nodeIds.length} nodes, intensity ${intensity}`);
        }
        if (update.path && Array.isArray(update.path)) {
          const intensity = update.intensity ?? 1;
          
          broadcast({ type: 'activate:path', path: update.path, intensity });
          
          console.log(`[${new Date().toISOString()}] Activate path: ${update.path.length} nodes`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // POST /tide - set tide level
  if (req.method === 'POST' && req.url === '/tide') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        if (typeof update.level === 'number') {
          tideLevel = Math.max(0, Math.min(1, update.level));
          
          broadcast({ type: 'tide:level', level: tideLevel });
          
          console.log(`[${new Date().toISOString()}] Tide: ${tideLevel}`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, level: tideLevel }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // POST /context - add context creature (future use)
  if (req.method === 'POST' && req.url === '/context') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        if (update.concept) {
          broadcast({ 
            type: 'context:add', 
            concept: update.concept, 
            creatureType: update.creatureType || 'default' 
          });
          
          console.log(`[${new Date().toISOString()}] Context: ${update.concept} (${update.creatureType})`);
        }
        if (update.clear) {
          broadcast({ type: 'context:clear' });
          console.log(`[${new Date().toISOString()}] Context cleared`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  // POST /agent - sub-agent events
  if (req.method === 'POST' && req.url === '/agent') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        if (update.action === 'spawn' && update.agent) {
          broadcast({ type: 'agent:spawn', agent: update.agent });
          console.log(`[${new Date().toISOString()}] Agent spawn: ${update.agent.label}`);
        }
        if (update.action === 'update' && update.sessionKey) {
          broadcast({ type: 'agent:update', sessionKey: update.sessionKey, status: update.status });
          console.log(`[${new Date().toISOString()}] Agent update: ${update.sessionKey} -> ${update.status}`);
        }
        if (update.action === 'complete' && update.sessionKey) {
          broadcast({ type: 'agent:complete', sessionKey: update.sessionKey, findings: update.findings || [] });
          console.log(`[${new Date().toISOString()}] Agent complete: ${update.sessionKey}`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
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
    res.end(JSON.stringify({ 
      ok: true, 
      clients: clients.size, 
      state: state.mode,
      graph: { nodes: graph.nodes.length, edges: graph.edges.length },
      tide: tideLevel
    }));
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
  ws.send(JSON.stringify({ type: 'state', state: state.mode, mode: state.mode }));
  
  // Send current graph if available
  if (graph.nodes.length > 0) {
    ws.send(JSON.stringify({ type: 'graph:full', graph }));
  }
  
  // Send tide level
  ws.send(JSON.stringify({ type: 'tide:level', level: tideLevel }));
  
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
    broadcast({ type: 'state', state: state.mode, mode: state.mode });
    console.log(`[${new Date().toISOString()}] Auto-idle after timeout`);
  }
}, 5000);

server.listen(PORT, () => {
  console.log(`Absalom State Server running on port ${PORT}`);
  console.log(`  WebSocket: ws://localhost:${PORT}`);
  console.log(`  HTTP API:`);
  console.log(`    GET/POST /state    - Mode changes (idle/listening/thinking/responding)`);
  console.log(`    GET/POST /graph    - Knowledge graph (nodes, edges)`);
  console.log(`    POST /activate     - Activate nodes { nodeIds: [], intensity: 1 }`);
  console.log(`    POST /tide         - Set tide level { level: 0.0-1.0 }`);
  console.log(`    POST /context      - Add context { concept, creatureType } or { clear: true }`);
  console.log(`    POST /agent        - Agent events { action: spawn|update|complete, ... }`);
  console.log(`    GET /health        - Server health check`);
});
