#!/usr/bin/env node
/**
 * Knowledge-to-City Mapper
 * 
 * Reads memory files and generates city building specifications
 * based on entities, their frequency, and relationships.
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE || path.join(process.env.HOME, '.openclaw/workspace');
const OUTPUT_PATH = path.join(__dirname, '../data/city-state.json');

// District definitions with keywords for classification
const DISTRICTS = {
  trading: {
    keywords: ['stock', 'trading', 'market', 'options', 'scanner', 'asymmetry', 'ticker', 
               'lunr', 'rdw', 'rklb', 'asts', 'uec', 'ccj', 'smr', 'oklo', 'ionq', 'rgti', 
               'qubt', 'sofi', 'hood', 'ampx', 'ctmx', 'price', 'portfolio', 'holdings',
               'bullish', 'bearish', 'momentum', 'breakout', 'squeeze', 'bounce'],
    position: { x: 25, z: 10 },
    color: '#ffd700'
  },
  infrastructure: {
    keywords: ['server', 'deploy', 'docker', 'tailscale', 'coolify', 'pm2', 'cloudflare',
               'tunnel', 'websocket', 'api', 'nginx', 'linux', 'ssh', 'port', 'daemon',
               'systemd', 'cron', 'node', 'python', 'bash', 'git', 'github'],
    position: { x: -20, z: 15 },
    color: '#ff6b9d'
  },
  projects: {
    keywords: ['project', 'build', 'create', 'app', 'visualization', 'face', 'mind',
               'electron', 'renderer', 'canvas', 'three', 'webgl', 'animation',
               'landing', 'page', 'whop', 'telegram', 'bot', 'skill', 'router'],
    position: { x: 10, z: -25 },
    color: '#9d6bff'
  },
  memory: {
    keywords: ['memory', 'remember', 'decision', 'learned', 'preference', 'soul',
               'identity', 'anton', 'user', 'human', 'session', 'heartbeat',
               'briefing', 'summary', 'note', 'log', 'journal'],
    position: { x: -15, z: -20 },
    color: '#6bff9d'
  },
  core: {
    keywords: ['self', 'absalom', 'core', 'agent', 'assistant', 'ai', 'claude',
               'knowledge', 'graph', 'engine', 'system'],
    position: { x: 0, z: 0 },
    color: '#00ffff'
  }
};

// Entity extraction patterns
const PATTERNS = {
  // Stock tickers (all caps, 2-5 letters)
  tickers: /\b([A-Z]{2,5})\b/g,
  // Projects (capitalized words followed by common project terms)
  projects: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Scanner|Pro|Face|Mind|Engine|Bot|App|CLI|Server)\b/g,
  // Tools/technologies
  tools: /\b(PM2|Docker|Tailscale|Coolify|Cloudflare|Telegram|Discord|GitHub|WebSocket|Node\.js|Python|Three\.js)\b/gi,
  // People (capitalized names)
  people: /\b(Anton|Absalom)\b/g,
  // URLs (as project indicators)
  urls: /https?:\/\/[^\s]+/g,
  // Markdown headers (topics)
  headers: /^#{1,3}\s+(.+)$/gm,
  // Code blocks (tech indicators)
  codeBlocks: /```(\w+)?/g
};

// Known valid tickers (to filter out false positives)
const VALID_TICKERS = new Set([
  'LUNR', 'RDW', 'RKLB', 'ASTS', 'UEC', 'CCJ', 'SMR', 'OKLO',
  'IONQ', 'RGTI', 'QUBT', 'SOFI', 'HOOD', 'AMPX', 'CTMX',
  'SPY', 'QQQ', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN'
]);

// Words to exclude from ticker matching
const TICKER_EXCLUSIONS = new Set([
  'THE', 'AND', 'FOR', 'NOT', 'BUT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS',
  'ONE', 'OUR', 'OUT', 'ARE', 'HAS', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW',
  'NOW', 'OLD', 'SEE', 'WAY', 'WHO', 'BOY', 'DID', 'GET', 'HIM', 'LET',
  'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'DAY', 'HAD', 'MAN', 'API', 'URL',
  'PST', 'UTC', 'AM', 'PM', 'OK', 'ID', 'UI', 'WS', 'MD', 'JS', 'CLI',
  'TTS', 'NLP', 'GPU', 'CPU', 'RAM', 'SSD', 'USB', 'SSH', 'FPS', 'HUD',
  'RGB', 'HSL', 'CSS', 'HTML', 'JSON', 'YAML', 'CORS', 'REST', 'CRUD'
]);

/**
 * Read all memory files from workspace
 */
function readMemoryFiles() {
  const files = [];
  
  // Main files
  const mainFiles = ['MEMORY.md', 'SOUL.md', 'USER.md', 'AGENTS.md', 'TOOLS.md'];
  for (const filename of mainFiles) {
    const filepath = path.join(WORKSPACE, filename);
    if (fs.existsSync(filepath)) {
      try {
        const content = fs.readFileSync(filepath, 'utf8');
        const stat = fs.statSync(filepath);
        files.push({
          name: filename,
          content,
          mtime: stat.mtime.getTime(),
          weight: filename === 'MEMORY.md' ? 3 : filename === 'SOUL.md' ? 5 : 1
        });
      } catch (e) {
        console.warn(`Failed to read ${filename}:`, e.message);
      }
    }
  }
  
  // Memory directory
  const memoryDir = path.join(WORKSPACE, 'memory');
  if (fs.existsSync(memoryDir)) {
    const memoryFiles = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));
    for (const filename of memoryFiles) {
      const filepath = path.join(memoryDir, filename);
      try {
        const content = fs.readFileSync(filepath, 'utf8');
        const stat = fs.statSync(filepath);
        // Recent files get higher weight
        const age = Date.now() - stat.mtime.getTime();
        const dayAge = age / (1000 * 60 * 60 * 24);
        const recencyWeight = Math.max(0.5, 2 - dayAge * 0.2);
        files.push({
          name: `memory/${filename}`,
          content,
          mtime: stat.mtime.getTime(),
          weight: recencyWeight
        });
      } catch (e) {
        // Ignore individual file errors
      }
    }
  }
  
  return files;
}

/**
 * Extract entities from content
 */
function extractEntities(files) {
  const entities = new Map(); // id -> { id, type, label, mentions, sources, district }
  
  for (const file of files) {
    const content = file.content;
    const weight = file.weight;
    
    // Extract tickers
    let match;
    const tickerRegex = /\b([A-Z]{2,5})\b/g;
    while ((match = tickerRegex.exec(content)) !== null) {
      const ticker = match[1];
      if (VALID_TICKERS.has(ticker) || 
          (!TICKER_EXCLUSIONS.has(ticker) && content.includes(`$${ticker}`))) {
        const id = `ticker:${ticker}`;
        if (!entities.has(id)) {
          entities.set(id, {
            id,
            type: 'ticker',
            label: ticker,
            mentions: 0,
            sources: new Set(),
            district: 'trading'
          });
        }
        const e = entities.get(id);
        e.mentions += weight;
        e.sources.add(file.name);
      }
    }
    
    // Extract headers as topics
    const headerRegex = /^#{1,3}\s+(.+)$/gm;
    while ((match = headerRegex.exec(content)) !== null) {
      const header = match[1].trim();
      if (header.length > 2 && header.length < 50) {
        const id = `topic:${header.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        if (!entities.has(id)) {
          const district = classifyToDistrict(header);
          entities.set(id, {
            id,
            type: 'topic',
            label: header,
            mentions: 0,
            sources: new Set(),
            district
          });
        }
        const e = entities.get(id);
        e.mentions += weight * 2; // Headers are important
        e.sources.add(file.name);
      }
    }
    
    // Extract tools/technologies
    const toolsRegex = /\b(PM2|Docker|Tailscale|Coolify|Cloudflare|Telegram|Discord|GitHub|WebSocket|Node\.js|Python|Three\.js|Electron|Vercel|Fly\.io)\b/gi;
    while ((match = toolsRegex.exec(content)) !== null) {
      const tool = match[1];
      const id = `tool:${tool.toLowerCase()}`;
      if (!entities.has(id)) {
        entities.set(id, {
          id,
          type: 'tool',
          label: tool,
          mentions: 0,
          sources: new Set(),
          district: 'infrastructure'
        });
      }
      const e = entities.get(id);
      e.mentions += weight;
      e.sources.add(file.name);
    }
    
    // Extract project names
    const projectPatterns = [
      /Asymmetry\s+Scanner(\s+Pro)?/gi,
      /Absalom\s+Face/gi,
      /Absalom\s+Mind/gi,
      /Absalom\s+City/gi,
      /Knowledge\s+Engine/gi,
      /Skill\s+Router/gi,
      /Living\s+Mind/gi
    ];
    
    for (const pattern of projectPatterns) {
      while ((match = pattern.exec(content)) !== null) {
        const project = match[0].trim();
        const id = `project:${project.toLowerCase().replace(/\s+/g, '-')}`;
        if (!entities.has(id)) {
          entities.set(id, {
            id,
            type: 'project',
            label: project,
            mentions: 0,
            sources: new Set(),
            district: 'projects'
          });
        }
        const e = entities.get(id);
        e.mentions += weight * 1.5;
        e.sources.add(file.name);
      }
    }
    
    // Extract key decisions/concepts from bullet points
    const bulletRegex = /[-*]\s+\*\*([^*]+)\*\*/g;
    while ((match = bulletRegex.exec(content)) !== null) {
      const concept = match[1].trim();
      if (concept.length > 3 && concept.length < 40) {
        const id = `concept:${concept.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        if (!entities.has(id)) {
          const district = classifyToDistrict(concept);
          entities.set(id, {
            id,
            type: 'concept',
            label: concept,
            mentions: 0,
            sources: new Set(),
            district
          });
        }
        const e = entities.get(id);
        e.mentions += weight;
        e.sources.add(file.name);
      }
    }
  }
  
  return entities;
}

/**
 * Classify text to a district based on keywords
 */
function classifyToDistrict(text) {
  const lower = text.toLowerCase();
  
  let bestDistrict = 'memory';
  let bestScore = 0;
  
  for (const [district, config] of Object.entries(DISTRICTS)) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (lower.includes(keyword)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestDistrict = district;
    }
  }
  
  return bestDistrict;
}

/**
 * Generate building positions for entities
 */
function generateBuildings(entities) {
  const buildings = [];
  const districtCounts = {};
  
  // Sort by mentions (most important first)
  const sorted = [...entities.values()].sort((a, b) => b.mentions - a.mentions);
  
  // Limit to top 100 entities
  const top = sorted.slice(0, 100);
  
  for (const entity of top) {
    const district = entity.district;
    const districtConfig = DISTRICTS[district];
    
    // Track how many buildings per district for positioning
    districtCounts[district] = (districtCounts[district] || 0) + 1;
    const index = districtCounts[district];
    
    // Spiral outward from district center
    const angle = (index * 0.618033988749895 * Math.PI * 2); // Golden angle
    const radius = 3 + Math.sqrt(index) * 3;
    
    const x = districtConfig.position.x + Math.cos(angle) * radius;
    const z = districtConfig.position.z + Math.sin(angle) * radius;
    
    // Height based on mention frequency (log scale)
    const height = 5 + Math.log2(entity.mentions + 1) * 5;
    
    // Width based on type
    const typeWidths = { ticker: 2, tool: 3, project: 4, topic: 3, concept: 2.5 };
    const width = typeWidths[entity.type] || 2.5;
    
    buildings.push({
      id: entity.id,
      type: entity.type,
      label: entity.label,
      district,
      x: Math.round(x * 10) / 10,
      z: Math.round(z * 10) / 10,
      height: Math.round(height * 10) / 10,
      width,
      depth: width,
      mentions: entity.mentions,
      sources: [...entity.sources]
    });
  }
  
  return buildings;
}

/**
 * Generate connections between related buildings
 */
function generateConnections(buildings, files) {
  const connections = [];
  const buildingMap = new Map(buildings.map(b => [b.id, b]));
  
  // Connect buildings that appear in the same file
  const fileConnections = new Map();
  
  for (const b of buildings) {
    for (const source of b.sources) {
      if (!fileConnections.has(source)) {
        fileConnections.set(source, []);
      }
      fileConnections.get(source).push(b.id);
    }
  }
  
  const connSet = new Set();
  
  for (const [source, ids] of fileConnections) {
    // Connect entities that share a source file
    for (let i = 0; i < ids.length && i < 5; i++) { // Limit connections per file
      for (let j = i + 1; j < ids.length && j < 5; j++) {
        const key = [ids[i], ids[j]].sort().join('|');
        if (!connSet.has(key)) {
          connSet.add(key);
          connections.push({
            from: ids[i],
            to: ids[j],
            strength: 0.5
          });
        }
      }
    }
  }
  
  // Connect each district to core
  const coreBuilding = buildings.find(b => b.district === 'core');
  if (coreBuilding) {
    const districts = new Set(buildings.map(b => b.district));
    for (const district of districts) {
      if (district === 'core') continue;
      const districtBuilding = buildings.find(b => b.district === district);
      if (districtBuilding) {
        connections.push({
          from: coreBuilding.id,
          to: districtBuilding.id,
          strength: 1.0
        });
      }
    }
  }
  
  return connections;
}

/**
 * Analyze recent context to determine active district
 */
function analyzeActiveDistrict(files) {
  // Look at most recent file
  const sorted = files.sort((a, b) => b.mtime - a.mtime);
  const recent = sorted.slice(0, 3);
  
  const districtScores = {};
  for (const [district, config] of Object.entries(DISTRICTS)) {
    districtScores[district] = 0.3; // Base activity
  }
  
  for (const file of recent) {
    const lower = file.content.toLowerCase();
    for (const [district, config] of Object.entries(DISTRICTS)) {
      for (const keyword of config.keywords) {
        if (lower.includes(keyword)) {
          districtScores[district] += 0.1 * file.weight;
        }
      }
    }
  }
  
  // Normalize
  const max = Math.max(...Object.values(districtScores));
  for (const district of Object.keys(districtScores)) {
    districtScores[district] = Math.min(1, districtScores[district] / max);
  }
  
  // Find most active
  let activeDistrict = 'core';
  let maxScore = 0;
  for (const [district, score] of Object.entries(districtScores)) {
    if (score > maxScore) {
      maxScore = score;
      activeDistrict = district;
    }
  }
  
  return { activeDistrict, districtActivity: districtScores };
}

/**
 * Main execution
 */
function main() {
  console.log('=== Knowledge-to-City Mapper ===');
  console.log(`Workspace: ${WORKSPACE}`);
  console.log('');
  
  // Read files
  console.log('Reading memory files...');
  const files = readMemoryFiles();
  console.log(`  Found ${files.length} files`);
  
  // Extract entities
  console.log('Extracting entities...');
  const entities = extractEntities(files);
  console.log(`  Found ${entities.size} entities`);
  
  // Generate buildings
  console.log('Generating buildings...');
  const buildings = generateBuildings(entities);
  console.log(`  Created ${buildings.length} buildings`);
  
  // Generate connections
  console.log('Generating connections...');
  const connections = generateConnections(buildings, files);
  console.log(`  Created ${connections.length} connections`);
  
  // Analyze activity
  const { activeDistrict, districtActivity } = analyzeActiveDistrict(files);
  console.log(`  Active district: ${activeDistrict}`);
  
  // Build city state
  const cityState = {
    version: Date.now(),
    lastUpdate: Date.now(),
    cognitiveState: 'idle',
    activeDistrict,
    districtActivity,
    buildings,
    connections,
    stats: {
      totalEntities: entities.size,
      buildingCount: buildings.length,
      connectionCount: connections.length,
      fileCount: files.length
    }
  };
  
  // Write output
  console.log(`\nWriting to ${OUTPUT_PATH}...`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cityState, null, 2));
  console.log('Done!');
  
  // Print summary
  console.log('\n=== City Summary ===');
  const districtCounts = {};
  for (const b of buildings) {
    districtCounts[b.district] = (districtCounts[b.district] || 0) + 1;
  }
  for (const [district, count] of Object.entries(districtCounts)) {
    console.log(`  ${district}: ${count} buildings`);
  }
  
  return cityState;
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main, readMemoryFiles, extractEntities, generateBuildings };
