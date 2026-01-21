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

  const sql = `
    CREATE TABLE IF NOT EXISTS poceada_sorteos (
        id INT PRIMARY KEY AUTO_INCREMENT,
        numero_sorteo VARCHAR(10) UNIQUE,
        fecha_sorteo DATE,
        recaudacion_bruta DECIMAL(15,2),
        pozo_primer_premio DECIMAL(15,2),
        pozo_segundo_premio DECIMAL(15,2),
        pozo_tercer_premio DECIMAL(15,2),
        ganadores_primer_premio INT DEFAULT 0,
        ganadores_segundo_premio INT DEFAULT 0,
        ganadores_tercer_premio INT DEFAULT 0,
        pozo_arrastre_siguiente DECIMAL(15,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await connection.query(sql);
    console.log('✅ Tabla poceada_sorteos creada correctamente');
    
    // Actualizar configuración del juego POCEADA
    await connection.query(`
      UPDATE juegos 
      SET 
        cantidad_numeros = 8, 
        tiene_letras = TRUE,
        config = '{"numeros_min": 8, "num_max": 15, "letras": 4, "rango_max": 99}'
      WHERE codigo = 'POCEADA'
    `);
    console.log('✅ Configuración de POCEADA actualizada');

  } catch (error) {
    console.error('❌ Error en la migración:', error);
  } finally {
    await connection.end();
  }
}

migrate();
