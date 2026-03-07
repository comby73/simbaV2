const fs = require('fs');
const path = require('path');
const envLocal = path.join(__dirname, '../.env.local');
const envDefault = path.join(__dirname, '../.env');
require('dotenv').config({ path: fs.existsSync(envLocal) ? envLocal : envDefault });

const mysql = require('mysql2/promise');

async function diag() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  // Parámetros del modelo (período actual y anterior)
  const [params] = await conn.query(
    "SELECT clave, valor_texto FROM scoring_modelo_parametros WHERE clave IN ('B3','B4') ORDER BY clave"
  );
  console.log('Parametros B3/B4 (periodo actual/anterior):');
  params.forEach(r => console.log('  ' + r.clave + ' =', r.valor_texto));

  // Conteos de tablas de scoring
  const tables = ['scoring_asesores', 'scoring_compliance', 'scoring_digital', 'scoring_cliente', 'scoring_hist_score', 'scoring_modelo_parametros'];
  console.log('\nFilas por tabla de scoring:');
  for (const t of tables) {
    const [r] = await conn.query('SELECT COUNT(*) as n FROM ' + t);
    console.log('  ' + t + ':', r[0].n);
  }

  // Formato de código en cada tabla
  const [b] = await conn.query('SELECT cta_cte FROM scoring_asesores LIMIT 3');
  console.log('\nMuestra cta_cte en scoring_asesores:', b.map(r => r.cta_cte));

  const [d] = await conn.query('SELECT DISTINCT codigo_agencia FROM control_previo_agencias LIMIT 3');
  console.log('Muestra codigo_agencia en control_previo_agencias:', d.map(r => r.codigo_agencia));

  // Matches con el nuevo JOIN LEFT(x,7)
  const [e] = await conn.query(
    "SELECT COUNT(DISTINCT LEFT(cpa.codigo_agencia,7)) as matches " +
    "FROM control_previo_agencias cpa " +
    "INNER JOIN scoring_asesores sa ON LEFT(sa.cta_cte,7) = LEFT(cpa.codigo_agencia,7) " +
    "WHERE cpa.fecha BETWEEN '2026-01-01' AND '2026-03-31'"
  );
  console.log('\nAgencias que matchean JOIN LEFT(x,7) para 2026-Q1:', e[0].matches);

  // Matches con el JOIN EXACTO (codigo viejo sin LEFT)
  const [g] = await conn.query(
    "SELECT COUNT(DISTINCT cpa.codigo_agencia) as matches " +
    "FROM control_previo_agencias cpa " +
    "INNER JOIN scoring_asesores sa ON (sa.cta_cte = cpa.codigo_agencia OR sa.cta_cte = LEFT(cpa.codigo_agencia,7)) " +
    "WHERE cpa.fecha BETWEEN '2026-01-01' AND '2026-03-31'"
  );
  console.log('Agencias con JOIN exacto (codigo anterior):', g[0].matches);

  await conn.end();
}

diag().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
