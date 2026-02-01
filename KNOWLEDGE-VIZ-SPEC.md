# Living Knowledge Visualization - Technical Architecture Spec

**Author:** Absalom  
**Date:** 2026-02-01  
**Status:** Proposal

---

## Overview

Transform the Absalom face visualization into a **living knowledge graph** — a visual representation of accumulated memory that breathes, evolves, and responds to interaction. The neural network already pulsing in the background becomes **semantically meaningful**: each node represents real knowledge, connections represent real relationships.

---

## Current State Analysis

### Memory Sources
| Source | Format | Content Type | Update Frequency |
|--------|--------|--------------|------------------|
| `MEMORY.md` | Markdown | Curated long-term knowledge | Weekly |
| `memory/YYYY-MM-DD.md` | Markdown | Daily raw logs | Daily |
| `~/.openclaw/skills/*/SKILL.md` | Markdown | Tool knowledge | Rarely |
| Session transcripts | JSON/text | Conversations | Per-session |

### Existing Infrastructure
- **State Server:** Node.js on port 3847 (WebSocket + HTTP)
- **Face Renderer:** Canvas-based, already has neural network with 50 nodes in orbital rings
- **State Sync:** `absalom-state <mode>` CLI pushes to server, broadcasts to clients
- **Tunnel:** Cloudflare quick tunnel exposes server publicly

### Current Neural Network
- 50 neurons in 4 orbital rings (8, 12, 16, 14 nodes)
- Connections between nearby ring neurons
- Energy propagation triggers visual firing
- Currently **decorative** — nodes are random, not semantic

---

## Architecture Options

### Option A: Client-Side NLP (Lightweight)

**Approach:** Ship pre-extracted entities to the browser, do layout in canvas.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Memory Files   │────▶│  Extraction     │────▶│  knowledge.json │
│  (markdown)     │     │  Script (cron)  │     │  (static file)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                              ┌──────────────────────────────────┐
                              │         Browser Canvas           │
                              │  • Force-directed layout         │
                              │  • Node rendering                │
                              │  • Hover/click interaction       │
                              └──────────────────────────────────┘
```

**Entity Extraction Script (Python):**
```python
# Extract entities from memory files
# Run: python extract_knowledge.py > knowledge.json

import re
import json
from collections import defaultdict
from pathlib import Path

def extract_entities(text):
    entities = {
        'people': [],      # @mentions, names (Anton, etc.)
        'projects': [],    # Headers, ### Project names
        'tools': [],       # Backticked `commands`, skill names
        'decisions': [],   # "Decided:", "Decision:", lines with →
        'topics': [],      # Frequent nouns, capitalized phrases
        'dates': [],       # Date references
        'tickers': []      # $SYMBOL or ALLCAPS 2-5 chars
    }
    
    # Tickers
    entities['tickers'] = list(set(re.findall(r'\b[A-Z]{2,5}\b', text)))
    
    # Headers as topics
    entities['topics'] = re.findall(r'^##+ (.+)$', text, re.MULTILINE)
    
    # Backticked items as tools
    entities['tools'] = list(set(re.findall(r'`([^`]+)`', text)))
    
    return entities
```

**Pros:**
- Simple, no backend dependencies
- Fast iteration
- Works offline once loaded
- Low resource usage

**Cons:**
- No real NLP (regex-based extraction)
- Full reload needed for updates
- No semantic similarity
- Limited entity disambiguation

**Estimated effort:** 1-2 days

---

### Option B: Server-Side Knowledge Engine (Medium)

**Approach:** Node.js service watches memory files, extracts entities with lightweight NLP, serves graph via WebSocket.

```
┌─────────────────┐     ┌────────────────────────────────────────┐
│  Memory Files   │────▶│         Knowledge Engine (Node.js)     │
│  (markdown)     │     │  ┌─────────────┐  ┌────────────────┐   │
│                 │◀────│  │ File Watcher│  │  Entity Store  │   │
│                 │     │  └─────────────┘  └────────────────┘   │
└─────────────────┘     │  ┌─────────────┐  ┌────────────────┐   │
                        │  │ NLP Extract │  │  Graph Builder │   │
                        │  │ (compromise)│  │  (weights)     │   │
                        │  └─────────────┘  └────────────────┘   │
                        │                                        │
                        │  WebSocket: /knowledge                 │
                        │  HTTP: /api/graph, /api/entity/:id     │
                        └──────────────────────────────────┬─────┘
                                                           │
                        ┌──────────────────────────────────▼─────┐
                        │           Browser Canvas               │
                        │  • Real-time graph updates             │
                        │  • Force-directed with D3              │
                        │  • Deep interaction (click → details)  │
                        └────────────────────────────────────────┘
```

**Tech Stack:**
- **File watching:** `chokidar`
- **NLP:** `compromise` (lightweight, runs in Node)
- **Graph store:** In-memory Map + periodic JSON dump
- **Similarity:** TF-IDF with `natural` package (no embeddings)

**Graph Construction:**
```javascript
class KnowledgeGraph {
  constructor() {
    this.nodes = new Map();  // id → { label, type, weight, firstSeen, lastSeen, mentions }
    this.edges = new Map();  // "src:dst" → { weight, cooccurrences, lastSeen }
  }
  
  addEntity(entity, source, date) {
    const id = this.normalize(entity.text);
    
    if (!this.nodes.has(id)) {
      this.nodes.set(id, {
        id,
        label: entity.text,
        type: entity.type, // person, project, tool, topic, ticker
        weight: 0,
        firstSeen: date,
        lastSeen: date,
        mentions: []
      });
    }
    
    const node = this.nodes.get(id);
    node.weight += this.calculateWeight(entity, source);
    node.lastSeen = date;
    node.mentions.push({ source, date, context: entity.context });
  }
  
  calculateWeight(entity, source) {
    let base = 1;
    
    // Source weights
    if (source === 'MEMORY.md') base *= 3;        // Curated = important
    if (source.includes('memory/')) base *= 1;    // Daily logs
    if (source.includes('SOUL.md')) base *= 5;    // Core identity
    
    // Entity type weights
    if (entity.type === 'decision') base *= 2;    // Decisions matter
    if (entity.type === 'person') base *= 1.5;    // People are central
    
    return base;
  }
  
  addConnection(entity1, entity2, date) {
    const key = [entity1.id, entity2.id].sort().join(':');
    
    if (!this.edges.has(key)) {
      this.edges.set(key, { weight: 0, cooccurrences: 0, lastSeen: date });
    }
    
    const edge = this.edges.get(key);
    edge.cooccurrences += 1;
    edge.weight = Math.log(edge.cooccurrences + 1) * 2;  // Log scale
    edge.lastSeen = date;
  }
}
```

**Temporal Dynamics:**
```javascript
// Called periodically (e.g., daily)
decay() {
  const now = Date.now();
  const DAY = 86400000;
  
  this.nodes.forEach((node, id) => {
    const age = (now - node.lastSeen) / DAY;
    
    // Half-life of 30 days for unreinforced knowledge
    node.displayWeight = node.weight * Math.pow(0.5, age / 30);
    
    // But minimum floor based on core importance
    if (node.weight > 10) {
      node.displayWeight = Math.max(node.displayWeight, node.weight * 0.3);
    }
  });
  
  // Edges decay faster
  this.edges.forEach((edge, key) => {
    const age = (now - edge.lastSeen) / DAY;
    edge.displayWeight = edge.weight * Math.pow(0.5, age / 14);
  });
}
```

**Real-Time Updates:**
```javascript
// File watcher triggers re-extraction
watcher.on('change', async (path) => {
  const content = await fs.readFile(path, 'utf-8');
  const entities = await extractEntities(content);
  const date = extractDateFromPath(path) || new Date();
  
  // Update graph
  entities.forEach(e => graph.addEntity(e, path, date));
  
  // Co-occurrence: entities in same section are connected
  const sections = splitBySections(content);
  sections.forEach(section => {
    const sectionEntities = extractEntities(section);
    for (let i = 0; i < sectionEntities.length; i++) {
      for (let j = i + 1; j < sectionEntities.length; j++) {
        graph.addConnection(sectionEntities[i], sectionEntities[j], date);
      }
    }
  });
  
  // Broadcast delta to clients
  wss.broadcast({ type: 'graph_update', delta: graph.getRecent() });
});
```

**Pros:**
- Real-time updates (file watching)
- Proper NLP with `compromise`
- Temporal decay built-in
- WebSocket enables live UI updates
- Can query individual entities

**Cons:**
- No semantic similarity (no embeddings)
- Moderate complexity
- Another service to run (PM2)

**Estimated effort:** 3-5 days

---

### Option C: Embedding-Powered Semantic Graph (Heavy)

**Approach:** Use OpenAI embeddings (or local model) for semantic similarity. Full-featured knowledge engine.

```
┌─────────────────┐     ┌────────────────────────────────────────────────┐
│  Memory Files   │────▶│           Knowledge Engine (Python)            │
│  (markdown)     │     │  ┌──────────────┐  ┌────────────────────────┐  │
│                 │◀────│  │ spaCy NER    │  │  Embedding Store       │  │
│                 │     │  │ (en_core_web)│  │  (ChromaDB / FAISS)    │  │
└─────────────────┘     │  └──────────────┘  └────────────────────────┘  │
                        │  ┌──────────────┐  ┌────────────────────────┐  │
┌─────────────────┐     │  │ Topic Model  │  │  Graph Database        │  │
│   Session       │────▶│  │ (BERTopic)   │  │  (NetworkX / Neo4j)    │  │
│  Transcripts    │     │  └──────────────┘  └────────────────────────┘  │
└─────────────────┘     │                                                │
                        │  FastAPI: /graph, /query, /similar/:id         │
                        │  WebSocket: /ws/knowledge                      │
                        └──────────────────────────────────────────┬─────┘
                                                                   │
                        ┌──────────────────────────────────────────▼─────┐
                        │            Browser (D3.js + Canvas)            │
                        │  • Semantic clustering                         │
                        │  • "Related to X" queries                      │
                        │  • Natural language search                     │
                        └────────────────────────────────────────────────┘
```

**Key Features:**

1. **Entity Extraction (spaCy):**
```python
import spacy
nlp = spacy.load("en_core_web_lg")

def extract_entities(text):
    doc = nlp(text)
    entities = []
    
    for ent in doc.ents:
        entities.append({
            'text': ent.text,
            'type': ent.label_,  # PERSON, ORG, PRODUCT, etc.
            'start': ent.start_char,
            'end': ent.end_char
        })
    
    # Custom patterns for tickers, code, etc.
    for match in re.finditer(r'\$([A-Z]{2,5})\b', text):
        entities.append({
            'text': match.group(1),
            'type': 'TICKER',
            'start': match.start(),
            'end': match.end()
        })
    
    return entities
```

2. **Semantic Similarity (Embeddings):**
```python
from openai import OpenAI

def embed_entity(entity):
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=entity.context  # Surrounding text
    )
    return response.data[0].embedding

# Connections based on cosine similarity
def semantic_edges(entities):
    embeddings = [embed_entity(e) for e in entities]
    edges = []
    
    for i, e1 in enumerate(entities):
        for j, e2 in enumerate(entities):
            if i < j:
                sim = cosine_similarity(embeddings[i], embeddings[j])
                if sim > 0.7:  # Threshold
                    edges.append((e1.id, e2.id, sim))
    
    return edges
```

3. **Topic Clustering (BERTopic):**
```python
from bertopic import BERTopic

def cluster_entities(entities):
    texts = [e.context for e in entities]
    topic_model = BERTopic()
    topics, probs = topic_model.fit_transform(texts)
    
    # Entities in same topic cluster are connected
    for topic_id in set(topics):
        cluster = [e for e, t in zip(entities, topics) if t == topic_id]
        # Create edges within cluster
```

4. **Graph Structure:**
```python
class SemanticKnowledgeGraph:
    def __init__(self):
        self.graph = nx.DiGraph()
        self.embeddings = {}  # entity_id → vector
        self.topics = {}      # entity_id → topic_id
    
    def add_entity(self, entity, embedding):
        self.graph.add_node(
            entity.id,
            label=entity.text,
            type=entity.type,
            weight=entity.weight,
            embedding=embedding,
            first_seen=entity.first_seen,
            last_seen=entity.last_seen
        )
        self.embeddings[entity.id] = embedding
    
    def query_similar(self, entity_id, k=5):
        """Find k most similar entities by embedding."""
        target = self.embeddings[entity_id]
        similarities = []
        
        for eid, emb in self.embeddings.items():
            if eid != entity_id:
                sim = cosine_similarity(target, emb)
                similarities.append((eid, sim))
        
        return sorted(similarities, key=lambda x: -x[1])[:k]
    
    def get_subgraph(self, center_id, depth=2):
        """Get subgraph around a node for deep-dive."""
        nodes = set([center_id])
        for _ in range(depth):
            new_nodes = set()
            for n in nodes:
                new_nodes.update(self.graph.neighbors(n))
            nodes.update(new_nodes)
        return self.graph.subgraph(nodes)
```

**Pros:**
- True semantic understanding
- "Show me everything related to trading" works
- Topic clustering reveals hidden structure
- Most sophisticated visualization possible

**Cons:**
- Heavy (spaCy model ~500MB, embeddings API costs)
- Python service + FastAPI + vector DB
- Complex deployment
- Overkill for current memory size?

**Estimated effort:** 7-10 days

---

## Visualization Integration

### Canvas Rendering Approach

Replace the random neural network with the knowledge graph. Each node = entity. Size = weight. Color = type.

```javascript
// Modified neuron initialization
function initKnowledgeNeurons(graph) {
  neurons.length = 0;
  
  graph.nodes.forEach((node, id) => {
    neurons.push({
      id: node.id,
      label: node.label,
      type: node.type,
      weight: node.displayWeight,
      
      // Position computed by force simulation
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: 0,
      vy: 0,
      
      // Visual properties
      size: 2 + Math.sqrt(node.displayWeight) * 3,
      color: getColorForType(node.type),
      energy: 0,
      connections: graph.edges.get(node.id) || []
    });
  });
}

function getColorForType(type) {
  const palette = {
    person: colors.gold,
    project: colors.emeraldLight,
    tool: colors.teal,
    topic: colors.emerald,
    ticker: colors.goldLight,
    decision: colors.goldDim
  };
  return palette[type] || colors.emerald;
}
```

### Force-Directed Layout

Use a simple force simulation for organic clustering:

```javascript
function tickForceSimulation(dt) {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2 - 30;
  
  neurons.forEach(n => {
    // Repulsion from other neurons
    neurons.forEach(other => {
      if (n.id !== other.id) {
        const dx = n.x - other.x;
        const dy = n.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = (n.size + other.size) * 3;
        
        if (dist < minDist) {
          const force = (minDist - dist) * 0.05;
          n.vx += (dx / dist) * force;
          n.vy += (dy / dist) * force;
        }
      }
    });
    
    // Attraction to connected neurons
    n.connections.forEach(connId => {
      const other = neurons.find(x => x.id === connId);
      if (other) {
        const dx = other.x - n.x;
        const dy = other.y - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = dist * 0.001;
        
        n.vx += (dx / dist) * force;
        n.vy += (dy / dist) * force;
      }
    });
    
    // Gravity toward center
    const dx = centerX - n.x;
    const dy = centerY - n.y;
    n.vx += dx * 0.0005;
    n.vy += dy * 0.0005;
    
    // Damping
    n.vx *= 0.95;
    n.vy *= 0.95;
    
    // Apply
    n.x += n.vx;
    n.y += n.vy;
  });
}
```

### Interaction Layer

```javascript
// Hover detection
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  
  hoveredNode = null;
  neurons.forEach(n => {
    const dist = Math.sqrt((mx - n.x) ** 2 + (my - n.y) ** 2);
    if (dist < n.size + 5) {
      hoveredNode = n;
    }
  });
  
  if (hoveredNode) {
    showTooltip(hoveredNode, e.clientX, e.clientY);
  } else {
    hideTooltip();
  }
});

// Click to focus
canvas.addEventListener('click', (e) => {
  if (hoveredNode) {
    focusNode(hoveredNode);
    // Request subgraph from server
    ws.send(JSON.stringify({ 
      type: 'get_subgraph', 
      id: hoveredNode.id,
      depth: 2
    }));
  }
});

function showTooltip(node, x, y) {
  tooltip.style.display = 'block';
  tooltip.style.left = x + 10 + 'px';
  tooltip.style.top = y + 10 + 'px';
  tooltip.innerHTML = `
    <strong>${node.label}</strong><br>
    Type: ${node.type}<br>
    Weight: ${node.weight.toFixed(1)}<br>
    <em>Click to explore</em>
  `;
}
```

---

## Temporal Dynamics

### Decay Model

Knowledge fades without reinforcement. Model as exponential decay with half-lives:

| Entity Type | Base Half-Life | Notes |
|-------------|----------------|-------|
| Decision | 60 days | Decisions persist |
| Person | 30 days | Relationships need maintenance |
| Project | 14 days | Active projects get mentioned |
| Topic | 21 days | General knowledge |
| Tool | 45 days | Skills stick longer |

**Reinforcement:** Any new mention resets `lastSeen` and adds to base weight.

### Visual Representation of Age

```javascript
function getOpacityForAge(node) {
  const age = (Date.now() - node.lastSeen) / 86400000; // days
  const halfLife = getHalfLife(node.type);
  
  // Exponential decay from 1.0 to 0.3 minimum
  const decay = Math.pow(0.5, age / halfLife);
  return 0.3 + decay * 0.7;
}

function drawNeuron(n) {
  const opacity = getOpacityForAge(n);
  
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
  ctx.fillStyle = n.color;
  ctx.fill();
  
  // Faded nodes have dotted border
  if (opacity < 0.6) {
    ctx.setLineDash([2, 2]);
  }
  ctx.strokeStyle = adjustAlpha(n.color, 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}
```

### "Memory Pulse" on Update

When new knowledge arrives, visualize it:

```javascript
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  
  if (msg.type === 'graph_update') {
    msg.delta.newNodes.forEach(node => {
      // Find or create neuron
      let neuron = neurons.find(n => n.id === node.id);
      
      if (!neuron) {
        neuron = createNeuron(node);
        neurons.push(neuron);
      }
      
      // Trigger pulse animation
      neuron.pulseEnergy = 1.0;
      neuron.weight = node.displayWeight;
      
      // Propagate energy to connections
      setTimeout(() => {
        neuron.connections.forEach(connId => {
          const connected = neurons.find(n => n.id === connId);
          if (connected) {
            connected.pulseEnergy = 0.5;
          }
        });
      }, 200);
    });
  }
});
```

---

## Emergent Structure

### Domain Clustering

Let the force simulation naturally cluster related entities:

1. **Strong attraction** between entities that co-occur frequently
2. **Weak gravity** toward center keeps graph compact
3. **Repulsion** prevents overlap
4. **Type-based grouping** (optional): entities of same type prefer proximity

Over time, domains emerge:
- Trading cluster (tickers, strategies, tools like `yahoo-finance`)
- Development cluster (projects, languages, deployment tools)
- Personal cluster (Anton, preferences, scheduling)

### Hierarchical Option

Alternative to force-directed: organize by type in concentric rings:

```
         ┌─── Projects ───┐
        ╱                  ╲
   People ──── Core ──── Tools
        ╲                  ╱
         └─── Topics ─────┘
```

Core = most weighted nodes (decisions, MEMORY.md entities)

---

## Implementation Recommendation

### Start: **Option B (Server-Side Knowledge Engine)**

**Why:**
1. Real-time updates are essential for "living" visualization
2. Moderate complexity, achievable in a few days
3. `compromise` NLP is good enough for structured markdown
4. Avoids embedding costs/complexity until proven needed
5. Builds infrastructure that Option C can extend later

**Implementation Path:**

**Phase 1 (Day 1-2):** Knowledge Engine core
- [ ] File watcher with chokidar
- [ ] Entity extraction with compromise + custom patterns
- [ ] In-memory graph store with persistence
- [ ] HTTP API: `/graph`, `/entity/:id`

**Phase 2 (Day 3-4):** Integration
- [ ] Extend state server with WebSocket `/knowledge` endpoint
- [ ] Modify face canvas to consume graph data
- [ ] Force-directed layout implementation
- [ ] Basic rendering (nodes, edges)

**Phase 3 (Day 5):** Polish
- [ ] Hover tooltips
- [ ] Click-to-focus with subgraph
- [ ] Temporal decay + visual aging
- [ ] Pulse animation on updates

**Future (if needed):**
- Upgrade to Option C with embeddings for semantic similarity
- Add natural language queries ("what do I know about trading?")
- Session transcript ingestion

---

## API Design

### WebSocket Messages

```typescript
// Server → Client
interface GraphState {
  type: 'graph_state';
  nodes: Array<{
    id: string;
    label: string;
    type: 'person' | 'project' | 'tool' | 'topic' | 'ticker' | 'decision';
    weight: number;
    displayWeight: number;
    firstSeen: string;  // ISO date
    lastSeen: string;
    connections: string[];  // node ids
  }>;
  edges: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
}

interface GraphUpdate {
  type: 'graph_update';
  delta: {
    newNodes: Node[];
    updatedNodes: Partial<Node>[];
    removedNodes: string[];
    newEdges: Edge[];
  };
}

// Client → Server
interface GetSubgraph {
  type: 'get_subgraph';
  id: string;
  depth: number;
}

interface QueryGraph {
  type: 'query';
  text: string;  // Future: semantic search
}
```

### HTTP Endpoints

```
GET  /graph              → Full graph JSON
GET  /graph/stats        → { nodes: 142, edges: 387, lastUpdate: "..." }
GET  /entity/:id         → Entity details + mentions
POST /graph/refresh      → Force re-extraction from all sources
```

---

## File Structure

```
~/Projects/absalom-face/
├── index.html              # Existing face
├── knowledge.js            # Knowledge graph renderer (new)
├── force-layout.js         # Force simulation (new)
├── server/
│   ├── index.js            # Existing state server
│   ├── knowledge-engine.js # Entity extraction + graph (new)
│   ├── graph-store.js      # Persistence layer (new)
│   └── knowledge.json      # Persisted graph state (new)
└── KNOWLEDGE-VIZ-SPEC.md   # This document
```

---

## Open Questions

1. **Should skills contribute to the graph?** Skills are tools, but their documentation might reveal capabilities. Could be useful for "what can I do?" queries.

2. **Session transcripts:** Currently not structured. Would need a separate ingestion pipeline. Worth it?

3. **Privacy:** Some memories shouldn't visualize (credentials, personal details). Need an exclusion pattern?

4. **Performance:** At what node count does canvas rendering struggle? 500? 1000? May need WebGL for large graphs.

5. **Mobile:** Current face is responsive. Knowledge graph might be too complex for small screens. Simplified view?

---

## Summary

| Option | Effort | Features | Recommendation |
|--------|--------|----------|----------------|
| A: Client-side | 1-2 days | Static, regex-only | Too limited |
| B: Server engine | 3-5 days | Real-time, NLP, temporal | **Start here** |
| C: Embeddings | 7-10 days | Semantic search, clustering | Future upgrade |

The living knowledge visualization transforms Absalom from a face that reacts to a face that **remembers**. Each session leaves traces. Frequently discussed topics grow larger, connections strengthen. Neglected knowledge fades but never fully disappears. Hovering reveals what each node means. Clicking dives deeper.

This isn't just visualization — it's externalized memory made visible.
