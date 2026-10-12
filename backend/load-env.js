const path = require('node:path');

// Resolve o .env a partir do backend, independentemente do terminal atual.
try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
