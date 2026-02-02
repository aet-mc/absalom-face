#!/usr/bin/env node
/**
 * Knowledge-to-City Mapper v2.0
 * Brain-Optimized Layout Algorithm
 * 
 * Generates city layout like an optimized brain:
 * - Most-used concepts closest to core
 * - Heavily connected concepts cluster together
 * - Growth areas have room to expand
 * - Critical systems (memory, cognition) are prominent/fortified
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
               'bullish', 'bearish', 'momentum', 'breakout', 'squeeze', 'bounce', 'kelly',
               'position', 'stop', 'target', 'entry', 'exit', 'pulse', 'dexter'],
    basePosition: { x: 45, z: 20 },
    color: '#ffd700',
    importance: 1.2  // Trading is critical
  },
  infrastructure: {
    keywords: ['server', 'deploy', 'docker', 'tailscale', 'coolify', 'pm2', 'cloudflare',
               'tunnel', 'websocket', 'api', 'nginx', 'linux', 'ssh', 'port', 'daemon',
               'systemd', 'cron', 'node', 'python', 'bash', 'git', 'github', 'vercel'],
    basePosition: { x: -40, z: 30 },
    color: '#ff6b9d',
    importance: 0.9
  },
  projects: {
    keywords: ['project', 'build', 'create', 'app', 'visualization', 'face', 'mind',
               'electron', 'renderer', 'canvas', 'three', 'webgl', 'animation',
               'landing', 'page', 'whop', 'telegram', 'bot', 'skill', 'router', 'city'],
    basePosition: { x: 20, z: -45 },
    color: '#9d6bff',
    importance: 1.0
  },
  memory: {
    keywords: ['memory', 'remember', 'decision', 'learned', 'preference', 'soul',
               'identity', 'anton', 'user', 'human', 'session', 'heartbeat',
               'briefing', 'summary', 'note', 'log', 'journal', 'continuity'],
    basePosition: { x: -30, z: -40 },
    color: '#6bff9d',
    importance: 1.3  // Memory is critical for continuity
  },
  core: {
    keywords: ['self', 'absalom', 'core', 'agent', 'assistant', 'ai', 'claude',
               'knowledge', 'graph', 'engine', 'system', 'opus', 'sonnet'],
    basePosition: { x: 0, z: 0 },
    color: '#00ffff',
    importance: 1.5  // Core is most important
  }
};

// Source file weights (SOUL.md concepts are identity = tallest)
const SOURCE_WEIGHTS = {
  'SOUL.md': 5.0,      // Identity - tallest buildings
  'MEMORY.md': 3.0,    // Long-term memory - very important
  'USER.md': 2.0,      // User context
  'AGENTS.md': 1.5,    // Operational patterns
  'TOOLS.md': 1.0      // Tool notes
};

// Recency decay: buildings from recent files get height boost
const RECENCY_HALF_LIFE_DAYS = 7;

/**
 * Read all memory files from workspace
 */
function readMemoryFiles() {
  const files = [];
  const now = Date.now();
  
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
          sourceWeight: SOURCE_WEIGHTS[filename] || 1
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
        // Recency weight: exponential decay with half-life
        const ageMs = now - stat.mtime.getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        const recencyMultiplier = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
        files.push({
          name: `memory/${filename}`,
          content,
          mtime: stat.mtime.getTime(),
          sourceWeight: 1.5 * (0.5 + recencyMultiplier)  // 0.75 to 1.5 based on recency
        });
      } catch (e) {
        // Ignore individual file errors
      }
    }
  }
  
  return files;
}

/**
 * Split content into paragraphs/sections for co-occurrence analysis
 */
function splitIntoParagraphs(content) {
  // Split by double newlines or headers
  return content.split(/\n\n+|^#{1,3}\s+/m)
    .map(p => p.trim())
    .filter(p => p.length > 20);
}

/**
 * Extract entities and build co-occurrence matrix
 */
function extractEntitiesWithCooccurrence(files) {
  const entities = new Map(); // id -> { id, type, label, frequency, recencyScore, sourceScore, sources, district }
  const cooccurrence = new Map(); // "id1|id2" -> count
  
  // Known valid tickers
  const VALID_TICKERS = new Set([
    'LUNR', 'RDW', 'RKLB', 'ASTS', 'UEC', 'CCJ', 'SMR', 'OKLO',
    'IONQ', 'RGTI', 'QUBT', 'SOFI', 'HOOD', 'AMPX', 'CTMX',
    'SPY', 'QQQ', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN',
    'BHF', 'BRZE', 'PLAY', 'BKD', 'IWM', 'VIX'
  ]);
  
  const TICKER_EXCLUSIONS = new Set([
    'THE', 'AND', 'FOR', 'NOT', 'BUT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS',
    'ONE', 'OUR', 'OUT', 'ARE', 'HAS', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW',
    'NOW', 'OLD', 'SEE', 'WAY', 'WHO', 'BOY', 'DID', 'GET', 'HIM', 'LET',
    'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'DAY', 'HAD', 'MAN', 'API', 'URL',
    'PST', 'UTC', 'AM', 'PM', 'OK', 'ID', 'UI', 'WS', 'MD', 'JS', 'CLI',
    'TTS', 'NLP', 'GPU', 'CPU', 'RAM', 'SSD', 'USB', 'SSH', 'FPS', 'HUD',
    'RGB', 'HSL', 'CSS', 'HTML', 'JSON', 'YAML', 'CORS', 'REST', 'CRUD',
    'EOD', 'ATR', 'OBV', 'TTM', 'VCP', 'IPO'
  ]);
  
  function addEntity(id, type, label, sourceWeight, recencyMult, sourceName, district) {
    if (!entities.has(id)) {
      entities.set(id, {
        id, type, label,
        frequency: 0,
        recencyScore: 0,
        sourceScore: 0,
        sources: new Set(),
        district
      });
    }
    const e = entities.get(id);
    e.frequency += 1;
    e.recencyScore = Math.max(e.recencyScore, recencyMult);
    e.sourceScore = Math.max(e.sourceScore, sourceWeight);
    e.sources.add(sourceName);
    return id;
  }
  
  function addCooccurrence(id1, id2) {
    if (id1 === id2) return;
    const key = [id1, id2].sort().join('|');
    cooccurrence.set(key, (cooccurrence.get(key) || 0) + 1);
  }
  
  for (const file of files) {
    const paragraphs = splitIntoParagraphs(file.content);
    const sourceWeight = file.sourceWeight;
    const ageMs = Date.now() - file.mtime;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyMult = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
    
    for (const para of paragraphs) {
      const paraEntities = []; // Track entities in this paragraph for co-occurrence
      
      // Extract tickers
      const tickerRegex = /\b([A-Z]{2,5})\b/g;
      let match;
      while ((match = tickerRegex.exec(para)) !== null) {
        const ticker = match[1];
        if (VALID_TICKERS.has(ticker) || 
            (!TICKER_EXCLUSIONS.has(ticker) && file.content.includes(`$${ticker}`))) {
          const id = addEntity(`ticker:${ticker}`, 'ticker', ticker, sourceWeight, recencyMult, file.name, 'trading');
          paraEntities.push(id);
        }
      }
      
      // Extract tools/technologies
      const toolsRegex = /\b(PM2|Docker|Tailscale|Coolify|Cloudflare|Telegram|Discord|GitHub|WebSocket|Node\.js|Python|Three\.js|Electron|Vercel|Fly\.io|Kelly|Dexter|Opus|Sonnet)\b/gi;
      while ((match = toolsRegex.exec(para)) !== null) {
        const tool = match[1];
        const district = ['Opus', 'Sonnet', 'Kelly', 'Dexter'].includes(tool) ? 'core' : 'infrastructure';
        const id = addEntity(`tool:${tool.toLowerCase()}`, 'tool', tool, sourceWeight, recencyMult, file.name, district);
        paraEntities.push(id);
      }
      
      // Extract project names
      const projectPatterns = [
        /Asymmetry\s+Scanner(\s+Pro)?/gi,
        /Absalom\s+Face/gi,
        /Absalom\s+Mind/gi,
        /Absalom\s+City/gi,
        /Knowledge\s+Engine/gi,
        /Skill\s+Router/gi,
        /Living\s+Mind/gi,
        /Market\s+Pulse/gi
      ];
      
      for (const pattern of projectPatterns) {
        pattern.lastIndex = 0;
        while ((match = pattern.exec(para)) !== null) {
          const project = match[0].trim();
          const id = addEntity(`project:${project.toLowerCase().replace(/\s+/g, '-')}`, 'project', project, sourceWeight * 1.5, recencyMult, file.name, 'projects');
          paraEntities.push(id);
        }
      }
      
      // Extract key concepts from headers and bold text
      const conceptPatterns = [
        /^#{1,3}\s+(.{3,40})$/gm,           // Headers
        /\*\*([^*]{3,30})\*\*/g,            // Bold text
      ];
      
      for (const pattern of conceptPatterns) {
        pattern.lastIndex = 0;
        while ((match = pattern.exec(para)) !== null) {
          const concept = match[1].trim();
          if (concept.length > 2 && concept.length < 40 && !/^[#\-\*]/.test(concept)) {
            const district = classifyToDistrict(concept);
            const id = addEntity(`concept:${concept.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, 'concept', concept, sourceWeight * 0.8, recencyMult, file.name, district);
            paraEntities.push(id);
          }
        }
      }
      
      // Build co-occurrence from paragraph entities
      for (let i = 0; i < paraEntities.length; i++) {
        for (let j = i + 1; j < paraEntities.length; j++) {
          addCooccurrence(paraEntities[i], paraEntities[j]);
        }
      }
    }
  }
  
  return { entities, cooccurrence };
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
 * Calculate importance score: frequency × recency × source_weight
 */
function calculateImportance(entity) {
  return entity.frequency * (0.5 + entity.recencyScore) * entity.sourceScore;
}

/**
 * Force-directed layout simulation for clustering connected concepts
 */
function forceDirectedLayout(entities, cooccurrence, iterations = 100) {
  const positions = new Map();
  const entitiesArray = [...entities.values()];
  
  // Calculate global importance for core distance
  const importances = entitiesArray.map(e => calculateImportance(e));
  const maxImportance = Math.max(...importances, 1);
  
  // City bounds
  const BOUNDS = 80; // Max distance from origin
  
  // Initialize positions based on district + importance (more important = closer to center)
  for (const entity of entitiesArray) {
    const district = DISTRICTS[entity.district] || DISTRICTS.memory;
    const importance = calculateImportance(entity);
    const normalizedImportance = importance / maxImportance;
    
    // Distance from core: high importance = close, low = far
    // Exponential decay: top entities very close, rest spread out
    const coreDistance = 10 + (1 - Math.pow(normalizedImportance, 0.4)) * 45;
    
    // Angle toward district center with jitter
    const districtAngle = Math.atan2(district.basePosition.z, district.basePosition.x);
    const angleSpread = (Math.random() - 0.5) * 1.2; // ±0.6 radians spread
    const angle = districtAngle + angleSpread;
    
    positions.set(entity.id, {
      x: Math.cos(angle) * coreDistance,
      z: Math.sin(angle) * coreDistance,
      vx: 0,
      vz: 0
    });
  }
  
  // Force simulation parameters (tuned for stability)
  const repulsionStrength = 50;
  const attractionStrength = 0.02;
  const districtPull = 0.05;
  const corePull = 0.02;
  const damping = 0.85;
  const minDistance = 4;
  const maxForce = 5;
  
  // Run simulation
  for (let iter = 0; iter < iterations; iter++) {
    const temp = Math.pow(1 - iter / iterations, 0.5); // Cooling
    
    // Reset forces
    for (const pos of positions.values()) {
      pos.fx = 0;
      pos.fz = 0;
    }
    
    // Repulsion between nearby entities (only check close pairs for performance)
    for (let i = 0; i < entitiesArray.length; i++) {
      const e1 = entitiesArray[i];
      const p1 = positions.get(e1.id);
      
      for (let j = i + 1; j < entitiesArray.length; j++) {
        const e2 = entitiesArray[j];
        const p2 = positions.get(e2.id);
        
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const distSq = dx * dx + dz * dz;
        const dist = Math.sqrt(distSq) || 0.1;
        
        // Only apply repulsion for close entities
        if (dist < 25) {
          const force = Math.min(maxForce, repulsionStrength / (distSq + 1)) * temp;
          const fx = (dx / dist) * force;
          const fz = (dz / dist) * force;
          
          p1.fx -= fx;
          p1.fz -= fz;
          p2.fx += fx;
          p2.fz += fz;
        }
      }
    }
    
    // Attraction between co-occurring entities
    for (const [key, strength] of cooccurrence) {
      const [id1, id2] = key.split('|');
      const p1 = positions.get(id1);
      const p2 = positions.get(id2);
      
      if (!p1 || !p2) continue;
      
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const dist = Math.sqrt(dx * dx + dz * dz) || 0.1;
      
      // Attraction proportional to co-occurrence strength (capped)
      const force = Math.min(maxForce, attractionStrength * Math.sqrt(strength) * dist) * temp;
      const fx = (dx / dist) * force;
      const fz = (dz / dist) * force;
      
      p1.fx += fx;
      p1.fz += fz;
      p2.fx -= fx;
      p2.fz -= fz;
    }
    
    // Pull toward district center + slight pull to core based on importance
    for (const entity of entitiesArray) {
      const p = positions.get(entity.id);
      const district = DISTRICTS[entity.district] || DISTRICTS.memory;
      const importance = calculateImportance(entity);
      const normalizedImportance = importance / maxImportance;
      
      // Pull toward district
      const dxDist = district.basePosition.x * 0.6 - p.x;
      const dzDist = district.basePosition.z * 0.6 - p.z;
      p.fx += dxDist * districtPull * temp;
      p.fz += dzDist * districtPull * temp;
      
      // Important entities pulled toward core
      const coreStrength = corePull * normalizedImportance;
      p.fx -= p.x * coreStrength * temp;
      p.fz -= p.z * coreStrength * temp;
    }
    
    // Apply forces with bounds clamping
    for (const entity of entitiesArray) {
      const p = positions.get(entity.id);
      const importance = calculateImportance(entity);
      const mass = 1 + (importance / maxImportance) * 2;
      
      // Clamp forces
      p.fx = Math.max(-maxForce, Math.min(maxForce, p.fx));
      p.fz = Math.max(-maxForce, Math.min(maxForce, p.fz));
      
      p.vx = (p.vx + p.fx / mass) * damping;
      p.vz = (p.vz + p.fz / mass) * damping;
      
      p.x += p.vx;
      p.z += p.vz;
      
      // Clamp to bounds
      p.x = Math.max(-BOUNDS, Math.min(BOUNDS, p.x));
      p.z = Math.max(-BOUNDS, Math.min(BOUNDS, p.z));
    }
  }
  
  return positions;
}

/**
 * Calculate dynamic district bounds based on entity count
 */
function calculateDistrictBounds(entities) {
  const districtCounts = {};
  const districtEntities = {};
  
  for (const entity of entities.values()) {
    districtCounts[entity.district] = (districtCounts[entity.district] || 0) + 1;
    if (!districtEntities[entity.district]) {
      districtEntities[entity.district] = [];
    }
    districtEntities[entity.district].push(entity);
  }
  
  const totalEntities = entities.size;
  const districtBounds = {};
  
  for (const [district, config] of Object.entries(DISTRICTS)) {
    const count = districtCounts[district] || 1;
    const proportion = count / totalEntities;
    
    // Base radius scales with sqrt of proportion (area scales linearly)
    const baseRadius = 25 + Math.sqrt(proportion) * 40;
    
    // Add expansion room for growing districts (recent activity)
    const recentActivity = (districtEntities[district] || [])
      .filter(e => e.recencyScore > 0.5).length;
    const expansionRoom = recentActivity > 5 ? 15 : recentActivity > 2 ? 8 : 0;
    
    districtBounds[district] = {
      center: config.basePosition,
      radius: baseRadius + expansionRoom,
      entityCount: count,
      color: config.color
    };
  }
  
  return districtBounds;
}

/**
 * Generate buildings with brain-optimized layout
 */
function generateBuildings(entities, cooccurrence) {
  const buildings = [];
  
  // Calculate importances
  const importanceMap = new Map();
  let maxImportance = 0;
  for (const entity of entities.values()) {
    const imp = calculateImportance(entity);
    importanceMap.set(entity.id, imp);
    maxImportance = Math.max(maxImportance, imp);
  }
  
  // Run force-directed layout
  console.log('Running force-directed layout...');
  const positions = forceDirectedLayout(entities, cooccurrence, 150);
  
  // Generate buildings
  for (const entity of entities.values()) {
    const pos = positions.get(entity.id);
    const importance = importanceMap.get(entity.id);
    const normalizedImportance = importance / maxImportance;
    const district = DISTRICTS[entity.district];
    
    // Height based on: frequency × recency × source_weight
    // SOUL.md entities get significant height boost
    let height;
    if (normalizedImportance > 0.8) {
      // Top 20%: Skyscrapers (40-70)
      height = 40 + normalizedImportance * 30;
    } else if (normalizedImportance > 0.5) {
      // Next tier: Tall buildings (25-40)
      height = 25 + normalizedImportance * 30;
    } else if (normalizedImportance > 0.2) {
      // Medium buildings (12-25)
      height = 12 + normalizedImportance * 26;
    } else {
      // Small buildings (5-15)
      height = 5 + normalizedImportance * 20;
    }
    
    // SOUL.md source bonus
    if (entity.sources.has('SOUL.md')) {
      height *= 1.4;
    }
    
    // Cap ticker heights - tickers should never dominate core concepts
    if (entity.type === 'ticker') {
      height = Math.min(height, 25);
    }
    
    // Width scales with importance
    const typeWidths = { ticker: 2.5, tool: 3, project: 4, topic: 3, concept: 2.5 };
    const baseWidth = typeWidths[entity.type] || 2.5;
    const width = baseWidth * (0.8 + normalizedImportance * 0.5);
    
    buildings.push({
      id: entity.id,
      type: entity.type,
      label: entity.label,
      district: entity.district,
      x: Math.round(pos.x * 10) / 10,
      z: Math.round(pos.z * 10) / 10,
      height: Math.round(height * 10) / 10,
      width: Math.round(width * 10) / 10,
      depth: Math.round(width * 10) / 10,
      importance: Math.round(importance * 100) / 100,
      frequency: entity.frequency,
      recencyScore: Math.round(entity.recencyScore * 100) / 100,
      sourceScore: Math.round(entity.sourceScore * 100) / 100,
      sources: [...entity.sources]
    });
  }
  
  // Sort by importance for rendering order
  buildings.sort((a, b) => b.importance - a.importance);
  
  return buildings;
}

/**
 * Generate connections (roads/bridges) based on co-occurrence
 */
function generateConnections(buildings, cooccurrence) {
  const connections = [];
  const buildingMap = new Map(buildings.map(b => [b.id, b]));
  
  // Convert co-occurrence to connections
  const maxStrength = Math.max(...cooccurrence.values(), 1);
  
  for (const [key, count] of cooccurrence) {
    const [id1, id2] = key.split('|');
    const b1 = buildingMap.get(id1);
    const b2 = buildingMap.get(id2);
    
    if (!b1 || !b2) continue;
    
    // Normalize strength (0-1)
    const strength = count / maxStrength;
    
    // Only include meaningful connections
    if (count >= 2 || strength > 0.3) {
      connections.push({
        from: id1,
        to: id2,
        strength: Math.round(strength * 100) / 100,
        count,
        // Connection type based on district relationship
        type: b1.district === b2.district ? 'local' : 'bridge'
      });
    }
  }
  
  // Sort by strength
  connections.sort((a, b) => b.strength - a.strength);
  
  // Limit to top connections to avoid visual clutter
  return connections.slice(0, 150);
}

/**
 * Analyze recent context to determine active district
 */
function analyzeActiveDistrict(files) {
  const sorted = files.sort((a, b) => b.mtime - a.mtime);
  const recent = sorted.slice(0, 3);
  
  const districtScores = {};
  for (const district of Object.keys(DISTRICTS)) {
    districtScores[district] = 0.2;
  }
  
  for (const file of recent) {
    const lower = file.content.toLowerCase();
    for (const [district, config] of Object.entries(DISTRICTS)) {
      for (const keyword of config.keywords) {
        if (lower.includes(keyword)) {
          districtScores[district] += 0.1 * file.sourceWeight;
        }
      }
    }
  }
  
  // Normalize
  const max = Math.max(...Object.values(districtScores));
  for (const district of Object.keys(districtScores)) {
    districtScores[district] = Math.round(Math.min(1, districtScores[district] / max) * 100) / 100;
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
  console.log('=== Knowledge-to-City Mapper v2.0 ===');
  console.log('Brain-Optimized Layout Algorithm');
  console.log(`Workspace: ${WORKSPACE}`);
  console.log('');
  
  // Read files
  console.log('Reading memory files...');
  const files = readMemoryFiles();
  console.log(`  Found ${files.length} files`);
  
  // Extract entities with co-occurrence
  console.log('Extracting entities and building co-occurrence matrix...');
  const { entities, cooccurrence } = extractEntitiesWithCooccurrence(files);
  console.log(`  Found ${entities.size} entities`);
  console.log(`  Found ${cooccurrence.size} co-occurrence pairs`);
  
  // Calculate district bounds
  console.log('Calculating dynamic district bounds...');
  const districtBounds = calculateDistrictBounds(entities);
  for (const [district, bounds] of Object.entries(districtBounds)) {
    console.log(`  ${district}: ${bounds.entityCount} entities, radius ${Math.round(bounds.radius)}`);
  }
  
  // Generate buildings with force-directed layout
  console.log('Generating brain-optimized building layout...');
  const buildings = generateBuildings(entities, cooccurrence);
  console.log(`  Created ${buildings.length} buildings`);
  
  // Show top buildings by importance
  console.log('\n  Top 10 buildings by importance:');
  buildings.slice(0, 10).forEach((b, i) => {
    console.log(`    ${i+1}. ${b.label} (${b.district}) - importance: ${b.importance}, height: ${b.height}`);
  });
  
  // Generate connections
  console.log('\nGenerating co-occurrence connections...');
  const connections = generateConnections(buildings, cooccurrence);
  console.log(`  Created ${connections.length} connections`);
  
  // Analyze activity
  const { activeDistrict, districtActivity } = analyzeActiveDistrict(files);
  console.log(`\n  Active district: ${activeDistrict}`);
  
  // Build city state
  const cityState = {
    version: Date.now(),
    lastUpdate: Date.now(),
    algorithm: 'brain-optimized-v2',
    cognitiveState: 'idle',
    activeDistrict,
    districtActivity,
    districtBounds,
    buildings,
    connections,
    stats: {
      totalEntities: entities.size,
      buildingCount: buildings.length,
      connectionCount: connections.length,
      cooccurrencePairs: cooccurrence.size,
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
    const bounds = districtBounds[district];
    console.log(`  ${district}: ${count} buildings, radius ${Math.round(bounds?.radius || 0)}`);
  }
  
  return cityState;
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main, readMemoryFiles, extractEntitiesWithCooccurrence, generateBuildings, forceDirectedLayout };
