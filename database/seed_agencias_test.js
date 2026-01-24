/**
 * Script para generar datos de prueba en control_previo_agencias
 * basándose en los sorteos existentes en control_previo_quiniela/poceada
 * 
 * USO: node database/seed_agencias_test.js
 */

const { query, closePool } = require('../src/config/database');

// Agencias de prueba CABA (51)
const AGENCIAS_CABA = [
  '5100001', '5100002', '5100003', '5100004', '5100005',
  '5100010', '5100015', '5100020', '5100025', '5100030',
  '5100100', '5100150', '5100200', '5100250', '5100300',
  '5188880' // Venta web
];

// Agencias de otras provincias (agrupadas)
const AGENCIAS_OTRAS = [
  { codigo: '5300001', provincia: '53' }, // Buenos Aires
  { codigo: '5300002', provincia: '53' },
  { codigo: '5500001', provincia: '55' }, // Córdoba
  { codigo: '5500002', provincia: '55' },
  { codigo: '7200001', provincia: '72' }, // Santa Fe
  { codigo: '6400001', provincia: '64' }, // Mendoza
];

async function generarDatosAgencias() {
  console.log('🔄 Generando datos de prueba para control_previo_agencias...\n');

  try {
    // Obtener sorteos de Quiniela existentes
    const sorteosQuiniela = await query(`
      SELECT id, fecha, numero_sorteo, modalidad, total_recaudacion 
      FROM control_previo_quiniela
    `);

    console.log(`📊 Encontrados ${sorteosQuiniela.length} sorteos de Quiniela`);

    // Limpiar datos existentes
    await query('DELETE FROM control_previo_agencias');
    console.log('🗑️  Tabla limpiada\n');

    let totalInsertados = 0;

    for (const sorteo of sorteosQuiniela) {
      const recaudacionTotal = parseFloat(sorteo.total_recaudacion) || 100000;
      const recaudacionPorAgencia = recaudacionTotal / (AGENCIAS_CABA.length + AGENCIAS_OTRAS.length);

      // Insertar agencias CABA
      for (const agencia of AGENCIAS_CABA) {
        const variacion = 0.5 + Math.random(); // 50% a 150%
        const recaudacion = recaudacionPorAgencia * variacion;
        const tickets = Math.floor(recaudacion / 50); // ~$50 por ticket
        const apuestas = tickets * (1 + Math.floor(Math.random() * 3)); // 1-3 apuestas por ticket

        await query(`
          INSERT INTO control_previo_agencias 
          (control_previo_id, juego, fecha, numero_sorteo, modalidad, 
           codigo_agencia, codigo_provincia, total_tickets, total_apuestas, 
           total_anulados, total_recaudacion)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          sorteo.id,
          'quiniela',
          sorteo.fecha,
          sorteo.numero_sorteo,
          sorteo.modalidad,
          agencia,
          '51',
          tickets,
          apuestas,
          Math.floor(tickets * 0.02), // 2% anulados
          recaudacion.toFixed(2)
        ]);
        totalInsertados++;
      }

      // Insertar agencias de otras provincias
      for (const ag of AGENCIAS_OTRAS) {
        const variacion = 0.3 + Math.random() * 0.5; // 30% a 80% (menos que CABA)
        const recaudacion = recaudacionPorAgencia * variacion;
        const tickets = Math.floor(recaudacion / 50);
        const apuestas = tickets * (1 + Math.floor(Math.random() * 2));

        await query(`
          INSERT INTO control_previo_agencias 
          (control_previo_id, juego, fecha, numero_sorteo, modalidad, 
           codigo_agencia, codigo_provincia, total_tickets, total_apuestas, 
           total_anulados, total_recaudacion)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          sorteo.id,
          'quiniela',
          sorteo.fecha,
          sorteo.numero_sorteo,
          sorteo.modalidad,
          ag.codigo,
          ag.provincia,
          tickets,
          apuestas,
          Math.floor(tickets * 0.01), // 1% anulados
          recaudacion.toFixed(2)
        ]);
        totalInsertados++;
      }

      console.log(`   ✅ Sorteo ${sorteo.numero_sorteo} (${sorteo.fecha}): insertadas agencias`);
    }

    // Verificar
    const [conteo] = await query('SELECT COUNT(*) as total FROM control_previo_agencias');
    console.log(`\n✅ Total registros insertados: ${conteo.total}`);

    // Mostrar resumen por provincia
    const resumen = await query(`
      SELECT 
        codigo_provincia,
        COUNT(DISTINCT codigo_agencia) as agencias,
        SUM(total_recaudacion) as recaudacion
      FROM control_previo_agencias
      GROUP BY codigo_provincia
      ORDER BY recaudacion DESC
    `);

    console.log('\n📊 Resumen por provincia:');
    console.log('─'.repeat(50));
    for (const row of resumen) {
      const provNombre = {
        '51': 'CABA',
        '53': 'Buenos Aires',
        '55': 'Córdoba',
        '64': 'Mendoza',
        '72': 'Santa Fe'
      }[row.codigo_provincia] || row.codigo_provincia;
      
      console.log(`   ${provNombre.padEnd(15)} | ${row.agencias} agencias | $${parseFloat(row.recaudacion).toLocaleString('es-AR')}`);
    }

    console.log('\n🎉 Datos de prueba generados correctamente!');
    console.log('   Ahora podés ver "Agencias c/Venta" en el Dashboard de Reportes\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await closePool();
  }
}

generarDatosAgencias();
