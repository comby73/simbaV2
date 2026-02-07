/**
 * Helper para guardar datos del Control Posterior (Escrutinio) en las tablas de resguardo
 * 
 * Usado por quiniela-escrutinio.controller.js y poceada-escrutinio.controller.js
 */

const { query } = require('../config/database');
const { PROVINCIAS } = require('./helpers');

/**
 * Guarda el resultado del Escrutinio de Quiniela en la base de datos
 * 
 * @param {Object} resultado - Resultado del escrutinio
 * @param {Object} datosControlPrevio - Datos del control previo (para vincular)
 * @param {Object} usuario - Usuario que realizó el escrutinio
 * @returns {Object} - { success, id, mensaje }
 */
async function guardarEscrutinioQuiniela(resultado, datosControlPrevio, usuario) {
  try {
    // Extraer datos básicos
    const fecha = datosControlPrevio?.sorteo?.programacion?.fecha_sorteo ||
      datosControlPrevio?.fecha ||
      new Date().toISOString().split('T')[0];
    const numeroSorteo = parseInt(datosControlPrevio?.sorteo?.numero ||
      datosControlPrevio?.numeroSorteo || 0);
    const modalidad = datosControlPrevio?.sorteo?.modalidad?.codigo ||
      datosControlPrevio?.modalidad || 'M';

    // Buscar el control_previo_id si existe
    let controlPrevioId = null;
    const previoExistente = await query(
      'SELECT id FROM control_previo_quiniela WHERE fecha = ? AND numero_sorteo = ? AND modalidad = ?',
      [fecha, numeroSorteo, modalidad]
    );
    if (previoExistente.length > 0) {
      controlPrevioId = previoExistente[0].id;
    }

    // Verificar si ya existe el escrutinio (para reemplazar)
    const existe = await query(
      'SELECT id FROM escrutinio_quiniela WHERE fecha = ? AND numero_sorteo = ? AND modalidad = ?',
      [fecha, numeroSorteo, modalidad]
    );

    const { totalPremios, totalGanadores, reportePorExtracto, ganadoresDetalle } = resultado;

    // Preparar resumen de premios
    const resumenPremios = {
      porExtracto: reportePorExtracto?.map(e => ({
        nombre: e.nombre,
        numeros: e.numeros || [],           // Números ganadores del extracto
        letras: e.letrasSorteo || [],       // Letras del sorteo
        cargado: e.cargado || false,        // Si se cargó el extracto
        totalPagado: e.totalPagado,
        totalGanadores: e.totalGanadores,
        porCifras: e.porCifras,
        redoblona: e.redoblona,
        premioLetras: e.letras              // Premios por letras
      })),
      totales: {
        premios: totalPremios,
        ganadores: totalGanadores
      }
    };

    let escrutinioId;

    if (existe.length > 0) {
      // Actualizar
      escrutinioId = existe[0].id;
      await query(
        `UPDATE escrutinio_quiniela SET 
          control_previo_id = ?, total_ganadores = ?, total_premios = ?,
          resumen_premios = ?, usuario_id = ?, usuario_nombre = ?, created_at = NOW()
         WHERE id = ?`,
        [controlPrevioId, totalGanadores, totalPremios, JSON.stringify(resumenPremios),
          usuario?.id || null, usuario?.nombre || 'Sistema', escrutinioId]
      );

      // Limpiar datos anteriores
      await query('DELETE FROM escrutinio_premios_agencia WHERE escrutinio_id = ? AND juego = ?',
        [escrutinioId, 'quiniela']);
      await query('DELETE FROM escrutinio_ganadores WHERE escrutinio_id = ? AND juego = ?',
        [escrutinioId, 'quiniela']);

      console.log(`✅ Escrutinio Quiniela actualizado (ID: ${escrutinioId})`);
    } else {
      // Insertar
      const result = await query(
        `INSERT INTO escrutinio_quiniela 
         (control_previo_id, fecha, numero_sorteo, modalidad, total_ganadores, total_premios,
          resumen_premios, usuario_id, usuario_nombre)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [controlPrevioId, fecha, numeroSorteo, modalidad, totalGanadores, totalPremios,
          JSON.stringify(resumenPremios), usuario?.id || null, usuario?.nombre || 'Sistema']
      );
      escrutinioId = result.insertId;
      console.log(`✅ Escrutinio Quiniela guardado (ID: ${escrutinioId})`);
    }

    // Guardar premios por agencia/provincia
    await guardarPremiosPorAgencia(escrutinioId, 'quiniela', ganadoresDetalle);

    // Guardar detalle de ganadores
    await guardarDetalleGanadores(escrutinioId, 'quiniela', ganadoresDetalle);

    return { success: true, id: escrutinioId, mensaje: 'Escrutinio guardado correctamente' };

  } catch (error) {
    console.error('❌ Error guardando Escrutinio Quiniela:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Guarda el resultado del Escrutinio de Poceada en la base de datos
 */
async function guardarEscrutinioPoceada(resultado, datosControlPrevio, usuario) {
  try {
    const fecha = datosControlPrevio?.fechaSorteo ||
      datosControlPrevio?.fecha ||
      new Date().toISOString().split('T')[0];
    const numeroSorteo = parseInt(datosControlPrevio?.sorteo ||
      resultado?.numeroSorteo || 0);

    // Buscar control_previo_id
    let controlPrevioId = null;
    const previoExistente = await query(
      'SELECT id FROM control_previo_poceada WHERE fecha = ? AND numero_sorteo = ?',
      [fecha, numeroSorteo]
    );
    if (previoExistente.length > 0) {
      controlPrevioId = previoExistente[0].id;
    }

    // Verificar si ya existe
    const existe = await query(
      'SELECT id FROM escrutinio_poceada WHERE fecha = ? AND numero_sorteo = ?',
      [fecha, numeroSorteo]
    );

    const { totalPremios, totalGanadores, porNivel, agenciero, porCantidadNumeros, extractoUsado } = resultado;

    // Preparar JSON con extracto incluido
    const resumenPremiosJSON = JSON.stringify({
      porNivel,
      agenciero,
      porCantidadNumeros,
      extracto: extractoUsado || {}  // Incluir números y letras del sorteo
    });

    let escrutinioId;

    if (existe.length > 0) {
      escrutinioId = existe[0].id;
      await query(
        `UPDATE escrutinio_poceada SET 
          control_previo_id = ?, total_ganadores = ?, total_premios = ?,
          ganadores_8_aciertos = ?, premio_8_aciertos = ?,
          ganadores_7_aciertos = ?, premio_7_aciertos = ?,
          ganadores_6_aciertos = ?, premio_6_aciertos = ?,
          ganadores_letras = ?, premio_letras = ?,
          resumen_premios = ?, usuario_id = ?, usuario_nombre = ?, created_at = NOW()
         WHERE id = ?`,
        [
          controlPrevioId, totalGanadores, totalPremios,
          porNivel[8]?.ganadores || 0, porNivel[8]?.totalPremios || 0,
          porNivel[7]?.ganadores || 0, porNivel[7]?.totalPremios || 0,
          porNivel[6]?.ganadores || 0, porNivel[6]?.totalPremios || 0,
          porNivel['letras']?.ganadores || 0, porNivel['letras']?.totalPremios || 0,
          resumenPremiosJSON,
          usuario?.id || null, usuario?.nombre || 'Sistema', escrutinioId
        ]
      );

      // Limpiar datos anteriores
      await query('DELETE FROM escrutinio_premios_agencia WHERE escrutinio_id = ? AND juego = ?',
        [escrutinioId, 'poceada']);
      await query('DELETE FROM escrutinio_ganadores WHERE escrutinio_id = ? AND juego = ?',
        [escrutinioId, 'poceada']);

      console.log(`✅ Escrutinio Poceada actualizado (ID: ${escrutinioId})`);
    } else {
      const result = await query(
        `INSERT INTO escrutinio_poceada 
         (control_previo_id, fecha, numero_sorteo, total_ganadores, total_premios,
          ganadores_8_aciertos, premio_8_aciertos, ganadores_7_aciertos, premio_7_aciertos,
          ganadores_6_aciertos, premio_6_aciertos, ganadores_letras, premio_letras,
          resumen_premios, usuario_id, usuario_nombre)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          controlPrevioId, fecha, numeroSorteo, totalGanadores, totalPremios,
          porNivel[8]?.ganadores || 0, porNivel[8]?.totalPremios || 0,
          porNivel[7]?.ganadores || 0, porNivel[7]?.totalPremios || 0,
          porNivel[6]?.ganadores || 0, porNivel[6]?.totalPremios || 0,
          porNivel['letras']?.ganadores || 0, porNivel['letras']?.totalPremios || 0,
          resumenPremiosJSON,
          usuario?.id || null, usuario?.nombre || 'Sistema'
        ]
      );
      escrutinioId = result.insertId;
      console.log(`✅ Escrutinio Poceada guardado (ID: ${escrutinioId})`);
    }

    // Guardar premios por agencia y detalle de ganadores
    if (resultado.ganadoresDetalle && resultado.ganadoresDetalle.length > 0) {
      // Si viene el detalle masivo (todos los aciertos 6, 7, 8)
      await guardarPremiosPorAgencia(escrutinioId, 'poceada', resultado.ganadoresDetalle);
    } else if (agenciero?.detalles && agenciero.detalles.length > 0) {
      // Fallback: solo ganadores del 1er premio (agenciero)
      await guardarPremiosPorAgenciaPoceada(escrutinioId, agenciero);
    }

    return { success: true, id: escrutinioId, mensaje: 'Escrutinio guardado correctamente' };

  } catch (error) {
    console.error('❌ Error guardando Escrutinio Poceada:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Guarda los premios acumulados por agencia/provincia
 * CABA (51): Por agencia individual
 * Otras provincias: Acumulado por provincia
 */
async function guardarPremiosPorAgencia(escrutinioId, juego, ganadoresDetalle) {
  if (!ganadoresDetalle || ganadoresDetalle.length === 0) return;

  // Acumular por agencia/provincia
  const acumulado = new Map();

  for (const ganador of ganadoresDetalle) {
    // Extraer provincia y agencia del registro original
    // En ganadoresDetalle de Quiniela, tenemos ticket pero necesitamos la agencia
    // Esto requiere que el ganador tenga la info de agencia
    const agencia = ganador.agencia || '';

    // Determinar clave de acumulación
    // Si no tenemos agencia, saltamos este registro
    if (!agencia) continue;

    // Extraer código de provincia (primeros 2 dígitos de cta_cte o agencia)
    let codProv = '51'; // Default CABA
    let codAgencia = agencia.padStart(5, '0');

    // Si la agencia viene como cta_cte (ej: "51-12345" o "5112345")
    if (agencia.includes('-')) {
      const partes = agencia.split('-');
      codProv = partes[0];
      codAgencia = partes[1];
    } else if (agencia.length === 7 && /^\d{7}$/.test(agencia)) {
      // Formato numérico puro: "5112345" → provincia "51", agencia "12345"
      codProv = agencia.substring(0, 2);
      codAgencia = agencia.substring(2);
    }

    let clave;
    let tipoAgrupacion;
    let nombreDisplay;

    if (codProv === '51') {
      // CABA: Por agencia individual - formato numérico sin guión
      clave = `${codProv}${codAgencia}`;
      tipoAgrupacion = 'agencia';
      nombreDisplay = clave;
    } else {
      // Otras provincias: Acumulado
      clave = codProv;
      tipoAgrupacion = 'provincia';
      nombreDisplay = PROVINCIAS[codProv]?.nombre || `Provincia ${codProv}`;
    }

    if (!acumulado.has(clave)) {
      acumulado.set(clave, {
        tipo_agrupacion: tipoAgrupacion,
        codigo_provincia: codProv,
        codigo_agencia: tipoAgrupacion === 'agencia' ? codAgencia : null,
        cta_cte: clave,
        nombre_display: nombreDisplay,
        total_ganadores: 0,
        total_premios: 0
      });
    }

    const acc = acumulado.get(clave);
    acc.total_ganadores++;
    acc.total_premios += ganador.premio || 0;
  }

  // Insertar en la tabla
  for (const [clave, datos] of acumulado) {
    await query(
      `INSERT INTO escrutinio_premios_agencia 
       (escrutinio_id, juego, tipo_agrupacion, codigo_provincia, codigo_agencia, cta_cte, nombre_display,
        total_ganadores, total_premios)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [escrutinioId, juego, datos.tipo_agrupacion, datos.codigo_provincia, datos.codigo_agencia,
        datos.cta_cte, datos.nombre_display, datos.total_ganadores, datos.total_premios]
    );
  }

  console.log(`  📊 Guardados ${acumulado.size} registros de premios por agencia/provincia`);
}

/**
 * Guarda premios por agencia para Poceada (solo 1er premio - agenciero)
 */
async function guardarPremiosPorAgenciaPoceada(escrutinioId, agencieroData) {
  const acumulado = new Map();

  for (const det of agencieroData.detalles || []) {
    const codProv = det.provincia || '51';
    const codAgencia = (det.agencia || '').padStart(5, '0');

    let clave;
    let tipoAgrupacion;
    let nombreDisplay;

    if (codProv === '51') {
      clave = det.ctaCte || `${codProv}${codAgencia}`;
      tipoAgrupacion = 'agencia';
      nombreDisplay = clave;
    } else {
      clave = codProv;
      tipoAgrupacion = 'provincia';
      nombreDisplay = PROVINCIAS[codProv]?.nombre || `Provincia ${codProv}`;
    }

    if (!acumulado.has(clave)) {
      acumulado.set(clave, {
        tipo_agrupacion: tipoAgrupacion,
        codigo_provincia: codProv,
        codigo_agencia: tipoAgrupacion === 'agencia' ? codAgencia : null,
        cta_cte: clave,
        nombre_display: nombreDisplay,
        total_ganadores: 0,
        total_premios: 0
      });
    }

    const acc = acumulado.get(clave);
    acc.total_ganadores += det.cantidad || 1;
    acc.total_premios += agencieroData.premioUnitario * (det.cantidad || 1);
  }

  for (const [clave, datos] of acumulado) {
    await query(
      `INSERT INTO escrutinio_premios_agencia 
       (escrutinio_id, juego, tipo_agrupacion, codigo_provincia, codigo_agencia, cta_cte, nombre_display,
        total_ganadores, total_premios)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [escrutinioId, 'poceada', datos.tipo_agrupacion, datos.codigo_provincia, datos.codigo_agencia,
        datos.cta_cte, datos.nombre_display, datos.total_ganadores, datos.total_premios]
    );
  }

  console.log(`  📊 Guardados ${acumulado.size} registros de agenciero Poceada`);
}

/**
 * Guarda el detalle de cada ticket ganador (para auditoría)
 */
async function guardarDetalleGanadores(escrutinioId, juego, ganadoresDetalle) {
  if (!ganadoresDetalle || ganadoresDetalle.length === 0) return;

  // Preparar lote de inserts
  const valores = [];

  for (const g of ganadoresDetalle) {
    // Extraer código de provincia y agencia
    const agencia = g.agencia || '';
    let codProv = '51';
    let codAgencia = agencia.padStart(5, '0');

    if (agencia.includes('-')) {
      const partes = agencia.split('-');
      codProv = partes[0];
      codAgencia = partes[1];
    } else if (agencia.length === 7 && /^\d{7}$/.test(agencia)) {
      // Formato numérico puro: "5112345" → provincia "51", agencia "12345"
      codProv = agencia.substring(0, 2);
      codAgencia = agencia.substring(2);
    }

    // cta_cte siempre en formato numérico sin guión
    const ctaCte = `${codProv}${codAgencia}`;

    valores.push([
      escrutinioId,
      juego,
      g.ticket || '',
      g.ordinal || '01',
      ctaCte,
      codProv,
      codAgencia,
      g.tipo || 'SIMPLE',
      g.numeroApostado || '',
      g.cifras || null,
      null, // ubicacion_desde
      null, // ubicacion_hasta
      null, // letras_apostadas
      null, // numeros_poceada
      null, // cantidad_numeros
      g.apuesta || 0,
      g.extracto || '',
      parseInt(g.posicion) || null,
      g.numeroSorteado || '',
      null, // aciertos
      g.tipo || 'SIMPLE',
      g.premio || 0
    ]);
  }

  // Insert en lotes de 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < valores.length; i += BATCH_SIZE) {
    const batch = valores.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() =>
      '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).join(', ');

    const flatValues = batch.flat();

    await query(
      `INSERT INTO escrutinio_ganadores 
       (escrutinio_id, juego, numero_ticket, ordinal_apuesta, cta_cte, codigo_provincia, codigo_agencia,
        tipo_apuesta, numero_apostado, cifras, ubicacion_desde, ubicacion_hasta, letras_apostadas,
        numeros_poceada, cantidad_numeros, importe_apuesta, extracto_provincia, posicion_ganadora,
        numero_sorteado, aciertos, tipo_premio, premio)
       VALUES ${placeholders}`,
      flatValues
    );
  }

  console.log(`  🎯 Guardados ${valores.length} ganadores en detalle`);
}

/**
 * Obtiene el historial de escrutinios
 */
async function obtenerHistorialEscrutinio(juego, filtros = {}) {
  try {
    const tabla = juego === 'quiniela' ? 'escrutinio_quiniela' : 'escrutinio_poceada';
    let sql = `SELECT * FROM ${tabla} WHERE 1=1`;
    const params = [];

    if (filtros.fecha) {
      sql += ' AND fecha = ?';
      params.push(filtros.fecha);
    }

    if (filtros.desde) {
      sql += ' AND fecha >= ?';
      params.push(filtros.desde);
    }

    if (filtros.hasta) {
      sql += ' AND fecha <= ?';
      params.push(filtros.hasta);
    }

    if (filtros.numeroSorteo) {
      sql += ' AND numero_sorteo = ?';
      params.push(filtros.numeroSorteo);
    }

    sql += ' ORDER BY fecha DESC, numero_sorteo DESC';
    sql += ` LIMIT ${filtros.limit || 50}`;

    return await query(sql, params);

  } catch (error) {
    console.error('Error obteniendo historial escrutinio:', error);
    throw error;
  }
}

/**
 * Obtiene los ganadores de un escrutinio específico
 */
async function obtenerGanadoresEscrutinio(escrutinioId, juego) {
  return await query(
    'SELECT * FROM escrutinio_ganadores WHERE escrutinio_id = ? AND juego = ? ORDER BY premio DESC',
    [escrutinioId, juego]
  );
}

/**
 * Obtiene los premios por agencia de un escrutinio
 */
async function obtenerPremiosPorAgencia(escrutinioId, juego) {
  return await query(
    'SELECT * FROM escrutinio_premios_agencia WHERE escrutinio_id = ? AND juego = ? ORDER BY total_premios DESC',
    [escrutinioId, juego]
  );
}

/**
 * Guarda el resultado del Escrutinio de Tombolina en la base de datos
 */
async function guardarEscrutinioTombolina(resultado, datosControlPrevio, usuario) {
  try {
    const fecha = datosControlPrevio?.fecha || new Date().toISOString().split('T')[0];
    const numeroSorteo = parseInt(datosControlPrevio?.sorteo || resultado?.numeroSorteo || 0);

    // Buscar control_previo_id
    let controlPrevioId = null;
    const previoExistente = await query(
      'SELECT id FROM control_previo_tombolina WHERE fecha = ? AND numero_sorteo = ?',
      [fecha, numeroSorteo]
    );
    if (previoExistente.length > 0) {
      controlPrevioId = previoExistente[0].id;
    }

    // Verificar si ya existe
    const existe = await query(
      'SELECT id FROM escrutinio_tombolina WHERE fecha = ? AND numero_sorteo = ?',
      [fecha, numeroSorteo]
    );

    const { totalPremios, totalGanadores, totalAgenciero, reporte, ganadoresDetalle, extracto } = resultado;

    const resumenPremiosJSON = JSON.stringify({
      reporte,
      extracto: extracto || {}
    });

    let escrutinioId;

    if (existe.length > 0) {
      escrutinioId = existe[0].id;
      await query(
        `UPDATE escrutinio_tombolina SET 
          control_previo_id = ?, total_ganadores = ?, total_premios = ?,
          total_agenciero = ?, resumen_premios = ?, 
          usuario_id = ?, usuario_nombre = ?, created_at = NOW()
         WHERE id = ?`,
        [
          controlPrevioId, totalGanadores, totalPremios,
          totalAgenciero, resumenPremiosJSON,
          usuario?.id || null, usuario?.nombre || 'Sistema', escrutinioId
        ]
      );

      // Limpiar datos anteriores
      await query('DELETE FROM escrutinio_premios_agencia WHERE escrutinio_id = ? AND juego = ?',
        [escrutinioId, 'tombolina']);
      await query('DELETE FROM escrutinio_ganadores WHERE escrutinio_id = ? AND juego = ?',
        [escrutinioId, 'tombolina']);

      console.log(`✅ Escrutinio Tombolina actualizado (ID: ${escrutinioId})`);
    } else {
      const result = await query(
        `INSERT INTO escrutinio_tombolina 
         (control_previo_id, fecha, numero_sorteo, total_ganadores, total_premios,
          total_agenciero, resumen_premios, usuario_id, usuario_nombre)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          controlPrevioId, fecha, numeroSorteo, totalGanadores, totalPremios,
          totalAgenciero, resumenPremiosJSON,
          usuario?.id || null, usuario?.nombre || 'Sistema'
        ]
      );
      escrutinioId = result.insertId;
      console.log(`✅ Escrutinio Tombolina guardado (ID: ${escrutinioId})`);
    }

    // Guardar premios por agencia (CABA 51 vs Provincias)
    await guardarPremiosPorAgencia(escrutinioId, 'tombolina', ganadoresDetalle);

    // Guardar detalle de ganadores
    await guardarDetalleGanadores(escrutinioId, 'tombolina', ganadoresDetalle);

    return { success: true, id: escrutinioId, mensaje: 'Escrutinio guardado correctamente' };

  } catch (error) {
    console.error('❌ Error guardando Escrutinio Tombolina:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  guardarEscrutinioQuiniela,
  guardarEscrutinioPoceada,
  guardarEscrutinioTombolina,
  obtenerHistorialEscrutinio,
  obtenerGanadoresEscrutinio,
  obtenerPremiosPorAgencia
};
