/**
 * Migración: Ampliar ENUM juego en escrutinio_premios_agencia
 * Agrega soporte para: tombolina, loto, loto5, quini6, brinco, hipodromo, quinielaya
 * 
 * Uso: node database/migration_premios_agencia_juegos.js
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

  console.log('🔧 Ampliando ENUM juego en escrutinio_premios_agencia...\n');

  try {
    // 1. Ampliar ENUM en escrutinio_premios_agencia
    await connection.execute(`
      ALTER TABLE escrutinio_premios_agencia 
      MODIFY COLUMN juego ENUM('quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'quini6', 'brinco', 'hipodromo', 'quinielaya') NOT NULL
    `);
    console.log('✅ ENUM juego ampliado en escrutinio_premios_agencia');

    // 2. Ampliar ENUM en escrutinio_ganadores si existe
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'escrutinio_ganadores'
    `);
    
    if (tables.length > 0) {
      await connection.execute(`
        ALTER TABLE escrutinio_ganadores 
        MODIFY COLUMN juego ENUM('quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'quini6', 'brinco', 'hipodromo', 'quinielaya') NOT NULL
      `);
      console.log('✅ ENUM juego ampliado en escrutinio_ganadores');
    }

    console.log('\n🎉 Migración completada exitosamente');

  } catch (error) {
    if (error.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || error.message.includes('Data truncated')) {
      console.error('❌ Error: Hay datos que no coinciden con el nuevo ENUM');
    } else if (error.message.includes('Unknown column')) {
      console.log('ℹ️ Tabla no tiene columna juego');
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
