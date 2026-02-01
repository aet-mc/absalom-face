module.exports = {
  apps: [
    {
      name: 'absalom-state',
      script: 'index.js',
      cwd: '/home/openclaw/Projects/absalom-face/server',
      env: {
        PORT: 3847
      }
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
