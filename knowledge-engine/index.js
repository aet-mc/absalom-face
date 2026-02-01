/**
 * Knowledge Engine - Main Entry Point
 * Ties together extraction, graph construction, and temporal decay
 */

const { extractEntities, extractByParagraph, getAllNodeIds, normalize } = require('./extractor');
const { KnowledgeGraph, buildGraph, buildGraphFromFiles, mergeGraphs, findKeyNodes } = require('./graph');
const { 
  applyDecay, 
  applyDecayToGraph, 
  getSourceWeight, 
  getHalfLife,
  filterByWeight,
  getTopNodes,
  HALF_LIVES,
  SOURCE_WEIGHTS
} = require('./decay');

/**
 * Full pipeline: markdown -> decayed knowledge graph
 * @param {string} markdown - Raw markdown content
 * @param {string} source - Source file path
 * @param {KnowledgeGraph} [existingGraph] - Optional graph to update
 * @returns {Object} Decayed graph with stats
 */
function processMarkdown(markdown, source, existingGraph = null) {
  // Build/update graph
  const graph = buildGraph(markdown, source, existingGraph);
  
  // Apply decay
  const decayedGraph = applyDecayToGraph(graph.toJSON());
  
  return {
    graph: decayedGraph,
    stats: graph.getStats(),
    keyNodes: findKeyNodes(graph, 10).map(n => applyDecay(n))
  };
}

/**
 * Process multiple files into a single decayed graph
 * @param {Array<{markdown: string, source: string}>} files - Array of file contents
 * @returns {Object} Decayed graph with stats
 */
function processFiles(files) {
  const graph = buildGraphFromFiles(files);
  const decayedGraph = applyDecayToGraph(graph.toJSON());
  
  return {
    graph: decayedGraph,
    stats: graph.getStats(),
    keyNodes: findKeyNodes(graph, 10).map(n => applyDecay(n))
  };
}

// Re-export everything
module.exports = {
  // Main functions
  processMarkdown,
  processFiles,
  
  // Extractor
  extractEntities,
  extractByParagraph,
  getAllNodeIds,
  normalize,
  
  // Graph
  KnowledgeGraph,
  buildGraph,
  buildGraphFromFiles,
  mergeGraphs,
  findKeyNodes,
  
  // Decay
  applyDecay,
  applyDecayToGraph,
  getSourceWeight,
  getHalfLife,
  filterByWeight,
  getTopNodes,
  HALF_LIVES,
  SOURCE_WEIGHTS
};

// ============================================================
// Standalone integration test
// ============================================================
if (require.main === module) {
  console.log('=== Knowledge Engine Integration Test ===\n');

  const testFiles = [
    {
      source: 'SOUL.md',
      markdown: `
# I Am Absalom

My core purpose is to assist Anton with trading, technology, and creative projects.
I use tools like \`yahoo-finance\`, \`dexter\`, and \`grok-search\`.

## Values
- Truthfulness above comfort
- Proactive assistance
`
    },
    {
      source: 'MEMORY.md',
      markdown: `
# Long-term Memory

## Trading
- NVDA has been a strong performer
- Decided to maintain 60/40 allocation

## Projects
Working on Asymmetry Scanner and Absalom Face visualization.
`
    },
    {
      source: 'memory/2026-01-28.md',
      markdown: `
# Daily Notes

Helped Anton analyze TSLA and MSFT positions today.
Used the \`copilot-money\` skill for portfolio tracking.

Discussed Microsoft AI strategy with focus on enterprise.
`
    }
  ];

  console.log(`Processing ${testFiles.length} files...\n`);
  
  const result = processFiles(testFiles);
  
  console.log('--- Graph Stats ---');
  console.log(JSON.stringify(result.stats, null, 2));
  
  console.log('\n--- Key Nodes (with decay) ---');
  for (const node of result.keyNodes.slice(0, 8)) {
    console.log(`  ${node.label} (${node.type})`);
    console.log(`    weight: ${node.weight} → display: ${node.displayWeight.toFixed(2)}`);
    console.log(`    source bonus: ${node.sourceBonus}x`);
  }

  console.log('\n--- Filtered Nodes (weight >= 1.0) ---');
  const filtered = filterByWeight(result.graph.nodes, 1.0);
  console.log(`  ${filtered.length} nodes above threshold`);

  console.log('\n--- Top 5 by Display Weight ---');
  const top5 = getTopNodes(result.graph.nodes, 5);
  for (const node of top5) {
    console.log(`  ${node.label}: ${node.displayWeight.toFixed(2)}`);
  }

  console.log('\n--- Sample Edges ---');
  for (const edge of result.graph.edges.slice(0, 5)) {
    console.log(`  ${edge.source} ↔ ${edge.target} (display: ${edge.displayWeight.toFixed(2)})`);
  }

  console.log('\n=== Integration Test Complete ===');
}
