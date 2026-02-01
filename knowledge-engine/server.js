#!/usr/bin/env node
/**
 * Knowledge Engine Server
 * 
 * WebSocket server for knowledge graph updates
 * Extends the existing state server with graph broadcast capability
 */

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3847;

class KnowledgeServer {
  constructor(options = {}) {
    this.port = options.port || PORT;
    this.server = null;
    this.wss = null;
    this.clients = new Set();
    
    // State (inherited from existing server)
    this.state = {
      mode: 'idle',
      lastUpdate: Date.now(),
      message: ''
    };
    
    // Knowledge graph
    this.graph = {
      nodes: [],
      edges: [],
      version: 0,
      lastUpdate: Date.now()
    };
  }

  /**
   * Update the knowledge graph
   */
  setGraph(graph) {
    this.graph = {
      ...graph,
      version: this.graph.version + 1,
      lastUpdate: Date.now()
    };
    
    // Broadcast full graph to all clients
    this.broadcast({
      type: 'graph:full',
      graph: this.graph
    });
    
    console.log(`[Server] Graph updated: ${this.graph.nodes.length} nodes, ${this.graph.edges.length} edges`);
  }

  /**
   * Send graph delta (node added/updated/removed)
   */
  sendNodeDelta(action, node) {
    const message = {
      type: `graph:node:${action}`,
      node,
      timestamp: Date.now()
    };
    
    this.broadcast(message);
    console.log(`[Server] Node ${action}: ${node.id}`);
  }

  /**
   * Send edge delta
   */
  sendEdgeDelta(action, edge) {
    const message = {
      type: `graph:edge:${action}`,
      edge,
      timestamp: Date.now()
    };
    
    this.broadcast(message);
  }

  /**
   * Send activation event (nodes being thought about)
   */
  sendActivation(nodeIds, intensity = 1.0) {
    this.broadcast({
      type: 'activate',
      nodeIds,
      intensity,
      timestamp: Date.now()
    });
  }

  /**
   * Send path activation
   */
  sendPathActivation(path, intensity = 1.0) {
    this.broadcast({
      type: 'activate:path',
      path,
      intensity,
      timestamp: Date.now()
    });
  }

  /**
   * Update state (existing functionality)
   */
  setState(mode, message = '') {
    this.state.mode = mode;
    this.state.lastUpdate = Date.now();
    this.state.message = message;
    
    this.broadcast({
      type: 'state',
      ...this.state
    });
    
    console.log(`[Server] State: ${mode}`);
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(data) {
    const message = JSON.stringify(data);
    let sent = 0;
    
    this.clients.forEach(client => {
      if (client.readyState === 1) {  // OPEN
        client.send(message);
        sent++;
      }
    });
    
    return sent;
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws, req) {
    this.clients.add(ws);
    const clientIp = req.socket.remoteAddress;
    console.log(`[Server] Client connected from ${clientIp} (${this.clients.size} total)`);

    // Send current state immediately
    ws.send(JSON.stringify({
      type: 'state',
      ...this.state
    }));

    // Send current graph
    ws.send(JSON.stringify({
      type: 'graph:full',
      graph: this.graph
    }));

    ws.on('close', () => {
      this.clients.delete(ws);
      console.log(`[Server] Client disconnected (${this.clients.size} total)`);
    });

    ws.on('error', (err) => {
      console.error('[Server] WebSocket error:', err.message);
      this.clients.delete(ws);
    });

    // Handle incoming messages from clients
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        this.handleClientMessage(ws, msg);
      } catch (err) {
        console.error('[Server] Invalid message:', err.message);
      }
    });
  }

  /**
   * Handle client messages
   */
  handleClientMessage(ws, msg) {
    switch (msg.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      
      case 'graph:request':
        ws.send(JSON.stringify({
          type: 'graph:full',
          graph: this.graph
        }));
        break;
      
      case 'state:request':
        ws.send(JSON.stringify({
          type: 'state',
          ...this.state
        }));
        break;
      
      default:
        console.log(`[Server] Unknown message type: ${msg.type}`);
    }
  }

  /**
   * Handle HTTP requests
   */
  handleRequest(req, res) {
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
      res.end(JSON.stringify(this.state));
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
            this.setState(update.mode, update.message);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, state: this.state }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // GET /graph - current graph
    if (req.method === 'GET' && req.url === '/graph') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.graph));
      return;
    }

    // GET /health - health check
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        clients: this.clients.size,
        state: this.state.mode,
        graphNodes: this.graph.nodes.length,
        graphEdges: this.graph.edges.length,
        graphVersion: this.graph.version
      }));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  }

  /**
   * Start the server
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.wss = new WebSocketServer({ server: this.server });
      
      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });

      // Auto-idle after 30 seconds of no updates
      this.idleInterval = setInterval(() => {
        if (this.state.mode !== 'idle' && Date.now() - this.state.lastUpdate > 30000) {
          this.setState('idle');
          console.log('[Server] Auto-idle after timeout');
        }
      }, 5000);

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.port} is already in use. Is another server running?`));
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, () => {
        console.log(`[Server] Knowledge Engine Server running on port ${this.port}`);
        console.log(`[Server]   WebSocket: ws://localhost:${this.port}`);
        console.log(`[Server]   HTTP API:  http://localhost:${this.port}/state`);
        console.log(`[Server]   Graph API: http://localhost:${this.port}/graph`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop() {
    if (this.idleInterval) {
      clearInterval(this.idleInterval);
    }

    // Close all client connections
    this.clients.forEach(client => {
      client.close();
    });
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
    }

    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
  }
}

module.exports = { KnowledgeServer };
