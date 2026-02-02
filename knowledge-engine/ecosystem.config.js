module.exports = {
  apps: [
    {
      name: 'absalom-knowledge',
      script: 'start.js',
      cwd: '/home/openclaw/Projects/absalom-face/knowledge-engine',
      env: {
        PORT: 3847
      },
      // Replaces absalom-state - this is the enhanced version
      // Provides both state sync AND knowledge graph
    },
    {
      name: 'absalom-watcher',
      script: 'activity-watcher.js',
      cwd: '/home/openclaw/Projects/absalom-face/server',
      env: {
        STATE_FILE: '/tmp/absalom-activity.json',
        SERVER_URL: 'http://localhost:3847'
      }
    }
  ]
};
