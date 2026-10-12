// init-mongo.js - cria collections e indexes básicos para o MongoDB
const { connect, getDb } = require('./mongo');

async function init() {
  const db = await connect();

  // Leituras: index por tipo e data
  await db.collection('leituras').createIndex({ tipo: 1, data: -1 });
  // Historicos: index por tipo e data
  await db.collection('historicos').createIndex({ tipo: 1, data: -1 });
  // Resultados: index por tipo e data
  await db.collection('resultados').createIndex({ tipo: 1, data: -1 });

  console.log('Coleções e índices criados (se não existiam)');
}

if (require.main === module) {
  init().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}

module.exports = init;
