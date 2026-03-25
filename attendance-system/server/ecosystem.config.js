/**
 * ecosystem.config.js  —  PM2 process manager config
 *
 * Install PM2:  npm install -g pm2
 *
 * Commands:
 *   pm2 start ecosystem.config.js        ← start
 *   pm2 restart attendance               ← restart
 *   pm2 stop attendance                  ← stop
 *   pm2 logs attendance                  ← live logs
 *   pm2 monit                            ← dashboard
 *   pm2 save && pm2 startup              ← auto-start on boot
 */

module.exports = {
  apps: [
    {
      name:         'attendance',
      script:       'server.js',
      cwd:          __dirname,
      instances:    1,               // SQLite is single-writer
      exec_mode:    'fork',
      watch:        false,
      max_memory_restart: '300M',

      // Environment
      env: {
        NODE_ENV:     'production',
        AUTO_BACKUP:  'true',
      },

      // Logs
      out_file:  './logs/out.log',
      error_file:'./logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      // Restart policy
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime:   '10s',
    },
  ],
};
