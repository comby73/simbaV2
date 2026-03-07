require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
const mysql = require('mysql2/promise');

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'control_loterias',
    multipleStatements: true
  });

  console.log('Iniciando migracion de scoring_agencias...');

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS scoring_modelo_parametros (
        id INT PRIMARY KEY AUTO_INCREMENT,
        clave VARCHAR(50) NOT NULL UNIQUE,
        valor_texto VARCHAR(255) NULL,
        valor_numerico DECIMAL(18,6) NULL,
        descripcion VARCHAR(255) NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE IF NOT EXISTS scoring_cliente_coeficientes (
        categoria VARCHAR(50) PRIMARY KEY,
        coeficiente DECIMAL(10,4) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE IF NOT EXISTS scoring_asesores (
        cta_cte VARCHAR(10) PRIMARY KEY,
        asesor VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_scoring_asesor (asesor)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE IF NOT EXISTS scoring_compliance (
        cta_cte VARCHAR(10) PRIMARY KEY,
        fiscalizacion DECIMAL(10,2) DEFAULT 0,
        analisis_apuestas DECIMAL(10,2) DEFAULT 0,
        sanciones DECIMAL(10,2) DEFAULT 0,
        pago_fuera_termino DECIMAL(10,2) DEFAULT 0,
        puntaje DECIMAL(10,2) DEFAULT 0,
        observacion VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE IF NOT EXISTS scoring_digital (
        cta_cte VARCHAR(10) PRIMARY KEY,
        activaciones_iniciales INT DEFAULT 0,
        dias_cash_in_cash_out_activos INT DEFAULT 0,
        cash_in_bruto DECIMAL(15,2) DEFAULT 0,
        cash_in_ponderado DECIMAL(15,4) DEFAULT 0,
        cash_out DECIMAL(15,2) DEFAULT 0,
        clientes_agencia_amiga_totales INT DEFAULT 0,
        clientes_agencia_amiga_operaron INT DEFAULT 0,
        ratio_clientes_operaron DECIMAL(15,6) DEFAULT 0,
        puntaje DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE IF NOT EXISTS scoring_cliente (
        cta_cte VARCHAR(10) PRIMARY KEY,
        qr_tot_estrellas DECIMAL(15,2) DEFAULT 0,
        qr_cant_op INT DEFAULT 0,
        qr_op_prom DECIMAL(15,6) DEFAULT 0,
        qr_pts DECIMAL(10,2) DEFAULT 0,
        cant_quejas INT DEFAULT 0,
        tasa_cero_quejas_pts DECIMAL(10,2) DEFAULT 0,
        evaluacion_cliente_incognito DECIMAL(10,2) DEFAULT 0,
        ponderacion_cliente_incognito DECIMAL(10,2) DEFAULT 0,
        resenias_google DECIMAL(10,2) DEFAULT 0,
        resenias_google_pts DECIMAL(10,2) DEFAULT 0,
        puntaje DECIMAL(10,2) DEFAULT 0,
        categoria VARCHAR(50) DEFAULT 'Regular',
        coeficiente DECIMAL(10,4) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_scoring_cliente_categoria (categoria)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE IF NOT EXISTS scoring_hist_score (
        periodo_key VARCHAR(10) NOT NULL,
        cta_cte VARCHAR(10) NOT NULL,
        puntaje_final DECIMAL(10,4) NOT NULL,
        categoria VARCHAR(50) NOT NULL,
        ranking_puntaje INT NULL,
        fecha_carga DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (periodo_key, cta_cte),
        INDEX idx_scoring_hist_periodo (periodo_key),
        INDEX idx_scoring_hist_categoria (categoria)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Migracion de scoring_agencias completada');
  } finally {
    await connection.end();
  }
}

migrate().catch(error => {
  console.error('Error en migracion scoring_agencias:', error);
  process.exit(1);
});