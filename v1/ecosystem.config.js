module.exports = {
  apps: [
    {
      name: 'ativacao-saas',
      script: 'src/index.js',
      cwd: __dirname,
      
      // Ambiente
      env: {
        NODE_ENV: 'production'
      },
      
      // Reinício automático
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      
      // Logs
      log_date_format: 'DD/MM/YYYY HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/output.log',
      merge_logs: true,
      
      // Memória - reinicia se passar de 500MB
      max_memory_restart: '500M',
      
      // Instâncias (1 é suficiente para bot Telegram)
      instances: 1,
      exec_mode: 'fork'
    }
  ]
};
