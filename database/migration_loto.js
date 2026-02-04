/**
 * Migration: Tablas para Control Previo y Escrutinio de LOTO
 * 
 * Ejecutar con: node database/migration_loto.js
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

const migration = `
-- ============================================
-- TABLAS PARA LOTO PLUS
-- ============================================

-- Control Previo Loto (resumen por modalidad)
CREATE TABLE IF NOT EXISTS control_previo_loto (
  id INT PRIMARY KEY AUTO_INCREMENT,
  fecha DATE NOT NULL,
  numero_sorteo INT NOT NULL,
  
  -- Totales generales (suma de todas las modalidades)
  total_registros INT DEFAULT 0,
  total_tickets INT DEFAULT 0,
  total_apuestas INT DEFAULT 0,
  total_anulados INT DEFAULT 0,
  total_recaudacion DECIMAL(15,2) DEFAULT 0,
  
  -- Desglose por modalidad (JSON)
  modalidades JSON COMMENT 'Datos por modalidad: Tradicional, Match, Desquite, Sale o Sale, Multiplicador',
  
  -- Desglose por provincia (JSON)
  provincias JSON COMMENT 'Recaudación y apuestas por provincia',
  
  -- Archivo procesado
  nombre_archivo_zip VARCHAR(255),
  hash_archivo VARCHAR(64),
  hash_verificado BOOLEAN DEFAULT FALSE,
  
  -- Comparación con XML oficial (UTE)
  comparacion_xml JSON COMMENT 'Diferencias entre TXT calculado y XML oficial',
  datos_oficiales JSON COMMENT 'Datos del XML completo (premios, pozos, etc)',
  
  -- Datos adicionales
  datos_adicionales JSON,
  
  -- Auditoría
  usuario_id INT,
  usuario_nombre VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_loto_sorteo (fecha, numero_sorteo),
  INDEX idx_fecha (fecha),
  INDEX idx_sorteo (numero_sorteo),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Escrutinio Loto (resultado del control posterior)
CREATE TABLE IF NOT EXISTS escrutinio_loto (
  id INT PRIMARY KEY AUTO_INCREMENT,
  control_previo_id INT COMMENT 'FK a control_previo_loto',
  numero_sorteo VARCHAR(20) NOT NULL,
  fecha_sorteo DATE,
  
  -- Totales generales
  total_ganadores INT DEFAULT 0,
  total_premios DECIMAL(15,2) DEFAULT 0,
  
  -- Extracto utilizado (JSON con los 4 extractos + plus)
  extracto JSON COMMENT 'tradicional, match, desquite, saleOSale, plus',
  
  -- Resultado completo (JSON)
  datos_json JSON COMMENT 'Resultado completo del escrutinio por modalidad',
  
  -- Auditoría
  usuario_id INT,
  usuario_nombre VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_escrutinio_loto (numero_sorteo),
  INDEX idx_fecha (fecha_sorteo),
  INDEX idx_sorteo (numero_sorteo),
  FOREIGN KEY (control_previo_id) REFERENCES control_previo_loto(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Escrutinio Tombolina (si no existe)
CREATE TABLE IF NOT EXISTS escrutinio_tombolina (
  id INT PRIMARY KEY AUTO_INCREMENT,
  control_previo_id INT COMMENT 'FK a control_previo_tombolina',
  numero_sorteo VARCHAR(20) NOT NULL,
  fecha_sorteo DATE,
  
  -- Totales
  total_ganadores INT DEFAULT 0,
  total_premios DECIMAL(15,2) DEFAULT 0,
  
  -- Extracto utilizado
  extracto JSON COMMENT '20 números sorteados',
  
  -- Resultado completo (JSON)
  datos_json JSON COMMENT 'Resultado completo del escrutinio',
  
  -- Auditoría
  usuario_id INT,
  usuario_nombre VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_escrutinio_tombolina (numero_sorteo),
  INDEX idx_fecha (fecha_sorteo),
  FOREIGN KEY (control_previo_id) REFERENCES control_previo_tombolina(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function runMigration() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    });

    console.log('🔌 Conectado a MySQL');

    // Usar la base de datos
    await connection.query(`USE ${DB_NAME}`);
    console.log(`✅ Usando base de datos: ${DB_NAME}`);

    // Ejecutar migration
    console.log('🔄 Ejecutando migration de tablas LOTO...\n');
    
    const statements = migration.split(';').filter(s => s.trim().length > 0);
    
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed.length > 0) {
        try {
          await connection.query(trimmed);
          // Extraer nombre de tabla del statement
          const match = trimmed.match(/CREATE TABLE IF NOT EXISTS\s+(\S+)/i);
          if (match) {
            console.log(`  ✅ ${match[1]}`);
          }
        } catch (err) {
          if (err.code === 'ER_TABLE_EXISTS_ERROR') {
            const match = trimmed.match(/CREATE TABLE.*?(\S+)\s*\(/i);
            console.log(`  ⚠️ ${match ? match[1] : 'tabla'} ya existe`);
          } else {
            throw err;
          }
        }
      }
    }

    console.log('\n✅ Migration LOTO completada exitosamente!');
    console.log('\n📋 Tablas creadas:');
    console.log('   - control_previo_loto');
    console.log('   - escrutinio_loto');
    console.log('   - escrutinio_tombolina');

  } catch (error) {
    console.error('❌ Error en migration:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Ejecutar
runMigration();
