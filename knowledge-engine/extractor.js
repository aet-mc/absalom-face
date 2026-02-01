/**
 * Knowledge Engine - Entity Extractor
 * Extracts entities from markdown files using compromise NLP and regex patterns
 */

const nlp = require('compromise');

// Common words that look like tickers but aren't
const TICKER_BLACKLIST = new Set([
  'I', 'A', 'IT', 'IS', 'BE', 'TO', 'IN', 'ON', 'AT', 'BY', 'OR', 'AN', 'AS',
  'IF', 'OF', 'SO', 'DO', 'UP', 'NO', 'GO', 'MY', 'WE', 'US', 'AM', 'PM',
  'OK', 'VS', 'AI', 'UI', 'UX', 'ID', 'JS', 'TS', 'MD', 'CSS', 'HTML', 'API',
  'CLI', 'SDK', 'URL', 'SSH', 'VPS', 'CPU', 'GPU', 'RAM', 'SSD', 'HDD',
  'FOR', 'THE', 'AND', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER',
  'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW',
  'NEW', 'NOW', 'OLD', 'SEE', 'WAY', 'WHO', 'BOY', 'DID', 'ITS', 'LET',
  'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'TODO', 'NOTE', 'TEMP', 'TEST', 'DONE'
]);

// Decision keywords to look for
const DECISION_PATTERNS = [
  /decided\s+(?:to\s+)?(.{10,80})/gi,
  /chose\s+(?:to\s+)?(.{10,80})/gi,
  /will\s+(?:be\s+)?(.{10,60})/gi,
  /going\s+to\s+(.{10,60})/gi,
  /committed\s+to\s+(.{10,60})/gi,
  /settled\s+on\s+(.{10,60})/gi,
];

/**
 * Check if a string is likely a stock ticker
 * @param {string} str - Potential ticker
 * @returns {boolean}
 */
function isTicker(str) {
  if (!str || str.length < 2 || str.length > 5) return false;
  if (TICKER_BLACKLIST.has(str)) return false;
  // Must be all uppercase letters
  if (!/^[A-Z]{2,5}$/.test(str)) return false;
  return true;
}

/**
 * Extract entities from markdown content
 * @param {string} markdown - Raw markdown content
 * @param {string} source - Source file path
 * @returns {Object} Extracted entities with metadata
 */
function extractEntities(markdown, source) {
  if (!markdown || typeof markdown !== 'string') {
    return createEmptyResult(source);
  }

  // Strip markdown before NLP to reduce noise
  const cleanedMarkdown = markdown
    .replace(/^#{1,6}\s+/gm, '')           // Remove header markers
    .replace(/```[\s\S]*?```/g, '')        // Remove code blocks
    .replace(/`[^`]+`/g, '')               // Remove inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
    .replace(/^\s*[-*+]\s+/gm, '')         // Remove list markers
    .replace(/^\s*\d+\.\s+/gm, '')         // Remove numbered list markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')     // Remove bold
    .replace(/\*([^*]+)\*/g, '$1')         // Remove italic
    .replace(/[|:─┌┐└┘├┤┬┴┼]+/g, ' ');    // Remove table chars
  
  const doc = nlp(cleanedMarkdown);
  
  // Helper to clean NLP output
  const cleanEntity = (arr) => arr
    .map(t => t.trim())
    .filter(t => t.length > 2)                    // Min 3 chars
    .filter(t => !/^[#\-*`(\[<>@$%]/.test(t))    // No special char starts
    .filter(t => !/[`\[\](){}<>]/.test(t))       // No brackets/parens
    .filter(t => !/^(the|a|an|is|are|was|were|be|been|being)$/i.test(t)); // No articles
  
  // NLP extraction
  const topics = cleanEntity(doc.topics().out('array'));
  const people = cleanEntity(doc.people().out('array'));
  const organizations = cleanEntity(doc.organizations().out('array'));

  // Regex extraction - Tickers (2-5 uppercase, word boundary)
  const tickerMatches = markdown.match(/\b[A-Z]{2,5}\b/g) || [];
  const tickers = [...new Set(tickerMatches.filter(isTicker))];

  // Regex extraction - Tools (backticked content)
  const toolMatches = markdown.match(/`([^`\n]+)`/g) || [];
  const tools = [...new Set(
    toolMatches
      .map(t => t.slice(1, -1).trim())
      .filter(t => t.length > 0 && t.length < 50 && !t.includes(' '))
  )];

  // Regex extraction - URLs
  const urlMatches = markdown.match(/https?:\/\/[^\s\)>\]]+/g) || [];
  const urls = [...new Set(urlMatches.map(u => u.replace(/[.,;:]+$/, '')))];

  // Structure extraction - Headers
  const headerMatches = markdown.match(/^#{1,3}\s+(.+)$/gm) || [];
  const headers = headerMatches
    .map(h => h.replace(/^#+\s+/, '').trim())
    .filter(h => h.length > 0);

  // Structure extraction - Decisions (checkbox items and keywords)
  const decisions = [];
  
  // Completed checkbox items (decisions made)
  const checkboxMatches = markdown.match(/- \[x\]\s*(.+)/gi) || [];
  for (const match of checkboxMatches) {
    const decision = match.replace(/- \[x\]\s*/i, '').trim();
    if (decision.length > 5) {
      decisions.push(decision);
    }
  }
  
  // Decision keywords
  for (const pattern of DECISION_PATTERNS) {
    let match;
    pattern.lastIndex = 0; // Reset regex state
    while ((match = pattern.exec(markdown)) !== null) {
      const decision = match[1].trim().replace(/[.!?,;:]+$/, '');
      if (decision.length > 5 && decision.length < 100) {
        decisions.push(decision);
      }
    }
  }

  return {
    // Entity types
    topics: [...new Set(topics)],
    people: [...new Set(people)],
    organizations: [...new Set(organizations)],
    tickers,
    tools,
    urls,
    headers,
    decisions: [...new Set(decisions)],
    
    // Metadata
    source,
    extractedAt: Date.now(),
    charCount: markdown.length,
    wordCount: markdown.split(/\s+/).length
  };
}

/**
 * Extract entities from each paragraph separately (for co-occurrence)
 * @param {string} markdown - Raw markdown content
 * @param {string} source - Source file path
 * @returns {Array<Object>} Array of entities per paragraph
 */
function extractByParagraph(markdown, source) {
  if (!markdown || typeof markdown !== 'string') {
    return [];
  }

  // Split into paragraphs (double newline or header boundaries)
  const paragraphs = markdown
    .split(/\n\n+|\n(?=#{1,3}\s)/)
    .map(p => p.trim())
    .filter(p => p.length > 10);

  return paragraphs.map((para, index) => ({
    paragraphIndex: index,
    content: para.slice(0, 100), // First 100 chars for debug
    entities: extractEntities(para, source)
  }));
}

/**
 * Create empty result object
 * @param {string} source - Source file path
 * @returns {Object} Empty entities object
 */
function createEmptyResult(source) {
  return {
    topics: [],
    people: [],
    organizations: [],
    tickers: [],
    tools: [],
    urls: [],
    headers: [],
    decisions: [],
    source,
    extractedAt: Date.now(),
    charCount: 0,
    wordCount: 0
  };
}

/**
 * Get all entity IDs from an extraction result
 * @param {Object} entities - Extracted entities
 * @returns {Array<string>} Array of node IDs
 */
function getAllNodeIds(entities) {
  const ids = [];
  
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

  for (const [plural, singular] of Object.entries(typeMap)) {
    const items = entities[plural] || [];
    for (const item of items) {
      ids.push(`${singular}:${normalize(item)}`);
    }
  }

  return ids;
}

/**
 * Normalize a label for consistent ID generation
 * @param {string} label - Raw label
 * @returns {string} Normalized label
 */
function normalize(label) {
  if (!label) return '';
  return label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w\-_]/g, '')
    .slice(0, 100); // Cap length
}

// Exports
module.exports = {
  extractEntities,
  extractByParagraph,
  getAllNodeIds,
  normalize,
  isTicker,
  TICKER_BLACKLIST
};

// ============================================================
// Standalone test
// ============================================================
if (require.main === module) {
  console.log('=== Knowledge Engine Extractor Test ===\n');

  const testMarkdown = `
# Trading Journal - 2026-01-15

## Morning Analysis

Anton decided to focus on NVDA and TSLA today. The AI sector looks strong.

Checked the Google Finance API for real-time data. Microsoft earnings coming up.

- [x] Review portfolio allocation
- [x] Set stop-loss on AAPL position
- [ ] Research quantum computing stocks

## Tools Used

Used \`yahoo-finance\` and \`dexter\` for analysis. The \`copilot-money\` skill 
helped track positions.

See more at https://example.com/trading and https://finance.yahoo.com

## Decisions

Settled on a 60/40 stock-bond split. Going to reduce tech exposure gradually.
Committed to reviewing positions weekly.
`;

  console.log('Test markdown:', testMarkdown.slice(0, 200) + '...\n');

  const result = extractEntities(testMarkdown, 'memory/2026-01-15.md');
  
  console.log('Extracted entities:');
  console.log('  Topics:', result.topics);
  console.log('  People:', result.people);
  console.log('  Organizations:', result.organizations);
  console.log('  Tickers:', result.tickers);
  console.log('  Tools:', result.tools);
  console.log('  URLs:', result.urls);
  console.log('  Headers:', result.headers);
  console.log('  Decisions:', result.decisions);
  console.log('\nMetadata:');
  console.log('  Source:', result.source);
  console.log('  Char count:', result.charCount);
  console.log('  Word count:', result.wordCount);

  console.log('\n--- Paragraph extraction test ---\n');
  
  const paragraphs = extractByParagraph(testMarkdown, 'test.md');
  console.log(`Found ${paragraphs.length} paragraphs`);
  
  for (const para of paragraphs.slice(0, 3)) {
    console.log(`\nParagraph ${para.paragraphIndex}:`);
    console.log(`  Preview: "${para.content.slice(0, 50)}..."`);
    const ids = getAllNodeIds(para.entities);
    console.log(`  Node IDs (${ids.length}):`, ids.slice(0, 5).join(', '), ids.length > 5 ? '...' : '');
  }

  console.log('\n--- Normalize test ---');
  console.log('  "Hello World" ->', normalize('Hello World'));
  console.log('  "NVDA" ->', normalize('NVDA'));
  console.log('  "user@example.com" ->', normalize('user@example.com'));

  console.log('\n=== Test Complete ===');
}
