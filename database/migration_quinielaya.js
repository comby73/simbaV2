/**
 * Migración: Quiniela Ya
 * - Crea tabla escrutinio_quiniela_ya
 * - Agrega quinielaya al ENUM juego en tablas compartidas
 *
 * Uso: node database/migration_quinielaya.js
 */

const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

const envLocalPath = path.join(__dirname, '../.env.local');
const envPath = path.join(__dirname, '../.env');

if (fs.existsSync(envLocalPath)) {
  require('dotenv').config({ path: envLocalPath });
  console.log('📁 Usando configuración: .env.local');
} else {
  require('dotenv').config({ path: envPath });
  console.log('📁 Usando configuración: .env');
}

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'control_loterias'
  });

  try {
    console.log('🔧 Creando tabla escrutinio_quiniela_ya...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS escrutinio_quiniela_ya (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fecha DATE NOT NULL,
        numero_sorteo INT NOT NULL,
        total_registros INT DEFAULT 0,
        total_tickets INT DEFAULT 0,
        total_apuestas INT DEFAULT 0,
        total_anulados INT DEFAULT 0,
        total_recaudacion DECIMAL(18,2) DEFAULT 0,
        total_premios DECIMAL(18,2) DEFAULT 0,
        total_ganadores INT DEFAULT 0,
        archivo_origen VARCHAR(255) NULL,
        usuario_id INT NULL,
        usuario_nombre VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_qya_sorteo (numero_sorteo),
        INDEX idx_qya_fecha (fecha),
        INDEX idx_qya_sorteo (numero_sorteo),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Tabla escrutinio_quiniela_ya creada/verificada');

    console.log('🔧 Ampliando ENUM juego en escrutinio_premios_agencia...');
    await connection.execute(`
      ALTER TABLE escrutinio_premios_agencia
      MODIFY COLUMN juego ENUM('quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'quini6', 'brinco', 'hipodromo', 'quinielaya') NOT NULL
    `);
    console.log('✅ ENUM actualizado en escrutinio_premios_agencia');

    const [hasGanadores] = await connection.execute(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'escrutinio_ganadores'
    `);
    if (hasGanadores.length > 0) {
      console.log('🔧 Ampliando ENUM juego en escrutinio_ganadores...');
      await connection.execute(`
        ALTER TABLE escrutinio_ganadores
        MODIFY COLUMN juego ENUM('quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'quini6', 'brinco', 'hipodromo', 'quinielaya') NOT NULL
      `);
      console.log('✅ ENUM actualizado en escrutinio_ganadores');
    }

    console.log('🔧 Agregando Quiniela Ya a tabla juegos (si no existe)...');
    await connection.execute(`
      INSERT INTO juegos (codigo, nombre, descripcion, activo)
      VALUES ('quinielaya', 'Quiniela Ya', 'Juego Quiniela Ya de la Ciudad', 1)
      ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), activo = VALUES(activo)
    `);
    console.log('✅ Registro quinielaya en tabla juegos verificado');

    console.log('🎉 Migración Quiniela Ya completada');
  } catch (error) {
    console.error('❌ Error en migración Quiniela Ya:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

migrate().catch(() => process.exit(1));

