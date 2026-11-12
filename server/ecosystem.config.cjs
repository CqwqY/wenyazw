module.exports = {
  apps: [
    {
      name: "wenyazw-back",
      script: "./server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production", PORT: 3033, HOST: "0.0.0.0" },
      max_memory_restart: "120M",
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      merge_logs: true,
      time: false
    }
  ]
};
