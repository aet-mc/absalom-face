# Agent Activity Visualization Architecture

**Goal:** Show real-time agent activity (main + sub-agents) as entities moving through the Three.js city.

## Current Architecture

```
┌─────────────────┐     HTTP/WS     ┌──────────────────┐     WS      ┌─────────────────┐
│  OpenClaw       │ ──────────────► │  Knowledge       │ ─────────► │  City (Browser) │
│  Gateway        │   POST /state   │  Engine :3847    │  broadcast │  Three.js       │
└─────────────────┘                 └──────────────────┘            └─────────────────┘
       │
       │ Plugin hook
       ▼
┌─────────────────┐
│  absalom-state  │  (before_agent_start → thinking, agent_end → idle)
│  extension      │
└─────────────────┘
```

**Existing events in absalom-state plugin:**
- `before_agent_start` → Fires when any agent starts processing
- `agent_end` → Fires when agent completes

**Problem:** These events don't distinguish between main agent and sub-agents, nor do they provide session/agent identity information.

---

## Proposed Architecture

### 1. Gateway Event Enhancement

**Best approach: Extend the existing plugin API to include agent context.**

The gateway already fires `before_agent_start` and `agent_end`. We need:
1. Access to session ID / agent ID in these hooks
2. A new event for sub-agent spawn
3. Periodic heartbeat or progress events

**New Plugin API (extension to existing):**

```typescript
// Proposed event payloads (extend existing api.on events)

interface AgentContext {
  sessionId: string;          // e.g., "agent:main:main"
  agentId: string;            // e.g., "main" or "subagent:f081958b-73f1..."
  parentSessionId?: string;   // Set if this is a sub-agent
  label?: string;             // Sub-agent label if provided
  channel?: string;           // "telegram", "discord", etc.
  model?: string;             // "claude-opus-4" etc.
}

// Hook with context
api.on("before_agent_start", async (event: { context: AgentContext }) => {
  // event.context.sessionId, event.context.agentId available
});

api.on("agent_end", async (event: { context: AgentContext; tokensUsed?: number }) => {
  // Same context + token usage
});

// NEW: Sub-agent specific events
api.on("subagent_spawn", async (event: { 
  context: AgentContext;
  task: string;  // The task description
}) => {});

api.on("subagent_complete", async (event: { 
  context: AgentContext;
  result: string;  // Summary of what was accomplished
}) => {});
```

### 2. Data Flow

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                                GATEWAY                                         │
│  ┌─────────────────┐                                                           │
│  │ Main Agent      │◄──── telegram message                                     │
│  │ session:main    │                                                           │
│  └────────┬────────┘                                                           │
│           │ spawns                                                             │
│           ▼                                                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                │
│  │ Sub-agent A     │  │ Sub-agent B     │  │ Sub-agent C     │                │
│  │ label: research │  │ label: code     │  │ label: deploy   │                │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                │
│                                                                                │
│  Plugin: absalom-activity (enhanced)                                           │
│    - Listens to: before_agent_start, agent_end, subagent_spawn, subagent_end  │
│    - Posts to: Knowledge Engine /agents endpoint                               │
└────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ POST /agents/activity
                                    ▼
                    ┌──────────────────────────────────────┐
                    │        Knowledge Engine :3847        │
                    │                                      │
                    │  agentManager = {                    │
                    │    agents: Map<sessionId, AgentState>│
                    │    broadcast('agent:spawn', data)    │
                    │    broadcast('agent:work', data)     │
                    │    broadcast('agent:complete', data) │
                    │  }                                   │
                    └──────────────────────────────────────┘
                                    │
                                    │ WebSocket broadcast
                                    ▼
                    ┌──────────────────────────────────────┐
                    │         City Frontend (Three.js)     │
                    │                                      │
                    │  agentTracker = {                    │
                    │    entities: Map<sessionId, Entity>  │
                    │    spawn(data) → create mesh         │
                    │    update(data) → move/animate       │
                    │    remove(data) → fade out           │
                    │  }                                   │
                    └──────────────────────────────────────┘
```

### 3. Message Format

**Agent Events (Gateway → Knowledge Engine → City):**

```typescript
// Spawn event
{
  type: "agent:spawn",
  agent: {
    sessionId: "agent:main:subagent:f081958b-73f1-45c3-ad27-b255fc3adb8c",
    agentId: "f081958b",  // Short form for display
    parentId: "main",     // null for main agent
    label: "city-agent-architecture",
    channel: "telegram",
    model: "claude-opus-4",
    task: "Design technical architecture for...",  // First 100 chars
    spawnedAt: 1738439089000
  }
}

// Work/Progress event (optional - can use heartbeat instead)
{
  type: "agent:work",
  agent: {
    sessionId: "agent:main:subagent:f081958b...",
    activity: "thinking" | "tool_call" | "responding",
    context?: "reading file...",  // Brief description
    progress?: 0.4,  // Optional 0-1 progress estimate
    lastActivity: 1738439095000
  }
}

// Complete event
{
  type: "agent:complete",
  agent: {
    sessionId: "agent:main:subagent:f081958b...",
    agentId: "f081958b",
    result: "success" | "error" | "timeout",
    duration: 15000,  // ms
    tokensUsed?: 12500,
    completedAt: 1738439104000
  }
}

// Heartbeat (for long-running agents)
{
  type: "agent:heartbeat",
  agents: [
    { sessionId: "agent:main:main", activity: "idle", lastActivity: 1738439100000 },
    { sessionId: "agent:main:subagent:f081...", activity: "thinking", lastActivity: 1738439095000 }
  ]
}
```

### 4. Knowledge Engine Additions

**New endpoint and state management:**

```javascript
// In knowledge-engine/server.js - add to KnowledgeServer class

class KnowledgeServer {
  constructor() {
    // ... existing code ...
    
    // Agent tracking
    this.agents = new Map();  // sessionId → AgentState
    this.agentTimeout = 60000;  // Remove stale agents after 60s
  }

  // New HTTP endpoint
  handleAgentActivity(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        this.processAgentEvent(event);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  }

  processAgentEvent(event) {
    const { type, agent } = event;
    
    switch (type) {
      case 'agent:spawn':
        this.agents.set(agent.sessionId, {
          ...agent,
          status: 'active',
          activity: 'spawning',
          lastUpdate: Date.now()
        });
        this.broadcast({ type: 'agent:spawn', agent: this.agents.get(agent.sessionId) });
        
        // Map agent to a district based on task/label
        const district = this.inferDistrict(agent.task || agent.label);
        this.setCognitiveState('thinking', agent.task);
        break;
        
      case 'agent:work':
        if (this.agents.has(agent.sessionId)) {
          const current = this.agents.get(agent.sessionId);
          Object.assign(current, agent, { lastUpdate: Date.now() });
          this.broadcast({ type: 'agent:work', agent: current });
        }
        break;
        
      case 'agent:complete':
        if (this.agents.has(agent.sessionId)) {
          const current = this.agents.get(agent.sessionId);
          Object.assign(current, agent, { status: 'complete', lastUpdate: Date.now() });
          this.broadcast({ type: 'agent:complete', agent: current });
          
          // Remove after fade-out time
          setTimeout(() => this.agents.delete(agent.sessionId), 5000);
        }
        break;
    }
    
    // Check if all agents are idle
    if (this.getActiveAgentCount() === 0) {
      this.setState('idle');
    }
  }

  inferDistrict(text) {
    if (!text) return 'core';
    const lower = text.toLowerCase();
    
    const districtKeywords = {
      trading: ['stock', 'trading', 'market', 'ticker', 'portfolio', 'price'],
      infrastructure: ['server', 'deploy', 'api', 'docker', 'tunnel', 'gateway'],
      projects: ['project', 'build', 'app', 'visualization', 'city', 'face'],
      memory: ['memory', 'remember', 'decision', 'note', 'log', 'architecture'],
      core: ['self', 'absalom', 'knowledge', 'engine', 'agent']
    };
    
    for (const [district, keywords] of Object.entries(districtKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) {
        return district;
      }
    }
    return 'core';
  }

  getActiveAgentCount() {
    return [...this.agents.values()].filter(a => a.status === 'active').length;
  }

  // Send full agent state to new clients
  sendAgentState(ws) {
    const agents = [...this.agents.values()];
    ws.send(JSON.stringify({ type: 'agents:full', agents }));
  }
}
```

### 5. City Frontend Agent Rendering

**Add to absalom-city.html:**

```javascript
// ═══════════════════════════════════════════════════════════════════════
// AGENT ENTITY SYSTEM
// ═══════════════════════════════════════════════════════════════════════

const agentSystem = {
  entities: new Map(),  // sessionId → { mesh, trail, state }
  
  // Visual config per agent type
  config: {
    main: {
      color: 0x00ffff,
      size: 1.2,
      trailLength: 20,
      glowIntensity: 0.8
    },
    subagent: {
      color: 0xff00ff,
      size: 0.6,
      trailLength: 10,
      glowIntensity: 0.5
    }
  },
  
  spawn(agentData) {
    const isMain = !agentData.parentId;
    const config = isMain ? this.config.main : this.config.subagent;
    
    // Determine spawn position (parent location or district center)
    let spawnPos;
    if (agentData.parentId && this.entities.has(`agent:main:${agentData.parentId}`)) {
      const parent = this.entities.get(`agent:main:${agentData.parentId}`);
      spawnPos = parent.mesh.position.clone();
    } else {
      // Spawn at district center based on task
      const district = this.inferDistrict(agentData.task);
      const districtData = DISTRICTS[district];
      spawnPos = new THREE.Vector3(
        districtData.position.x + (Math.random() - 0.5) * 5,
        2,
        districtData.position.z + (Math.random() - 0.5) * 5
      );
    }
    
    // Create agent mesh (glowing orb with inner core)
    const group = new THREE.Group();
    
    // Inner core
    const coreGeo = new THREE.SphereGeometry(config.size * 0.3, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({
      color: config.color,
      transparent: true,
      opacity: 0.9
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);
    
    // Outer glow
    const glowGeo = new THREE.SphereGeometry(config.size, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: config.color,
      transparent: true,
      opacity: config.glowIntensity * 0.3
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    group.add(glow);
    
    // Label sprite (optional)
    if (agentData.label) {
      const labelSprite = this.createLabelSprite(agentData.label.substring(0, 15));
      labelSprite.position.y = config.size + 0.5;
      group.add(labelSprite);
    }
    
    group.position.copy(spawnPos);
    scene.add(group);
    
    // Trail system
    const trail = this.createTrail(config.color, config.trailLength);
    scene.add(trail.line);
    
    const entity = {
      mesh: group,
      core,
      glow,
      trail,
      state: {
        ...agentData,
        activity: 'spawning',
        targetDistrict: this.inferDistrict(agentData.task),
        spawnTime: performance.now(),
        lastUpdate: Date.now()
      }
    };
    
    this.entities.set(agentData.sessionId, entity);
    
    // Spawn animation
    group.scale.setScalar(0.1);
    this.animateSpawn(entity);
    
    console.log(`[Agent] Spawned: ${agentData.agentId} (${agentData.label || 'main'})`);
  },
  
  update(agentData) {
    const entity = this.entities.get(agentData.sessionId);
    if (!entity) return;
    
    Object.assign(entity.state, agentData, { lastUpdate: Date.now() });
    
    // Update visual based on activity
    this.updateVisuals(entity);
  },
  
  complete(agentData) {
    const entity = this.entities.get(agentData.sessionId);
    if (!entity) return;
    
    entity.state.status = 'complete';
    entity.state.result = agentData.result;
    
    // Success/error visual
    const color = agentData.result === 'success' ? 0x00ff00 : 0xff0000;
    entity.glow.material.color.setHex(color);
    
    // Fade out and remove
    this.animateDespawn(entity, () => {
      scene.remove(entity.mesh);
      scene.remove(entity.trail.line);
      this.entities.delete(agentData.sessionId);
    });
    
    console.log(`[Agent] Complete: ${agentData.agentId} (${agentData.result})`);
  },
  
  tick(dt, elapsed) {
    for (const [sessionId, entity] of this.entities) {
      // Movement toward target district
      if (entity.state.activity !== 'complete') {
        this.moveTowardTarget(entity, dt);
      }
      
      // Visual updates
      this.updateAnimation(entity, elapsed);
      
      // Update trail
      this.updateTrail(entity);
      
      // Timeout stale agents
      if (Date.now() - entity.state.lastUpdate > 120000) {
        console.warn(`[Agent] Stale: ${sessionId}`);
        this.complete({ sessionId, agentId: entity.state.agentId, result: 'timeout' });
      }
    }
  },
  
  moveTowardTarget(entity, dt) {
    const targetDistrict = entity.state.targetDistrict || 'core';
    const districtData = DISTRICTS[targetDistrict];
    
    if (!districtData) return;
    
    const targetPos = new THREE.Vector3(
      districtData.position.x,
      2 + Math.sin(performance.now() * 0.001 + entity.state.spawnTime) * 0.5,
      districtData.position.z
    );
    
    // Smooth movement
    const speed = entity.state.activity === 'thinking' ? 0.02 : 0.01;
    entity.mesh.position.lerp(targetPos, speed);
    
    // Wander within district when arrived
    const dist = entity.mesh.position.distanceTo(targetPos);
    if (dist < 3) {
      const wander = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        0,
        (Math.random() - 0.5) * 4
      );
      entity.wanderTarget = targetPos.clone().add(wander);
    }
    
    if (entity.wanderTarget) {
      entity.mesh.position.lerp(entity.wanderTarget, 0.005);
    }
  },
  
  updateAnimation(entity, elapsed) {
    const activity = entity.state.activity;
    
    // Pulse based on activity
    let pulseSpeed = 1;
    let pulseIntensity = 0.2;
    
    if (activity === 'thinking') {
      pulseSpeed = 3;
      pulseIntensity = 0.4;
    } else if (activity === 'tool_call') {
      pulseSpeed = 5;
      pulseIntensity = 0.5;
    } else if (activity === 'responding') {
      pulseSpeed = 2;
      pulseIntensity = 0.3;
    }
    
    const pulse = 1 + Math.sin(elapsed * pulseSpeed) * pulseIntensity;
    entity.glow.scale.setScalar(pulse);
    entity.glow.material.opacity = 0.3 + (pulse - 1) * 0.5;
    
    // Spawn animation continuation
    if (entity.mesh.scale.x < 1) {
      entity.mesh.scale.multiplyScalar(1.05);
      if (entity.mesh.scale.x > 1) {
        entity.mesh.scale.setScalar(1);
      }
    }
  },
  
  createTrail(color, length) {
    const positions = new Float32Array(length * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4
    });
    
    return {
      line: new THREE.Line(geometry, material),
      positions: Array(length).fill(null).map(() => new THREE.Vector3()),
      index: 0
    };
  },
  
  updateTrail(entity) {
    const trail = entity.trail;
    const pos = entity.mesh.position.clone();
    
    trail.positions[trail.index].copy(pos);
    trail.index = (trail.index + 1) % trail.positions.length;
    
    const positions = trail.line.geometry.attributes.position.array;
    for (let i = 0; i < trail.positions.length; i++) {
      const p = trail.positions[(trail.index + i) % trail.positions.length];
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    trail.line.geometry.attributes.position.needsUpdate = true;
  },
  
  createLabelSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.roundRect(0, 0, canvas.width, canvas.height, 8);
    ctx.fill();
    
    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2, 0.5, 1);
    
    return sprite;
  },
  
  animateSpawn(entity) {
    // Already handled in updateAnimation via scale check
  },
  
  animateDespawn(entity, callback) {
    let opacity = 1;
    const fade = () => {
      opacity -= 0.05;
      entity.glow.material.opacity = opacity * 0.3;
      entity.core.material.opacity = opacity * 0.9;
      entity.trail.line.material.opacity = opacity * 0.4;
      
      if (opacity > 0) {
        requestAnimationFrame(fade);
      } else {
        callback();
      }
    };
    fade();
  },
  
  inferDistrict(text) {
    if (!text) return 'core';
    const lower = text.toLowerCase();
    
    if (/stock|trading|market|ticker|portfolio/.test(lower)) return 'trading';
    if (/server|deploy|api|docker|tunnel|gateway/.test(lower)) return 'infrastructure';
    if (/project|build|app|visual|city|face/.test(lower)) return 'projects';
    if (/memory|remember|decision|note|log/.test(lower)) return 'memory';
    
    return 'core';
  }
};

// Add to WebSocket message handler
cityWebSocket.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  
  switch (msg.type) {
    case 'agents:full':
      msg.agents.forEach(a => agentSystem.spawn(a));
      break;
    case 'agent:spawn':
      agentSystem.spawn(msg.agent);
      break;
    case 'agent:work':
      agentSystem.update(msg.agent);
      break;
    case 'agent:complete':
      agentSystem.complete(msg.agent);
      break;
    // ... existing handlers
  }
};

// Add to animation loop
function animate() {
  const now = performance.now() / 1000;
  agentSystem.tick(deltaTime, now);
  // ... existing animation
}
```

---

## Implementation Plan

### Phase 1: Gateway Events (Simplest Path)
**File:** `~/.openclaw/extensions/absalom-activity/index.ts`

Extend the existing absalom-state plugin to:
1. Extract session context from available hooks
2. Post richer events to the Knowledge Engine

```typescript
// absalom-activity/index.ts
export default function register(api: PluginApi) {
  const endpoint = api.config.plugins?.entries?.["absalom-activity"]?.config?.endpoint 
    ?? "http://localhost:3847/agents/activity";

  async function postEvent(type: string, data: any) {
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, agent: data }),
      });
    } catch (e) {
      // Silent fail
    }
  }

  // Hook into agent lifecycle
  api.on("before_agent_start", async (event: any) => {
    const context = event.context ?? {};
    
    // Detect sub-agent from session ID pattern
    const isSubagent = context.sessionId?.includes(':subagent:');
    
    await postEvent("agent:spawn", {
      sessionId: context.sessionId ?? `unknown-${Date.now()}`,
      agentId: context.agentId ?? 'main',
      parentId: isSubagent ? 'main' : null,
      label: context.label ?? null,
      channel: context.channel ?? 'unknown',
      model: context.model ?? 'unknown',
      task: context.taskDescription?.substring(0, 200) ?? null,
      spawnedAt: Date.now()
    });
  });

  api.on("agent_end", async (event: any) => {
    const context = event.context ?? {};
    
    await postEvent("agent:complete", {
      sessionId: context.sessionId ?? `unknown`,
      agentId: context.agentId ?? 'main',
      result: event.error ? 'error' : 'success',
      duration: event.duration ?? 0,
      tokensUsed: event.tokensUsed ?? 0,
      completedAt: Date.now()
    });
  });

  // Optional: periodic heartbeat for activity state
  api.on("tool_call", async (event: any) => {
    const context = event.context ?? {};
    
    await postEvent("agent:work", {
      sessionId: context.sessionId,
      activity: "tool_call",
      context: event.toolName ?? "unknown",
      lastActivity: Date.now()
    });
  });
}
```

### Phase 2: Knowledge Engine Updates
**File:** `/home/openclaw/Projects/absalom-face/knowledge-engine/server.js`

Add agent state management and broadcasting (code in section 4 above).

### Phase 3: City Frontend
**File:** `/home/openclaw/Projects/absalom-face/renderer/city/absalom-city.html`

Add the agentSystem object and WebSocket handlers (code in section 5 above).

---

## Simplest MVP Path

**If gateway doesn't expose session context yet:**

1. **Use file-based signaling** (like existing activity-watcher):
```bash
# Sub-agent writes to file on spawn:
echo '{"type":"spawn","id":"abc123","task":"..."}'  >> /tmp/agent-activity.jsonl

# Activity watcher tails and posts to Knowledge Engine
```

2. **Poll gateway /sessions endpoint:**
```javascript
// Poll every 2 seconds
setInterval(async () => {
  const sessions = await fetch('http://localhost:18789/api/sessions').then(r => r.json());
  // Diff with previous, emit spawn/complete events
}, 2000);
```

3. **Manual annotation in sub-agent context:**
```javascript
// In the sub-agent's system prompt injection, have it call:
// echo '{"agent":"xyz","status":"working"}' >> /tmp/agent-signal.jsonl
```

---

## State Management Summary

| Component | State Storage | Broadcast |
|-----------|--------------|-----------|
| Gateway | In-memory sessions | Plugin hooks |
| Knowledge Engine | `Map<sessionId, AgentState>` | WebSocket to all clients |
| City Frontend | `Map<sessionId, Entity>` | N/A (render only) |

**Key invariants:**
- Knowledge Engine is source of truth for UI state
- Stale agents (no update for 2min) auto-removed
- Sub-agents inherit spawn position from parent
- Each agent maps to a district based on task keywords

---

## Open Questions

1. **Does the gateway expose session context in plugin hooks?**
   - If yes: Direct integration
   - If no: File/polling fallback

2. **How to detect tool calls vs thinking?**
   - Hook into `tool_call` events if available
   - Otherwise infer from timing gaps

3. **Should sub-agents show connection lines to parent?**
   - Yes for visual hierarchy
   - Add `parentId` tracking in city renderer

4. **Performance with many concurrent agents?**
   - Cap at ~20 visible entities
   - Older ones fade to reduce clutter
