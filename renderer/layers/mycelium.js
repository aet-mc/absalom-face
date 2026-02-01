/**
 * Mycelium Layer - Depth visualization for Absalom Face v3.0
 * 
 * A force-directed graph of persistent knowledge, rendered as a
 * bioluminescent neural network on the ocean floor.
 * 
 * Visual style: Deep ocean floor aesthetic. Organic, not mechanical.
 */

// Node type colors - bioluminescent palette
const NODE_COLORS = {
  topics: '#2dd4a8',    // emerald
  people: '#fbbf24',    // gold
  tickers: '#60a5fa',   // blue
  tools: '#a78bfa',     // purple
  headers: '#94a3b8',   // gray
  decisions: '#f472b6', // pink
  default: '#2dd4a8'    // fallback emerald
};

// Edge colors
const EDGE_COLOR_DIM = 'rgba(26, 58, 48, 0.4)';     // #1a3a3066
const EDGE_COLOR_ACTIVE = 'rgba(45, 212, 168, 0.53)'; // #2dd4a888

/**
 * Represents a node in the mycelium network
 */
class MyceliumNode {
  constructor(data) {
    this.id = data.id;
    this.label = data.label || data.id;
    this.type = data.type || 'default';
    this.weight = data.weight || 1;
    this.firstSeen = data.firstSeen || Date.now();
    this.lastSeen = data.lastSeen || Date.now();
    
    // Physics state
    this.x = data.x || Math.random() * 800;
    this.y = data.y || Math.random() * 600;
    this.vx = 0;
    this.vy = 0;
    this.fx = null; // Fixed position (if pinned)
    this.fy = null;
    
    // Animation state
    this.activation = 0;        // 0-1, how activated this node is
    this.targetActivation = 0;  // For smooth transitions
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.baseRadius = this.calculateRadius();
  }
  
  calculateRadius() {
    // Size based on weight: 4px base, up to 20px for heavy nodes
    return 4 + Math.min(16, Math.log2(this.weight + 1) * 4);
  }
  
  getColor(alpha = 1) {
    const baseColor = NODE_COLORS[this.type] || NODE_COLORS.default;
    return this.hexToRgba(baseColor, alpha);
  }
  
  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  update(dt) {
    // Smooth activation transitions
    const activationSpeed = 4; // Higher = faster response
    this.activation += (this.targetActivation - this.activation) * Math.min(1, dt * activationSpeed);
    
    // Decay activation over time (2-3 seconds)
    if (this.targetActivation > 0) {
      this.targetActivation -= dt * 0.4; // ~2.5 second decay
      if (this.targetActivation < 0) this.targetActivation = 0;
    }
    
    // Pulse phase for idle animation
    this.pulsePhase += dt * 0.5;
  }
  
  render(ctx, time) {
    const pulse = 0.5 + 0.5 * Math.sin(this.pulsePhase);
    const idleGlow = 0.1 + pulse * 0.05; // Subtle idle pulse
    const glowIntensity = Math.max(idleGlow, this.activation);
    
    const baseColor = NODE_COLORS[this.type] || NODE_COLORS.default;
    const radius = this.baseRadius * (1 + this.activation * 0.3);
    
    ctx.save();
    ctx.translate(this.x, this.y);
    
    // Outer glow (larger, more diffuse)
    if (glowIntensity > 0.1) {
      const glowRadius = radius * (3 + this.activation * 2);
      const outerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
      outerGlow.addColorStop(0, this.hexToRgba(baseColor, glowIntensity * 0.5));
      outerGlow.addColorStop(0.4, this.hexToRgba(baseColor, glowIntensity * 0.2));
      outerGlow.addColorStop(1, 'transparent');
      
      ctx.beginPath();
      ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = outerGlow;
      ctx.fill();
    }
    
    // Inner glow (core)
    const innerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.5);
    innerGlow.addColorStop(0, this.hexToRgba(baseColor, 0.8 + glowIntensity * 0.2));
    innerGlow.addColorStop(0.5, this.hexToRgba(baseColor, 0.3 + glowIntensity * 0.3));
    innerGlow.addColorStop(1, 'transparent');
    
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = innerGlow;
    ctx.fill();
    
    // Core (solid center)
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = this.hexToRgba(baseColor, 0.9);
    ctx.fill();
    
    ctx.restore();
  }
}

/**
 * Represents an edge (connection) in the mycelium network
 */
class MyceliumEdge {
  constructor(data, sourceNode, targetNode) {
    this.id = data.id || `${data.source}↔${data.target}`;
    this.source = sourceNode;
    this.target = targetNode;
    this.weight = data.weight || 1;
    
    // Animation state
    this.activation = 0;
    this.targetActivation = 0;
    
    // Control point offset for bezier curve (organic feel)
    this.curvature = (Math.random() - 0.5) * 0.4;
  }
  
  update(dt) {
    // Smooth activation transitions
    this.activation += (this.targetActivation - this.activation) * Math.min(1, dt * 4);
    
    // Decay
    if (this.targetActivation > 0) {
      this.targetActivation -= dt * 0.4;
      if (this.targetActivation < 0) this.targetActivation = 0;
    }
  }
  
  render(ctx) {
    if (!this.source || !this.target) return;
    
    const sx = this.source.x;
    const sy = this.source.y;
    const tx = this.target.x;
    const ty = this.target.y;
    
    // Calculate control point for bezier curve
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    
    // Perpendicular offset for curve
    const nx = -dy / len * this.curvature * len;
    const ny = dx / len * this.curvature * len;
    const cx = mx + nx;
    const cy = my + ny;
    
    // Line thickness based on weight
    const baseWidth = 0.5 + Math.min(2.5, Math.log2(this.weight + 1) * 0.5);
    const width = baseWidth * (1 + this.activation * 0.5);
    
    // Interpolate color based on activation
    const dimR = 26, dimG = 58, dimB = 48, dimA = 0.25;
    const actR = 45, actG = 212, actB = 168, actA = 0.53;
    
    const r = Math.round(dimR + (actR - dimR) * this.activation);
    const g = Math.round(dimG + (actG - dimG) * this.activation);
    const b = Math.round(dimB + (actB - dimB) * this.activation);
    const a = dimA + (actA - dimA) * this.activation;
    
    // Create gradient along the edge (fade at endpoints)
    const gradient = ctx.createLinearGradient(sx, sy, tx, ty);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a * 0.3})`);
    gradient.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, ${a})`);
    gradient.addColorStop(0.8, `rgba(${r}, ${g}, ${b}, ${a})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${a * 0.3})`);
    
    ctx.save();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    
    // Draw bezier curve
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.stroke();
    
    // Add glow effect when active
    if (this.activation > 0.3) {
      ctx.strokeStyle = `rgba(${actR}, ${actG}, ${actB}, ${this.activation * 0.3})`;
      ctx.lineWidth = width * 3;
      ctx.filter = 'blur(4px)';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(cx, cy, tx, ty);
      ctx.stroke();
      ctx.filter = 'none';
    }
    
    ctx.restore();
  }
}

/**
 * Force-directed layout simulation
 */
class ForceSimulation {
  constructor(options = {}) {
    this.centerX = options.centerX || 400;
    this.centerY = options.centerY || 400;
    this.width = options.width || 800;
    this.height = options.height || 600;
    
    // Force strengths
    this.centerForce = options.centerForce || 0.01;
    this.repulsionForce = options.repulsionForce || 200;
    this.edgeForce = options.edgeForce || 0.02;
    this.edgeLength = options.edgeLength || 80;
    this.damping = options.damping || 0.9;
    
    // Depth positioning
    this.depthInfluence = options.depthInfluence || 0.3;
    
    this.nodes = [];
    this.edges = [];
    this.nodeMap = new Map();
  }
  
  setNodes(nodes) {
    this.nodes = nodes;
    this.nodeMap.clear();
    for (const node of nodes) {
      this.nodeMap.set(node.id, node);
    }
    this.initializePositions();
  }
  
  setEdges(edges) {
    this.edges = edges;
  }
  
  initializePositions() {
    // Deterministic initial positions based on node ID hash
    for (const node of this.nodes) {
      const hash = this.hashString(node.id);
      const angle = (hash % 1000) / 1000 * Math.PI * 2;
      const radius = 100 + (hash % 500);
      
      node.x = this.centerX + Math.cos(angle) * radius * 0.5;
      node.y = this.centerY + Math.sin(angle) * radius * 0.3;
      
      // Older nodes start deeper (higher Y for canvas coords)
      const age = Date.now() - node.firstSeen;
      const ageDepth = Math.min(1, age / (30 * 24 * 60 * 60 * 1000)); // Max depth at 30 days
      node.y += ageDepth * this.height * this.depthInfluence;
    }
  }
  
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  
  step(dt) {
    const alpha = Math.min(dt * 10, 1); // Simulation speed
    
    // Reset forces
    for (const node of this.nodes) {
      if (node.fx !== null) {
        node.x = node.fx;
        node.vx = 0;
      }
      if (node.fy !== null) {
        node.y = node.fy;
        node.vy = 0;
      }
    }
    
    // Apply center force (attraction to center)
    for (const node of this.nodes) {
      const dx = this.centerX - node.x;
      const dy = this.centerY - node.y;
      node.vx += dx * this.centerForce * alpha;
      node.vy += dy * this.centerForce * alpha;
    }
    
    // Apply repulsion force (nodes push each other away)
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i];
        const b = this.nodes[j];
        
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 1) dist = 1;
        if (dist > 300) continue; // Skip distant nodes for performance
        
        const force = this.repulsionForce / (dist * dist) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        
        if (a.fx === null) a.vx -= fx;
        if (a.fy === null) a.vy -= fy;
        if (b.fx === null) b.vx += fx;
        if (b.fy === null) b.vy += fy;
      }
    }
    
    // Apply edge spring force
    for (const edge of this.edges) {
      const source = edge.source;
      const target = edge.target;
      if (!source || !target) continue;
      
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 1) continue;
      
      // Spring force: pull together if too far, push apart if too close
      const idealDist = this.edgeLength / Math.sqrt(edge.weight);
      const displacement = dist - idealDist;
      const force = displacement * this.edgeForce * alpha;
      
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      
      if (source.fx === null) source.vx += fx;
      if (source.fy === null) source.vy += fy;
      if (target.fx === null) target.vx -= fx;
      if (target.fy === null) target.vy -= fy;
    }
    
    // Apply gravity toward depth based on age
    for (const node of this.nodes) {
      const age = Date.now() - node.firstSeen;
      const ageDepth = Math.min(1, age / (30 * 24 * 60 * 60 * 1000));
      const targetY = this.centerY + ageDepth * this.height * this.depthInfluence;
      const dy = targetY - node.y;
      node.vy += dy * 0.005 * alpha;
    }
    
    // Update positions with velocity and damping
    for (const node of this.nodes) {
      if (node.fx === null) {
        node.vx *= this.damping;
        node.x += node.vx;
        
        // Boundary constraints
        const margin = 50;
        if (node.x < margin) { node.x = margin; node.vx = 0; }
        if (node.x > this.width - margin) { node.x = this.width - margin; node.vx = 0; }
      }
      
      if (node.fy === null) {
        node.vy *= this.damping;
        node.y += node.vy;
        
        const margin = 50;
        if (node.y < margin) { node.y = margin; node.vy = 0; }
        if (node.y > this.height - margin) { node.y = this.height - margin; node.vy = 0; }
      }
    }
  }
}

/**
 * Main Mycelium Layer class
 */
class MyceliumLayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    this.nodes = [];
    this.edges = [];
    this.nodeMap = new Map();
    this.edgeMap = new Map();
    
    this.simulation = new ForceSimulation({
      width: canvas.width,
      height: canvas.height,
      centerX: canvas.width / 2,
      centerY: canvas.height / 2
    });
    
    this.waterLine = canvas.height * 0.3; // Default water line at 30% from top
    this.time = 0;
  }
  
  /**
   * Set the full graph data
   * @param {Object} graph - { nodes: [], edges: [] }
   */
  setGraph(graph) {
    // Clear existing
    this.nodes = [];
    this.edges = [];
    this.nodeMap.clear();
    this.edgeMap.clear();
    
    // Create nodes
    for (const nodeData of (graph.nodes || [])) {
      const node = new MyceliumNode(nodeData);
      this.nodes.push(node);
      this.nodeMap.set(node.id, node);
    }
    
    // Create edges
    for (const edgeData of (graph.edges || [])) {
      const source = this.nodeMap.get(edgeData.source);
      const target = this.nodeMap.get(edgeData.target);
      
      if (source && target) {
        const edge = new MyceliumEdge(edgeData, source, target);
        this.edges.push(edge);
        this.edgeMap.set(edge.id, edge);
      }
    }
    
    // Initialize simulation
    this.simulation.setNodes(this.nodes);
    this.simulation.setEdges(this.edges);
  }
  
  /**
   * Activate specific nodes with given intensity
   * @param {string[]} nodeIds - Array of node IDs to activate
   * @param {number} intensity - Activation intensity (0-1)
   */
  activate(nodeIds, intensity = 1) {
    for (const id of nodeIds) {
      const node = this.nodeMap.get(id);
      if (node) {
        node.targetActivation = Math.max(node.targetActivation, intensity);
        
        // Spread to neighbors with decay
        this.spreadActivation(node, intensity * 0.5, new Set([id]));
      }
    }
    
    // Activate edges between active nodes
    for (const edge of this.edges) {
      const sourceActive = edge.source.targetActivation > 0.3;
      const targetActive = edge.target.targetActivation > 0.3;
      if (sourceActive && targetActive) {
        edge.targetActivation = Math.max(
          edge.targetActivation,
          Math.min(edge.source.targetActivation, edge.target.targetActivation) * 0.8
        );
      }
    }
  }
  
  /**
   * Spread activation to neighboring nodes
   */
  spreadActivation(node, intensity, visited) {
    if (intensity < 0.1) return;
    
    for (const edge of this.edges) {
      let neighbor = null;
      if (edge.source.id === node.id) {
        neighbor = edge.target;
      } else if (edge.target.id === node.id) {
        neighbor = edge.source;
      }
      
      if (neighbor && !visited.has(neighbor.id)) {
        visited.add(neighbor.id);
        
        // Decay based on edge weight (stronger connections carry more activation)
        const decay = 0.4 + 0.3 * Math.min(1, edge.weight / 5);
        const spreadIntensity = intensity * decay;
        
        neighbor.targetActivation = Math.max(neighbor.targetActivation, spreadIntensity);
        edge.targetActivation = Math.max(edge.targetActivation, spreadIntensity);
        
        // Recursively spread (with depth limit via intensity decay)
        this.spreadActivation(neighbor, spreadIntensity * 0.5, visited);
      }
    }
  }
  
  /**
   * Activate a path of nodes (lights up the connections between them)
   * @param {string[]} path - Array of node IDs forming a path
   * @param {number} intensity - Activation intensity (0-1)
   */
  activatePath(path, intensity = 1) {
    for (let i = 0; i < path.length; i++) {
      const node = this.nodeMap.get(path[i]);
      if (node) {
        // Intensity varies along path (brighter in middle)
        const pathPos = i / (path.length - 1 || 1);
        const pathIntensity = intensity * (0.7 + 0.3 * Math.sin(pathPos * Math.PI));
        node.targetActivation = Math.max(node.targetActivation, pathIntensity);
      }
      
      // Activate edge to next node
      if (i < path.length - 1) {
        const edgeId1 = `${path[i]}↔${path[i + 1]}`;
        const edgeId2 = `${path[i + 1]}↔${path[i]}`;
        const edge = this.edgeMap.get(edgeId1) || this.edgeMap.get(edgeId2);
        if (edge) {
          edge.targetActivation = Math.max(edge.targetActivation, intensity);
        }
      }
    }
  }
  
  /**
   * Set the water line Y position (depth layer renders below this)
   * @param {number} y - Y coordinate of water line
   */
  setWaterLine(y) {
    this.waterLine = y;
    
    // Adjust simulation center
    this.simulation.centerY = y + (this.canvas.height - y) / 2;
  }
  
  /**
   * Update physics and animations
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    this.time += dt;
    
    // Run physics simulation
    this.simulation.step(dt);
    
    // Update node animations
    for (const node of this.nodes) {
      node.update(dt);
    }
    
    // Update edge animations
    for (const edge of this.edges) {
      edge.update(dt);
    }
  }
  
  /**
   * Render the mycelium layer
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  render(ctx) {
    ctx = ctx || this.ctx;
    
    ctx.save();
    
    // Clip to below water line
    ctx.beginPath();
    ctx.rect(0, this.waterLine, this.canvas.width, this.canvas.height - this.waterLine);
    ctx.clip();
    
    // Render edges first (behind nodes)
    for (const edge of this.edges) {
      edge.render(ctx);
    }
    
    // Render nodes
    for (const node of this.nodes) {
      node.render(ctx, this.time);
    }
    
    ctx.restore();
  }
  
  /**
   * Resize the canvas and update simulation bounds
   */
  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    
    this.simulation.width = width;
    this.simulation.height = height;
    this.simulation.centerX = width / 2;
    this.simulation.centerY = this.waterLine + (height - this.waterLine) / 2;
  }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MyceliumLayer, MyceliumNode, MyceliumEdge, ForceSimulation };
}
