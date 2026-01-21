const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function getDbConfig() {
  const isProduction = process.env.NODE_ENV === 'production';

  const host = process.env.DB_HOST || (isProduction ? undefined : 'localhost');
  const portRaw = process.env.DB_PORT || (isProduction ? undefined : 3306);
  const port = isBlank(portRaw) ? undefined : Number(portRaw);
  const user = process.env.DB_USER || (isProduction ? undefined : 'root');
  const password = process.env.DB_PASSWORD || (isProduction ? undefined : '');
  const database = process.env.DB_NAME || (isProduction ? undefined : 'control_loterias');

  return {
    isProduction,
    host,
    port,
    user,
    password,
    database,
  };
}

function assertDbConfig(config) {
  if (!config.isProduction) return;

  const missing = [];
  if (isBlank(config.host)) missing.push('DB_HOST');
  if (isBlank(config.port) || Number.isNaN(config.port)) missing.push('DB_PORT');
  if (isBlank(config.user)) missing.push('DB_USER');
  if (isBlank(config.password)) missing.push('DB_PASSWORD');
  if (isBlank(config.database)) missing.push('DB_NAME');

  if (missing.length > 0) {
    throw new Error(
      `Error de configuración de BD: faltan variables de entorno (${missing.join(', ')}). ` +
      'Revisá las Environment Variables de la app Node.js en Hostinger y reiniciá la app.'
    );
  }
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
