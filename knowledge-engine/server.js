#!/usr/bin/env node
/**
 * Knowledge Engine Server
 * 
 * WebSocket server for knowledge graph updates
 * Extends the existing state server with graph broadcast capability
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3847;
const CITY_STATE_PATH = path.join(__dirname, '../data/city-state.json');

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
    
    // City state (for Absalom City visualization)
    this.cityState = this.loadCityState();
  }
  
  /**
   * Load city state from disk
   */
  loadCityState() {
    try {
      if (fs.existsSync(CITY_STATE_PATH)) {
        const data = fs.readFileSync(CITY_STATE_PATH, 'utf8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('[Server] Failed to load city state:', e.message);
    }
    return {
      version: 0,
      lastUpdate: 0,
      buildings: [],
      connections: [],
      activeDistrict: null,
      cognitiveState: 'idle',
      districtActivity: {}
    };
  }
  
  /**
   * Regenerate city state from knowledge
   */
  async regenerateCityState() {
    try {
      const scriptPath = path.join(__dirname, '../scripts/knowledge-to-city.js');
      const { main } = require(scriptPath);
      this.cityState = main();
      this.broadcastCityState();
      return this.cityState;
    } catch (e) {
      console.error('[Server] Failed to regenerate city:', e.message);
      return null;
    }
  }
  
  /**
   * Update cognitive state and district activity
   */
  setCognitiveState(mode, context = '') {
    this.cityState.cognitiveState = mode;
    
    // Parse context for district activity hints
    if (context) {
      const lower = context.toLowerCase();
      const districtKeywords = {
        trading: ['stock', 'trading', 'market', 'ticker', 'price', 'portfolio'],
        infrastructure: ['server', 'deploy', 'api', 'docker', 'tunnel'],
        projects: ['project', 'build', 'app', 'visualization', 'face'],
        memory: ['memory', 'remember', 'decision', 'note', 'log'],
        core: ['self', 'absalom', 'knowledge', 'engine']
      };
      
      // Boost matching district
      for (const [district, keywords] of Object.entries(districtKeywords)) {
        for (const kw of keywords) {
          if (lower.includes(kw)) {
            this.cityState.districtActivity[district] = Math.min(1.0, 
              (this.cityState.districtActivity[district] || 0.3) + 0.2);
            this.cityState.activeDistrict = district;
            break;
          }
        }
      }
    }
    
    this.broadcastCityState();
  }
  
  /**
   * Broadcast city state to all clients
   */
  broadcastCityState() {
    this.broadcast({
      type: 'city:state',
      city: this.cityState
    });
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

    // Send current city state
    ws.send(JSON.stringify({
      type: 'city:state',
      city: this.cityState
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
      
      case 'city:request':
        ws.send(JSON.stringify({
          type: 'city:state',
          city: this.cityState
        }));
        break;
      
      case 'city:regenerate':
        this.regenerateCityState();
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
        graphVersion: this.graph.version,
        cityBuildings: this.cityState.buildings.length
      }));
      return;
    }

    // GET /city-state - current city state for Absalom City
    if (req.method === 'GET' && req.url === '/city-state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.cityState));
      return;
    }

    // POST /city-state/regenerate - regenerate city from knowledge
    if (req.method === 'POST' && req.url === '/city-state/regenerate') {
      this.regenerateCityState().then(state => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, buildings: state?.buildings?.length || 0 }));
      }).catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
      return;
    }

    // POST /city-state/cognitive - update cognitive state with context
    if (req.method === 'POST' && req.url === '/city-state/cognitive') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { mode, context } = JSON.parse(body);
          this.setCognitiveState(mode, context);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, activeDistrict: this.cityState.activeDistrict }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CITY PLANNER ENDPOINTS - Memory optimization
    // ═══════════════════════════════════════════════════════════════════════
    
    // POST /planner/scan - Report a building scan, get optimization hints
    if (req.method === 'POST' && req.url === '/planner/scan') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { buildingId, district, label } = JSON.parse(body);
          console.log(`[Planner] Scanning: ${label} (${district})`);
          
          // Track scan in planner stats
          if (!this.plannerStats) {
            this.plannerStats = { scans: 0, optimizations: 0, lastPatrol: null, findings: [] };
          }
          this.plannerStats.scans++;
          
          // Check if this entity might be stale (simple heuristic)
          const finding = this.analyzeBuildingHealth(buildingId, label, district);
          if (finding) {
            this.plannerStats.findings.push(finding);
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            ok: true, 
            scans: this.plannerStats.scans,
            finding: finding || null
          }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    
    // POST /planner/patrol-complete - Full patrol done, trigger optimization
    if (req.method === 'POST' && req.url === '/planner/patrol-complete') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          console.log('[Planner] Patrol complete - running optimization...');
          
          if (!this.plannerStats) {
            this.plannerStats = { scans: 0, optimizations: 0, lastPatrol: null, findings: [] };
          }
          
          this.plannerStats.lastPatrol = Date.now();
          this.plannerStats.optimizations++;
          
          // Run actual memory optimization
          const result = await this.runMemoryOptimization();
          
          // Regenerate city after optimization
          if (result.changes > 0) {
            this.regenerateCityState();
          }
          
          // Clear findings after optimization
          const findings = [...this.plannerStats.findings];
          this.plannerStats.findings = [];
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            ok: true, 
            optimizations: this.plannerStats.optimizations,
            result,
            findings
          }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    
    // GET /planner/status - Planner optimization stats
    if (req.method === 'GET' && req.url === '/planner/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        stats: this.plannerStats || { scans: 0, optimizations: 0, lastPatrol: null, findings: [] }
      }));
      return;
    }

    // GET /api/dashboard-stats - Stats for Command Center dashboard
    if (req.method === 'GET' && req.url === '/api/dashboard-stats') {
      const stats = this.getDashboardStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
      return;
    }

    // POST /api/thought - Inject a thought into the city
    if (req.method === 'POST' && req.url === '/api/thought') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.text) {
            // Broadcast thought to WebSocket clients
            this.broadcast({
              type: 'thought',
              text: data.text,
              timestamp: Date.now()
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, text: data.text }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing text field' }));
          }
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // GET /api - API documentation
    if (req.method === 'GET' && req.url === '/api') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: 'Absalom Knowledge Engine',
        version: '1.0.0',
        endpoints: {
          'GET /state': 'Current cognitive state',
          'POST /state': 'Update cognitive state',
          'GET /graph': 'Knowledge graph',
          'GET /health': 'Health check',
          'GET /city-state': 'City visualization state',
          'POST /city-state/regenerate': 'Regenerate city from knowledge',
          'POST /city-state/cognitive': 'Update cognitive state with context',
          'POST /planner/scan': 'Report building scan',
          'POST /planner/patrol-complete': 'Report patrol completion',
          'GET /planner/status': 'Planner optimization stats',
          'GET /api/dashboard-stats': 'Dashboard statistics',
          'POST /api/thought': 'Inject a thought into the city visualization',
        }
      }));
      return;
    }

    // Static file serving for visualization (fallback for all other routes)
    const STATIC_ROOT = path.join(__dirname, '../renderer');
    let filePath = req.url === '/' ? '/city/absalom-city.html' : req.url;
    
    // Security: prevent directory traversal
    filePath = filePath.replace(/\.\./g, '');
    const fullPath = path.join(STATIC_ROOT, filePath);
    
    // Check if file exists within STATIC_ROOT
    if (fullPath.startsWith(STATIC_ROOT) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(fullPath).pipe(res);
      return;
    }
    
    res.writeHead(404);
    res.end('Not found');
  }
  
  /**
   * Get stats for Command Center dashboard
   */
  getDashboardStats() {
    const fs = require('fs');
    const path = require('path');
    const workspace = process.env.WORKSPACE || path.join(process.env.HOME, '.openclaw/workspace');
    
    // Count buildings
    const buildingCount = this.cityState?.buildings?.length || 0;
    
    // Count memory files
    let memoryFileCount = 0;
    let memoryTotalSize = 0;
    const memoryDir = path.join(workspace, 'memory');
    try {
      if (fs.existsSync(memoryDir)) {
        const files = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));
        memoryFileCount = files.length;
        files.forEach(f => {
          try {
            memoryTotalSize += fs.statSync(path.join(memoryDir, f)).size;
          } catch (e) {}
        });
      }
      // Add MEMORY.md
      const mainMemory = path.join(workspace, 'MEMORY.md');
      if (fs.existsSync(mainMemory)) {
        memoryFileCount++;
        memoryTotalSize += fs.statSync(mainMemory).size;
      }
    } catch (e) {}
    
    return {
      ok: true,
      timestamp: Date.now(),
      city: {
        buildingCount,
        cognitiveState: this.cityState?.cognitiveState || 'idle',
        version: this.cityState?.version || 0,
        lastUpdate: this.cityState?.lastUpdate || 0,
      },
      memory: {
        fileCount: memoryFileCount,
        totalSizeKB: (memoryTotalSize / 1024).toFixed(1),
      },
      planner: this.plannerStats || { scans: 0, optimizations: 0 },
      uptime: process.uptime(),
      serverVersion: '1.0.0',
    };
  }
  
  /**
   * Analyze a building/entity for potential issues
   */
  analyzeBuildingHealth(buildingId, label, district) {
    // Simple heuristics for now - can be expanded
    const findings = [];
    
    // Check for potential staleness based on naming patterns
    if (label && label.toLowerCase().includes('2024')) {
      return { type: 'stale', buildingId, label, message: 'Contains old year reference' };
    }
    
    if (label && label.toLowerCase().includes('todo')) {
      return { type: 'actionable', buildingId, label, message: 'Unresolved TODO item' };
    }
    
    if (label && label.toLowerCase().includes('temp')) {
      return { type: 'cleanup', buildingId, label, message: 'Temporary item - consider removing' };
    }
    
    return null;
  }
  
  /**
   * Run actual memory optimization
   */
  async runMemoryOptimization() {
    const fs = require('fs');
    const path = require('path');
    const workspace = process.env.WORKSPACE || path.join(process.env.HOME, '.openclaw/workspace');
    
    let changes = 0;
    const actions = [];
    
    try {
      // 1. Check MEMORY.md size
      const memoryPath = path.join(workspace, 'MEMORY.md');
      if (fs.existsSync(memoryPath)) {
        const stats = fs.statSync(memoryPath);
        const sizeKB = stats.size / 1024;
        if (sizeKB > 4) {
          actions.push({ type: 'warning', message: `MEMORY.md is ${sizeKB.toFixed(1)}KB (target: <4KB)` });
        }
      }
      
      // 2. Check for old daily memory files (>30 days)
      const memoryDir = path.join(workspace, 'memory');
      if (fs.existsSync(memoryDir)) {
        const files = fs.readdirSync(memoryDir).filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/));
        const now = Date.now();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        
        for (const file of files) {
          const filePath = path.join(memoryDir, file);
          const stat = fs.statSync(filePath);
          if (now - stat.mtime.getTime() > thirtyDaysMs) {
            actions.push({ type: 'archive', file, message: `Old file: ${file} (>30 days)` });
            changes++;
          }
        }
      }
      
      // 3. Count entities in current graph
      if (this.cityState && this.cityState.buildings) {
        const buildingCount = this.cityState.buildings.length;
        actions.push({ type: 'info', message: `Tracking ${buildingCount} knowledge entities` });
      }
      
      console.log('[Planner] Optimization complete:', actions.length, 'actions');
      
    } catch (e) {
      console.error('[Planner] Optimization error:', e.message);
      actions.push({ type: 'error', message: e.message });
    }
    
    return { changes, actions };
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
