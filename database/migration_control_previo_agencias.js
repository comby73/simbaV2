/**
 * Migración: Crear tabla control_previo_agencias
 * 
 * Esta tabla guarda el desglose por agencia del Control Previo (NTF)
 * para poder consultar recaudación, apuestas, tickets por agencia.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
const mysql = require('mysql2/promise');

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'control_loterias'
  });

  console.log('🔄 Iniciando migración: control_previo_agencias...\n');

  try {
    // Crear tabla control_previo_agencias
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS control_previo_agencias (
        id INT PRIMARY KEY AUTO_INCREMENT,
        control_previo_id INT NOT NULL,
        juego VARCHAR(20) NOT NULL COMMENT 'quiniela o poceada',
        fecha DATE NOT NULL,
        numero_sorteo INT NOT NULL,
        modalidad VARCHAR(10) DEFAULT 'N',
        codigo_agencia VARCHAR(10) NOT NULL COMMENT 'Código completo ej: 5100001',
        codigo_provincia VARCHAR(2) NOT NULL COMMENT 'Código provincia ej: 51',
        total_tickets INT DEFAULT 0,
        total_apuestas INT DEFAULT 0,
        total_anulados INT DEFAULT 0,
        total_recaudacion DECIMAL(15,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cp_id (control_previo_id),
        INDEX idx_fecha (fecha),
        INDEX idx_sorteo (numero_sorteo),
        INDEX idx_agencia (codigo_agencia),
        INDEX idx_provincia (codigo_provincia),
        INDEX idx_juego (juego),
        UNIQUE KEY unique_agencia_sorteo (juego, fecha, numero_sorteo, modalidad, codigo_agencia)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Tabla control_previo_agencias creada');

    // Verificar estructura
    const [columns] = await connection.execute('DESCRIBE control_previo_agencias');
    console.log('\n📋 Estructura de la tabla:');
    columns.forEach(col => {
      console.log(`   - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : ''} ${col.Key ? `(${col.Key})` : ''}`);
    });

    console.log('\n✅ Migración completada exitosamente');

  } catch (error) {
    if (error.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('⚠️  La tabla ya existe');
    } else {
      console.error('❌ Error en migración:', error.message);
      throw error;
    }
  } finally {
    await connection.end();
  }
}

migrate().catch(console.error);
