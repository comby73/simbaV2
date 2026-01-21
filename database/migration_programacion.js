/**
 * Migración: Crear tabla de programación de sorteos
 * Esta tabla almacena la programación mensual de cada juego
 * Permite validar que las provincias en el NTF coincidan con las habilitadas
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const os = require('os');

// Detectar si es local o producción
function isProduction() {
  const hostname = os.hostname();
  return process.env.NODE_ENV === 'production' || 
         hostname.includes('hostinger') || 
         hostname.includes('server') ||
         hostname === 'srv522141';
}

const getDbConfig = () => {
  if (isProduction()) {
    return {
      host: '127.0.0.1',
      port: 3306,
      user: 'u870508525_simba',
      password: 'Machu1733*',
      database: 'u870508525_control_loteri'
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'control_loterias'
  };
};

async function migrate() {
  const config = getDbConfig();
  console.log('🔌 Conectando a:', config.host, '/', config.database);
  
  const connection = await mysql.createConnection(config);

  console.log('🔄 Iniciando migración de programación de sorteos...');

  try {
    // Crear tabla de programación
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS programacion_sorteos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        juego VARCHAR(50) NOT NULL COMMENT 'Quiniela, Poceada, Tombolina, Loto, Loto5, etc.',
        numero_sorteo VARCHAR(20) NOT NULL,
        fecha_sorteo DATE NOT NULL,
        hora_sorteo TIME,
        modalidad_codigo CHAR(2) COMMENT 'R=Previa, P=Primera, M=Matutina, V=Vespertina, N=Nocturna',
        modalidad_nombre VARCHAR(50) COMMENT 'LA PREVIA, PRIMERA, MATUTINA, VESPERTINA, NOCTURNA',
        
        -- Provincias habilitadas (solo para Quiniela)
        prov_caba TINYINT(1) DEFAULT 0 COMMENT 'Ciudad Autónoma',
        prov_bsas TINYINT(1) DEFAULT 0 COMMENT 'Buenos Aires',
        prov_cordoba TINYINT(1) DEFAULT 0 COMMENT 'Córdoba',
        prov_santafe TINYINT(1) DEFAULT 0 COMMENT 'Santa Fe',
        prov_montevideo TINYINT(1) DEFAULT 0 COMMENT 'Montevideo/Uruguay',
        prov_santiago TINYINT(1) DEFAULT 0 COMMENT 'Santiago del Estero',
        prov_mendoza TINYINT(1) DEFAULT 0 COMMENT 'Mendoza',
        prov_entrerios TINYINT(1) DEFAULT 0 COMMENT 'Entre Ríos',
        
        -- Fechas de pago y ventas
        fecha_inicio_pago DATE,
        inicio_pago_ute DATE COMMENT 'Inicio Pago UTE Sistema',
        fecha_prescripcion DATE,
        fecha_apertura_vtas DATE,
        hora_apertura_vtas TIME,
        fecha_cierre_vtas DATE,
        hora_cierre_vtas TIME,
        dias_vta INT COMMENT 'Días de venta',
        
        -- Metadatos
        mes_carga VARCHAR(7) COMMENT 'YYYY-MM del Excel cargado',
        archivo_origen VARCHAR(255) COMMENT 'Nombre del archivo Excel',
        activo TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        -- Índices
        INDEX idx_juego_fecha (juego, fecha_sorteo),
        INDEX idx_numero_sorteo (numero_sorteo),
        INDEX idx_fecha_modalidad (fecha_sorteo, modalidad_codigo),
        UNIQUE KEY uk_sorteo (juego, numero_sorteo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='Programación mensual de sorteos por juego'
    `);
    console.log('✅ Tabla programacion_sorteos creada');

    // Crear tabla de log de cargas
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS programacion_cargas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        juego VARCHAR(50) NOT NULL,
        mes_carga VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
        archivo_nombre VARCHAR(255),
        registros_cargados INT DEFAULT 0,
        registros_actualizados INT DEFAULT 0,
        usuario_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        INDEX idx_juego_mes (juego, mes_carga)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='Log de cargas de programación'
    `);
    console.log('✅ Tabla programacion_cargas creada');

    // ============================================
    // PERMISOS DE PROGRAMACIÓN
    // ============================================
    console.log('🔐 Insertando permisos de programación...');
    await connection.execute(`
      INSERT IGNORE INTO permisos (codigo, nombre, modulo) VALUES
      ('programacion.ver', 'Ver programación de sorteos', 'programacion'),
      ('programacion.cargar', 'Cargar programación desde Excel', 'programacion'),
      ('programacion.editar', 'Editar programación', 'programacion'),
      ('programacion.eliminar', 'Eliminar programación', 'programacion')
    `);
    console.log('✅ Permisos insertados');

    // Asignar permisos al admin (todos)
    await connection.execute(`
      INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r, permisos p 
      WHERE r.codigo = 'admin' AND p.modulo = 'programacion'
    `);

    // Asignar permisos de ver y cargar al operador
    await connection.execute(`
      INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r, permisos p 
      WHERE r.codigo = 'operador' AND p.codigo IN ('programacion.ver', 'programacion.cargar')
    `);

    // Asignar permiso de ver al analista y auditor
    await connection.execute(`
      INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r, permisos p 
      WHERE r.codigo IN ('analista', 'auditor') AND p.codigo = 'programacion.ver'
    `);
    console.log('✅ Permisos asignados a roles');

    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Migración de programación completada exitosamente');
    console.log('═══════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error en migración:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

migrate().catch(console.error);
