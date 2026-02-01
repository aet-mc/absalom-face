#!/usr/bin/env node
/**
 * File Watcher for Knowledge Engine
 * 
 * Watches memory files for changes and triggers graph rebuilds
 * Uses chokidar for efficient file watching with debouncing
 */

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const WORKSPACE = process.env.WORKSPACE || path.join(process.env.HOME, '.openclaw/workspace');
const DEBOUNCE_MS = 500;

// Source weights from the spec
const SOURCE_WEIGHTS = {
  'SOUL.md': 5.0,
  'MEMORY.md': 3.0,
  'USER.md': 3.0,
  'AGENTS.md': 2.0,
  'memory/': 1.0,
};

class FileWatcher extends EventEmitter {
  constructor(options = {}) {
    super();
    this.workspace = options.workspace || WORKSPACE;
    this.debounceMs = options.debounceMs || DEBOUNCE_MS;
    this.fileHashes = new Map();
    this.pendingUpdates = new Map();
    this.watcher = null;
  }

  /**
   * Get list of files to watch
   */
  getWatchPaths() {
    return [
      path.join(this.workspace, 'MEMORY.md'),
      path.join(this.workspace, 'SOUL.md'),
      path.join(this.workspace, 'USER.md'),
      path.join(this.workspace, 'AGENTS.md'),
      path.join(this.workspace, 'memory'),  // Watch directory for all .md files
    ];
  }

  /**
   * Calculate MD5 hash of file content
   */
  getFileHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Get source weight for a file path
   */
  getSourceWeight(filepath) {
    const relativePath = path.relative(this.workspace, filepath);
    
    for (const [pattern, weight] of Object.entries(SOURCE_WEIGHTS)) {
      if (relativePath === pattern || relativePath.startsWith(pattern)) {
        return weight;
      }
    }
    return 1.0;
  }

  /**
   * Check if file actually changed (content hash comparison)
   */
  hasActuallyChanged(filepath, content) {
    const newHash = this.getFileHash(content);
    const oldHash = this.fileHashes.get(filepath);
    
    if (newHash !== oldHash) {
      this.fileHashes.set(filepath, newHash);
      return true;
    }
    return false;
  }

  /**
   * Process a file change with debouncing
   */
  scheduleUpdate(filepath, eventType) {
    // Clear existing timeout for this file
    if (this.pendingUpdates.has(filepath)) {
      clearTimeout(this.pendingUpdates.get(filepath));
    }

    // Schedule new update
    const timeout = setTimeout(() => {
      this.pendingUpdates.delete(filepath);
      this.processFileChange(filepath, eventType);
    }, this.debounceMs);

    this.pendingUpdates.set(filepath, timeout);
  }

  /**
   * Process a file change after debounce
   */
  processFileChange(filepath, eventType) {
    // Only process .md files
    if (!filepath.endsWith('.md')) {
      return;
    }

    if (eventType === 'unlink') {
      // File was deleted
      this.fileHashes.delete(filepath);
      this.emit('file:deleted', {
        path: filepath,
        relativePath: path.relative(this.workspace, filepath),
        timestamp: Date.now()
      });
      return;
    }

    // Read file content
    try {
      const content = fs.readFileSync(filepath, 'utf8');
      
      // Check if content actually changed
      if (!this.hasActuallyChanged(filepath, content)) {
        console.log(`[Watcher] No actual change: ${path.basename(filepath)}`);
        return;
      }

      const relativePath = path.relative(this.workspace, filepath);
      const weight = this.getSourceWeight(filepath);

      console.log(`[Watcher] ${eventType}: ${relativePath} (weight: ${weight})`);

      this.emit('file:changed', {
        path: filepath,
        relativePath,
        content,
        weight,
        eventType,
        timestamp: Date.now()
      });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`[Watcher] Error reading ${filepath}:`, err.message);
      }
    }
  }

  /**
   * Get all watched files and their current content
   */
  getAllFiles() {
    const files = [];
    
    const coreFiles = ['MEMORY.md', 'SOUL.md', 'USER.md', 'AGENTS.md'];
    for (const filename of coreFiles) {
      const filepath = path.join(this.workspace, filename);
      if (fs.existsSync(filepath)) {
        try {
          const content = fs.readFileSync(filepath, 'utf8');
          const hash = this.getFileHash(content);
          this.fileHashes.set(filepath, hash);
          
          files.push({
            path: filepath,
            relativePath: filename,
            content,
            weight: this.getSourceWeight(filepath),
            timestamp: Date.now()
          });
        } catch (err) {
          console.error(`[Watcher] Error reading ${filename}:`, err.message);
        }
      }
    }

    // Memory directory
    const memoryDir = path.join(this.workspace, 'memory');
    if (fs.existsSync(memoryDir)) {
      try {
        const memoryFiles = fs.readdirSync(memoryDir)
          .filter(f => f.endsWith('.md'))
          .map(f => path.join(memoryDir, f));

        for (const filepath of memoryFiles) {
          try {
            const content = fs.readFileSync(filepath, 'utf8');
            const hash = this.getFileHash(content);
            this.fileHashes.set(filepath, hash);
            
            files.push({
              path: filepath,
              relativePath: path.relative(this.workspace, filepath),
              content,
              weight: this.getSourceWeight(filepath),
              timestamp: Date.now()
            });
          } catch (err) {
            console.error(`[Watcher] Error reading ${filepath}:`, err.message);
          }
        }
      } catch (err) {
        console.error('[Watcher] Error reading memory directory:', err.message);
      }
    }

    return files;
  }

  /**
   * Start watching files
   */
  start() {
    if (this.watcher) {
      console.log('[Watcher] Already running');
      return;
    }

    const watchPaths = this.getWatchPaths();
    
    console.log('[Watcher] Starting file watcher');
    console.log(`[Watcher] Workspace: ${this.workspace}`);
    console.log(`[Watcher] Watching ${watchPaths.length} paths`);

    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,  // Don't emit events for existing files
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      },
      // Only watch .md files in the memory directory
      ignored: (filepath, stats) => {
        if (!stats) return false;
        if (stats.isDirectory()) return false;
        if (filepath.includes('/memory/') && !filepath.endsWith('.md')) return true;
        return false;
      }
    });

    this.watcher
      .on('add', filepath => this.scheduleUpdate(filepath, 'add'))
      .on('change', filepath => this.scheduleUpdate(filepath, 'change'))
      .on('unlink', filepath => this.scheduleUpdate(filepath, 'unlink'))
      .on('error', error => {
        console.error('[Watcher] Error:', error.message);
        this.emit('error', error);
      })
      .on('ready', () => {
        console.log('[Watcher] Ready and watching for changes');
        this.emit('ready');
      });
  }

  /**
   * Stop watching files
   */
  async stop() {
    if (!this.watcher) {
      return;
    }

    // Clear pending updates
    for (const timeout of this.pendingUpdates.values()) {
      clearTimeout(timeout);
    }
    this.pendingUpdates.clear();

    await this.watcher.close();
    this.watcher = null;
    console.log('[Watcher] Stopped');
  }
}

module.exports = { FileWatcher, SOURCE_WEIGHTS };
