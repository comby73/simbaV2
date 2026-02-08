/**
 * Migración: Normalizar formato agency en facturacion_turfito
 * Agregar guión para que coincida con cta_cte de otros juegos
 * Formato: "5100019" -> "51-00019"
 * 
 * Uso: node database/migration_hipicas_guion.js
 */

const path = require('path');
const fs = require('fs');

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

  console.log('🔧 Normalizando formato agency en facturacion_turfito...\n');

  try {
    // 1. Ver formato actual
    const [antes] = await connection.execute(`
      SELECT agency, LENGTH(agency) as len, COUNT(*) as cnt 
      FROM facturacion_turfito 
      GROUP BY agency, LENGTH(agency) 
      LIMIT 5
    `);
    console.log('📋 Formato ANTES:');
    antes.forEach(r => console.log(`   ${r.agency} (${r.len} chars) - ${r.cnt} registros`));

    // 2. Agregar guión: "5100019" -> "51-00019"
    const [result] = await connection.execute(`
      UPDATE facturacion_turfito 
      SET agency = CONCAT(SUBSTRING(agency, 1, 2), '-', SUBSTRING(agency, 3))
      WHERE agency NOT LIKE '%-%' 
        AND LENGTH(agency) = 7
    `);
    console.log(`\n✅ Registros actualizados: ${result.affectedRows}`);

    // 3. Verificar después
    const [despues] = await connection.execute(`
      SELECT agency, LENGTH(agency) as len, COUNT(*) as cnt 
      FROM facturacion_turfito 
      GROUP BY agency, LENGTH(agency) 
      ORDER BY cnt DESC
      LIMIT 5
    `);
    console.log('\n📋 Formato DESPUÉS:');
    despues.forEach(r => console.log(`   ${r.agency} (${r.len} chars) - ${r.cnt} registros`));

    console.log('\n🎉 Migración completada');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
