require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DB_NAME = process.env.DB_NAME || 'control_loterias';

async function seedDatabase() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: DB_NAME,
      multipleStatements: true
    });

    console.log('🔄 Insertando datos iniciales...');

    // ============================================
    // ROLES
    // ============================================
    console.log('👤 Insertando roles...');
    await connection.query(`
      INSERT IGNORE INTO roles (codigo, nombre, descripcion) VALUES
      ('admin', 'Administrador', 'Acceso total al sistema'),
      ('operador', 'Operador', 'Carga de archivos y control previo'),
      ('analista', 'Analista', 'Control posterior y reportes'),
      ('auditor', 'Auditor', 'Solo lectura y auditoría')
    `);

    // ============================================
    // PERMISOS
    // ============================================
    console.log('🔐 Insertando permisos...');
    await connection.query(`
      INSERT IGNORE INTO permisos (codigo, nombre, modulo) VALUES
      ('usuarios.ver', 'Ver usuarios', 'usuarios'),
      ('usuarios.crear', 'Crear usuarios', 'usuarios'),
      ('usuarios.editar', 'Editar usuarios', 'usuarios'),
      ('usuarios.eliminar', 'Eliminar usuarios', 'usuarios'),
      ('archivos.cargar', 'Cargar archivos', 'archivos'),
      ('archivos.ver', 'Ver archivos', 'archivos'),
      ('archivos.eliminar', 'Eliminar archivos', 'archivos'),
      ('extractos.cargar', 'Cargar extractos', 'extractos'),
      ('extractos.ver', 'Ver extractos', 'extractos'),
      ('extractos.editar', 'Editar extractos', 'extractos'),
      ('control_previo.ejecutar', 'Ejecutar control previo', 'control_previo'),
      ('control_previo.ver', 'Ver control previo', 'control_previo'),
      ('control_posterior.ejecutar', 'Ejecutar control posterior', 'control_posterior'),
      ('control_posterior.ver', 'Ver control posterior', 'control_posterior'),
      ('actas.generar', 'Generar actas', 'actas'),
      ('actas.ver', 'Ver actas', 'actas'),
      ('reportes.ver', 'Ver reportes', 'reportes'),
      ('reportes.exportar', 'Exportar reportes', 'reportes'),
      ('auditoria.ver', 'Ver auditoría', 'auditoria')
    `);

    // Asignar todos los permisos al admin
    await connection.query(`
      INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r, permisos p WHERE r.codigo = 'admin'
    `);

    // Permisos para operador
    await connection.query(`
      INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r, permisos p 
      WHERE r.codigo = 'operador' 
      AND p.codigo IN ('archivos.cargar', 'archivos.ver', 'extractos.cargar', 'extractos.ver', 
                       'control_previo.ejecutar', 'control_previo.ver')
    `);

    // Permisos para analista
    await connection.query(`
      INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r, permisos p 
      WHERE r.codigo = 'analista' 
      AND p.codigo IN ('archivos.ver', 'extractos.ver', 'control_previo.ver',
                       'control_posterior.ejecutar', 'control_posterior.ver',
                       'actas.generar', 'actas.ver', 'reportes.ver', 'reportes.exportar')
    `);

    // Permisos para auditor
    await connection.query(`
      INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r, permisos p 
      WHERE r.codigo = 'auditor' 
      AND p.codigo LIKE '%.ver'
    `);

    // ============================================
    // USUARIOS
    // ============================================
    console.log('👤 Insertando usuarios...');
    const passwordHash = await bcrypt.hash('admin123', 10);
    
    await connection.query(`
      INSERT IGNORE INTO usuarios (username, password, nombre, email, rol_id)
      SELECT 'admin', ?, 'Administrador', 'admin@sistema.com', id
      FROM roles WHERE codigo = 'admin'
    `, [passwordHash]);

    await connection.query(`
      INSERT IGNORE INTO usuarios (username, password, nombre, email, rol_id)
      SELECT 'operador', ?, 'Operador Sistema', 'operador@sistema.com', id
      FROM roles WHERE codigo = 'operador'
    `, [passwordHash]);

    await connection.query(`
      INSERT IGNORE INTO usuarios (username, password, nombre, email, rol_id)
      SELECT 'analista', ?, 'Analista Sistema', 'analista@sistema.com', id
      FROM roles WHERE codigo = 'analista'
    `, [passwordHash]);

    // ============================================
    // JUEGOS
    // ============================================
    console.log('🎰 Insertando juegos...');
    await connection.query(`
      INSERT IGNORE INTO juegos (codigo, nombre, descripcion, cantidad_numeros, tiene_letras, config) VALUES
      ('QUINIELA', 'Quiniela', 'Quiniela tradicional - 20 números y 4 letras', 20, TRUE, 
       '{"multiplicadores": {"1": 70, "2": 60, "3": 50, "4": 40, "5": 30}, "letras": 4}'),
      ('POCEADA', 'Poceada', 'Juego con pozo acumulado', 6, FALSE,
       '{"numeros_elegir": 6, "rango_min": 0, "rango_max": 45}'),
      ('QUINI6', 'Quini 6', 'Quini 6 nacional', 6, FALSE,
       '{"modalidades": ["tradicional", "revancha", "siempre_sale"], "rango": 46}'),
      ('LOTO', 'Loto', 'Loto tradicional', 6, FALSE,
       '{"numeros_elegir": 6, "rango_min": 0, "rango_max": 45}'),
      ('LOTO5', 'Loto 5', 'Loto 5 números', 5, FALSE,
       '{"numeros_elegir": 5, "rango_min": 0, "rango_max": 40}')
    `);

    // ============================================
    // SORTEOS (horarios de Quiniela)
    // ============================================
    console.log('🎲 Insertando sorteos...');
    await connection.query(`
      INSERT IGNORE INTO sorteos (juego_id, codigo, nombre, hora_sorteo, hora_cierre)
      SELECT id, 'PRIM', 'Primera', '12:00:00', '11:30:00' FROM juegos WHERE codigo = 'QUINIELA'
    `);
    await connection.query(`
      INSERT IGNORE INTO sorteos (juego_id, codigo, nombre, hora_sorteo, hora_cierre)
      SELECT id, 'MAT', 'Matutina', '15:00:00', '14:30:00' FROM juegos WHERE codigo = 'QUINIELA'
    `);
    await connection.query(`
      INSERT IGNORE INTO sorteos (juego_id, codigo, nombre, hora_sorteo, hora_cierre)
      SELECT id, 'VESP', 'Vespertina', '18:00:00', '17:30:00' FROM juegos WHERE codigo = 'QUINIELA'
    `);
    await connection.query(`
      INSERT IGNORE INTO sorteos (juego_id, codigo, nombre, hora_sorteo, hora_cierre)
      SELECT id, 'NOCT', 'Nocturna', '21:00:00', '20:30:00' FROM juegos WHERE codigo = 'QUINIELA'
    `);

    // Sorteos de Poceada
    await connection.query(`
      INSERT IGNORE INTO sorteos (juego_id, codigo, nombre, hora_sorteo, hora_cierre)
      SELECT id, 'UNICO', 'Sorteo Único', '21:30:00', '21:00:00' FROM juegos WHERE codigo = 'POCEADA'
    `);

    // ============================================
    // PROVINCIAS
    // ============================================
    console.log('🗺️ Insertando provincias...');
    await connection.query(`
      INSERT IGNORE INTO provincias (codigo, nombre, codigo_luba) VALUES
      ('CABA', 'Ciudad Autónoma', '51'),
      ('PBA', 'Buenos Aires', '53'),
      ('CBA', 'Córdoba', '55'),
      ('SFE', 'Santa Fe', '72'),
      ('MZA', 'Mendoza', '64'),
      ('ENR', 'Entre Ríos', '59'),
      ('URU', 'Uruguay', '0'),
      ('SGO', 'Santiago', '63'),
      ('CTE', 'Corrientes', '57'),
      ('NEU', 'Neuquén', '67'),
      ('SJN', 'San Juan', '69')
    `);

    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Datos iniciales insertados correctamente');
    console.log('');
    console.log('👤 USUARIOS CREADOS:');
    console.log('   admin / admin123 (Administrador)');
    console.log('   operador / admin123 (Operador)');
    console.log('   analista / admin123 (Analista)');
    console.log('═══════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error insertando datos:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

seedDatabase();
