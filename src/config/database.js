const mysql = require('mysql2/promise');
const path = require('path');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

let pool;

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

// Detectar si estamos en producción (Hostinger) o local (XAMPP/desarrollo)
function isProduction() {
  // SOLO verificar NODE_ENV para evitar confusiones
  // En producción SIEMPRE debe estar NODE_ENV=production
  return process.env.NODE_ENV === 'production';
}

function getDbConfig() {
  const isProd = isProduction();
  
  console.log(`🔧 Entorno detectado: ${isProd ? 'PRODUCCIÓN (Hostinger)' : 'LOCAL (XAMPP)'}`);
  
  if (isProd) {
    // PRODUCCIÓN: Credenciales de Hostinger
    return {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'u870508525_simba',
      password: process.env.DB_PASSWORD || 'Machu1733*',
      database: process.env.DB_NAME || 'u870508525_control_loteri'
    };
  } else {
    // LOCAL: Credenciales de XAMPP
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'control_loterias'
    };
  }
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
