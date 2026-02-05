/**
 * Migration: Tablas para BRINCO - Control Previo y Escrutinio
 *
 * Ejecutar con: node database/migration_brinco.js
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

    // Control Previo BRINCO
    await connection.query(`
      CREATE TABLE IF NOT EXISTS control_previo_brinco (
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
        UNIQUE KEY uk_brinco_sorteo (numero_sorteo),
        KEY idx_brinco_fecha (fecha)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  control_previo_brinco creada');

    // Detalle de tickets BRINCO (opcional para análisis detallado)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS control_previo_brinco_tickets (
        id INT PRIMARY KEY AUTO_INCREMENT,
        control_previo_id INT NOT NULL,
        numero_sorteo VARCHAR(10) NOT NULL,
        agencia VARCHAR(20),
        provincia VARCHAR(5),
        terminal VARCHAR(10),
        numero_ticket VARCHAR(20),
        numeros VARCHAR(255),
        instancia TINYINT DEFAULT 1,
        cantidad_apuestas INT DEFAULT 1,
        importe DECIMAL(10,2) DEFAULT 0,
        es_anulado TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_brinco_ticket_cp (control_previo_id),
        KEY idx_brinco_ticket_agencia (agencia),
        KEY idx_brinco_ticket_sorteo (numero_sorteo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  control_previo_brinco_tickets creada');

    // Escrutinio BRINCO
    await connection.query(`
      CREATE TABLE IF NOT EXISTS escrutinio_brinco (
        id INT PRIMARY KEY AUTO_INCREMENT,
        numero_sorteo VARCHAR(10) NOT NULL,
        fecha DATE,
        numeros_sorteados VARCHAR(100),
        total_apostadores INT DEFAULT 0,
        total_ganadores INT DEFAULT 0,
        total_premios DECIMAL(15,2) DEFAULT 0,
        datos_json LONGTEXT,
        usuario_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_escrutinio_brinco (numero_sorteo),
        KEY idx_escrutinio_brinco_fecha (fecha)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  escrutinio_brinco creada');

    // Ganadores BRINCO (detalle por agencia)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS escrutinio_brinco_ganadores (
        id INT PRIMARY KEY AUTO_INCREMENT,
        escrutinio_id INT NOT NULL,
        numero_sorteo VARCHAR(10) NOT NULL,
        agencia VARCHAR(20),
        provincia VARCHAR(5),
        modalidad VARCHAR(50),
        aciertos INT,
        cantidad_ganadores INT DEFAULT 0,
        premio_unitario DECIMAL(15,2) DEFAULT 0,
        premio_total DECIMAL(15,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_brinco_ganador_escrutinio (escrutinio_id),
        KEY idx_brinco_ganador_agencia (agencia),
        KEY idx_brinco_ganador_sorteo (numero_sorteo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  escrutinio_brinco_ganadores creada');

    console.log('\nMigration BRINCO completada exitosamente');

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
