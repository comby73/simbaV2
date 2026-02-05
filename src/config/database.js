const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Cargar .env.local primero si existe (para desarrollo), sino .env
// En producción (Hostinger), las variables vienen del panel, no de archivos
const envLocalPath = path.join(__dirname, '../../.env.local');
const envPath = path.join(__dirname, '../../.env');

if (process.env.NODE_ENV !== 'production') {
  // Solo cargar dotenv en desarrollo
  if (fs.existsSync(envLocalPath)) {
    require('dotenv').config({ path: envLocalPath });
    console.log('📁 Usando configuración: .env.local');
  } else if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log('📁 Usando configuración: .env');
  }
} else {
  console.log('📁 Modo PRODUCCIÓN: usando variables de entorno del servidor');
}

let pool;

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

// Detectar si estamos en producción (Hostinger) o local (XAMPP/desarrollo)
function isProduction() {
  // Si existe variable de entorno NODE_ENV=production, es producción
  if (process.env.NODE_ENV === 'production') return true;
  
  // Si el hostname no es tu PC local, es producción
  const hostname = os.hostname().toLowerCase();
  const localHostnames = ['desktop', 'laptop', 'comby', 'pc', 'localhost'];
  const isLocal = localHostnames.some(h => hostname.includes(h));
  
  // Si no parece local y no es Windows, probablemente es servidor
  if (!isLocal && process.platform === 'linux') return true;
  
  return false;
}

function getDbConfig() {
  const isProd = isProduction();
  
  console.log(`🔧 Entorno detectado: ${isProd ? 'PRODUCCIÓN (Hostinger)' : 'LOCAL (XAMPP)'}`);
  
  // Debug: mostrar todas las variables de entorno de BD
  console.log('📋 Variables de entorno BD:', {
    DB_HOST: process.env.DB_HOST || '(no definido)',
    DB_USER: process.env.DB_USER || '(no definido)',
    DB_NAME: process.env.DB_NAME || '(no definido)',
    DB_PASSWORD: process.env.DB_PASSWORD ? '****' : '(no definido)',
    NODE_ENV: process.env.NODE_ENV || '(no definido)'
  });
  
  if (isProd) {
    // PRODUCCIÓN: Credenciales de Hostinger
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectTimeout: 10000,
    };
  } else {
    // LOCAL: Credenciales de XAMPP
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'control_loterias',
      connectTimeout: 5000
    };
  }
}

function getPool() {
  if (pool) return pool;

  const config = getDbConfig();
  
  // LOG CRÍTICO PARA DEBUG EN PRODUCCIÓN (sin mostrar password completa)
  console.log('🗄️  Intentando conectar a BD:', {
    host: config.host,
    user: config.user,
    database: config.database,
    hasPassword: !!config.password
  });

  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: config.connectTimeout || 10000
  });

  return pool;
}

async function testConnection() {
  try {
    const p = getPool();
    const connection = await p.getConnection();
    console.log('✅ Conexión a MySQL establecida correctamente');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Error crítico de conexión a MySQL:', {
      mensaje: error.message,
      codigo: error.code,
      fatal: error.fatal
    });
    // NO bloqueamos la ejecución, permitimos que el servidor inicie
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
