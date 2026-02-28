/**
 * Migración: Unicidad de extractos por juego + numero_sorteo + provincia
 *
 * Regla de negocio:
 * - El mismo numero_sorteo puede existir en distintas provincias.
 * - NO puede repetirse la misma provincia dentro del mismo numero_sorteo del mismo juego.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'control_loterias'
  });

  console.log('🔄 Iniciando migración: unicidad extractos por sorteo+provincia...');

  try {
    // 1) Limpiar duplicados históricos por clave de negocio (solo provincias no nulas)
    // Se conserva el registro más reciente (id mayor).
    const [cleanup] = await connection.execute(`
      DELETE e1
      FROM extractos e1
      INNER JOIN extractos e2
        ON e1.juego_id = e2.juego_id
       AND e1.numero_sorteo = e2.numero_sorteo
       AND e1.provincia_id = e2.provincia_id
       AND e1.provincia_id IS NOT NULL
       AND e1.id < e2.id
    `);
    console.log(`✅ Duplicados eliminados: ${cleanup.affectedRows || 0}`);

    // 2) Crear índice único si no existe
    const [indexes] = await connection.execute(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'extractos'
        AND INDEX_NAME = 'uk_extractos_juego_sorteo_provincia'
      LIMIT 1
    `);

    if (indexes.length === 0) {
      await connection.execute(`
        ALTER TABLE extractos
        ADD UNIQUE KEY uk_extractos_juego_sorteo_provincia (juego_id, numero_sorteo, provincia_id)
      `);
      console.log('✅ Índice único creado: uk_extractos_juego_sorteo_provincia');
    } else {
      console.log('ℹ️ El índice único ya existe: uk_extractos_juego_sorteo_provincia');
    }

    // 3) Índice auxiliar para consultas de upsert por clave de negocio
    const [idxLookup] = await connection.execute(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'extractos'
        AND INDEX_NAME = 'idx_extractos_juego_numero_provincia'
      LIMIT 1
    `);

    if (idxLookup.length === 0) {
      await connection.execute(`
        ALTER TABLE extractos
        ADD INDEX idx_extractos_juego_numero_provincia (juego_id, numero_sorteo, provincia_id)
      `);
      console.log('✅ Índice auxiliar creado: idx_extractos_juego_numero_provincia');
    } else {
      console.log('ℹ️ El índice auxiliar ya existe: idx_extractos_juego_numero_provincia');
    }

    console.log('✅ Migración completada exitosamente');
  } catch (error) {
    console.error('❌ Error en migración:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

migrate().catch(console.error);
