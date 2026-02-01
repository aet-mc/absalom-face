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
  
  // Edge colors - BOOSTED for visibility
  edgeDim: { r: 50, g: 120, b: 100, a: 0.35 },
  edgeActive: { r: 80, g: 230, b: 190, a: 0.85 },
  
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
    this.maxTrail = Math.floor(8 + Math.random() * 15); // Longer trails (was 3-8)
    
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
    
    // Spiral attraction - stronger pull toward active nodes
    const angle = Math.atan2(dy, dx) + Math.sin(time * 2 + this.phase) * 0.5;
    const attractForce = Math.min(2.5, 80 / dist) * this.speed; // Stronger (was min 1, 50/dist)
    
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
  constructor(maxParticles = 3500) {
    this.particles = [];
    this.maxParticles = maxParticles;
    this.spawnRate = 50; // particles per second (was 30)
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
    
    // Organic properties - multiple strands (TUNED for visibility)
    this.strandCount = 3 + Math.floor(Math.random() * 3); // 3-5 strands for fuller tendrils
    this.strands = [];
    for (let i = 0; i < this.strandCount; i++) {
      this.strands.push({
        offset: (Math.random() - 0.5) * 0.15, // REDUCED: tighter bundle (was 0.4)
        thickness: 0.6 + Math.random() * 0.5, // BOOSTED: minimum 0.6 (was 0.3)
        phase: Math.random() * Math.PI * 2,
        waveFreq: 1.5 + Math.random() * 2, // SLOWER: gentler undulation (was 2-5)
        waveAmp: 2 + Math.random() * 4 // REDUCED: tighter waves (was 5-15)
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
    
    // Spawn energy pulses - even dim edges get occasional pulses
    const pulseThreshold = 0.15; // LOWERED from 0.4
    const pulseInterval = this.activation > 0.5 ? 0.3 : 1.2; // Faster when active
    if (this.activation > pulseThreshold && time - this.lastPulseTime > pulseInterval) {
      this.pulses.push({
        progress: 0,
        speed: 0.15 + Math.random() * 0.25 + this.activation * 0.3, // Slower base, faster when active
        size: 4 + this.activation * 8, // BIGGER pulses (was 3 + act*5)
        brightness: 0.4 + this.activation * 0.6 // Minimum brightness 0.4
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
    
    // Base thickness - BOOSTED for visibility
    // High-weight edges are now dramatically thicker
    const weightFactor = Math.log2(this.weight + 1);
    const baseWidth = 1.5 + Math.min(4, weightFactor * 1.2); // 1.5-5.5px range (was 0.5-2.5)
    
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
      
      // Add strand-specific offset and wave (TIGHTER bundling)
      const strandWave = Math.sin(t * strand.waveFreq * Math.PI + time * 0.5 + strand.phase) * strand.waveAmp;
      const offset = strand.offset * 12 + strandWave; // REDUCED from 30 to 12
      
      points.push({
        x: point.x + point.nx * offset,
        y: point.y + point.ny * offset,
        t
      });
    }
    
    // Draw the strand with variable thickness - BOOSTED
    const width = baseWidth * strand.thickness * (1 + this.activation * 0.8); // was 0.5
    
    // Color interpolation - DRAMATICALLY BOOSTED VISIBILITY
    // Inactive edges now start at 25% alpha, active reach 80%
    const dimAlpha = 0.25 + this.weight * 0.03; // Weight adds slight visibility
    const activeAlpha = 0.80;
    const alpha = dimAlpha + (activeAlpha - dimAlpha) * this.activation;
    
    // Brighter base colors - visible cyan-green even when dim
    const r = Math.round(50 + (90 - 50) * this.activation);   // 50-90 (was 30-45)
    const g = Math.round(130 + (235 - 130) * this.activation); // 130-235 (was 60-212)
    const b = Math.round(110 + (195 - 110) * this.activation); // 110-195 (was 55-168)
    
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
    
    // Create gradient between source and target node colors (if different types)
    const sourceColor = PALETTE.nodes[this.source.type] || PALETTE.nodes.default;
    const targetColor = PALETTE.nodes[this.target.type] || PALETTE.nodes.default;
    const useGradient = sourceColor.h !== targetColor.h;
    
    if (useGradient && points.length > 1) {
      // Gradient along edge path
      const gradient = ctx.createLinearGradient(
        points[0].x, points[0].y,
        points[points.length - 1].x, points[points.length - 1].y
      );
      // Blend toward edge color at center, node colors at ends
      const srcR = Math.round(sourceColor.r * 0.3 + r * 0.7);
      const srcG = Math.round(sourceColor.g * 0.3 + g * 0.7);
      const srcB = Math.round(sourceColor.b * 0.3 + b * 0.7);
      const tgtR = Math.round(targetColor.r * 0.3 + r * 0.7);
      const tgtG = Math.round(targetColor.g * 0.3 + g * 0.7);
      const tgtB = Math.round(targetColor.b * 0.3 + b * 0.7);
      
      gradient.addColorStop(0, `rgba(${srcR}, ${srcG}, ${srcB}, ${alpha})`);
      gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      gradient.addColorStop(1, `rgba(${tgtR}, ${tgtG}, ${tgtB}, ${alpha})`);
      ctx.strokeStyle = gradient;
    } else {
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    ctx.lineWidth = width;
    ctx.stroke();
    
    // AMBIENT GLOW - all edges get subtle glow, active edges get bloom
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    // Subtle ambient glow for ALL edges (always visible)
    const ambientGlowAlpha = 0.08 + this.activation * 0.15;
    ctx.filter = `blur(${4 + this.activation * 6}px)`;
    ctx.strokeStyle = `rgba(${r + 30}, ${g + 20}, ${b + 20}, ${ambientGlowAlpha})`;
    ctx.lineWidth = width * 2.5;
    ctx.stroke();
    
    // Extra bloom layer when highly active
    if (this.activation > 0.4) {
      ctx.filter = `blur(${8 + this.activation * 10}px)`;
      ctx.strokeStyle = `rgba(${r + 50}, ${g + 30}, ${b + 30}, ${(this.activation - 0.4) * 0.5})`;
      ctx.lineWidth = width * 4;
      ctx.stroke();
    }
    
    ctx.restore();
  }
  
  renderPulse(ctx, time, pulse) {
    const point = this.getPointOnCurve(pulse.progress, time);
    
    // Brighter, more saturated pulse colors
    const r = 100, g = 245, b = 210;
    const size = pulse.size;
    
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    // Outer bloom (large, soft)
    const outerGlow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, size * 4);
    outerGlow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${pulse.brightness * 0.4})`);
    outerGlow.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${pulse.brightness * 0.2})`);
    outerGlow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    
    ctx.beginPath();
    ctx.arc(point.x, point.y, size * 4, 0, Math.PI * 2);
    ctx.fillStyle = outerGlow;
    ctx.fill();
    
    // Inner core (bright, sharp)
    const coreGlow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, size * 1.5);
    coreGlow.addColorStop(0, `rgba(255, 255, 255, ${pulse.brightness * 0.9})`);
    coreGlow.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, ${pulse.brightness * 0.8})`);
    coreGlow.addColorStop(0.6, `rgba(${r - 30}, ${g - 20}, ${b - 20}, ${pulse.brightness * 0.4})`);
    coreGlow.addColorStop(1, `rgba(${r - 50}, ${g - 40}, ${b - 40}, 0)`);
    
    ctx.beginPath();
    ctx.arc(point.x, point.y, size * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = coreGlow;
    ctx.fill();
    
    ctx.restore();
  }
}

// ============================================================================
// ORGANIC NODE - Living, breathing entities with rich visual expression
// ============================================================================

// Type-specific visual signatures
const NODE_SIGNATURES = {
  topics: {
    coronaLayers: 3,      // Number of corona rings
    coronaSpread: 0.15,   // How far corona extends
    pulseSpeed: 1.0,      // Breathing speed multiplier
    coreIntensity: 0.9,   // Core brightness
    hasRings: false,      // Saturn-like rings
    hasTendrils: true,    // Organic tendrils reaching out
  },
  people: {
    coronaLayers: 2,
    coronaSpread: 0.12,
    pulseSpeed: 1.2,      // Slightly faster - more "alive"
    coreIntensity: 1.0,   // Brightest core
    hasRings: false,
    hasTendrils: false,
    hasAura: true,        // Warm aura effect
  },
  tickers: {
    coronaLayers: 4,      // More technical, layered look
    coronaSpread: 0.2,
    pulseSpeed: 0.8,
    coreIntensity: 0.85,
    hasRings: true,       // Data rings
    hasTendrils: false,
  },
  tools: {
    coronaLayers: 2,
    coronaSpread: 0.1,
    pulseSpeed: 0.6,      // Slower, more stable
    coreIntensity: 0.8,
    hasRings: true,
    hasTendrils: false,
  },
  decisions: {
    coronaLayers: 5,      // Most complex - decision nodes are important
    coronaSpread: 0.25,
    pulseSpeed: 1.4,      // Quick, alert
    coreIntensity: 0.95,
    hasRings: false,
    hasTendrils: true,
  },
  default: {
    coronaLayers: 2,
    coronaSpread: 0.12,
    pulseSpeed: 1.0,
    coreIntensity: 0.85,
    hasRings: false,
    hasTendrils: false,
  }
};

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
    
    // Visual signature for this type
    this.signature = NODE_SIGNATURES[this.type] || NODE_SIGNATURES.default;
    
    // Organic breathing - multiple overlapping rhythms (scaled by type)
    const ps = this.signature.pulseSpeed;
    this.breathPhases = [
      { phase: Math.random() * Math.PI * 2, speed: (0.3 + Math.random() * 0.2) * ps, amp: 0.18 },
      { phase: Math.random() * Math.PI * 2, speed: (0.7 + Math.random() * 0.3) * ps, amp: 0.10 },
      { phase: Math.random() * Math.PI * 2, speed: (1.5 + Math.random() * 0.5) * ps, amp: 0.04 },
      { phase: Math.random() * Math.PI * 2, speed: (2.5 + Math.random() * 0.8) * ps, amp: 0.02 } // Extra fast flutter
    ];
    
    // Sway motion
    this.swayPhase = Math.random() * Math.PI * 2;
    this.swaySpeed = 0.1 + Math.random() * 0.1;
    this.swayAmount = 2 + Math.random() * 3;
    
    // Color properties
    this.colorShift = Math.random() * Math.PI * 2;
    
    // === IDLE "THOUGHTS" - spontaneous micro-activations ===
    this.thoughtTimer = Math.random() * 10;  // Time until next thought
    this.thoughtIntensity = 0;               // Current thought glow
    this.thoughtDecay = 0;
    
    // Label visibility (fades in on activation)
    this.labelOpacity = 0;
    
    // Tendril state (for types with tendrils)
    if (this.signature.hasTendrils) {
      this.tendrils = [];
      const tendrilCount = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < tendrilCount; i++) {
        this.tendrils.push({
          angle: (i / tendrilCount) * Math.PI * 2 + Math.random() * 0.5,
          length: 0.5 + Math.random() * 0.5,
          phase: Math.random() * Math.PI * 2,
          speed: 0.3 + Math.random() * 0.4
        });
      }
    }
    
    // Ring state (for types with rings)
    if (this.signature.hasRings) {
      this.rings = [];
      const ringCount = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < ringCount; i++) {
        this.rings.push({
          radius: 1.8 + i * 0.6,
          rotation: Math.random() * Math.PI * 2,
          speed: (0.2 + Math.random() * 0.2) * (i % 2 === 0 ? 1 : -1),
          thickness: 0.5 + Math.random() * 0.5
        });
      }
    }
  }
  
  calculateRadius() {
    // WIDER SIZE RANGE: exponential scaling for heavy nodes
    // Light nodes: ~5px, Heavy nodes (weight 50+): up to ~40px
    const minRadius = 5;
    const maxRadius = 45;
    
    // Exponential curve: small nodes stay small, heavy nodes get MUCH bigger
    const weightFactor = Math.pow(this.weight, 0.6); // Sublinear but more dramatic than log
    const normalizedWeight = Math.min(1, weightFactor / 15); // Normalize to 0-1
    
    return minRadius + (maxRadius - minRadius) * normalizedWeight;
  }
  
  getColor() {
    return PALETTE.nodes[this.type] || PALETTE.nodes.default;
  }
  
  update(dt, time) {
    // Smooth activation with asymmetric speed (quick on, slow off)
    const speed = this.activation < this.targetActivation ? 8 : 1.5;
    this.activation += (this.targetActivation - this.activation) * Math.min(1, dt * speed);
    
    // Decay activation
    if (this.targetActivation > 0) {
      this.targetActivation -= dt * 0.2;
      if (this.targetActivation < 0) this.targetActivation = 0;
    }
    
    // === IDLE THOUGHTS: spontaneous micro-activations ===
    this.thoughtTimer -= dt;
    if (this.thoughtTimer <= 0 && this.activation < 0.1) {
      // Trigger a "thought" - a brief, subtle glow
      this.thoughtIntensity = 0.15 + Math.random() * 0.25;
      this.thoughtDecay = 0.8 + Math.random() * 0.5;
      // Next thought in 5-20 seconds
      this.thoughtTimer = 5 + Math.random() * 15;
    }
    
    // Decay thought
    if (this.thoughtIntensity > 0) {
      this.thoughtIntensity -= dt * this.thoughtDecay;
      if (this.thoughtIntensity < 0) this.thoughtIntensity = 0;
    }
    
    // === LABEL OPACITY: fade in on activation ===
    const targetLabelOpacity = this.activation > 0.5 ? Math.min(1, (this.activation - 0.5) * 3) : 0;
    this.labelOpacity += (targetLabelOpacity - this.labelOpacity) * Math.min(1, dt * 4);
    
    // Update breath phases
    for (const breath of this.breathPhases) {
      breath.phase += dt * breath.speed;
    }
    
    // Update sway
    this.swayPhase += dt * this.swaySpeed;
    
    // Update tendrils
    if (this.tendrils) {
      for (const tendril of this.tendrils) {
        tendril.phase += dt * tendril.speed;
      }
    }
    
    // Update rings
    if (this.rings) {
      for (const ring of this.rings) {
        ring.rotation += dt * ring.speed;
      }
    }
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
    
    // Combined glow from activation + idle thoughts
    const effectiveGlow = Math.max(this.activation, this.thoughtIntensity);
    
    // Calculate glow intensity
    const baseGlow = 0.12 + breathScale * 0.06;
    const glowIntensity = baseGlow + effectiveGlow * 0.88;
    
    // Calculate radius with dramatic activation scaling
    const activationScale = 1 + effectiveGlow * 0.6;
    const radius = this.baseRadius * breathScale * activationScale;
    
    ctx.save();
    ctx.translate(x, y);
    
    // ===== TENDRILS (behind everything, for organic types) =====
    if (this.tendrils && effectiveGlow > 0.05) {
      this.renderTendrils(ctx, time, radius, hue, effectiveGlow);
    }
    
    // ===== RINGS (for technical types) =====
    if (this.rings) {
      this.renderRings(ctx, time, radius, hue, glowIntensity);
    }
    
    // ===== OUTER BLOOM (furthest out, very soft) =====
    if (effectiveGlow > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      
      // Multiple bloom layers for richer glow
      const bloomLayers = this.signature.coronaLayers;
      for (let i = 0; i < bloomLayers; i++) {
        const layerT = i / bloomLayers;
        const bloomRadius = radius * (4 + layerT * 6 + effectiveGlow * 10);
        const bloomOpacity = effectiveGlow * 0.35 * (1 - layerT * 0.6);
        const bloomHue = (hue + layerT * 15) % 360; // Slight hue shift per layer
        
        const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, bloomRadius);
        bloom.addColorStop(0, `hsla(${bloomHue}, 85%, 65%, ${bloomOpacity})`);
        bloom.addColorStop(0.2, `hsla(${bloomHue}, 75%, 55%, ${bloomOpacity * 0.6})`);
        bloom.addColorStop(0.5, `hsla(${bloomHue}, 65%, 45%, ${bloomOpacity * 0.2})`);
        bloom.addColorStop(0.8, `hsla(${bloomHue}, 55%, 35%, ${bloomOpacity * 0.05})`);
        bloom.addColorStop(1, 'transparent');
        
        ctx.beginPath();
        ctx.arc(0, 0, bloomRadius, 0, Math.PI * 2);
        ctx.fillStyle = bloom;
        ctx.fill();
      }
      
      ctx.restore();
    }
    
    // ===== AURA (warm types like people) =====
    if (this.signature.hasAura && effectiveGlow > 0.1) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      
      const auraRadius = radius * 2.5;
      const warmHue = (hue + 20) % 360; // Warmer shift
      const aura = ctx.createRadialGradient(0, 0, radius * 0.8, 0, 0, auraRadius);
      aura.addColorStop(0, `hsla(${warmHue}, 90%, 70%, ${effectiveGlow * 0.3})`);
      aura.addColorStop(0.5, `hsla(${warmHue}, 80%, 60%, ${effectiveGlow * 0.15})`);
      aura.addColorStop(1, 'transparent');
      
      ctx.beginPath();
      ctx.arc(0, 0, auraRadius, 0, Math.PI * 2);
      ctx.fillStyle = aura;
      ctx.fill();
      
      ctx.restore();
    }
    
    // ===== OUTER CORONA =====
    const outerRadius = radius * (2.5 + effectiveGlow * 2.5);
    const outerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, outerRadius);
    outerGlow.addColorStop(0, `hsla(${hue}, 80%, 70%, ${glowIntensity * 0.7})`);
    outerGlow.addColorStop(0.15, `hsla(${hue}, 75%, 60%, ${glowIntensity * 0.5})`);
    outerGlow.addColorStop(0.35, `hsla(${hue}, 70%, 50%, ${glowIntensity * 0.25})`);
    outerGlow.addColorStop(0.6, `hsla(${hue}, 65%, 40%, ${glowIntensity * 0.08})`);
    outerGlow.addColorStop(0.85, `hsla(${hue}, 60%, 35%, ${glowIntensity * 0.02})`);
    outerGlow.addColorStop(1, 'transparent');
    
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
    ctx.fillStyle = outerGlow;
    ctx.fill();
    
    // ===== INNER GLOW (mid-layer) =====
    const innerRadius = radius * 1.6;
    const innerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, innerRadius);
    innerGlow.addColorStop(0, `hsla(${hue}, 85%, 80%, ${0.85 + glowIntensity * 0.15})`);
    innerGlow.addColorStop(0.25, `hsla(${hue}, 80%, 70%, ${0.6 + glowIntensity * 0.25})`);
    innerGlow.addColorStop(0.5, `hsla(${hue}, 75%, 58%, ${0.35 + glowIntensity * 0.2})`);
    innerGlow.addColorStop(0.8, `hsla(${hue}, 70%, 45%, ${0.1 + glowIntensity * 0.1})`);
    innerGlow.addColorStop(1, 'transparent');
    
    ctx.beginPath();
    ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = innerGlow;
    ctx.fill();
    
    // ===== CORE (bright center) =====
    const coreRadius = radius * 0.55;
    const coreIntensity = this.signature.coreIntensity;
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRadius);
    // More gradient stops for smoother falloff
    core.addColorStop(0, `hsla(${hue}, 30%, 98%, ${coreIntensity})`);
    core.addColorStop(0.15, `hsla(${hue}, 45%, 92%, ${coreIntensity * 0.95})`);
    core.addColorStop(0.35, `hsla(${hue}, 60%, 82%, ${coreIntensity * 0.9})`);
    core.addColorStop(0.55, `hsla(${hue}, 75%, 70%, ${coreIntensity * 0.8})`);
    core.addColorStop(0.75, `hsla(${hue}, 82%, 60%, ${coreIntensity * 0.6})`);
    core.addColorStop(1, `hsla(${hue}, 85%, 50%, ${coreIntensity * 0.3})`);
    
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.fill();
    
    // ===== HOT SPOT (tiny bright center) =====
    const hotspotRadius = radius * 0.15;
    const hotspot = ctx.createRadialGradient(0, 0, 0, 0, 0, hotspotRadius);
    hotspot.addColorStop(0, `hsla(${hue}, 20%, 100%, ${0.9 + effectiveGlow * 0.1})`);
    hotspot.addColorStop(0.5, `hsla(${hue}, 40%, 95%, 0.7)`);
    hotspot.addColorStop(1, `hsla(${hue}, 60%, 85%, 0)`);
    
    ctx.beginPath();
    ctx.arc(0, 0, hotspotRadius, 0, Math.PI * 2);
    ctx.fillStyle = hotspot;
    ctx.fill();
    
    // ===== LABEL (appears on activation) =====
    if (this.labelOpacity > 0.01) {
      this.renderLabel(ctx, radius, hue);
    }
    
    ctx.restore();
  }
  
  renderTendrils(ctx, time, radius, hue, activation) {
    if (!this.tendrils) return;
    
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    for (const tendril of this.tendrils) {
      const waveOffset = Math.sin(tendril.phase) * 0.3;
      const angle = tendril.angle + waveOffset;
      const length = radius * (1.5 + tendril.length * 2 + activation * 2);
      
      // Tendril as a tapered line with glow
      const endX = Math.cos(angle) * length;
      const endY = Math.sin(angle) * length;
      
      const gradient = ctx.createLinearGradient(0, 0, endX, endY);
      gradient.addColorStop(0, `hsla(${hue}, 70%, 60%, ${activation * 0.4})`);
      gradient.addColorStop(0.5, `hsla(${hue}, 65%, 50%, ${activation * 0.2})`);
      gradient.addColorStop(1, `hsla(${hue}, 60%, 40%, 0)`);
      
      ctx.beginPath();
      ctx.moveTo(0, 0);
      
      // Curved tendril using quadratic bezier
      const controlDist = length * 0.5;
      const controlAngle = angle + Math.sin(tendril.phase * 2) * 0.5;
      const cx = Math.cos(controlAngle) * controlDist;
      const cy = Math.sin(controlAngle) * controlDist;
      
      ctx.quadraticCurveTo(cx, cy, endX, endY);
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2 + activation * 3;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    
    ctx.restore();
  }
  
  renderRings(ctx, time, radius, hue, glowIntensity) {
    if (!this.rings) return;
    
    ctx.save();
    
    for (const ring of this.rings) {
      ctx.save();
      ctx.rotate(ring.rotation);
      
      const ringRadius = radius * ring.radius;
      const thickness = ring.thickness * (1 + this.activation * 0.5);
      
      // Draw ring as ellipse
      ctx.beginPath();
      ctx.ellipse(0, 0, ringRadius, ringRadius * 0.3, 0, 0, Math.PI * 2);
      
      ctx.strokeStyle = `hsla(${hue}, 60%, 55%, ${glowIntensity * 0.4})`;
      ctx.lineWidth = thickness;
      ctx.stroke();
      
      // Glow on ring
      if (this.activation > 0.2) {
        ctx.strokeStyle = `hsla(${hue}, 70%, 65%, ${this.activation * 0.3})`;
        ctx.lineWidth = thickness * 2;
        ctx.filter = 'blur(2px)';
        ctx.stroke();
      }
      
      ctx.restore();
    }
    
    ctx.restore();
  }
  
  renderLabel(ctx, radius, hue) {
    const label = this.label;
    if (!label || label.length === 0) return;
    
    // Position label above the node
    const labelY = -radius * 2.5 - 8;
    
    ctx.save();
    
    // Text styling
    const fontSize = Math.max(10, Math.min(14, radius * 0.6));
    ctx.font = `${fontSize}px "Inter", -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Truncate long labels
    const maxLen = 20;
    const displayLabel = label.length > maxLen ? label.slice(0, maxLen) + '…' : label;
    
    // Glow behind text
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowColor = `hsla(${hue}, 70%, 60%, ${this.labelOpacity * 0.8})`;
    ctx.shadowBlur = 8;
    ctx.fillStyle = `hsla(${hue}, 60%, 85%, ${this.labelOpacity * 0.9})`;
    ctx.fillText(displayLabel, 0, labelY);
    ctx.restore();
    
    // Main text
    ctx.fillStyle = `rgba(255, 255, 255, ${this.labelOpacity * 0.95})`;
    ctx.fillText(displayLabel, 0, labelY);
    
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
    
    this.centerForce = options.centerForce || 0.002;    // 4x weaker center pull → more spread
    this.repulsionForce = options.repulsionForce || 1200; // 5x stronger repulsion
    this.edgeForce = options.edgeForce || 0.008;         // Softer springs
    this.edgeLength = options.edgeLength || 180;         // Longer rest length
    this.damping = options.damping || 0.92;
    this.depthInfluence = options.depthInfluence || 0.3;
    
    this.nodes = [];
    this.edges = [];
    this.nodeMap = new Map();
    
    // Global breathing - layout expands/contracts
    this.breathPhase = 0;
    this.breathAmp = 0.03; // 3% expansion/contraction
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
    // Type-based angular sectors for semantic clustering
    const typeAngles = {
      topics: 0,                // 12 o'clock
      people: Math.PI * 0.4,    // 2 o'clock
      tickers: Math.PI * 0.8,   // 4 o'clock
      tools: Math.PI * 1.2,     // 8 o'clock
      decisions: Math.PI * 1.6, // 10 o'clock
      headers: Math.PI * 1.8,   // 11 o'clock
      default: Math.PI          // 6 o'clock
    };
    
    for (const node of this.nodes) {
      const hash = this.hashString(node.id);
      const baseAngle = typeAngles[node.type] || typeAngles.default;
      
      // Spread within sector (±30°)
      const spread = (hash % 1000) / 1000 - 0.5;
      const angle = baseAngle + spread * 0.5;
      
      // Radius based on weight (heavier = more central)
      const weightFactor = Math.min(1, node.weight / 10);
      const radius = 120 + (1 - weightFactor) * 280 + (hash % 100);
      
      node.x = this.centerX + Math.cos(angle) * radius;
      node.y = this.centerY + Math.sin(angle) * radius * 0.7; // Squash vertically
      
      // Age-based depth still applies
      const age = Date.now() - node.firstSeen;
      const ageDepth = Math.min(1, age / (30 * 24 * 60 * 60 * 1000));
      node.y += ageDepth * this.height * this.depthInfluence * 0.5;
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
    
    // Add organic global motion - more noticeable drift
    const globalSwayX = Math.sin(time * 0.03) * 2.5; // 5x (was 0.5)
    const globalSwayY = Math.cos(time * 0.025) * 1.8; // 6x (was 0.3)
    
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
      
      // Slow orbital drift - nodes rotate around center
      const distFromCenter = Math.sqrt(dx * dx + dy * dy);
      if (distFromCenter > 50) {
        const orbitSpeed = 0.0003 * (1 + node.activation * 2);
        const perpX = -dy / distFromCenter;
        const perpY = dx / distFromCenter;
        node.vx += perpX * orbitSpeed * distFromCenter * alpha;
        node.vy += perpY * orbitSpeed * distFromCenter * alpha;
      }
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
        if (dist > 600) continue; // Repulsion reaches farther (was 350)
        
        // Hybrid falloff - gentler, reaches farther
        const force = this.repulsionForce / (dist * dist + dist * 50) * alpha;
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
    
    // Global breathing - expand/contract entire layout
    this.breathPhase += dt * 0.15; // ~42 second full cycle
    const breathFactor = 1 + Math.sin(this.breathPhase) * this.breathAmp;
    
    for (const node of this.nodes) {
      const dx = node.x - this.centerX;
      const dy = node.y - this.centerY;
      node.vx += dx * (breathFactor - 1) * 0.5;
      node.vy += dy * (breathFactor - 1) * 0.5;
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
    
    // Pre-generate caustic pattern points - denser for richer light play
    this.causticPoints = [];
    for (let i = 0; i < 50; i++) { // Was 30
      this.causticPoints.push({
        x: Math.random(),
        y: Math.random(),
        phase: Math.random() * Math.PI * 2,
        speed: 0.15 + Math.random() * 0.4, // Slower, more hypnotic
        size: 80 + Math.random() * 200 // Larger caustics
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
      
      // Caustic intensity fades with depth - warmer tones near surface
      const depthRatio = (y - waterLine) / (this.canvas.height - waterLine);
      const warmth = 1 - depthRatio;
      const intensity = 0.045 * (1 - depthRatio * 0.7); // Was 0.03
      
      const size = point.size * (1 + Math.sin(time * point.speed * 1.5 + point.phase) * 0.2);
      
      // Warmer tones near surface, cooler in depths
      const r = Math.round(80 + warmth * 60);
      const g = Math.round(180 + warmth * 40);
      const b = Math.round(140 + warmth * 20);
      
      const caustic = ctx.createRadialGradient(x, y, 0, x, y, size);
      caustic.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${intensity})`);
      caustic.addColorStop(0.4, `rgba(${r - 20}, ${g - 20}, ${b - 20}, ${intensity * 0.5})`);
      caustic.addColorStop(1, 'transparent');
      
      ctx.fillStyle = caustic;
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
    }
    
    ctx.restore();
  }
  
  renderFog(ctx, waterLine) {
    // Depth fog - richer gradient, true abyss feeling
    const fogGradient = ctx.createLinearGradient(0, waterLine, 0, this.canvas.height);
    fogGradient.addColorStop(0, 'rgba(10, 25, 32, 0)');
    fogGradient.addColorStop(0.3, 'rgba(8, 20, 26, 0.15)');
    fogGradient.addColorStop(0.5, 'rgba(6, 16, 22, 0.35)');
    fogGradient.addColorStop(0.75, 'rgba(4, 12, 16, 0.55)');
    fogGradient.addColorStop(0.9, 'rgba(3, 10, 14, 0.75)');
    fogGradient.addColorStop(1, 'rgba(2, 6, 10, 0.85)'); // True abyss (was 0.6 max)
    
    ctx.fillStyle = fogGradient;
    ctx.fillRect(0, waterLine, this.canvas.width, this.canvas.height - waterLine);
  }
  
  renderVignette(ctx) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height * 0.55; // Bias focus slightly downward toward mycelium
    const radius = Math.max(this.canvas.width, this.canvas.height) * 0.85;
    
    const vignette = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius);
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(0.5, 'rgba(0, 0, 0, 0.05)');
    vignette.addColorStop(0.75, 'rgba(0, 0, 0, 0.2)');
    vignette.addColorStop(0.9, 'rgba(0, 0, 0, 0.45)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.65)'); // Darker corners (was 0.5)
    
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
    
    // Global color temperature - slow hue shift over time
    this.colorTemperature = {
      phase: 0,
      speed: 0.02, // Very slow shift
      range: 15    // ±15 hue degrees
    };
    
    // Global breathing rhythm
    this.globalBreath = {
      phase: 0,
      speed: 0.15,     // ~42 second full cycle
      scaleAmp: 0.008, // 0.8% scale pulse
      driftAmp: 3      // 3px drift pulse
    };
    
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
        
        this.spreadActivation(node, intensity * 0.7, new Set([id]), 0);
      }
    }
    
    // Activate edges between active nodes (LOWERED threshold for better connectivity visibility)
    for (const edge of this.edges) {
      const sourceActive = edge.source.targetActivation > 0.15; // was 0.3
      const targetActive = edge.target.targetActivation > 0.15; // was 0.3
      if (sourceActive || targetActive) { // OR instead of AND - single active node lights its edges
        const maxActivation = Math.max(edge.source.targetActivation, edge.target.targetActivation);
        const minActivation = Math.min(edge.source.targetActivation, edge.target.targetActivation);
        // Stronger activation when both ends are active
        const edgeStrength = sourceActive && targetActive 
          ? (maxActivation + minActivation) * 0.5 
          : maxActivation * 0.4;
        edge.targetActivation = Math.max(edge.targetActivation, edgeStrength);
      }
    }
  }
  
  spreadActivation(node, intensity, visited, depth = 0) {
    // Activation threshold - below this, we stop spreading
    const threshold = 0.06;
    if (intensity < threshold) return;
    
    // Max spread depth (prevent infinite recursion, also controls "reach")
    const maxDepth = 4;
    if (depth >= maxDepth) return;
    
    for (const edge of this.edges) {
      let neighbor = null;
      if (edge.source.id === node.id) neighbor = edge.target;
      else if (edge.target.id === node.id) neighbor = edge.source;
      
      if (neighbor && !visited.has(neighbor.id)) {
        visited.add(neighbor.id);
        
        // Decay based on edge weight (stronger connections preserve more signal)
        // Heavy edges: ~80% transmission, light edges: ~45% transmission
        const weightFactor = Math.min(1, edge.weight / 5);
        const decay = 0.45 + 0.35 * weightFactor;
        
        // Distance-based falloff (further = weaker, simulates neural delay)
        const depthDecay = 1 - (depth * 0.12);
        
        const spreadIntensity = intensity * decay * depthDecay;
        
        // Apply to neighbor with slight delay simulation (staggered targeting)
        // Using setTimeout would be ideal but we'll approximate with reduced initial hit
        const neighborIntensity = spreadIntensity * (0.85 + Math.random() * 0.15);
        neighbor.targetActivation = Math.max(neighbor.targetActivation, neighborIntensity);
        
        // Edge gets activated too (energy flowing through it)
        edge.targetActivation = Math.max(edge.targetActivation, spreadIntensity * 0.9);
        
        // Recursively spread with diminishing returns
        // The 0.65 multiplier ensures it doesn't spread too far too fast
        this.spreadActivation(neighbor, spreadIntensity * 0.65, visited, depth + 1);
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
    
    // Update color temperature - slow global hue shift
    this.colorTemperature.phase += dt * this.colorTemperature.speed;
    const globalHueShift = Math.sin(this.colorTemperature.phase) * this.colorTemperature.range;
    
    // Update global breath
    this.globalBreath.phase += dt * this.globalBreath.speed;
    
    // Physics
    this.simulation.step(dt, this.time);
    
    // Update simulation center with breath drift
    const breathDriftX = Math.sin(this.globalBreath.phase * 0.7) * this.globalBreath.driftAmp;
    const breathDriftY = Math.cos(this.globalBreath.phase * 0.5) * this.globalBreath.driftAmp * 0.6;
    this.simulation.centerX = this.canvas.width / 2 + breathDriftX;
    
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
