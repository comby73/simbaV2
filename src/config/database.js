const mysql = require('mysql2/promise');
const path = require('path');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

let pool;

// Detectar si estamos en producción (Hostinger) o local (XAMPP/desarrollo)
// IMPORTANTE: Esto se detecta por el sistema operativo y hostname, NO por variables de entorno
function isProduction() {
  const platform = os.platform();
  const hostname = os.hostname().toLowerCase();

  // Windows = desarrollo local
  // Linux con hostname que contenga 'srv', 'hostinger', 'vps' = producción
  const isLinux = platform === 'linux';
  const isHostingerServer = hostname.includes('srv') ||
                            hostname.includes('hostinger') ||
                            hostname.includes('vps');

  const isProd = isLinux && isHostingerServer;

  console.log(`🔧 Sistema: ${platform} | Hostname: ${hostname}`);
  console.log(`🔧 Entorno detectado: ${isProd ? 'PRODUCCIÓN (Hostinger)' : 'LOCAL (XAMPP)'}`);

  return isProd;
}

function getDbConfig() {
  const isProd = isProduction();

  if (isProd) {
    // PRODUCCIÓN (Hostinger): Credenciales hardcodeadas con fallback a .env
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'u870508525_simba',
      password: process.env.DB_PASSWORD || 'Machu1733*',
      database: process.env.DB_NAME || 'u870508525_control_loteri'
    };
  } else {
    // LOCAL (XAMPP): Credenciales hardcodeadas con fallback a .env
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'control_loterias'
    };
  }
}

// Eliminamos la validación, las credenciales ya están hardcodeadas según el entorno

function getPool() {
  if (pool) return pool;

  const config = getDbConfig();

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
