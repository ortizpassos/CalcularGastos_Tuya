require('./load-env');
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGO_DB_NAME || process.env.MYSQL_DATABASE || 'calcular_gastos';

let client;
let db;

async function connect() {
  if (db) return db;
  client = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();
  db = client.db(DB_NAME);
  console.log('MongoDB connected to', DB_NAME);
  return db;
}

function getDb() {
  if (!db) throw new Error('MongoDB not connected. Call connect() first.');
  return db;
}

module.exports = { connect, getDb, client: () => client };
