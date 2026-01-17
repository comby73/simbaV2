require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'control_loterias';

async function seedAgencias() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: DB_NAME
    });

    console.log('🔄 Insertando agencias de prueba...');

    const agencias = [
      ['51001005', '51', '00100', '5', 'Agencia Centro', true],
      ['53123450', '53', '12345', '0', 'Agencia La Plata', true],
      ['55000019', '55', '00001', '9', 'Agencia Córdoba', true],
      ['72005553', '72', '00555', '3', 'Agencia Rosario', true],
      ['64009991', '64', '00999', '1', 'Agencia Mendoza', true]
    ];

    for (const data of agencias) {
      await connection.execute(
        'INSERT IGNORE INTO agencias (numero, provincia, cuenta_corriente, digito_verificador, nombre, activa) VALUES (?, ?, ?, ?, ?, ?)',
        data
      );
    }

    console.log('✅ 5 agencias insertadas correctamente');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

seedAgencias();