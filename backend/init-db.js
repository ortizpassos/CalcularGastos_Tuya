// init-db.js: cria tabela leituras_luz se não existir
const pool = require('./db');

async function init() {
  // Tabela de leituras (já existente)
  const createLeituras = `
    CREATE TABLE IF NOT EXISTS leituras (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tipo ENUM('luz','agua') NOT NULL,
      karina DECIMAL(10,2) NOT NULL,
  luiza DECIMAL(10,2) NOT NULL,
      data DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `;

  // Tabela de históricos (consumo e valor por pessoa)
  const createHistorico = `
    CREATE TABLE IF NOT EXISTS historicos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tipo ENUM('luz','agua') NOT NULL,
      nome VARCHAR(50) NOT NULL,
      consumo DECIMAL(10,2) NOT NULL,
      valor DECIMAL(10,2) NOT NULL,
      data DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `;

  // Tabela de resultados (opcional, se quiser guardar o cálculo final)
  const createResultados = `
    CREATE TABLE IF NOT EXISTS resultados (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tipo ENUM('luz','agua') NOT NULL,
      resultado JSON NOT NULL,
      data DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `;

  try {
    const conn = await pool.getConnection();
    await conn.query(createLeituras);
    await conn.query(createHistorico);
    await conn.query(createResultados);
    conn.release();
    console.log('Tabelas leituras, historicos e resultados prontas!');
  } catch (err) {
    console.error('Erro ao criar tabelas:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  init().then(() => process.exit(0));
}

module.exports = init;