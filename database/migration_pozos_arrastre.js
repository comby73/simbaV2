require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'control_loterias';

async function migrate() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: DB_NAME
    });

    console.log('🔄 Agregando columnas de arrastres a poceada_sorteos...');

    // Columnas de arrastre separadas (los arrastres que se LLEVAN al sorteo siguiente)
    // pozo_arrastre_siguiente ya existe y es el arrastre del 1er premio
    const columnas = [
      { nombre: 'arrastre_segundo_premio', despues: 'pozo_arrastre_siguiente' },
      { nombre: 'arrastre_tercer_premio', despues: 'arrastre_segundo_premio' },
      { nombre: 'arrastre_agenciero', despues: 'arrastre_tercer_premio' }
    ];

    for (const col of columnas) {
      try {
        await connection.execute(
          `ALTER TABLE poceada_sorteos ADD COLUMN ${col.nombre} DECIMAL(15,2) DEFAULT 0 AFTER ${col.despues}`
        );
        console.log(`✅ Columna ${col.nombre} agregada`);
      } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
          console.log(`ℹ️ Columna ${col.nombre} ya existe`);
        } else {
          console.error(`⚠️ Error agregando ${col.nombre}:`, e.message);
        }
      }
    }

    console.log('✅ Migración completada');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

migrate();
