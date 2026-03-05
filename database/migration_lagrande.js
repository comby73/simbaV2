/**
 * Migration: Tablas para LA GRANDE - Control Previo y Escrutinio
 *
 * Ejecutar con: node database/migration_lagrande.js
 */

const path = require('path');
const fs = require('fs');

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

    await connection.query(`
      CREATE TABLE IF NOT EXISTS control_previo_la_grande (
        id INT PRIMARY KEY AUTO_INCREMENT,
        numero_sorteo VARCHAR(10) NOT NULL,
        fecha DATE,
        archivo VARCHAR(255),
        registros_validos INT DEFAULT 0,
        registros_anulados INT DEFAULT 0,
        apuestas_total INT DEFAULT 0,
        recaudacion DECIMAL(15,2) DEFAULT 0,
        datos_json LONGTEXT,
        usuario_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_la_grande_sorteo (numero_sorteo),
        KEY idx_la_grande_fecha (fecha)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  control_previo_la_grande creada');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS escrutinio_la_grande (
        id INT PRIMARY KEY AUTO_INCREMENT,
        numero_sorteo VARCHAR(10) NOT NULL,
        fecha DATE,
        numeros_tradicional VARCHAR(100),
        total_apostadores INT DEFAULT 0,
        total_ganadores INT DEFAULT 0,
        total_premios DECIMAL(15,2) DEFAULT 0,
        datos_json LONGTEXT,
        usuario_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_escrutinio_la_grande (numero_sorteo),
        KEY idx_escrutinio_la_grande_fecha (fecha)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  escrutinio_la_grande creada');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS escrutinio_la_grande_ganadores (
        id INT PRIMARY KEY AUTO_INCREMENT,
        escrutinio_id INT NOT NULL,
        numero_sorteo VARCHAR(10) NOT NULL,
        nivel_aciertos INT NOT NULL,
        cantidad_ganadores INT DEFAULT 0,
        premio_unitario DECIMAL(15,2) DEFAULT 0,
        premio_total DECIMAL(15,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_lg_gan_escrutinio (escrutinio_id),
        KEY idx_lg_gan_sorteo (numero_sorteo),
        KEY idx_lg_gan_nivel (nivel_aciertos)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  escrutinio_la_grande_ganadores creada');

    console.log('\nMigration LA GRANDE completada exitosamente');
  } catch (error) {
    console.error('Error en migration:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

runMigration();
