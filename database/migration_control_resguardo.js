/**
 * Migration: Tablas de resguardo para Control Previo y Posterior
 * 
 * Ejecutar con: node database/migration_control_resguardo.js
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
-- TABLAS DE RESGUARDO - CONTROL PREVIO
-- ============================================

-- Control Previo Quiniela (solo totales)
CREATE TABLE IF NOT EXISTS control_previo_quiniela (
  id INT PRIMARY KEY AUTO_INCREMENT,
  fecha DATE NOT NULL,
  numero_sorteo INT NOT NULL,
  modalidad VARCHAR(10) NOT NULL COMMENT 'R=Previa, P=Primera, M=Matutina, V=Vespertina, N=Nocturna',
  
  -- Totales
  total_registros INT DEFAULT 0,
  total_tickets INT DEFAULT 0,
  total_apuestas INT DEFAULT 0,
  total_anulados INT DEFAULT 0,
  total_recaudacion DECIMAL(15,2) DEFAULT 0,
  
  -- Archivo procesado
  nombre_archivo_zip VARCHAR(255),
  hash_archivo VARCHAR(64),
  hash_verificado BOOLEAN DEFAULT FALSE,
  
  -- Comparación con XML oficial
  comparacion_xml JSON COMMENT 'Diferencias TXT vs XML',
  datos_adicionales JSON COMMENT 'Info extra del procesamiento',
  
  -- Auditoría
  usuario_id INT,
  usuario_nombre VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_quiniela_sorteo (fecha, numero_sorteo, modalidad),
  INDEX idx_fecha (fecha),
  INDEX idx_sorteo (numero_sorteo),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Control Previo Poceada (solo totales)
CREATE TABLE IF NOT EXISTS control_previo_poceada (
  id INT PRIMARY KEY AUTO_INCREMENT,
  fecha DATE NOT NULL,
  numero_sorteo INT NOT NULL,
  
  -- Totales
  total_registros INT DEFAULT 0,
  total_tickets INT DEFAULT 0,
  total_apuestas INT DEFAULT 0,
  total_anulados INT DEFAULT 0,
  total_recaudacion DECIMAL(15,2) DEFAULT 0,
  
  -- Archivo procesado
  nombre_archivo_zip VARCHAR(255),
  hash_archivo VARCHAR(64),
  hash_verificado BOOLEAN DEFAULT FALSE,
  
  -- Comparación con XML oficial
  comparacion_xml JSON COMMENT 'Diferencias TXT vs XML',
  
  -- Distribución de premios calculada
  distribucion_premios JSON COMMENT 'Primer, segundo, tercer premio, fondo reserva, etc.',
  pozos_arrastre JSON COMMENT 'Pozos vacantes de sorteos anteriores',
  
  datos_adicionales JSON,
  
  -- Auditoría
  usuario_id INT,
  usuario_nombre VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_poceada_sorteo (fecha, numero_sorteo),
  INDEX idx_fecha (fecha),
  INDEX idx_sorteo (numero_sorteo),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLAS DE RESGUARDO - CONTROL POSTERIOR (ESCRUTINIO)
-- ============================================

-- Escrutinio Quiniela (resumen)
CREATE TABLE IF NOT EXISTS escrutinio_quiniela (
  id INT PRIMARY KEY AUTO_INCREMENT,
  control_previo_id INT COMMENT 'FK a control_previo_quiniela',
  extracto_id INT COMMENT 'FK a extractos',
  fecha DATE NOT NULL,
  numero_sorteo INT NOT NULL,
  modalidad VARCHAR(10) NOT NULL,
  
  -- Totales
  total_ganadores INT DEFAULT 0,
  total_premios DECIMAL(15,2) DEFAULT 0,
  
  -- Desglose por tipo de premio
  resumen_premios JSON COMMENT 'Por cifras, redoblona, letras, por extracto',
  
  datos_adicionales JSON,
  
  -- Auditoría
  usuario_id INT,
  usuario_nombre VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_escrutinio_quiniela (fecha, numero_sorteo, modalidad),
  INDEX idx_fecha (fecha),
  INDEX idx_sorteo (numero_sorteo),
  FOREIGN KEY (control_previo_id) REFERENCES control_previo_quiniela(id) ON DELETE SET NULL,
  FOREIGN KEY (extracto_id) REFERENCES extractos(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Escrutinio Poceada (resumen)
CREATE TABLE IF NOT EXISTS escrutinio_poceada (
  id INT PRIMARY KEY AUTO_INCREMENT,
  control_previo_id INT COMMENT 'FK a control_previo_poceada',
  extracto_id INT COMMENT 'FK a extractos',
  fecha DATE NOT NULL,
  numero_sorteo INT NOT NULL,
  
  -- Totales
  total_ganadores INT DEFAULT 0,
  total_premios DECIMAL(15,2) DEFAULT 0,
  
  -- Desglose por nivel de aciertos
  ganadores_8_aciertos INT DEFAULT 0,
  premio_8_aciertos DECIMAL(15,2) DEFAULT 0,
  ganadores_7_aciertos INT DEFAULT 0,
  premio_7_aciertos DECIMAL(15,2) DEFAULT 0,
  ganadores_6_aciertos INT DEFAULT 0,
  premio_6_aciertos DECIMAL(15,2) DEFAULT 0,
  ganadores_letras INT DEFAULT 0,
  premio_letras DECIMAL(15,2) DEFAULT 0,
  
  resumen_premios JSON COMMENT 'Desglose completo',
  
  datos_adicionales JSON,
  
  -- Auditoría
  usuario_id INT,
  usuario_nombre VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_escrutinio_poceada (fecha, numero_sorteo),
  INDEX idx_fecha (fecha),
  INDEX idx_sorteo (numero_sorteo),
  FOREIGN KEY (control_previo_id) REFERENCES control_previo_poceada(id) ON DELETE SET NULL,
  FOREIGN KEY (extracto_id) REFERENCES extractos(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PREMIOS POR AGENCIA/PROVINCIA (acumulado post-escrutinio)
-- ============================================

-- Premios acumulados por agencia (CABA) o provincia (resto)
CREATE TABLE IF NOT EXISTS escrutinio_premios_agencia (
  id INT PRIMARY KEY AUTO_INCREMENT,
  escrutinio_id INT NOT NULL COMMENT 'FK genérico al escrutinio',
  juego ENUM('quiniela', 'poceada') NOT NULL,
  
  -- Tipo de agrupación
  tipo_agrupacion ENUM('agencia', 'provincia') NOT NULL COMMENT 'agencia=CABA individual, provincia=acumulado',
  codigo_provincia VARCHAR(2) NOT NULL COMMENT '51=CABA, 53=BsAs, etc.',
  codigo_agencia VARCHAR(5) NULL COMMENT 'Solo para CABA (tipo=agencia)',
  cta_cte VARCHAR(10) NOT NULL COMMENT '51-12345 o 53 (acumulado)',
  nombre_display VARCHAR(50) NOT NULL COMMENT 'Para mostrar: 51-12345 o BUENOS AIRES',
  
  -- Totales
  total_ganadores INT DEFAULT 0,
  total_premios DECIMAL(15,2) DEFAULT 0,
  
  UNIQUE KEY uk_premio_agencia (escrutinio_id, juego, cta_cte),
  INDEX idx_provincia (codigo_provincia),
  INDEX idx_cta_cte (cta_cte),
  INDEX idx_escrutinio (escrutinio_id, juego)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DETALLE DE GANADORES (para auditoría)
-- ============================================

CREATE TABLE IF NOT EXISTS escrutinio_ganadores (
  id INT PRIMARY KEY AUTO_INCREMENT,
  escrutinio_id INT NOT NULL COMMENT 'FK genérico al escrutinio',
  juego ENUM('quiniela', 'poceada') NOT NULL,
  
  -- DATOS DEL TICKET
  numero_ticket VARCHAR(20) NOT NULL,
  ordinal_apuesta VARCHAR(5) DEFAULT '01',
  cta_cte VARCHAR(10) NOT NULL COMMENT '51-12345',
  codigo_provincia VARCHAR(2) NOT NULL,
  codigo_agencia VARCHAR(5) NOT NULL,
  
  -- LA APUESTA (qué apostó)
  tipo_apuesta VARCHAR(20) NOT NULL COMMENT 'SIMPLE/REDOBLONA/POCEADA',
  numero_apostado VARCHAR(20) NULL COMMENT '45 o 45-78 (redoblona)',
  cifras INT NULL COMMENT '1,2,3,4 para Quiniela',
  ubicacion_desde INT NULL,
  ubicacion_hasta INT NULL,
  letras_apostadas VARCHAR(4) NULL,
  numeros_poceada TEXT NULL COMMENT 'Lista de números jugados (Poceada)',
  cantidad_numeros INT NULL COMMENT '8-15 para Poceada',
  
  -- PLATA APOSTADA
  importe_apuesta DECIMAL(10,2) NOT NULL,
  
  -- RESULTADO (por qué ganó)
  extracto_provincia VARCHAR(20) NULL COMMENT 'En qué lotería ganó (Quiniela)',
  posicion_ganadora INT NULL COMMENT 'Posición en extracto',
  numero_sorteado VARCHAR(10) NULL COMMENT 'Qué número salió',
  aciertos INT NULL COMMENT '6,7,8 para Poceada',
  tipo_premio VARCHAR(20) NOT NULL COMMENT 'SIMPLE/REDOBLONA/LETRAS/8AC/7AC/6AC',
  
  -- PREMIO A COBRAR
  premio DECIMAL(15,2) NOT NULL,
  
  INDEX idx_escrutinio (escrutinio_id, juego),
  INDEX idx_ticket (numero_ticket),
  INDEX idx_cta_cte (cta_cte),
  INDEX idx_provincia (codigo_provincia),
  INDEX idx_tipo_premio (tipo_premio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- VISTA ÚTIL: Resumen de premios por provincia
-- ============================================

CREATE OR REPLACE VIEW v_premios_por_provincia AS
SELECT 
  epa.escrutinio_id,
  epa.juego,
  epa.codigo_provincia,
  CASE epa.codigo_provincia
    WHEN '51' THEN 'Ciudad Autónoma'
    WHEN '53' THEN 'Buenos Aires'
    WHEN '54' THEN 'Catamarca'
    WHEN '55' THEN 'Córdoba'
    WHEN '56' THEN 'Corrientes'
    WHEN '57' THEN 'Chaco'
    WHEN '58' THEN 'Chubut'
    WHEN '59' THEN 'Entre Ríos'
    WHEN '60' THEN 'Formosa'
    WHEN '61' THEN 'Jujuy'
    WHEN '62' THEN 'La Pampa'
    WHEN '63' THEN 'La Rioja'
    WHEN '64' THEN 'Mendoza'
    WHEN '65' THEN 'Misiones'
    WHEN '66' THEN 'Neuquén'
    WHEN '67' THEN 'Río Negro'
    WHEN '68' THEN 'Salta'
    WHEN '69' THEN 'San Juan'
    WHEN '70' THEN 'San Luis'
    WHEN '71' THEN 'Santa Cruz'
    WHEN '72' THEN 'Santa Fe'
    WHEN '73' THEN 'Santiago del Estero'
    WHEN '74' THEN 'Tucumán'
    WHEN '75' THEN 'Tierra del Fuego'
    ELSE 'Desconocida'
  END AS nombre_provincia,
  SUM(epa.total_ganadores) AS total_ganadores,
  SUM(epa.total_premios) AS total_premios,
  COUNT(DISTINCT epa.cta_cte) AS cantidad_agencias
FROM escrutinio_premios_agencia epa
GROUP BY epa.escrutinio_id, epa.juego, epa.codigo_provincia;
`;

async function runMigration() {
  let connection;
  
  try {
    // Conectar sin especificar base de datos primero
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    });

    console.log('✅ Conectado a MySQL');

    // Usar la base de datos
    await connection.query(`USE ${DB_NAME}`);
    console.log(`✅ Usando base de datos: ${DB_NAME}`);

    // Ejecutar migration
    console.log('🔄 Ejecutando migration de tablas de resguardo...\n');
    
    const statements = migration.split(';').filter(s => s.trim().length > 0);
    
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed.length > 0) {
        try {
          await connection.query(trimmed);
          // Extraer nombre de tabla/vista del statement
          const match = trimmed.match(/(?:CREATE TABLE IF NOT EXISTS|CREATE OR REPLACE VIEW)\s+(\S+)/i);
          if (match) {
            console.log(`  ✅ ${match[1]}`);
          }
        } catch (err) {
          // Si es error de tabla ya existente, ignorar
          if (err.code === 'ER_TABLE_EXISTS_ERROR') {
            const match = trimmed.match(/CREATE TABLE.*?(\S+)\s*\(/i);
            console.log(`  ⚠️ ${match ? match[1] : 'tabla'} ya existe`);
          } else {
            throw err;
          }
        }
      }
    }

    console.log('\n✅ Migration completada exitosamente!');
    console.log('\n📋 Tablas creadas:');
    console.log('   - control_previo_quiniela');
    console.log('   - control_previo_poceada');
    console.log('   - escrutinio_quiniela');
    console.log('   - escrutinio_poceada');
    console.log('   - escrutinio_premios_agencia');
    console.log('   - escrutinio_ganadores');
    console.log('   - v_premios_por_provincia (vista)');

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
