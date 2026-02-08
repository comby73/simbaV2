/**
 * Migración: Normalizar formato cta_cte en TODAS las tablas
 * Quitar guiones y asegurar formato numérico "51XXXXX" (7 dígitos)
 * 
 * Tablas afectadas:
 * - escrutinio_premios_agencia.cta_cte: "51-00011" → "5100011"
 * - facturacion_turfito.agency: Ya está bien pero verificar
 * 
 * Uso: node database/migration_normalizar_ctacte.js
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

  console.log('🔧 Normalizando formato cta_cte en todas las tablas...\n');

  try {
    // 1. Ver formato actual en escrutinio_premios_agencia
    console.log('=== escrutinio_premios_agencia ===');
    const [antes1] = await connection.execute(`
      SELECT cta_cte, COUNT(*) as cnt FROM escrutinio_premios_agencia 
      WHERE cta_cte LIKE '%-%'
      GROUP BY cta_cte LIMIT 5
    `);
    console.log(`📋 Registros con guión: ${antes1.length > 0 ? antes1.reduce((a, b) => a + b.cnt, 0) : 0}`);
    if (antes1.length > 0) {
      antes1.forEach(r => console.log(`   ${r.cta_cte} (${r.cnt})`));
    }

    // 2. Quitar guiones de escrutinio_premios_agencia
    const [result1] = await connection.execute(`
      UPDATE escrutinio_premios_agencia 
      SET cta_cte = REPLACE(cta_cte, '-', '')
      WHERE cta_cte LIKE '%-%'
    `);
    console.log(`✅ Corregidos: ${result1.affectedRows} registros`);

    // 3. Ver formato en facturacion_turfito
    console.log('\n=== facturacion_turfito ===');
    const [antes2] = await connection.execute(`
      SELECT agency, LENGTH(agency) as len, COUNT(*) as cnt 
      FROM facturacion_turfito 
      GROUP BY agency, LENGTH(agency) 
      ORDER BY len 
      LIMIT 5
    `);
    console.log('📋 Formato actual:');
    antes2.forEach(r => console.log(`   ${r.agency} (len=${r.len}, cnt=${r.cnt})`));

    // 4. Verificar si hay inconsistencias
    const [check] = await connection.execute(`
      SELECT agency, LENGTH(agency) as len FROM facturacion_turfito 
      WHERE LENGTH(agency) != 7 AND agency NOT LIKE '%-%'
      LIMIT 5
    `);
    if (check.length > 0) {
      console.log('⚠️ Registros con formato incorrecto:');
      check.forEach(r => console.log(`   ${r.agency} (len=${r.len})`));
    } else {
      console.log('✅ Todos los registros tienen formato correcto (7 dígitos)');
    }

    // 5. Verificar resultado final
    console.log('\n=== RESULTADO FINAL ===');
    const [final1] = await connection.execute(`
      SELECT DISTINCT cta_cte FROM escrutinio_premios_agencia ORDER BY cta_cte LIMIT 5
    `);
    console.log('escrutinio_premios_agencia:');
    final1.forEach(r => console.log(`   ${r.cta_cte}`));

    const [final2] = await connection.execute(`
      SELECT DISTINCT agency FROM facturacion_turfito ORDER BY agency LIMIT 5
    `);
    console.log('facturacion_turfito:');
    final2.forEach(r => console.log(`   ${r.agency}`));

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
