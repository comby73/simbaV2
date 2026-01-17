require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'control_loterias';

async function migrateAgenciasLocalidad() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: DB_NAME
    });

    console.log('🔄 Agregando columna localidad a tabla agencias...');

    // Agregar columna localidad
    try {
      await connection.execute('ALTER TABLE agencias ADD COLUMN localidad VARCHAR(100) AFTER direccion');
      console.log('✅ Columna localidad agregada');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.error('Error localidad:', e.message);
    }

    console.log('✅ Migración completada');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

migrateAgenciasLocalidad();