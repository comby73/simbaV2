require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'control_loterias';

async function migrateAgencias() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: DB_NAME
    });

    console.log('🔄 Actualizando estructura de tabla agencias...');

    // Agregar columna email
    try {
      await connection.execute('ALTER TABLE agencias ADD COLUMN email VARCHAR(150) AFTER nombre');
      console.log('✅ Columna email agregada');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.error('Error email:', e.message);
    }

    // Agregar columna direccion
    try {
      await connection.execute('ALTER TABLE agencias ADD COLUMN direccion VARCHAR(255) AFTER email');
      console.log('✅ Columna direccion agregada');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.error('Error direccion:', e.message);
    }
    
    // Modificar columna nombre para que sea más larga por si acaso
    await connection.execute('ALTER TABLE agencias MODIFY column nombre VARCHAR(255)');

    console.log('✅ Migración completada');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

migrateAgencias();