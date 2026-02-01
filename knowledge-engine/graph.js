/**
 * Knowledge Engine - Graph Construction
 * Builds a weighted graph from extracted entities with co-occurrence edges
 */

const { extractByParagraph, getAllNodeIds, normalize } = require('./extractor');

/**
 * Node in the knowledge graph
 * @typedef {Object} GraphNode
 * @property {string} id - Unique identifier (type:normalized_label)
 * @property {string} label - Original label
 * @property {string} type - Entity type (topic, person, tool, etc.)
 * @property {number} weight - Occurrence count
 * @property {number} firstSeen - Timestamp of first occurrence
 * @property {number} lastSeen - Timestamp of most recent occurrence
 * @property {Set<string>|Array<string>} sources - Files where this entity appears
 */

/**
 * Edge in the knowledge graph
 * @typedef {Object} GraphEdge
 * @property {string} id - Unique identifier (source↔target, sorted)
 * @property {string} source - Source node ID
 * @property {string} target - Target node ID
 * @property {number} weight - Co-occurrence count
 * @property {number} lastSeen - Timestamp of most recent co-occurrence
 */

/**
 * Knowledge graph container
 */
class KnowledgeGraph {
  constructor() {
    /** @type {Map<string, GraphNode>} */
    this.nodes = new Map();
    /** @type {Map<string, GraphEdge>} */
    this.edges = new Map();
    this.lastUpdated = Date.now();
  }

  /**
   * Add or update a node
   * @param {string} id - Node ID
   * @param {string} label - Display label
   * @param {string} type - Entity type
   * @param {string} source - Source file
   * @returns {GraphNode} The node
   */
  addNode(id, label, type, source) {
    const now = Date.now();
    
    if (this.nodes.has(id)) {
      const node = this.nodes.get(id);
      node.weight++;
      node.lastSeen = now;
      node.sources.add(source);
      return node;
    }

    const node = {
      id,
      label,
      type,
      weight: 1,
      firstSeen: now,
      lastSeen: now,
      sources: new Set([source])
    };
    
    this.nodes.set(id, node);
    return node;
  }

  /**
   * Add or update an edge
   * @param {string} sourceId - Source node ID
   * @param {string} targetId - Target node ID
   * @returns {GraphEdge} The edge
   */
  addEdge(sourceId, targetId) {
    // Consistent edge ID (sorted)
    const edgeId = [sourceId, targetId].sort().join('↔');
    const now = Date.now();
    
    if (this.edges.has(edgeId)) {
      const edge = this.edges.get(edgeId);
      edge.weight++;
      edge.lastSeen = now;
      return edge;
    }

    const edge = {
      id: edgeId,
      source: sourceId,
      target: targetId,
      weight: 1,
      lastSeen: now
    };
    
    this.edges.set(edgeId, edge);
    return edge;
  }

  /**
   * Get node by ID
   * @param {string} id - Node ID
   * @returns {GraphNode|undefined}
   */
  getNode(id) {
    return this.nodes.get(id);
  }

  /**
   * Get all nodes as array (with sources as array for serialization)
   * @returns {Array<GraphNode>}
   */
  getNodes() {
    return [...this.nodes.values()].map(node => ({
      ...node,
      sources: [...node.sources]
    }));
  }

  /**
   * Get all edges as array
   * @returns {Array<GraphEdge>}
   */
  getEdges() {
    return [...this.edges.values()];
  }

  /**
   * Get edges connected to a node
   * @param {string} nodeId - Node ID
   * @returns {Array<GraphEdge>}
   */
  getNodeEdges(nodeId) {
    return this.getEdges().filter(
      e => e.source === nodeId || e.target === nodeId
    );
  }

  /**
   * Get neighbor nodes
   * @param {string} nodeId - Node ID
   * @returns {Array<GraphNode>}
   */
  getNeighbors(nodeId) {
    const neighborIds = new Set();
    
    for (const edge of this.edges.values()) {
      if (edge.source === nodeId) neighborIds.add(edge.target);
      if (edge.target === nodeId) neighborIds.add(edge.source);
    }
    
    return [...neighborIds]
      .map(id => this.nodes.get(id))
      .filter(Boolean);
  }

  /**
   * Export graph for serialization
   * @returns {Object}
   */
  toJSON() {
    return {
      nodes: this.getNodes(),
      edges: this.getEdges(),
      lastUpdated: this.lastUpdated,
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size
    };
  }

  /**
   * Import graph from serialized data
   * @param {Object} data - Serialized graph
   */
  fromJSON(data) {
    this.nodes.clear();
    this.edges.clear();
    
    for (const node of data.nodes || []) {
      this.nodes.set(node.id, {
        ...node,
        sources: new Set(node.sources || [])
      });
    }
    
    for (const edge of data.edges || []) {
      this.edges.set(edge.id, edge);
    }
    
    this.lastUpdated = data.lastUpdated || Date.now();
  }

  /**
   * Get graph statistics
   * @returns {Object}
   */
  getStats() {
    const typeCount = {};
    for (const node of this.nodes.values()) {
      typeCount[node.type] = (typeCount[node.type] || 0) + 1;
    }

    const totalWeight = [...this.nodes.values()].reduce((sum, n) => sum + n.weight, 0);
    const totalEdgeWeight = [...this.edges.values()].reduce((sum, e) => sum + e.weight, 0);

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      typeCount,
      totalWeight,
      totalEdgeWeight,
      avgNodeWeight: this.nodes.size > 0 ? totalWeight / this.nodes.size : 0,
      avgEdgeWeight: this.edges.size > 0 ? totalEdgeWeight / this.edges.size : 0
    };
  }
}

/**
 * Build graph from markdown content
 * @param {string} markdown - Raw markdown
 * @param {string} source - Source file path
 * @param {KnowledgeGraph} [existingGraph] - Graph to update (or create new)
 * @returns {KnowledgeGraph}
 */
function buildGraph(markdown, source, existingGraph = null) {
  const graph = existingGraph || new KnowledgeGraph();
  
  // Extract entities by paragraph for co-occurrence
  const paragraphs = extractByParagraph(markdown, source);
  
  const typeMap = {
    topics: 'topic',
    people: 'person',
    organizations: 'organization',
    tickers: 'ticker',
    tools: 'tool',
    urls: 'url',
    headers: 'header',
    decisions: 'decision'
  };

  for (const para of paragraphs) {
    const entities = para.entities;
    const nodeIds = [];

    // Add nodes for all entities in this paragraph
    for (const [plural, singular] of Object.entries(typeMap)) {
      const items = entities[plural] || [];
      for (const item of items) {
        const id = `${singular}:${normalize(item)}`;
        graph.addNode(id, item, singular, source);
        nodeIds.push(id);
      }
    }

    // Create edges for all co-occurring entities in the paragraph
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        graph.addEdge(nodeIds[i], nodeIds[j]);
      }
    }
  }

  graph.lastUpdated = Date.now();
  return graph;
}

/**
 * Build graph from multiple files
 * @param {Array<{markdown: string, source: string}>} files - Array of file contents
 * @returns {KnowledgeGraph}
 */
function buildGraphFromFiles(files) {
  const graph = new KnowledgeGraph();
  
  for (const file of files) {
    buildGraph(file.markdown, file.source, graph);
  }
  
  return graph;
}

/**
 * Merge two graphs
 * @param {KnowledgeGraph} graph1 - First graph
 * @param {KnowledgeGraph} graph2 - Second graph
 * @returns {KnowledgeGraph} Merged graph
 */
function mergeGraphs(graph1, graph2) {
  const merged = new KnowledgeGraph();
  merged.fromJSON(graph1.toJSON());
  
  // Merge nodes from graph2
  for (const node of graph2.nodes.values()) {
    if (merged.nodes.has(node.id)) {
      const existing = merged.nodes.get(node.id);
      existing.weight += node.weight;
      existing.lastSeen = Math.max(existing.lastSeen, node.lastSeen);
      existing.firstSeen = Math.min(existing.firstSeen, node.firstSeen);
      for (const src of node.sources) {
        existing.sources.add(src);
      }
    } else {
      merged.nodes.set(node.id, {
        ...node,
        sources: new Set(node.sources)
      });
    }
  }
  
  // Merge edges from graph2
  for (const edge of graph2.edges.values()) {
    if (merged.edges.has(edge.id)) {
      const existing = merged.edges.get(edge.id);
      existing.weight += edge.weight;
      existing.lastSeen = Math.max(existing.lastSeen, edge.lastSeen);
    } else {
      merged.edges.set(edge.id, { ...edge });
    }
  }
  
  merged.lastUpdated = Date.now();
  return merged;
}

/**
 * Find strongly connected nodes (high weight, many edges)
 * @param {KnowledgeGraph} graph - The graph
 * @param {number} [limit=10] - Number of nodes to return
 * @returns {Array<GraphNode>}
 */
function findKeyNodes(graph, limit = 10) {
  const nodes = graph.getNodes();
  
  // Score = weight * sqrt(edge_count)
  const scored = nodes.map(node => {
    const edgeCount = graph.getNodeEdges(node.id).length;
    return {
      node,
      score: node.weight * Math.sqrt(edgeCount + 1)
    };
  });
  
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.node);
}

// Exports
module.exports = {
  KnowledgeGraph,
  buildGraph,
  buildGraphFromFiles,
  mergeGraphs,
  findKeyNodes
};

// ============================================================
// Standalone test
// ============================================================
if (require.main === module) {
  console.log('=== Knowledge Engine Graph Test ===\n');

  const testMarkdown1 = `
# Project Update

Working on the Asymmetry Scanner with Anton today. 
Used \`yahoo-finance\` and \`dexter\` for data.

Analyzed NVDA and TSLA positions. Microsoft looking interesting.

## Next Steps

- [x] Decided to increase NVDA allocation
- [ ] Research quantum computing
`;

  const testMarkdown2 = `
# Trading Notes

Anton reviewed the portfolio. NVDA still strong.
The \`copilot-money\` tool shows good returns.

Discussed Google's AI announcements with the team.
`;

  console.log('Building graph from two test documents...\n');

  // Build from first document
  let graph = buildGraph(testMarkdown1, 'memory/2026-01-15.md');
  console.log('After first document:');
  console.log('  Nodes:', graph.nodes.size);
  console.log('  Edges:', graph.edges.size);

  // Add second document
  buildGraph(testMarkdown2, 'memory/2026-01-16.md', graph);
  console.log('\nAfter second document:');
  console.log('  Nodes:', graph.nodes.size);
  console.log('  Edges:', graph.edges.size);

  console.log('\n--- Graph Statistics ---');
  const stats = graph.getStats();
  console.log(JSON.stringify(stats, null, 2));

  console.log('\n--- Sample Nodes ---');
  const nodes = graph.getNodes().slice(0, 5);
  for (const node of nodes) {
    console.log(`  ${node.id}:`);
    console.log(`    label: "${node.label}", type: ${node.type}, weight: ${node.weight}`);
    console.log(`    sources: ${node.sources.join(', ')}`);
  }

  console.log('\n--- Sample Edges ---');
  const edges = graph.getEdges().slice(0, 5);
  for (const edge of edges) {
    console.log(`  ${edge.source} ↔ ${edge.target} (weight: ${edge.weight})`);
  }

  console.log('\n--- Key Nodes ---');
  const keyNodes = findKeyNodes(graph, 5);
  for (const node of keyNodes) {
    const edgeCount = graph.getNodeEdges(node.id).length;
    console.log(`  ${node.label} (${node.type}): weight=${node.weight}, edges=${edgeCount}`);
  }

  console.log('\n--- Neighbors of "person:anton" ---');
  const neighbors = graph.getNeighbors('person:anton');
  console.log(`  Found ${neighbors.length} neighbors:`);
  for (const n of neighbors.slice(0, 5)) {
    console.log(`    - ${n.label} (${n.type})`);
  }

  console.log('\n--- Serialization Test ---');
  const json = graph.toJSON();
  console.log(`  Serialized: ${JSON.stringify(json).length} bytes`);
  
  const restored = new KnowledgeGraph();
  restored.fromJSON(json);
  console.log(`  Restored: ${restored.nodes.size} nodes, ${restored.edges.size} edges`);

  console.log('\n=== Test Complete ===');
}
