const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

let pool;

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function getDbConfig() {
  // HARDCODE TOTAL PARA HOSTINGER (TEMPORAL)
  // Forzamos uso de estas credenciales siempre
  return {
    isProduction: true,
    host: '127.0.0.1', 
    port: 3306,
    user: 'u870508525_simba',
    password: 'CasioIvI0',
    database: 'u870508525_control_loteri'
  };
}

function assertDbConfig(config) {
  // Desactivamos validación temporalmente
  return;
}

function getPool() {
  if (pool) return pool;

  const config = getDbConfig();
  assertDbConfig(config);

  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  console.log('🗄️  Config BD:', {
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
    nodeEnv: process.env.NODE_ENV || 'development',
  });

  return pool;
}

async function testConnection() {
  try {
    const connection = await getPool().getConnection();
    console.log('✅ Conexión a MySQL establecida');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Error conectando a MySQL:', error.message);
    return false;
  }
}

async function query(sql, params = []) {
  const [results] = await getPool().execute(sql, params);
  return results;
}

async function transaction(callback) {
  const connection = await getPool().getConnection();
  await connection.beginTransaction();
  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { pool, query, transaction, testConnection };
