// Supervisor pm2 milik yosi (bukan root): `pm2 start ekosistem.config.js && pm2 save`.
// Port dan alamat dengar di sini harus sama dengan KEVI_PORT / KEVI_BIND di .env.
module.exports = {
  apps: [{
    name: 'kevi',
    cwd: __dirname,
    script: __dirname + '/venv/bin/uvicorn',
    args: 'app.main:app --host 0.0.0.0 --port 8800',
    interpreter: 'none',
    autorestart: true,
    max_restarts: 20,
    error_file: __dirname + '/data/galat.log',
    out_file: __dirname + '/data/keluaran.log',
    time: true,
  }],
};
