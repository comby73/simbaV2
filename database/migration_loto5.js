/**
 * Migration: Tablas para Loto 5 - Control Previo y Escrutinio
 *
 * Ejecutar con: node database/migration_loto5.js
 */

const path = require('path');
const fs = require('fs');

// Cargar .env.local primero si existe (para desarrollo), sino .env (producción)
const envLocalPath = path.join(__dirname, '../.env.local');
const envPath = path.join(__dirname, '../.env');

if (fs.existsSync(envLocalPath)) {
  require('dotenv').config({ path: envLocalPath });
  console.log('Usando configuración: .env.local');
} else {
  require('dotenv').config({ path: envPath });
  console.log('Usando configuración: .env');
}

const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'control_loterias';

async function runMigration() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    });

    console.log('Conectado a MySQL');
    await connection.query(`USE ${DB_NAME}`);
    console.log(`Usando base de datos: ${DB_NAME}`);

    // Control Previo Loto 5
    await connection.query(`
      CREATE TABLE IF NOT EXISTS control_previo_loto5 (
        id INT PRIMARY KEY AUTO_INCREMENT,
        numero_sorteo VARCHAR(10) NOT NULL,
        archivo VARCHAR(255),
        registros_validos INT DEFAULT 0,
        registros_anulados INT DEFAULT 0,
        apuestas_total INT DEFAULT 0,
        recaudacion DECIMAL(15,2) DEFAULT 0,
        datos_json LONGTEXT,
        usuario_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_loto5_sorteo (numero_sorteo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  control_previo_loto5 creada');

    // Escrutinio Loto 5
    await connection.query(`
      CREATE TABLE IF NOT EXISTS escrutinio_loto5 (
        id INT PRIMARY KEY AUTO_INCREMENT,
        numero_sorteo VARCHAR(10) NOT NULL,
        fecha_sorteo DATE,
        total_ganadores INT DEFAULT 0,
        total_premios DECIMAL(15,2) DEFAULT 0,
        datos_json LONGTEXT,
        usuario_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_escrutinio_loto5 (numero_sorteo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  escrutinio_loto5 creada');

    console.log('\nMigration Loto 5 completada exitosamente');

  } catch (error) {
    console.error('Error en migration:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();
