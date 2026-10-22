/* PM2 process file (optional; see DEPLOY.md → "সার্ভিস হিসেবে চালানো").
     npm install -g pm2
     pm2 start ecosystem.config.js
     pm2 save && pm2 startup        (Linux: start at boot; Windows: see DEPLOY.md, pm2-installer or NSSM)
   Settings come from .env in this folder; only one instance may run per database (the server keeps the
   state in memory), so keep instances: 1 and exec_mode: fork. */
module.exports = {
  apps: [{
    name: 'dhee',
    script: 'server/index.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '1G',
    kill_timeout: 20000,          // time for the graceful shutdown (pending writes)
    env: { NODE_ENV: 'production' },
    // the server writes its own daily JSON logs to logs/; PM2's own copies go here
    out_file: 'logs/pm2-out.log',
    error_file: 'logs/pm2-error.log',
    merge_logs: true,
    time: true,
  }],
};
