/**
 * GraphClient - WebSocket client for knowledge graph protocol
 * Connects to the state server and receives graph updates
 */

class EventEmitter {
  constructor() {
    this._events = {};
  }

  on(event, listener) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(listener);
    return this;
  }

  off(event, listener) {
    if (!this._events[event]) return this;
    this._events[event] = this._events[event].filter(l => l !== listener);
    return this;
  }

  emit(event, ...args) {
    if (!this._events[event]) return false;
    this._events[event].forEach(listener => listener(...args));
    return true;
  }

  once(event, listener) {
    const onceWrapper = (...args) => {
      this.off(event, onceWrapper);
      listener(...args);
    };
    return this.on(event, onceWrapper);
  }
}

class GraphClient extends EventEmitter {
  /**
   * @param {string} wsUrl - WebSocket URL to connect to
   * @param {Object} options - Configuration options
   * @param {number} options.reconnectDelay - Delay between reconnection attempts (ms)
   * @param {number} options.maxReconnectDelay - Maximum reconnect delay (ms)
   * @param {boolean} options.autoConnect - Auto-connect on creation
   */
  constructor(wsUrl, options = {}) {
    super();
    
    this.wsUrl = wsUrl;
    this.options = {
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      autoConnect: true,
      ...options
    };
    
    // Connection state
    this.ws = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    
    // Graph state
    this.graph = { nodes: [], edges: [] };
    this.state = 'idle';
    this.tideLevel = 0.3;
    this.activations = new Map(); // nodeId -> { intensity, time }
    
    if (this.options.autoConnect && this.wsUrl) {
      this.connect();
    }
  }

  /**
   * Connect to the WebSocket server
   */
  connect() {
    if (!this.wsUrl) {
      console.warn('[GraphClient] No WebSocket URL configured');
      return;
    }
    
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }
    
    try {
      this.ws = new WebSocket(this.wsUrl);
      this._setupHandlers();
    } catch (error) {
      console.error('[GraphClient] WebSocket creation failed:', error);
      this._scheduleReconnect();
    }
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.connected = false;
  }

  /**
   * Set/update the WebSocket URL
   */
  setUrl(wsUrl) {
    const wasConnected = this.connected;
    this.disconnect();
    this.wsUrl = wsUrl;
    if (wasConnected || this.options.autoConnect) {
      this.connect();
    }
  }

  /**
   * Get the current graph state
   */
  getGraph() {
    return this.graph;
  }

  /**
   * Get node by ID
   */
  getNode(nodeId) {
    return this.graph.nodes.find(n => n.id === nodeId);
  }

  /**
   * Get edges connected to a node
   */
  getEdgesForNode(nodeId) {
    return this.graph.edges.filter(e => e.source === nodeId || e.target === nodeId);
  }

  /**
   * Get current activations with decay applied
   */
  getActivations() {
    const now = Date.now();
    const result = new Map();
    
    for (const [nodeId, activation] of this.activations) {
      const age = now - activation.time;
      const decayedIntensity = activation.intensity * Math.exp(-age / 2000); // 2s decay
      
      if (decayedIntensity > 0.05) {
        result.set(nodeId, { ...activation, currentIntensity: decayedIntensity });
      }
    }
    
    return result;
  }

  /**
   * Clean up old activations
   */
  pruneActivations() {
    const now = Date.now();
    for (const [nodeId, activation] of this.activations) {
      const age = now - activation.time;
      if (age > 5000) { // 5s maximum lifetime
        this.activations.delete(nodeId);
      }
    }
  }

  // === Private Methods ===

  _setupHandlers() {
    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      console.log('[GraphClient] Connected to', this.wsUrl);
      this.emit('connect');
    };

    this.ws.onclose = (event) => {
      const wasConnected = this.connected;
      this.connected = false;
      console.log('[GraphClient] Disconnected:', event.code, event.reason);
      
      if (wasConnected) {
        this.emit('disconnect', event);
      }
      
      // Auto-reconnect unless it was a clean close
      if (event.code !== 1000) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('[GraphClient] WebSocket error:', error);
      this.emit('error', error);
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this._handleMessage(message);
      } catch (error) {
        console.warn('[GraphClient] Failed to parse message:', error);
      }
    };
  }

  _handleMessage(msg) {
    switch (msg.type) {
      // === Graph updates ===
      case 'graph:full':
        this.graph = msg.graph || { nodes: [], edges: [] };
        this.emit('graph', this.graph);
        break;

      case 'graph:node:add':
        if (msg.node) {
          this.graph.nodes.push(msg.node);
          this.emit('node:add', msg.node);
          this.emit('graph', this.graph);
        }
        break;

      case 'graph:node:update':
        if (msg.id && msg.changes) {
          const node = this.graph.nodes.find(n => n.id === msg.id);
          if (node) {
            Object.assign(node, msg.changes);
            this.emit('node:update', node);
            this.emit('graph', this.graph);
          }
        }
        break;

      case 'graph:node:remove':
        if (msg.id) {
          const idx = this.graph.nodes.findIndex(n => n.id === msg.id);
          if (idx >= 0) {
            const removed = this.graph.nodes.splice(idx, 1)[0];
            this.emit('node:remove', removed);
            this.emit('graph', this.graph);
          }
        }
        break;

      case 'graph:edge:add':
        if (msg.edge) {
          this.graph.edges.push(msg.edge);
          this.emit('edge:add', msg.edge);
          this.emit('graph', this.graph);
        }
        break;

      case 'graph:edge:update':
        if (msg.id && msg.changes) {
          const edge = this.graph.edges.find(e => 
            `${e.source}↔${e.target}` === msg.id || `${e.target}↔${e.source}` === msg.id
          );
          if (edge) {
            Object.assign(edge, msg.changes);
            this.emit('edge:update', edge);
            this.emit('graph', this.graph);
          }
        }
        break;

      // === State changes ===
      case 'state':
        const oldState = this.state;
        this.state = msg.state || msg.mode || 'idle';
        if (oldState !== this.state) {
          this.emit('state', this.state, oldState);
        }
        break;

      // === Activations ===
      case 'activate':
        if (msg.nodeIds && Array.isArray(msg.nodeIds)) {
          const intensity = msg.intensity ?? 1;
          const now = Date.now();
          
          for (const nodeId of msg.nodeIds) {
            this.activations.set(nodeId, { intensity, time: now });
          }
          
          this.emit('activate', msg.nodeIds, intensity);
        }
        break;

      case 'activate:path':
        if (msg.path && Array.isArray(msg.path)) {
          const intensity = msg.intensity ?? 1;
          const now = Date.now();
          
          // Staggered activation along path
          msg.path.forEach((nodeId, idx) => {
            const delayedIntensity = intensity * (1 - idx * 0.1);
            this.activations.set(nodeId, { 
              intensity: delayedIntensity, 
              time: now + idx * 100 // Stagger by 100ms
            });
          });
          
          this.emit('activate:path', msg.path, intensity);
        }
        break;

      // === Context (surface layer) ===
      case 'context:add':
        this.emit('context:add', msg.concept, msg.creatureType);
        break;

      case 'context:clear':
        this.emit('context:clear');
        break;

      // === Tide level ===
      case 'tide:level':
        const oldTide = this.tideLevel;
        this.tideLevel = msg.level ?? 0.3;
        if (oldTide !== this.tideLevel) {
          this.emit('tide', this.tideLevel, oldTide);
        }
        break;

      // === Sub-agent visualization ===
      case 'agent:spawn':
        this.emit('agent:spawn', msg.agent);
        break;

      case 'agent:update':
        this.emit('agent:update', msg.sessionKey, msg.status);
        break;

      case 'agent:complete':
        this.emit('agent:complete', msg.sessionKey, msg.findings);
        break;

      default:
        // Unknown message type - pass through
        this.emit('message', msg);
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    
    this.reconnectAttempts++;
    const delay = Math.min(
      this.options.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      this.options.maxReconnectDelay
    );
    
    console.log(`[GraphClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

// Export for module and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GraphClient, EventEmitter };
}
