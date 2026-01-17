require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'control_loterias';

async function migrateAgenciasSplit() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: DB_NAME
    });

    console.log('🔄 Agregando columnas divididas a tabla agencias...');

    // Agregar columna provincia
    try {
      await connection.execute('ALTER TABLE agencias ADD COLUMN provincia VARCHAR(5) AFTER numero');
      console.log('✅ Columna provincia agregada');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.error('Error provincia:', e.message);
    }

    // Agregar columna cuenta_corriente (INT para formato numero)
    try {
      await connection.execute('ALTER TABLE agencias ADD COLUMN cuenta_corriente INT AFTER provincia');
      console.log('✅ Columna cuenta_corriente agregada');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.error('Error cuenta_corriente:', e.message);
    }

    // Agregar columna digito_verificador
    try {
      await connection.execute('ALTER TABLE agencias ADD COLUMN digito_verificador VARCHAR(1) AFTER cuenta_corriente');
      console.log('✅ Columna digito_verificador agregada');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.error('Error digito_verificador:', e.message);
    }

    console.log('✅ Migración completada');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

migrateAgenciasSplit();
