#!/usr/bin/env node
/**
 * Knowledge Engine - Start Script
 * Runs the WebSocket server with file watching
 */

const fs = require('fs');
const path = require('path');
const { KnowledgeServer } = require('./server');
const { KnowledgeGraph, buildGraph } = require('./graph');
const { applyDecay, getSourceWeight } = require('./decay');

// Try to load watcher, but continue without it if unavailable
let KnowledgeWatcher = null;
try {
  KnowledgeWatcher = require('./watcher').KnowledgeWatcher;
} catch (e) {
  console.warn('Watcher not available:', e.message);
}

const PORT = parseInt(process.env.PORT) || 3847;
const WORKSPACE = process.env.WORKSPACE || path.join(process.env.HOME, '.openclaw/workspace');

console.log('=== Absalom Knowledge Engine ===');
console.log(`Port: ${PORT}`);
console.log(`Workspace: ${WORKSPACE}`);
console.log('');

// Files to watch and process
const MEMORY_FILES = [
  'MEMORY.md',
  'MEMORY_EXTENDED.md',
  'SOUL.md',
  'USER.md',
  'AGENTS.md',
  'TOOLS.md'
];

/**
 * Load and process all memory files
 */
function loadGraph() {
  const graph = new KnowledgeGraph();
  
  for (const filename of MEMORY_FILES) {
    const filepath = path.join(WORKSPACE, filename);
    if (fs.existsSync(filepath)) {
      try {
        const content = fs.readFileSync(filepath, 'utf8');
        buildGraph(content, filename, graph);
        console.log(`  Loaded: ${filename}`);
      } catch (e) {
        console.warn(`  Failed to load ${filename}:`, e.message);
      }
    }
  }
  
  // Also load memory/*.md files
  const memoryDir = path.join(WORKSPACE, 'memory');
  if (fs.existsSync(memoryDir)) {
    const memoryFiles = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));
    for (const filename of memoryFiles) {
      const filepath = path.join(memoryDir, filename);
      try {
        const content = fs.readFileSync(filepath, 'utf8');
        buildGraph(content, `memory/${filename}`, graph);
      } catch (e) {
        // Ignore individual file errors
      }
    }
    console.log(`  Loaded: ${memoryFiles.length} files from memory/`);
  }
  
  // Apply decay and source bonuses
  const now = Date.now();
  for (const node of graph.nodes.values()) {
    const bonus = getSourceWeight([...node.sources][0] || '');
    node.sourceBonus = bonus;
    const decayed = applyDecay(node, now);
    node.displayWeight = decayed.displayWeight * bonus;
  }
  
  for (const edge of graph.edges.values()) {
    edge.displayWeight = edge.weight;
  }
  
  return {
    nodes: [...graph.nodes.values()],
    edges: [...graph.edges.values()]
  };
}

// Create and start server
const server = new KnowledgeServer({ port: PORT, workspace: WORKSPACE });

server.start().then(() => {
  console.log('');
  console.log('Loading knowledge graph...');
  const graph = loadGraph();
  server.setGraph(graph);
  
  console.log('');
  console.log('Knowledge Engine running');
  console.log(`  WebSocket: ws://localhost:${PORT}`);
  console.log(`  HTTP:      http://localhost:${PORT}/graph`);
  console.log(`  Health:    http://localhost:${PORT}/health`);
  console.log(`  Nodes:     ${graph.nodes.length}`);
  console.log(`  Edges:     ${graph.edges.length}`);
  
  // Set up file watcher if available
  if (KnowledgeWatcher) {
    const watcher = new KnowledgeWatcher({ workspace: WORKSPACE });
    watcher.on('change', (files) => {
      console.log(`[Watcher] Files changed: ${files.join(', ')}`);
      const newGraph = loadGraph();
      server.setGraph(newGraph);
    });
    watcher.start();
    console.log('  Watcher:   active');
  } else {
    console.log('  Watcher:   disabled (chokidar not available)');
  }
  
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Interrupted...');
  await server.stop();
  process.exit(0);
});
