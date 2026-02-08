/**
 * Migración: escrutinio_loto_ganadores
 * Tabla para almacenar ganadores detallados por modalidad y nivel de aciertos
 * 
 * Uso: node database/migration_loto_ganadores.js
 */

const path = require('path');
const fs = require('fs');

// Cargar .env.local primero si existe (para desarrollo), sino .env (producción)
const envLocalPath = path.join(__dirname, '../.env.local');
const envPath = path.join(__dirname, '../.env');

if (fs.existsSync(envLocalPath)) {
  require('dotenv').config({ path: envLocalPath });
  console.log('📁 Usando configuración: .env.local');
} else {
  require('dotenv').config({ path: envPath });
  console.log('📁 Usando configuración: .env');
}

const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'control_loterias';

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: DB_NAME
  });

  console.log('🔧 Creando tabla escrutinio_loto_ganadores...\n');

  try {
    // Tabla de ganadores detallados por modalidad y nivel
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS escrutinio_loto_ganadores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        escrutinio_id INT NOT NULL,
        numero_sorteo VARCHAR(20) NOT NULL,
        modalidad ENUM('TRADICIONAL', 'MATCH', 'DESQUITE', 'SALE_O_SALE', 'MULTIPLICADOR') NOT NULL,
        aciertos TINYINT NOT NULL COMMENT '6=primero, 5=segundo, 4=tercero, 0=agenciero',
        cantidad_ganadores INT DEFAULT 0,
        premio_unitario DECIMAL(18,2) DEFAULT 0,
        premio_total DECIMAL(18,2) DEFAULT 0,
        pozo_xml DECIMAL(18,2) DEFAULT 0 COMMENT 'Pozo del XML Control Previo',
        pozo_vacante DECIMAL(18,2) DEFAULT 0 COMMENT 'Pozo vacante (sin ganadores)',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        INDEX idx_escrutinio (escrutinio_id),
        INDEX idx_sorteo (numero_sorteo),
        INDEX idx_modalidad_aciertos (modalidad, aciertos),
        
        FOREIGN KEY (escrutinio_id) REFERENCES escrutinio_loto(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ Tabla escrutinio_loto_ganadores creada correctamente');

    // Verificar columna extracto en escrutinio_loto
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'escrutinio_loto' 
      AND COLUMN_NAME = 'extracto'
    `);

    if (columns.length === 0) {
      console.log('📝 Agregando columna extracto a escrutinio_loto...');
      await connection.execute(`
        ALTER TABLE escrutinio_loto 
        ADD COLUMN extracto JSON NULL COMMENT 'Datos del extracto usado' AFTER total_premios
      `);
      console.log('✅ Columna extracto agregada');
    }

    console.log('\n🎉 Migración completada exitosamente');

  } catch (error) {
    if (error.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('ℹ️ La tabla ya existe');
    } else {
      console.error('❌ Error en migración:', error.message);
      throw error;
    }
  } finally {
    await connection.end();
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
