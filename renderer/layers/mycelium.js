/**
 * Mycelium Layer - Depth visualization for Absalom Face v3.0
 * 
 * A bioluminescent neural network on the ocean floor.
 * Transformed from functional prototype to BEAUTIFUL art piece.
 * 
 * Visual inspiration: Refik Anadol, physarum simulations, deep ocean bioluminescence
 * 
 * Features:
 * - Thousands of flowing particles
 * - Organic tendrils with multiple strands
 * - Atmospheric depth with fog and vignette
 * - Bloom and glow effects
 * - Perlin noise-based organic motion
 */

// ============================================================================
// NOISE FUNCTIONS (Simplex-like for organic motion)
// ============================================================================

class PerlinNoise {
  constructor(seed = Math.random() * 10000) {
    this.seed = seed;
    this.gradients = {};
    this.memory = {};
  }

  rand_vect(x, y) {
    const key = `${x},${y}`;
    if (this.gradients[key]) return this.gradients[key];
    
    const theta = Math.sin(x * 12.9898 + y * 78.233 + this.seed) * 43758.5453 % (2 * Math.PI);
    this.gradients[key] = { x: Math.cos(theta), y: Math.sin(theta) };
    return this.gradients[key];
  }

  dot_prod_grid(x, y, vx, vy) {
    const g_vect = this.rand_vect(vx, vy);
    return (x - vx) * g_vect.x + (y - vy) * g_vect.y;
  }

  smootherstep(x) {
    return 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3;
  }

  interp(x, a, b) {
    return a + this.smootherstep(x) * (b - a);
  }

  get(x, y) {
    const key = `${Math.floor(x * 100)},${Math.floor(y * 100)}`;
    if (this.memory[key] !== undefined) return this.memory[key];

    const xf = Math.floor(x);
    const yf = Math.floor(y);

    const tl = this.dot_prod_grid(x, y, xf, yf);
    const tr = this.dot_prod_grid(x, y, xf + 1, yf);
    const bl = this.dot_prod_grid(x, y, xf, yf + 1);
    const br = this.dot_prod_grid(x, y, xf + 1, yf + 1);

    const xt = this.interp(x - xf, tl, tr);
    const xb = this.interp(x - xf, bl, br);
    const v = this.interp(y - yf, xt, xb);

    this.memory[key] = v;
    return v;
  }

  get3d(x, y, z) {
    // Approximate 3D by combining 2D samples
    return (this.get(x + z * 0.7, y + z * 0.3) + this.get(x - z * 0.3, y + z * 0.7)) * 0.5;
  }
}

// Global noise instances for different purposes
const motionNoise = new PerlinNoise(42);
const waveNoise = new PerlinNoise(137);
const colorNoise = new PerlinNoise(256);

// ============================================================================
// COLOR PALETTE - Rich, deep bioluminescent colors
// ============================================================================

const PALETTE = {
  // Deep ocean background
  background: { r: 8, g: 18, b: 24 },
  backgroundDeep: { r: 4, g: 10, b: 14 },
  
  // Fog layers
  fogNear: { r: 12, g: 28, b: 35, a: 0.0 },
  fogFar: { r: 6, g: 16, b: 22, a: 0.7 },
  
  // Node type colors (bioluminescent)
  nodes: {
    topics: { r: 45, g: 212, b: 168, h: 163 },    // emerald/cyan
    people: { r: 251, g: 191, b: 36, h: 43 },      // warm gold
    tickers: { r: 96, g: 165, b: 250, h: 217 },    // electric blue
    tools: { r: 167, g: 139, b: 250, h: 262 },     // purple
    headers: { r: 148, g: 163, b: 184, h: 215 },   // silver
    decisions: { r: 244, g: 114, b: 182, h: 330 }, // pink
    default: { r: 45, g: 212, b: 168, h: 163 }     // emerald
  },
  
  // Edge colors
  edgeDim: { r: 30, g: 60, b: 55, a: 0.15 },
  edgeActive: { r: 45, g: 212, b: 168, a: 0.6 },
  
  // Particle colors
  particleBase: { r: 120, g: 220, b: 200 },
  particleWarm: { r: 255, g: 200, b: 150 }
};

// ============================================================================
// PARTICLE SYSTEM - Thousands of flowing particles
// ============================================================================

class Particle {
  constructor(x, y, options = {}) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    
    // Particle properties
    this.size = options.size || 0.5 + Math.random() * 2;
    this.brightness = options.brightness || 0.3 + Math.random() * 0.7;
    this.speed = options.speed || 0.3 + Math.random() * 0.7;
    this.life = 1.0;
    this.maxLife = options.maxLife || 8 + Math.random() * 12; // seconds
    this.age = 0;
    
    // Visual properties
    this.hue = options.hue || 163 + (Math.random() - 0.5) * 40;
    this.saturation = 70 + Math.random() * 30;
    this.trail = [];
    this.maxTrail = Math.floor(3 + Math.random() * 8);
    
    // Movement mode
    this.mode = options.mode || 'ambient'; // 'ambient', 'flow', 'attracted'
    this.targetNode = null;
    this.edgeProgress = 0;
    this.sourceEdge = null;
    
    // Phase offset for unique motion
    this.phase = Math.random() * Math.PI * 2;
    this.noiseOffsetX = Math.random() * 1000;
    this.noiseOffsetY = Math.random() * 1000;
  }
  
  update(dt, time, nodes, edges, bounds) {
    this.age += dt;
    
    // Update life
    const lifeRatio = this.age / this.maxLife;
    this.life = lifeRatio < 0.1 ? lifeRatio * 10 :
                lifeRatio > 0.8 ? (1 - lifeRatio) * 5 : 1;
    
    // Store trail
    if (this.trail.length >= this.maxTrail) {
      this.trail.shift();
    }
    this.trail.push({ x: this.x, y: this.y, life: this.life });
    
    // Movement based on mode
    if (this.mode === 'flow' && this.sourceEdge) {
      this.updateFlowMode(dt, time);
    } else if (this.mode === 'attracted' && this.targetNode) {
      this.updateAttractedMode(dt, time);
    } else {
      this.updateAmbientMode(dt, time, bounds);
    }
    
    // Apply velocity
    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;
    
    // Wrap or respawn
    if (this.x < bounds.left - 50) this.x = bounds.right + 50;
    if (this.x > bounds.right + 50) this.x = bounds.left - 50;
    if (this.y < bounds.top - 50) this.y = bounds.bottom + 50;
    if (this.y > bounds.bottom + 50) this.y = bounds.top - 50;
    
    return this.age < this.maxLife;
  }
  
  updateAmbientMode(dt, time, bounds) {
    // Organic drift using noise
    const noiseScale = 0.002;
    const noiseX = motionNoise.get3d(
      this.x * noiseScale + this.noiseOffsetX,
      this.y * noiseScale + this.noiseOffsetY,
      time * 0.05
    );
    const noiseY = motionNoise.get3d(
      this.x * noiseScale + this.noiseOffsetX + 100,
      this.y * noiseScale + this.noiseOffsetY + 100,
      time * 0.05
    );
    
    // Base drift + noise + gentle upward tendency
    const driftX = Math.sin(time * 0.1 + this.phase) * 0.1;
    const driftY = -0.05 + Math.cos(time * 0.08 + this.phase * 1.3) * 0.05;
    
    this.vx = (noiseX * 0.8 + driftX) * this.speed;
    this.vy = (noiseY * 0.6 + driftY) * this.speed;
  }
  
  updateFlowMode(dt, time) {
    if (!this.sourceEdge) return;
    
    const edge = this.sourceEdge;
    this.edgeProgress += dt * 0.3 * this.speed;
    
    if (this.edgeProgress >= 1) {
      this.mode = 'ambient';
      this.sourceEdge = null;
      return;
    }
    
    // Position along edge with organic wobble
    const t = this.edgeProgress;
    const wobble = Math.sin(t * Math.PI * 4 + this.phase) * 10;
    
    // Get edge positions
    const sx = edge.source.x;
    const sy = edge.source.y;
    const tx = edge.target.x;
    const ty = edge.target.y;
    
    // Bezier point
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len;
    const ny = dx / len;
    
    // Quadratic bezier
    const cx = (sx + tx) / 2 + nx * edge.curvature * len;
    const cy = (sy + ty) / 2 + ny * edge.curvature * len;
    
    const t1 = 1 - t;
    const targetX = t1 * t1 * sx + 2 * t1 * t * cx + t * t * tx;
    const targetY = t1 * t1 * sy + 2 * t1 * t * cy + t * t * ty;
    
    // Add perpendicular wobble
    this.x = targetX + nx * wobble;
    this.y = targetY + ny * wobble;
    
    this.vx = (targetX - this.x) * 0.1;
    this.vy = (targetY - this.y) * 0.1;
  }
  
  updateAttractedMode(dt, time) {
    if (!this.targetNode) return;
    
    const dx = this.targetNode.x - this.x;
    const dy = this.targetNode.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 20) {
      this.mode = 'ambient';
      this.targetNode = null;
      return;
    }
    
    // Spiral attraction
    const angle = Math.atan2(dy, dx) + Math.sin(time * 2 + this.phase) * 0.3;
    const attractForce = Math.min(1, 50 / dist) * this.speed;
    
    this.vx += Math.cos(angle) * attractForce * 0.5;
    this.vy += Math.sin(angle) * attractForce * 0.5;
    
    // Damping
    this.vx *= 0.98;
    this.vy *= 0.98;
  }
  
  render(ctx, time) {
    if (this.life <= 0) return;
    
    const alpha = this.life * this.brightness * 0.8;
    
    // Draw trail
    if (this.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      
      for (let i = 1; i < this.trail.length; i++) {
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }
      ctx.lineTo(this.x, this.y);
      
      const gradient = ctx.createLinearGradient(
        this.trail[0].x, this.trail[0].y,
        this.x, this.y
      );
      gradient.addColorStop(0, `hsla(${this.hue}, ${this.saturation}%, 70%, 0)`);
      gradient.addColorStop(1, `hsla(${this.hue}, ${this.saturation}%, 70%, ${alpha * 0.5})`);
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = this.size * 0.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    
    // Draw particle core
    const glowSize = this.size * (2 + Math.sin(time * 3 + this.phase) * 0.5);
    
    const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowSize);
    glow.addColorStop(0, `hsla(${this.hue}, ${this.saturation}%, 85%, ${alpha})`);
    glow.addColorStop(0.3, `hsla(${this.hue}, ${this.saturation}%, 70%, ${alpha * 0.6})`);
    glow.addColorStop(1, `hsla(${this.hue}, ${this.saturation}%, 50%, 0)`);
    
    ctx.beginPath();
    ctx.arc(this.x, this.y, glowSize, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
  }
}

class ParticleSystem {
  constructor(maxParticles = 2000) {
    this.particles = [];
    this.maxParticles = maxParticles;
    this.spawnRate = 30; // particles per second
    this.spawnAccumulator = 0;
  }
  
  update(dt, time, nodes, edges, bounds) {
    // Spawn new particles
    this.spawnAccumulator += dt * this.spawnRate;
    
    while (this.spawnAccumulator >= 1 && this.particles.length < this.maxParticles) {
      this.spawnAccumulator -= 1;
      this.spawnParticle(bounds, nodes, edges, time);
    }
    
    // Update particles
    this.particles = this.particles.filter(p => p.update(dt, time, nodes, edges, bounds));
  }
  
  spawnParticle(bounds, nodes, edges, time) {
    // Random spawn location
    let x = bounds.left + Math.random() * (bounds.right - bounds.left);
    let y = bounds.top + Math.random() * (bounds.bottom - bounds.top);
    
    const mode = Math.random();
    let options = {};
    
    // 20% chance to spawn on an active edge
    if (mode < 0.2 && edges.length > 0) {
      const activeEdges = edges.filter(e => e.activation > 0.3);
      if (activeEdges.length > 0) {
        const edge = activeEdges[Math.floor(Math.random() * activeEdges.length)];
        x = edge.source.x;
        y = edge.source.y;
        
        const particle = new Particle(x, y, {
          mode: 'flow',
          hue: 163 + edge.activation * 40,
          brightness: 0.5 + edge.activation * 0.5,
          speed: 0.5 + edge.activation * 0.5
        });
        particle.sourceEdge = edge;
        particle.edgeProgress = 0;
        this.particles.push(particle);
        return;
      }
    }
    
    // 10% chance to be attracted to an active node
    if (mode < 0.3 && nodes.length > 0) {
      const activeNodes = nodes.filter(n => n.activation > 0.3);
      if (activeNodes.length > 0) {
        const node = activeNodes[Math.floor(Math.random() * activeNodes.length)];
        const angle = Math.random() * Math.PI * 2;
        const dist = 100 + Math.random() * 200;
        x = node.x + Math.cos(angle) * dist;
        y = node.y + Math.sin(angle) * dist;
        
        const particle = new Particle(x, y, {
          mode: 'attracted',
          hue: PALETTE.nodes[node.type]?.h || 163,
          brightness: 0.6,
          speed: 0.8
        });
        particle.targetNode = node;
        this.particles.push(particle);
        return;
      }
    }
    
    // Default ambient particle
    // Vary hue based on depth (cooler at bottom, warmer near top)
    const depthRatio = (y - bounds.top) / (bounds.bottom - bounds.top);
    const hue = 163 + depthRatio * 30 + (Math.random() - 0.5) * 20;
    
    this.particles.push(new Particle(x, y, {
      mode: 'ambient',
      hue,
      size: 0.5 + Math.random() * 1.5,
      brightness: 0.2 + Math.random() * 0.4
    }));
  }
  
  spawnBurst(x, y, count, options = {}) {
    for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 10 + Math.random() * 30;
      
      const particle = new Particle(
        x + Math.cos(angle) * dist,
        y + Math.sin(angle) * dist,
        {
          ...options,
          speed: 0.8 + Math.random() * 0.4
        }
      );
      particle.vx = Math.cos(angle) * 2;
      particle.vy = Math.sin(angle) * 2;
      this.particles.push(particle);
    }
  }
  
  render(ctx, time) {
    // Use lighter composite for glow effect
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    for (const particle of this.particles) {
      particle.render(ctx, time);
    }
    
    ctx.restore();
  }
}

// ============================================================================
// ORGANIC EDGE - Multi-strand tendrils with energy pulses
// ============================================================================

class OrganicEdge {
  constructor(data, sourceNode, targetNode) {
    this.id = data.id || `${data.source}↔${data.target}`;
    this.source = sourceNode;
    this.target = targetNode;
    this.weight = data.weight || 1;
    
    // Animation state
    this.activation = 0;
    this.targetActivation = 0;
    
    // Organic properties - multiple strands
    this.strandCount = 2 + Math.floor(Math.random() * 3);
    this.strands = [];
    for (let i = 0; i < this.strandCount; i++) {
      this.strands.push({
        offset: (Math.random() - 0.5) * 0.4,
        thickness: 0.3 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
        waveFreq: 2 + Math.random() * 3,
        waveAmp: 5 + Math.random() * 10
      });
    }
    
    // Curvature for bezier
    this.curvature = (Math.random() - 0.5) * 0.3;
    
    // Energy pulses traveling along edge
    this.pulses = [];
    this.lastPulseTime = 0;
  }
  
  update(dt, time) {
    // Smooth activation transitions
    const speed = this.activation > this.targetActivation ? 2 : 4;
    this.activation += (this.targetActivation - this.activation) * Math.min(1, dt * speed);
    
    // Decay activation
    if (this.targetActivation > 0) {
      this.targetActivation -= dt * 0.3;
      if (this.targetActivation < 0) this.targetActivation = 0;
    }
    
    // Spawn energy pulses when active
    if (this.activation > 0.4 && time - this.lastPulseTime > 0.5) {
      this.pulses.push({
        progress: 0,
        speed: 0.3 + Math.random() * 0.4,
        size: 3 + this.activation * 5,
        brightness: this.activation
      });
      this.lastPulseTime = time;
    }
    
    // Update pulses
    this.pulses = this.pulses.filter(pulse => {
      pulse.progress += dt * pulse.speed;
      pulse.brightness *= 0.995;
      return pulse.progress < 1 && pulse.brightness > 0.05;
    });
  }
  
  getPointOnCurve(t, wobbleTime = 0) {
    if (!this.source || !this.target) return { x: 0, y: 0, nx: 0, ny: 1 };
    
    const sx = this.source.x;
    const sy = this.source.y;
    const tx = this.target.x;
    const ty = this.target.y;
    
    // Control point
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    
    if (len < 1) return { x: sx, y: sy, nx: 0, ny: 1 };
    
    // Perpendicular for curve
    const px = -dy / len;
    const py = dx / len;
    
    // Add organic undulation
    const wave = Math.sin(t * Math.PI * 3 + wobbleTime * 0.5) * 15 * (1 - Math.abs(t - 0.5) * 2);
    
    const cx = mx + px * (this.curvature * len + wave);
    const cy = my + py * (this.curvature * len + wave);
    
    // Quadratic bezier
    const t1 = 1 - t;
    const x = t1 * t1 * sx + 2 * t1 * t * cx + t * t * tx;
    const y = t1 * t1 * sy + 2 * t1 * t * cy + t * t * ty;
    
    // Tangent for normal calculation
    const tangentX = 2 * t1 * (cx - sx) + 2 * t * (tx - cx);
    const tangentY = 2 * t1 * (cy - sy) + 2 * t * (ty - cy);
    const tangentLen = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
    
    return {
      x,
      y,
      nx: -tangentY / tangentLen,
      ny: tangentX / tangentLen
    };
  }
  
  render(ctx, time) {
    if (!this.source || !this.target) return;
    
    const len = Math.sqrt(
      (this.target.x - this.source.x) ** 2 + 
      (this.target.y - this.source.y) ** 2
    );
    if (len < 1) return;
    
    // Base thickness
    const baseWidth = 0.5 + Math.min(2, Math.log2(this.weight + 1) * 0.5);
    
    // Render each strand
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    for (const strand of this.strands) {
      this.renderStrand(ctx, time, strand, baseWidth, len);
    }
    
    // Render energy pulses
    for (const pulse of this.pulses) {
      this.renderPulse(ctx, time, pulse);
    }
    
    ctx.restore();
  }
  
  renderStrand(ctx, time, strand, baseWidth, edgeLength) {
    const segments = Math.max(20, Math.floor(edgeLength / 10));
    const points = [];
    
    // Generate points along strand
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = this.getPointOnCurve(t, time);
      
      // Add strand-specific offset and wave
      const strandWave = Math.sin(t * strand.waveFreq * Math.PI + time * 0.8 + strand.phase) * strand.waveAmp;
      const offset = strand.offset * 30 + strandWave;
      
      points.push({
        x: point.x + point.nx * offset,
        y: point.y + point.ny * offset,
        t
      });
    }
    
    // Draw the strand with variable thickness
    const width = baseWidth * strand.thickness * (1 + this.activation * 0.5);
    
    // Color interpolation
    const dimAlpha = 0.08 + this.activation * 0.02;
    const activeAlpha = 0.15 + this.activation * 0.45;
    const alpha = dimAlpha + (activeAlpha - dimAlpha) * this.activation;
    
    const r = Math.round(30 + (45 - 30) * this.activation);
    const g = Math.round(60 + (212 - 60) * this.activation);
    const b = Math.round(55 + (168 - 55) * this.activation);
    
    // Draw main line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    
    for (let i = 1; i < points.length - 2; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    
    ctx.quadraticCurveTo(
      points[points.length - 2].x, points[points.length - 2].y,
      points[points.length - 1].x, points[points.length - 1].y
    );
    
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.lineWidth = width;
    ctx.stroke();
    
    // Glow layer when active
    if (this.activation > 0.2) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = `blur(${3 + this.activation * 5}px)`;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${this.activation * 0.3})`;
      ctx.lineWidth = width * 2;
      ctx.stroke();
      ctx.restore();
    }
  }
  
  renderPulse(ctx, time, pulse) {
    const point = this.getPointOnCurve(pulse.progress, time);
    
    const r = 45, g = 220, b = 180;
    const size = pulse.size;
    
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, size * 2);
    glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${pulse.brightness})`);
    glow.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${pulse.brightness * 0.5})`);
    glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    
    ctx.beginPath();
    ctx.arc(point.x, point.y, size * 2, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    
    ctx.restore();
  }
}

// ============================================================================
// ORGANIC NODE - Breathing, pulsing with bloom
// ============================================================================

class OrganicNode {
  constructor(data) {
    this.id = data.id;
    this.label = data.label || data.id;
    this.type = data.type || 'default';
    this.weight = data.weight || 1;
    this.firstSeen = data.firstSeen || Date.now();
    this.lastSeen = data.lastSeen || Date.now();
    
    // Physics
    this.x = data.x || Math.random() * 800;
    this.y = data.y || Math.random() * 600;
    this.vx = 0;
    this.vy = 0;
    this.fx = null;
    this.fy = null;
    
    // Animation
    this.activation = 0;
    this.targetActivation = 0;
    this.baseRadius = this.calculateRadius();
    
    // Organic breathing - multiple overlapping rhythms
    this.breathPhases = [
      { phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.2, amp: 0.15 },
      { phase: Math.random() * Math.PI * 2, speed: 0.7 + Math.random() * 0.3, amp: 0.08 },
      { phase: Math.random() * Math.PI * 2, speed: 1.5 + Math.random() * 0.5, amp: 0.03 }
    ];
    
    // Sway motion
    this.swayPhase = Math.random() * Math.PI * 2;
    this.swaySpeed = 0.1 + Math.random() * 0.1;
    this.swayAmount = 2 + Math.random() * 3;
    
    // Color properties
    this.colorShift = Math.random() * Math.PI * 2;
  }
  
  calculateRadius() {
    return 4 + Math.min(16, Math.log2(this.weight + 1) * 4);
  }
  
  getColor() {
    return PALETTE.nodes[this.type] || PALETTE.nodes.default;
  }
  
  update(dt, time) {
    // Smooth activation with asymmetric speed (quick on, slow off)
    const speed = this.activation < this.targetActivation ? 6 : 2;
    this.activation += (this.targetActivation - this.activation) * Math.min(1, dt * speed);
    
    // Decay activation
    if (this.targetActivation > 0) {
      this.targetActivation -= dt * 0.25;
      if (this.targetActivation < 0) this.targetActivation = 0;
    }
    
    // Update breath phases
    for (const breath of this.breathPhases) {
      breath.phase += dt * breath.speed;
    }
    
    // Update sway
    this.swayPhase += dt * this.swaySpeed;
  }
  
  render(ctx, time) {
    const color = this.getColor();
    
    // Calculate organic breathing
    let breathScale = 1;
    for (const breath of this.breathPhases) {
      breathScale += Math.sin(breath.phase) * breath.amp;
    }
    
    // Calculate sway
    const swayX = Math.sin(this.swayPhase) * this.swayAmount;
    const swayY = Math.cos(this.swayPhase * 0.7) * this.swayAmount * 0.5;
    
    const x = this.x + swayX;
    const y = this.y + swayY;
    
    // Subtle color shift over time
    const hueShift = Math.sin(time * 0.05 + this.colorShift) * 10;
    const hue = (color.h + hueShift + 360) % 360;
    
    // Calculate glow intensity
    const baseGlow = 0.15 + breathScale * 0.05;
    const glowIntensity = baseGlow + this.activation * 0.85;
    
    // Calculate radius
    const radius = this.baseRadius * breathScale * (1 + this.activation * 0.4);
    
    ctx.save();
    ctx.translate(x, y);
    
    // ===== BLOOM LAYER (furthest out) =====
    if (this.activation > 0.1) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      
      const bloomRadius = radius * (6 + this.activation * 8);
      const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, bloomRadius);
      bloom.addColorStop(0, `hsla(${hue}, 80%, 60%, ${this.activation * 0.4})`);
      bloom.addColorStop(0.3, `hsla(${hue}, 70%, 50%, ${this.activation * 0.2})`);
      bloom.addColorStop(0.6, `hsla(${hue}, 60%, 40%, ${this.activation * 0.05})`);
      bloom.addColorStop(1, 'transparent');
      
      ctx.beginPath();
      ctx.arc(0, 0, bloomRadius, 0, Math.PI * 2);
      ctx.fillStyle = bloom;
      ctx.fill();
      
      ctx.restore();
    }
    
    // ===== OUTER GLOW =====
    const outerRadius = radius * (3 + this.activation * 2);
    const outerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, outerRadius);
    outerGlow.addColorStop(0, `hsla(${hue}, 75%, 65%, ${glowIntensity * 0.6})`);
    outerGlow.addColorStop(0.3, `hsla(${hue}, 70%, 55%, ${glowIntensity * 0.3})`);
    outerGlow.addColorStop(0.6, `hsla(${hue}, 65%, 45%, ${glowIntensity * 0.1})`);
    outerGlow.addColorStop(1, 'transparent');
    
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
    ctx.fillStyle = outerGlow;
    ctx.fill();
    
    // ===== INNER GLOW =====
    const innerRadius = radius * 1.8;
    const innerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, innerRadius);
    innerGlow.addColorStop(0, `hsla(${hue}, 80%, 75%, ${0.8 + glowIntensity * 0.2})`);
    innerGlow.addColorStop(0.4, `hsla(${hue}, 75%, 60%, ${0.4 + glowIntensity * 0.3})`);
    innerGlow.addColorStop(1, 'transparent');
    
    ctx.beginPath();
    ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = innerGlow;
    ctx.fill();
    
    // ===== CORE =====
    const coreRadius = radius * 0.6;
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRadius);
    core.addColorStop(0, `hsla(${hue}, 50%, 95%, 0.95)`);
    core.addColorStop(0.5, `hsla(${hue}, 70%, 75%, 0.9)`);
    core.addColorStop(1, `hsla(${hue}, 80%, 60%, 0.7)`);
    
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.fill();
    
    ctx.restore();
  }
}

// ============================================================================
// FORCE SIMULATION (enhanced with organic settling)
// ============================================================================

class ForceSimulation {
  constructor(options = {}) {
    this.centerX = options.centerX || 400;
    this.centerY = options.centerY || 400;
    this.width = options.width || 800;
    this.height = options.height || 600;
    
    this.centerForce = options.centerForce || 0.008;
    this.repulsionForce = options.repulsionForce || 250;
    this.edgeForce = options.edgeForce || 0.015;
    this.edgeLength = options.edgeLength || 100;
    this.damping = options.damping || 0.92;
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
    for (const node of this.nodes) {
      const hash = this.hashString(node.id);
      const angle = (hash % 1000) / 1000 * Math.PI * 2;
      const radius = 100 + (hash % 400);
      
      node.x = this.centerX + Math.cos(angle) * radius * 0.6;
      node.y = this.centerY + Math.sin(angle) * radius * 0.4;
      
      const age = Date.now() - node.firstSeen;
      const ageDepth = Math.min(1, age / (30 * 24 * 60 * 60 * 1000));
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
  
  step(dt, time) {
    const alpha = Math.min(dt * 8, 1);
    
    // Add organic global motion
    const globalSwayX = Math.sin(time * 0.03) * 0.5;
    const globalSwayY = Math.cos(time * 0.025) * 0.3;
    
    // Reset fixed nodes
    for (const node of this.nodes) {
      if (node.fx !== null) { node.x = node.fx; node.vx = 0; }
      if (node.fy !== null) { node.y = node.fy; node.vy = 0; }
    }
    
    // Center force with organic offset
    for (const node of this.nodes) {
      const dx = this.centerX + globalSwayX * 20 - node.x;
      const dy = this.centerY + globalSwayY * 20 - node.y;
      node.vx += dx * this.centerForce * alpha;
      node.vy += dy * this.centerForce * alpha;
    }
    
    // Repulsion
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i];
        const b = this.nodes[j];
        
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 1) dist = 1;
        if (dist > 350) continue;
        
        const force = this.repulsionForce / (dist * dist) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        
        if (a.fx === null) a.vx -= fx;
        if (a.fy === null) a.vy -= fy;
        if (b.fx === null) b.vx += fx;
        if (b.fy === null) b.vy += fy;
      }
    }
    
    // Edge springs
    for (const edge of this.edges) {
      const source = edge.source;
      const target = edge.target;
      if (!source || !target) continue;
      
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      
      const idealDist = this.edgeLength / Math.sqrt(edge.weight * 0.5 + 0.5);
      const displacement = dist - idealDist;
      const force = displacement * this.edgeForce * alpha;
      
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      
      if (source.fx === null) source.vx += fx;
      if (source.fy === null) source.vy += fy;
      if (target.fx === null) target.vx -= fx;
      if (target.fy === null) target.vy -= fy;
    }
    
    // Depth gravity
    for (const node of this.nodes) {
      const age = Date.now() - node.firstSeen;
      const ageDepth = Math.min(1, age / (30 * 24 * 60 * 60 * 1000));
      const targetY = this.centerY + ageDepth * this.height * this.depthInfluence;
      node.vy += (targetY - node.y) * 0.003 * alpha;
    }
    
    // Update positions
    for (const node of this.nodes) {
      if (node.fx === null) {
        node.vx *= this.damping;
        node.x += node.vx;
        
        const margin = 60;
        if (node.x < margin) { node.x = margin; node.vx *= -0.3; }
        if (node.x > this.width - margin) { node.x = this.width - margin; node.vx *= -0.3; }
      }
      
      if (node.fy === null) {
        node.vy *= this.damping;
        node.y += node.vy;
        
        const margin = 60;
        if (node.y < margin) { node.y = margin; node.vy *= -0.3; }
        if (node.y > this.height - margin) { node.y = this.height - margin; node.vy *= -0.3; }
      }
    }
  }
}

// ============================================================================
// ATMOSPHERIC EFFECTS
// ============================================================================

class AtmosphericEffects {
  constructor(canvas) {
    this.canvas = canvas;
    this.causticPhase = 0;
    
    // Pre-generate caustic pattern points
    this.causticPoints = [];
    for (let i = 0; i < 30; i++) {
      this.causticPoints.push({
        x: Math.random(),
        y: Math.random(),
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.5,
        size: 50 + Math.random() * 150
      });
    }
  }
  
  renderBackground(ctx, waterLine) {
    // Deep gradient from top of water to bottom
    const gradient = ctx.createLinearGradient(0, waterLine, 0, this.canvas.height);
    gradient.addColorStop(0, 'rgb(12, 28, 35)');
    gradient.addColorStop(0.3, 'rgb(8, 20, 26)');
    gradient.addColorStop(0.7, 'rgb(5, 14, 18)');
    gradient.addColorStop(1, 'rgb(3, 8, 12)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, waterLine, this.canvas.width, this.canvas.height - waterLine);
  }
  
  renderCaustics(ctx, time, waterLine) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    for (const point of this.causticPoints) {
      const x = point.x * this.canvas.width;
      const baseY = waterLine + point.y * (this.canvas.height - waterLine) * 0.5;
      const y = baseY + Math.sin(time * point.speed + point.phase) * 20;
      
      // Caustic intensity fades with depth
      const depthRatio = (y - waterLine) / (this.canvas.height - waterLine);
      const intensity = 0.03 * (1 - depthRatio * 0.8);
      
      const size = point.size * (1 + Math.sin(time * point.speed * 1.5 + point.phase) * 0.2);
      
      const caustic = ctx.createRadialGradient(x, y, 0, x, y, size);
      caustic.addColorStop(0, `rgba(100, 200, 180, ${intensity})`);
      caustic.addColorStop(0.4, `rgba(80, 180, 160, ${intensity * 0.5})`);
      caustic.addColorStop(1, 'transparent');
      
      ctx.fillStyle = caustic;
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
    }
    
    ctx.restore();
  }
  
  renderFog(ctx, waterLine) {
    // Depth fog - increases opacity deeper
    const fogGradient = ctx.createLinearGradient(0, waterLine, 0, this.canvas.height);
    fogGradient.addColorStop(0, 'rgba(8, 20, 26, 0)');
    fogGradient.addColorStop(0.5, 'rgba(6, 16, 22, 0.2)');
    fogGradient.addColorStop(0.8, 'rgba(4, 12, 16, 0.4)');
    fogGradient.addColorStop(1, 'rgba(3, 10, 14, 0.6)');
    
    ctx.fillStyle = fogGradient;
    ctx.fillRect(0, waterLine, this.canvas.width, this.canvas.height - waterLine);
  }
  
  renderVignette(ctx) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const radius = Math.max(this.canvas.width, this.canvas.height) * 0.8;
    
    const vignette = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(0.7, 'rgba(0, 0, 0, 0.1)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
  
  renderNoiseGrain(ctx, time) {
    // Subtle animated noise (every few frames for performance)
    if (Math.floor(time * 20) % 3 !== 0) return;
    
    ctx.save();
    ctx.globalAlpha = 0.015;
    ctx.globalCompositeOperation = 'overlay';
    
    const imageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;
    
    // Apply subtle noise (sample every 4th pixel for performance)
    for (let i = 0; i < data.length; i += 16) {
      const noise = (Math.random() - 0.5) * 30;
      data[i] += noise;
      data[i + 1] += noise;
      data[i + 2] += noise;
    }
    
    ctx.putImageData(imageData, 0, 0);
    ctx.restore();
  }
}

// ============================================================================
// MAIN MYCELIUM LAYER CLASS
// ============================================================================

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
    
    this.particles = new ParticleSystem(2000);
    this.atmosphere = new AtmosphericEffects(canvas);
    
    this.waterLine = canvas.height * 0.3;
    this.time = 0;
    
    // Performance tracking
    this.lastFrameTime = 0;
    this.frameCount = 0;
  }
  
  /**
   * Set the full graph data
   */
  setGraph(graph) {
    this.nodes = [];
    this.edges = [];
    this.nodeMap.clear();
    this.edgeMap.clear();
    
    for (const nodeData of (graph.nodes || [])) {
      const node = new OrganicNode(nodeData);
      this.nodes.push(node);
      this.nodeMap.set(node.id, node);
    }
    
    for (const edgeData of (graph.edges || [])) {
      const source = this.nodeMap.get(edgeData.source);
      const target = this.nodeMap.get(edgeData.target);
      
      if (source && target) {
        const edge = new OrganicEdge(edgeData, source, target);
        this.edges.push(edge);
        this.edgeMap.set(edge.id, edge);
      }
    }
    
    this.simulation.setNodes(this.nodes);
    this.simulation.setEdges(this.edges);
  }
  
  /**
   * Activate specific nodes
   */
  activate(nodeIds, intensity = 1) {
    for (const id of nodeIds) {
      const node = this.nodeMap.get(id);
      if (node) {
        node.targetActivation = Math.max(node.targetActivation, intensity);
        
        // Spawn particle burst
        this.particles.spawnBurst(node.x, node.y, 8 + Math.floor(intensity * 12), {
          hue: PALETTE.nodes[node.type]?.h || 163,
          brightness: 0.7 + intensity * 0.3
        });
        
        this.spreadActivation(node, intensity * 0.6, new Set([id]));
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
  
  spreadActivation(node, intensity, visited) {
    if (intensity < 0.08) return;
    
    for (const edge of this.edges) {
      let neighbor = null;
      if (edge.source.id === node.id) neighbor = edge.target;
      else if (edge.target.id === node.id) neighbor = edge.source;
      
      if (neighbor && !visited.has(neighbor.id)) {
        visited.add(neighbor.id);
        
        const decay = 0.5 + 0.25 * Math.min(1, edge.weight / 5);
        const spreadIntensity = intensity * decay;
        
        neighbor.targetActivation = Math.max(neighbor.targetActivation, spreadIntensity);
        edge.targetActivation = Math.max(edge.targetActivation, spreadIntensity);
        
        this.spreadActivation(neighbor, spreadIntensity * 0.5, visited);
      }
    }
  }
  
  /**
   * Activate a path
   */
  activatePath(path, intensity = 1) {
    for (let i = 0; i < path.length; i++) {
      const node = this.nodeMap.get(path[i]);
      if (node) {
        const pathPos = i / (path.length - 1 || 1);
        const pathIntensity = intensity * (0.7 + 0.3 * Math.sin(pathPos * Math.PI));
        node.targetActivation = Math.max(node.targetActivation, pathIntensity);
      }
      
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
   * Set water line position
   */
  setWaterLine(y) {
    this.waterLine = y;
    this.simulation.centerY = y + (this.canvas.height - y) / 2;
  }
  
  /**
   * Update everything
   */
  update(dt) {
    this.time += dt;
    
    // Physics
    this.simulation.step(dt, this.time);
    
    // Nodes
    for (const node of this.nodes) {
      node.update(dt, this.time);
    }
    
    // Edges
    for (const edge of this.edges) {
      edge.update(dt, this.time);
    }
    
    // Particles
    const bounds = {
      left: 0,
      right: this.canvas.width,
      top: this.waterLine,
      bottom: this.canvas.height
    };
    this.particles.update(dt, this.time, this.nodes, this.edges, bounds);
  }
  
  /**
   * Render everything in layers
   */
  render(ctx) {
    ctx = ctx || this.ctx;
    
    ctx.save();
    
    // Clip to below water line
    ctx.beginPath();
    ctx.rect(0, this.waterLine, this.canvas.width, this.canvas.height - this.waterLine);
    ctx.clip();
    
    // === LAYER 1: Background ===
    this.atmosphere.renderBackground(ctx, this.waterLine);
    
    // === LAYER 2: Caustics (underwater light) ===
    this.atmosphere.renderCaustics(ctx, this.time, this.waterLine);
    
    // === LAYER 3: Deep edges (rendered first, behind everything) ===
    for (const edge of this.edges) {
      edge.render(ctx, this.time);
    }
    
    // === LAYER 4: Particles (between edges and nodes) ===
    this.particles.render(ctx, this.time);
    
    // === LAYER 5: Nodes ===
    // Sort by Y for depth ordering (deeper = behind)
    const sortedNodes = [...this.nodes].sort((a, b) => a.y - b.y);
    for (const node of sortedNodes) {
      node.render(ctx, this.time);
    }
    
    // === LAYER 6: Depth fog ===
    this.atmosphere.renderFog(ctx, this.waterLine);
    
    ctx.restore();
    
    // === LAYER 7: Vignette (over everything) ===
    this.atmosphere.renderVignette(ctx);
  }
  
  /**
   * Resize handler
   */
  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    
    this.simulation.width = width;
    this.simulation.height = height;
    this.simulation.centerX = width / 2;
    this.simulation.centerY = this.waterLine + (height - this.waterLine) / 2;
    
    this.atmosphere = new AtmosphericEffects(this.canvas);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    MyceliumLayer, 
    OrganicNode, 
    OrganicEdge, 
    ForceSimulation,
    ParticleSystem,
    Particle,
    AtmosphericEffects,
    PerlinNoise
  };
}
