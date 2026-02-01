/**
 * Knowledge Engine - Temporal Decay
 * Applies exponential decay to nodes based on age and type
 * Also handles source weighting for different file types
 */

// Half-lives in milliseconds (from spec)
const HALF_LIVES = {
  topic: 30 * 24 * 60 * 60 * 1000,        // 30 days
  person: 60 * 24 * 60 * 60 * 1000,       // 60 days - people remembered longer
  organization: 45 * 24 * 60 * 60 * 1000, // 45 days
  ticker: 7 * 24 * 60 * 60 * 1000,        // 7 days - market data stales fast
  tool: 90 * 24 * 60 * 60 * 1000,         // 90 days - skills persist
  url: 14 * 24 * 60 * 60 * 1000,          // 14 days - links go stale
  header: 30 * 24 * 60 * 60 * 1000,       // 30 days
  decision: 60 * 24 * 60 * 60 * 1000,     // 60 days - decisions are important
  default: 30 * 24 * 60 * 60 * 1000       // 30 days fallback
};

// Source file weights (from spec)
const SOURCE_WEIGHTS = {
  'SOUL.md': 5.0,      // Core identity, always bright
  'MEMORY.md': 3.0,    // Long-term memory, prominent
  'USER.md': 3.0,      // User info, prominent
  'AGENTS.md': 2.0,    // Operating instructions
  'TOOLS.md': 2.0,     // Tool configuration
  'memory/': 1.0,      // Daily notes, standard decay
};

/**
 * Get half-life for a node type
 * @param {string} type - Node type
 * @returns {number} Half-life in milliseconds
 */
function getHalfLife(type) {
  return HALF_LIVES[type] || HALF_LIVES.default;
}

/**
 * Get weight multiplier for a source file
 * @param {string} filepath - Source file path
 * @returns {number} Weight multiplier
 */
function getSourceWeight(filepath) {
  if (!filepath) return 1.0;
  
  // Check patterns in order of specificity
  for (const [pattern, weight] of Object.entries(SOURCE_WEIGHTS)) {
    if (filepath.includes(pattern)) {
      return weight;
    }
  }
  return 1.0;
}

/**
 * Calculate decay factor for a given age
 * Uses exponential decay: 0.5^(age/halfLife)
 * @param {number} age - Age in milliseconds
 * @param {number} halfLife - Half-life in milliseconds
 * @returns {number} Decay factor (0-1)
 */
function calculateDecayFactor(age, halfLife) {
  if (age <= 0) return 1.0;
  if (halfLife <= 0) return 0;
  return Math.pow(0.5, age / halfLife);
}

/**
 * Apply temporal decay to a single node
 * @param {Object} node - Graph node
 * @param {number} [now] - Current timestamp (default: Date.now())
 * @returns {Object} Node with displayWeight added
 */
function applyDecay(node, now = Date.now()) {
  const halfLife = getHalfLife(node.type);
  const age = now - node.lastSeen;
  const decayFactor = calculateDecayFactor(age, halfLife);
  
  // Calculate source weight bonus (max of all sources)
  let sourceBonus = 1.0;
  const sources = Array.isArray(node.sources) ? node.sources : [...(node.sources || [])];
  for (const source of sources) {
    sourceBonus = Math.max(sourceBonus, getSourceWeight(source));
  }
  
  // Final display weight = base weight * decay * source bonus
  const displayWeight = node.weight * decayFactor * sourceBonus;
  
  return {
    ...node,
    sources: sources, // Ensure array for serialization
    displayWeight,
    decayFactor,
    sourceBonus,
    age
  };
}

/**
 * Apply decay to all nodes in a graph
 * @param {Object} graph - Graph with nodes array
 * @param {number} [now] - Current timestamp
 * @returns {Object} Graph with decayed nodes
 */
function applyDecayToGraph(graph, now = Date.now()) {
  const decayedNodes = graph.nodes.map(node => applyDecay(node, now));
  
  // Also decay edges based on lastSeen
  const decayedEdges = graph.edges.map(edge => {
    const age = now - edge.lastSeen;
    const decayFactor = calculateDecayFactor(age, HALF_LIVES.default);
    return {
      ...edge,
      displayWeight: edge.weight * decayFactor,
      decayFactor,
      age
    };
  });
  
  return {
    ...graph,
    nodes: decayedNodes,
    edges: decayedEdges,
    decayedAt: now
  };
}

/**
 * Filter nodes below a weight threshold
 * @param {Array} nodes - Array of nodes (with displayWeight)
 * @param {number} threshold - Minimum displayWeight to keep
 * @returns {Array} Filtered nodes
 */
function filterByWeight(nodes, threshold = 0.1) {
  return nodes.filter(node => 
    (node.displayWeight || node.weight) >= threshold
  );
}

/**
 * Get nodes sorted by display weight (highest first)
 * @param {Array} nodes - Array of nodes (with displayWeight)
 * @param {number} [limit] - Max nodes to return
 * @returns {Array} Sorted nodes
 */
function getTopNodes(nodes, limit = null) {
  const sorted = [...nodes].sort((a, b) => 
    (b.displayWeight || b.weight) - (a.displayWeight || a.weight)
  );
  return limit ? sorted.slice(0, limit) : sorted;
}

/**
 * Calculate freshness score (inverse of decay)
 * Returns 1.0 for brand new, approaching 0 for very old
 * @param {number} lastSeen - Timestamp
 * @param {string} type - Node type
 * @param {number} [now] - Current timestamp
 * @returns {number} Freshness score (0-1)
 */
function getFreshness(lastSeen, type, now = Date.now()) {
  const age = now - lastSeen;
  const halfLife = getHalfLife(type);
  return calculateDecayFactor(age, halfLife);
}

/**
 * Estimate when a node will fall below a threshold
 * @param {Object} node - Node with displayWeight
 * @param {number} threshold - Target weight
 * @returns {number|null} Timestamp when threshold reached, or null if already below
 */
function estimateDecayTime(node, threshold = 0.1) {
  const currentWeight = node.displayWeight || node.weight;
  if (currentWeight <= threshold) return null;
  
  const halfLife = getHalfLife(node.type);
  // Solve: threshold = currentWeight * 0.5^(t/halfLife)
  // t = halfLife * log2(currentWeight / threshold)
  const decaysNeeded = Math.log2(currentWeight / threshold);
  const timeRemaining = decaysNeeded * halfLife;
  
  return Date.now() + timeRemaining;
}

/**
 * Group nodes by decay urgency
 * @param {Array} nodes - Array of nodes with displayWeight
 * @returns {Object} Groups: { fading, stable, strong }
 */
function groupByDecay(nodes) {
  const groups = {
    fading: [],   // displayWeight < 0.3
    stable: [],   // displayWeight 0.3 - 0.7
    strong: []    // displayWeight > 0.7
  };
  
  for (const node of nodes) {
    const weight = node.displayWeight || node.weight;
    if (weight < 0.3) {
      groups.fading.push(node);
    } else if (weight < 0.7) {
      groups.stable.push(node);
    } else {
      groups.strong.push(node);
    }
  }
  
  return groups;
}

/**
 * Create decay configuration for custom use
 * @param {Object} customHalfLives - Override half-lives by type
 * @param {Object} customSourceWeights - Override source weights
 * @returns {Object} Decay functions with custom config
 */
function createDecayConfig(customHalfLives = {}, customSourceWeights = {}) {
  const halfLives = { ...HALF_LIVES, ...customHalfLives };
  const sourceWeights = { ...SOURCE_WEIGHTS, ...customSourceWeights };
  
  return {
    getHalfLife: (type) => halfLives[type] || halfLives.default,
    getSourceWeight: (filepath) => {
      for (const [pattern, weight] of Object.entries(sourceWeights)) {
        if (filepath && filepath.includes(pattern)) return weight;
      }
      return 1.0;
    },
    applyDecay: (node, now = Date.now()) => {
      const hl = halfLives[node.type] || halfLives.default;
      const age = now - node.lastSeen;
      const decayFactor = calculateDecayFactor(age, hl);
      
      let sourceBonus = 1.0;
      const sources = Array.isArray(node.sources) ? node.sources : [...(node.sources || [])];
      for (const source of sources) {
        for (const [pattern, weight] of Object.entries(sourceWeights)) {
          if (source && source.includes(pattern)) {
            sourceBonus = Math.max(sourceBonus, weight);
          }
        }
      }
      
      return {
        ...node,
        sources,
        displayWeight: node.weight * decayFactor * sourceBonus,
        decayFactor,
        sourceBonus,
        age
      };
    }
  };
}

// Exports
module.exports = {
  HALF_LIVES,
  SOURCE_WEIGHTS,
  getHalfLife,
  getSourceWeight,
  calculateDecayFactor,
  applyDecay,
  applyDecayToGraph,
  filterByWeight,
  getTopNodes,
  getFreshness,
  estimateDecayTime,
  groupByDecay,
  createDecayConfig
};

// ============================================================
// Standalone test
// ============================================================
if (require.main === module) {
  console.log('=== Knowledge Engine Decay Test ===\n');

  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();

  console.log('--- Half-lives ---');
  for (const [type, hl] of Object.entries(HALF_LIVES)) {
    console.log(`  ${type}: ${Math.round(hl / DAY)} days`);
  }

  console.log('\n--- Source Weights ---');
  for (const [pattern, weight] of Object.entries(SOURCE_WEIGHTS)) {
    console.log(`  ${pattern}: ${weight}x`);
  }

  console.log('\n--- Decay Factor Tests ---');
  const testAges = [0, 1, 7, 14, 30, 60, 90];
  const halfLife30 = 30 * DAY;
  console.log('  30-day half-life:');
  for (const days of testAges) {
    const factor = calculateDecayFactor(days * DAY, halfLife30);
    console.log(`    ${days} days old: ${(factor * 100).toFixed(1)}% retained`);
  }

  console.log('\n--- Node Decay Test ---');
  const testNodes = [
    {
      id: 'person:anton',
      label: 'Anton',
      type: 'person',
      weight: 10,
      lastSeen: now - 30 * DAY,
      sources: ['SOUL.md', 'memory/2026-01-01.md']
    },
    {
      id: 'ticker:nvda',
      label: 'NVDA',
      type: 'ticker',
      weight: 5,
      lastSeen: now - 7 * DAY,
      sources: ['memory/2026-01-20.md']
    },
    {
      id: 'tool:yahoo-finance',
      label: 'yahoo-finance',
      type: 'tool',
      weight: 3,
      lastSeen: now - 60 * DAY,
      sources: ['TOOLS.md']
    },
    {
      id: 'decision:increase_nvda',
      label: 'Increase NVDA allocation',
      type: 'decision',
      weight: 2,
      lastSeen: now - 14 * DAY,
      sources: ['MEMORY.md']
    }
  ];

  for (const node of testNodes) {
    const decayed = applyDecay(node, now);
    console.log(`\n  ${node.label} (${node.type}):`);
    console.log(`    Base weight: ${node.weight}`);
    console.log(`    Age: ${Math.round(decayed.age / DAY)} days`);
    console.log(`    Decay factor: ${(decayed.decayFactor * 100).toFixed(1)}%`);
    console.log(`    Source bonus: ${decayed.sourceBonus}x`);
    console.log(`    Display weight: ${decayed.displayWeight.toFixed(2)}`);
    
    const decayTime = estimateDecayTime(decayed, 0.1);
    if (decayTime) {
      const daysUntil = Math.round((decayTime - now) / DAY);
      console.log(`    Falls below 0.1 in: ~${daysUntil} days`);
    }
  }

  console.log('\n--- Graph Decay Test ---');
  const testGraph = {
    nodes: testNodes,
    edges: [
      { id: 'e1', source: 'person:anton', target: 'ticker:nvda', weight: 3, lastSeen: now - 10 * DAY },
      { id: 'e2', source: 'ticker:nvda', target: 'tool:yahoo-finance', weight: 2, lastSeen: now - 20 * DAY }
    ]
  };

  const decayedGraph = applyDecayToGraph(testGraph, now);
  console.log(`  Decayed ${decayedGraph.nodes.length} nodes`);
  console.log(`  Decayed ${decayedGraph.edges.length} edges`);

  console.log('\n--- Top Nodes by Display Weight ---');
  const top = getTopNodes(decayedGraph.nodes, 3);
  for (const node of top) {
    console.log(`  ${node.label}: ${node.displayWeight.toFixed(2)}`);
  }

  console.log('\n--- Decay Groups ---');
  const groups = groupByDecay(decayedGraph.nodes);
  console.log(`  Strong (>0.7): ${groups.strong.length} nodes`);
  console.log(`  Stable (0.3-0.7): ${groups.stable.length} nodes`);
  console.log(`  Fading (<0.3): ${groups.fading.length} nodes`);

  console.log('\n--- Filtered Nodes (threshold=0.5) ---');
  const filtered = filterByWeight(decayedGraph.nodes, 0.5);
  console.log(`  Kept ${filtered.length} of ${decayedGraph.nodes.length} nodes`);

  console.log('\n--- Custom Config Test ---');
  const customDecay = createDecayConfig(
    { ticker: 3 * DAY },  // Faster ticker decay
    { 'PROJECT.md': 4.0 } // Custom source weight
  );
  console.log(`  Custom ticker half-life: ${customDecay.getHalfLife('ticker') / DAY} days`);
  console.log(`  Custom PROJECT.md weight: ${customDecay.getSourceWeight('PROJECT.md')}x`);

  console.log('\n=== Test Complete ===');
}
