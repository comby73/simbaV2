/**
 * Migración: Corregir formato agency en facturacion_turfito
 * Agregar prefijo "51" (CABA) a las agencias que no lo tienen
 * 
 * Uso: node database/migration_hipicas_ctacte.js
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

  console.log('🔧 Corrigiendo formato agency en facturacion_turfito...\n');

  try {
    // 1. Verificar cuántos registros necesitan corrección
    const [beforeCount] = await connection.execute(`
      SELECT COUNT(*) as total FROM facturacion_turfito 
      WHERE LENGTH(agency) < 7 AND agency NOT LIKE '51%'
    `);
    console.log(`📊 Registros a corregir: ${beforeCount[0].total}`);

    if (beforeCount[0].total === 0) {
      console.log('✅ No hay registros que corregir');
      await connection.end();
      return;
    }

    // 2. Mostrar ejemplos antes
    const [ejemplos] = await connection.execute(`
      SELECT id, agency, sorteo FROM facturacion_turfito 
      WHERE LENGTH(agency) < 7 AND agency NOT LIKE '51%'
      LIMIT 5
    `);
    console.log('📋 Ejemplos antes de corrección:');
    ejemplos.forEach(e => console.log(`   ID ${e.id}: ${e.agency} → 51${e.agency.padStart(5, '0')}`));

    // 3. Actualizar: agregar prefijo "51" y padding a 5 dígitos
    // El formato final debe ser: 51XXXXX (7 caracteres: 2 prov + 5 agencia)
    const [result] = await connection.execute(`
      UPDATE facturacion_turfito 
      SET agency = CONCAT('51', LPAD(agency, 5, '0'))
      WHERE LENGTH(agency) < 7 AND agency NOT LIKE '51%'
    `);
    console.log(`\n✅ Registros actualizados: ${result.affectedRows}`);

    // 4. Verificar después
    const [afterSample] = await connection.execute(`
      SELECT agency, COUNT(*) as cnt FROM facturacion_turfito 
      GROUP BY agency ORDER BY cnt DESC LIMIT 10
    `);
    console.log('\n📋 Formato después de corrección:');
    afterSample.forEach(e => console.log(`   ${e.agency} (${e.cnt} registros)`));

    console.log('\n🎉 Migración completada exitosamente');

  } catch (error) {
    console.error('❌ Error en migración:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
