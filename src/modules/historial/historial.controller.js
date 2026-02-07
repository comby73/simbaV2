/**
 * Controller para consultar historial de Control Previo y Escrutinios
 * 
 * Provee endpoints para:
 * - Listar historial de control previo (todos los juegos)
 * - Listar historial de escrutinios
 * - Ver detalle de ganadores
 * - Ver premios por agencia/provincia
 * 
 * Juegos soportados: quiniela, poceada, tombolina, loto, loto5, brinco, quini6
 */

const { query } = require('../../config/database');
const { successResponse, errorResponse, PROVINCIAS } = require('../../shared/helpers');
const {
  obtenerHistorialEscrutinio,
  obtenerGanadoresEscrutinio,
  obtenerPremiosPorAgencia
} = require('../../shared/escrutinio.helper');
const { obtenerHistorialControlPrevio } = require('../../shared/control-previo.helper');

/**
 * GET /api/historial/control-previo/:juego
 * Lista el historial de control previo
 * Query params: fecha, desde, hasta, numeroSorteo, limit
 */
const listarControlPrevio = async (req, res) => {
  try {
    const { juego } = req.params; // 'quiniela' o 'poceada'
    const { fecha, desde, hasta, numeroSorteo, limit } = req.query;

    if (!['quiniela', 'poceada'].includes(juego)) {
      return errorResponse(res, 'Juego inválido. Use "quiniela" o "poceada"', 400);
    }

    const historial = await obtenerHistorialControlPrevio(juego, {
      fecha, desde, hasta, numeroSorteo, limit: parseInt(limit) || 50
    });

    // Parsear JSON fields
    const resultado = historial.map(h => ({
      ...h,
      comparacion_xml: h.comparacion_xml ? JSON.parse(h.comparacion_xml) : null,
      datos_adicionales: h.datos_adicionales ? JSON.parse(h.datos_adicionales) : null,
      distribucion_premios: h.distribucion_premios ? JSON.parse(h.distribucion_premios) : null,
      pozos_arrastre: h.pozos_arrastre ? JSON.parse(h.pozos_arrastre) : null
    }));

    return successResponse(res, {
      juego,
      total: resultado.length,
      registros: resultado
    });

  } catch (error) {
    console.error('Error listando control previo:', error);
    return errorResponse(res, 'Error obteniendo historial: ' + error.message, 500);
  }
};

/**
 * GET /api/historial/escrutinio/:juego
 * Lista el historial de escrutinios
 */
const listarEscrutinios = async (req, res) => {
  try {
    const { juego } = req.params;
    const { fecha, desde, hasta, numeroSorteo, limit } = req.query;

    const juegosValidos = ['quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'brinco', 'quini6'];
    if (!juegosValidos.includes(juego)) {
      return errorResponse(res, `Juego inválido. Use uno de: ${juegosValidos.join(', ')}`, 400);
    }

    const historial = await obtenerHistorialEscrutinio(juego, {
      fecha, desde, hasta, numeroSorteo, limit: parseInt(limit) || 50
    });

    // Parsear JSON fields
    const resultado = historial.map(h => ({
      ...h,
      resumen_premios: h.resumen_premios ? JSON.parse(h.resumen_premios) : null,
      datos_adicionales: h.datos_adicionales ? JSON.parse(h.datos_adicionales) : null
    }));

    return successResponse(res, {
      juego,
      total: resultado.length,
      registros: resultado
    });

  } catch (error) {
    console.error('Error listando escrutinios:', error);
    return errorResponse(res, 'Error obteniendo historial: ' + error.message, 500);
  }
};

/**
 * GET /api/historial/escrutinio/:juego/:id/ganadores
 * Obtiene el detalle de ganadores de un escrutinio específico
 */
const obtenerGanadores = async (req, res) => {
  try {
    const { juego, id } = req.params;
    const { limit, offset } = req.query;

    const juegosValidos = ['quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'brinco', 'quini6'];
    if (!juegosValidos.includes(juego)) {
      return errorResponse(res, 'Juego inválido', 400);
    }

    // Obtener ganadores con paginación
    let sql = `
      SELECT * FROM escrutinio_ganadores 
      WHERE escrutinio_id = ? AND juego = ?
      ORDER BY premio DESC
    `;
    const params = [id, juego];

    if (limit) {
      sql += ` LIMIT ${parseInt(limit)}`;
      if (offset) {
        sql += ` OFFSET ${parseInt(offset)}`;
      }
    }

    const ganadores = await query(sql, params);

    // Obtener total
    const [{ total }] = await query(
      'SELECT COUNT(*) as total FROM escrutinio_ganadores WHERE escrutinio_id = ? AND juego = ?',
      [id, juego]
    );

    // Obtener resumen
    const [resumen] = await query(
      `SELECT 
        COUNT(*) as total_ganadores,
        SUM(premio) as total_premios,
        COUNT(DISTINCT cta_cte) as total_agencias
       FROM escrutinio_ganadores 
       WHERE escrutinio_id = ? AND juego = ?`,
      [id, juego]
    );

    return successResponse(res, {
      escrutinio_id: parseInt(id),
      juego,
      resumen: {
        total_ganadores: resumen?.total_ganadores || 0,
        total_premios: resumen?.total_premios || 0,
        total_agencias: resumen?.total_agencias || 0
      },
      total,
      ganadores
    });

  } catch (error) {
    console.error('Error obteniendo ganadores:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * GET /api/historial/escrutinio/:juego/:id/agencias
 * Obtiene los premios por agencia/provincia de un escrutinio
 */
const obtenerPremiosAgencias = async (req, res) => {
  try {
    const { juego, id } = req.params;

    const juegosValidos = ['quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'brinco', 'quini6'];
    if (!juegosValidos.includes(juego)) {
      return errorResponse(res, 'Juego inválido', 400);
    }

    const premios = await obtenerPremiosPorAgencia(id, juego);

    // Separar por tipo
    const porAgencia = premios.filter(p => p.tipo_agrupacion === 'agencia');
    const porProvincia = premios.filter(p => p.tipo_agrupacion === 'provincia');

    // Calcular totales
    const totalGanadores = premios.reduce((sum, p) => sum + p.total_ganadores, 0);
    const totalPremios = premios.reduce((sum, p) => sum + parseFloat(p.total_premios), 0);

    return successResponse(res, {
      escrutinio_id: parseInt(id),
      juego,
      resumen: {
        total_ganadores: totalGanadores,
        total_premios: totalPremios,
        agencias_caba: porAgencia.length,
        provincias: porProvincia.length
      },
      porAgencia,
      porProvincia
    });

  } catch (error) {
    console.error('Error obteniendo premios por agencia:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * GET /api/historial/resumen
 * Obtiene un resumen general del historial (para dashboard)
 */
const obtenerResumen = async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    // Fechas por defecto: último mes
    const fechaHasta = hasta || new Date().toISOString().split('T')[0];
    const fechaDesde = desde || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Control Previo Quiniela
    const [cpQuiniela] = await query(`
      SELECT 
        COUNT(*) as total_sorteos,
        SUM(total_registros) as total_registros,
        SUM(total_recaudacion) as total_recaudacion
      FROM control_previo_quiniela
      WHERE fecha BETWEEN ? AND ?
    `, [fechaDesde, fechaHasta]);

    // Control Previo Poceada
    const [cpPoceada] = await query(`
      SELECT 
        COUNT(*) as total_sorteos,
        SUM(total_registros) as total_registros,
        SUM(total_recaudacion) as total_recaudacion
      FROM control_previo_poceada
      WHERE fecha BETWEEN ? AND ?
    `, [fechaDesde, fechaHasta]);

    // Control Previo Tombolina
    const [cpTombolina] = await query(`
      SELECT 
        COUNT(*) as total_sorteos,
        SUM(total_apuestas) as total_registros,
        SUM(total_recaudacion) as total_recaudacion
      FROM control_previo_tombolina
      WHERE fecha BETWEEN ? AND ?
    `, [fechaDesde, fechaHasta]);

    // Escrutinio Quiniela
    const [escQuiniela] = await query(`
      SELECT 
        COUNT(*) as total_sorteos,
        SUM(total_ganadores) as total_ganadores,
        SUM(total_premios) as total_premios
      FROM escrutinio_quiniela
      WHERE fecha BETWEEN ? AND ?
    `, [fechaDesde, fechaHasta]);

    // Escrutinio Poceada
    const [escPoceada] = await query(`
      SELECT 
        COUNT(*) as total_sorteos,
        SUM(total_ganadores) as total_ganadores,
        SUM(total_premios) as total_premios
      FROM escrutinio_poceada
      WHERE fecha BETWEEN ? AND ?
    `, [fechaDesde, fechaHasta]);

    // Escrutinio Tombolina
    const [escTombolina] = await query(`
      SELECT 
        COUNT(*) as total_sorteos,
        SUM(total_ganadores) as total_ganadores,
        SUM(total_premios) as total_premios
      FROM escrutinio_tombolina
      WHERE fecha BETWEEN ? AND ?
    `, [fechaDesde, fechaHasta]);

    // Últimos 5 sorteos de cada tipo
    const ultimosQuiniela = await query(`
      SELECT fecha, numero_sorteo, modalidad, total_ganadores, total_premios
      FROM escrutinio_quiniela
      ORDER BY fecha DESC, numero_sorteo DESC
      LIMIT 5
    `);

    const ultimosPoceada = await query(`
      SELECT fecha, numero_sorteo, total_ganadores, total_premios,
             ganadores_8_aciertos, ganadores_7_aciertos, ganadores_6_aciertos
      FROM escrutinio_poceada
      ORDER BY fecha DESC, numero_sorteo DESC
      LIMIT 5
    `);

    return successResponse(res, {
      periodo: { desde: fechaDesde, hasta: fechaHasta },
      controlPrevio: {
        quiniela: {
          sorteos: cpQuiniela?.total_sorteos || 0,
          registros: cpQuiniela?.total_registros || 0,
          recaudacion: cpQuiniela?.total_recaudacion || 0
        },
        poceada: {
          sorteos: cpPoceada?.total_sorteos || 0,
          registros: cpPoceada?.total_registros || 0,
          recaudacion: cpPoceada?.total_recaudacion || 0
        },
        tombolina: {
          sorteos: cpTombolina?.total_sorteos || 0,
          registros: cpTombolina?.total_registros || 0,
          recaudacion: cpTombolina?.total_recaudacion || 0
        }
      },
      escrutinio: {
        quiniela: {
          sorteos: escQuiniela?.total_sorteos || 0,
          ganadores: escQuiniela?.total_ganadores || 0,
          premios: escQuiniela?.total_premios || 0
        },
        poceada: {
          sorteos: escPoceada?.total_sorteos || 0,
          ganadores: escPoceada?.total_ganadores || 0,
          premios: escPoceada?.total_premios || 0
        },
        tombolina: {
          sorteos: escTombolina?.total_sorteos || 0,
          ganadores: escTombolina?.total_ganadores || 0,
          premios: escTombolina?.total_premios || 0
        }
      },
      ultimosSorteos: {
        quiniela: ultimosQuiniela,
        poceada: ultimosPoceada
      }
    });

  } catch (error) {
    console.error('Error obteniendo resumen:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * GET /api/historial/buscar
 * Busca un sorteo específico en todo el historial
 */
const buscarSorteo = async (req, res) => {
  try {
    const { numeroSorteo, fecha, juego } = req.query;

    if (!numeroSorteo && !fecha) {
      return errorResponse(res, 'Debe especificar numeroSorteo o fecha', 400);
    }

    const resultado = {
      controlPrevio: { quiniela: null, poceada: null, tombolina: null, loto: null, loto5: null, brinco: null, quini6: null },
      escrutinio: { quiniela: null, poceada: null, tombolina: null, loto: null, loto5: null, brinco: null, quini6: null }
    };

    // Buscar en Control Previo Quiniela
    if (!juego || juego === 'quiniela') {
      let sqlQ = 'SELECT * FROM control_previo_quiniela WHERE 1=1';
      const paramsQ = [];
      if (numeroSorteo) { sqlQ += ' AND numero_sorteo = ?'; paramsQ.push(numeroSorteo); }
      if (fecha) { sqlQ += ' AND fecha = ?'; paramsQ.push(fecha); }
      sqlQ += ' ORDER BY created_at DESC LIMIT 10';
      resultado.controlPrevio.quiniela = await query(sqlQ, paramsQ);

      // Escrutinio Quiniela
      let sqlEQ = 'SELECT * FROM escrutinio_quiniela WHERE 1=1';
      const paramsEQ = [];
      if (numeroSorteo) { sqlEQ += ' AND numero_sorteo = ?'; paramsEQ.push(numeroSorteo); }
      if (fecha) { sqlEQ += ' AND fecha = ?'; paramsEQ.push(fecha); }
      sqlEQ += ' ORDER BY created_at DESC LIMIT 10';
      resultado.escrutinio.quiniela = await query(sqlEQ, paramsEQ);
    }

    // Buscar en Control Previo Poceada
    if (!juego || juego === 'poceada') {
      let sqlP = 'SELECT * FROM control_previo_poceada WHERE 1=1';
      const paramsP = [];
      if (numeroSorteo) { sqlP += ' AND numero_sorteo = ?'; paramsP.push(numeroSorteo); }
      if (fecha) { sqlP += ' AND fecha = ?'; paramsP.push(fecha); }
      sqlP += ' ORDER BY created_at DESC LIMIT 10';
      resultado.controlPrevio.poceada = await query(sqlP, paramsP);

      // Escrutinio Poceada
      let sqlEP = 'SELECT * FROM escrutinio_poceada WHERE 1=1';
      const paramsEP = [];
      if (numeroSorteo) { sqlEP += ' AND numero_sorteo = ?'; paramsEP.push(numeroSorteo); }
      if (fecha) { sqlEP += ' AND fecha = ?'; paramsEP.push(fecha); }
      sqlEP += ' ORDER BY created_at DESC LIMIT 10';
      resultado.escrutinio.poceada = await query(sqlEP, paramsEP);
    }

    // Buscar en Control Previo Tombolina
    if (!juego || juego === 'tombolina') {
      try {
        let sqlT = 'SELECT * FROM control_previo_tombolina WHERE 1=1';
        const paramsT = [];
        if (numeroSorteo) { sqlT += ' AND numero_sorteo = ?'; paramsT.push(numeroSorteo); }
        if (fecha) { sqlT += ' AND fecha = ?'; paramsT.push(fecha); }
        sqlT += ' ORDER BY created_at DESC LIMIT 10';
        resultado.controlPrevio.tombolina = await query(sqlT, paramsT);

        let sqlET = 'SELECT * FROM escrutinio_tombolina WHERE 1=1';
        const paramsET = [];
        if (numeroSorteo) { sqlET += ' AND numero_sorteo = ?'; paramsET.push(numeroSorteo); }
        if (fecha) { sqlET += ' AND fecha = ?'; paramsET.push(fecha); }
        sqlET += ' ORDER BY created_at DESC LIMIT 10';
        resultado.escrutinio.tombolina = await query(sqlET, paramsET);
      } catch (e) { /* tabla no disponible */ }
    }

    // Buscar en Control Previo Loto
    if (!juego || juego === 'loto') {
      try {
        let sqlL = 'SELECT * FROM control_previo_loto WHERE 1=1';
        const paramsL = [];
        if (numeroSorteo) { sqlL += ' AND numero_sorteo = ?'; paramsL.push(numeroSorteo); }
        if (fecha) { sqlL += ' AND fecha = ?'; paramsL.push(fecha); }
        sqlL += ' ORDER BY created_at DESC LIMIT 10';
        resultado.controlPrevio.loto = await query(sqlL, paramsL);

        let sqlEL = 'SELECT * FROM escrutinio_loto WHERE 1=1';
        const paramsEL = [];
        if (numeroSorteo) { sqlEL += ' AND numero_sorteo = ?'; paramsEL.push(numeroSorteo); }
        if (fecha) { sqlEL += ' AND fecha = ?'; paramsEL.push(fecha); }
        sqlEL += ' ORDER BY created_at DESC LIMIT 10';
        resultado.escrutinio.loto = await query(sqlEL, paramsEL);
      } catch (e) { /* tabla no disponible */ }
    }

    // Buscar en Control Previo Loto 5
    if (!juego || juego === 'loto5') {
      try {
        let sqlL5 = 'SELECT * FROM control_previo_loto5 WHERE 1=1';
        const paramsL5 = [];
        if (numeroSorteo) { sqlL5 += ' AND numero_sorteo = ?'; paramsL5.push(numeroSorteo); }
        if (fecha) { sqlL5 += ' AND fecha = ?'; paramsL5.push(fecha); }
        sqlL5 += ' ORDER BY created_at DESC LIMIT 10';
        resultado.controlPrevio.loto5 = await query(sqlL5, paramsL5);

        let sqlEL5 = 'SELECT * FROM escrutinio_loto5 WHERE 1=1';
        const paramsEL5 = [];
        if (numeroSorteo) { sqlEL5 += ' AND numero_sorteo = ?'; paramsEL5.push(numeroSorteo); }
        if (fecha) { sqlEL5 += ' AND fecha = ?'; paramsEL5.push(fecha); }
        sqlEL5 += ' ORDER BY created_at DESC LIMIT 10';
        resultado.escrutinio.loto5 = await query(sqlEL5, paramsEL5);
      } catch (e) { /* tabla no disponible */ }
    }

    // Buscar en Control Previo BRINCO
    if (!juego || juego === 'brinco') {
      try {
        let sqlB = 'SELECT * FROM control_previo_brinco WHERE 1=1';
        const paramsB = [];
        if (numeroSorteo) { sqlB += ' AND numero_sorteo = ?'; paramsB.push(numeroSorteo); }
        if (fecha) { sqlB += ' AND fecha = ?'; paramsB.push(fecha); }
        sqlB += ' ORDER BY created_at DESC LIMIT 10';
        resultado.controlPrevio.brinco = await query(sqlB, paramsB);

        let sqlEB = 'SELECT * FROM escrutinio_brinco WHERE 1=1';
        const paramsEB = [];
        if (numeroSorteo) { sqlEB += ' AND numero_sorteo = ?'; paramsEB.push(numeroSorteo); }
        if (fecha) { sqlEB += ' AND fecha = ?'; paramsEB.push(fecha); }
        sqlEB += ' ORDER BY created_at DESC LIMIT 10';
        resultado.escrutinio.brinco = await query(sqlEB, paramsEB);
      } catch (e) { /* tabla no disponible */ }
    }

    // Buscar en Control Previo QUINI 6
    if (!juego || juego === 'quini6') {
      try {
        let sqlQ6 = 'SELECT * FROM control_previo_quini6 WHERE 1=1';
        const paramsQ6 = [];
        if (numeroSorteo) { sqlQ6 += ' AND numero_sorteo = ?'; paramsQ6.push(numeroSorteo); }
        if (fecha) { sqlQ6 += ' AND fecha = ?'; paramsQ6.push(fecha); }
        sqlQ6 += ' ORDER BY created_at DESC LIMIT 10';
        resultado.controlPrevio.quini6 = await query(sqlQ6, paramsQ6);

        let sqlEQ6 = 'SELECT * FROM escrutinio_quini6 WHERE 1=1';
        const paramsEQ6 = [];
        if (numeroSorteo) { sqlEQ6 += ' AND numero_sorteo = ?'; paramsEQ6.push(numeroSorteo); }
        if (fecha) { sqlEQ6 += ' AND fecha = ?'; paramsEQ6.push(fecha); }
        sqlEQ6 += ' ORDER BY created_at DESC LIMIT 10';
        resultado.escrutinio.quini6 = await query(sqlEQ6, paramsEQ6);
      } catch (e) { /* tabla no disponible */ }
    }

    return successResponse(res, resultado);

  } catch (error) {
    console.error('Error buscando sorteo:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * GET /api/historial/control-previo
 * Lista el historial de control previo de todos los juegos combinado
 */
const listarControlPrevioGeneral = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta, juego, limit } = req.query;
    const maxLimit = parseInt(limit) || 50;

    let resultados = [];

    // Obtener Quiniela si no se especifica juego o es quiniela
    if (!juego || juego === 'quiniela') {
      let sqlQ = `
        SELECT cp.*, u.nombre as usuario_nombre, 'quiniela' as juego
        FROM control_previo_quiniela cp
        LEFT JOIN usuarios u ON cp.usuario_id = u.id
        WHERE 1=1
      `;
      const paramsQ = [];

      if (fechaDesde) { sqlQ += ' AND cp.fecha >= ?'; paramsQ.push(fechaDesde); }
      if (fechaHasta) { sqlQ += ' AND cp.fecha <= ?'; paramsQ.push(fechaHasta); }

      sqlQ += ` ORDER BY cp.fecha DESC, cp.created_at DESC LIMIT ${maxLimit}`;

      const quinielaData = await query(sqlQ, paramsQ);
      resultados = resultados.concat(quinielaData);
    }

    // Obtener Poceada si no se especifica juego o es poceada
    if (!juego || juego === 'poceada') {
      let sqlP = `
        SELECT cp.*, u.nombre as usuario_nombre, 'poceada' as juego
        FROM control_previo_poceada cp
        LEFT JOIN usuarios u ON cp.usuario_id = u.id
        WHERE 1=1
      `;
      const paramsP = [];

      if (fechaDesde) { sqlP += ' AND cp.fecha >= ?'; paramsP.push(fechaDesde); }
      if (fechaHasta) { sqlP += ' AND cp.fecha <= ?'; paramsP.push(fechaHasta); }

      sqlP += ` ORDER BY cp.fecha DESC, cp.created_at DESC LIMIT ${maxLimit}`;

      const poceadaData = await query(sqlP, paramsP);
      resultados = resultados.concat(poceadaData);
    }

    // Obtener Tombolina si no se especifica juego o es tombolina
    if (!juego || juego === 'tombolina') {
      try {
        let sqlT = `
          SELECT cp.*, u.nombre as usuario_nombre, 'tombolina' as juego
          FROM control_previo_tombolina cp
          LEFT JOIN usuarios u ON cp.usuario_id = u.id
          WHERE 1=1
        `;
        const paramsT = [];

        if (fechaDesde) { sqlT += ' AND cp.fecha >= ?'; paramsT.push(fechaDesde); }
        if (fechaHasta) { sqlT += ' AND cp.fecha <= ?'; paramsT.push(fechaHasta); }

        sqlT += ` ORDER BY cp.fecha DESC, cp.created_at DESC LIMIT ${maxLimit}`;

        const tombolinaData = await query(sqlT, paramsT);
        resultados = resultados.concat(tombolinaData);
      } catch (e) {
        // Tabla puede no existir todavía
        console.log('Tabla control_previo_tombolina no disponible');
      }
    }

    // Obtener Loto si no se especifica juego o es loto
    if (!juego || juego === 'loto') {
      try {
        let sqlL = `
          SELECT cp.*, u.nombre as usuario_nombre, 'loto' as juego
          FROM control_previo_loto cp
          LEFT JOIN usuarios u ON cp.usuario_id = u.id
          WHERE 1=1
        `;
        const paramsL = [];

        if (fechaDesde) { sqlL += ' AND cp.fecha >= ?'; paramsL.push(fechaDesde); }
        if (fechaHasta) { sqlL += ' AND cp.fecha <= ?'; paramsL.push(fechaHasta); }

        sqlL += ` ORDER BY cp.fecha DESC, cp.created_at DESC LIMIT ${maxLimit}`;

        const lotoData = await query(sqlL, paramsL);
        resultados = resultados.concat(lotoData);
      } catch (e) {
        // Tabla puede no existir todavía
        console.log('Tabla control_previo_loto no disponible');
      }
    }

    // Obtener Loto 5 si no se especifica juego o es loto5
    if (!juego || juego === 'loto5') {
      try {
        let sqlL5 = `
          SELECT cp.id, cp.numero_sorteo, cp.fecha, cp.archivo,
                 cp.registros_validos as total_registros,
                 cp.apuestas_total as total_apuestas,
                 cp.registros_anulados as total_anulados,
                 cp.recaudacion as total_recaudacion,
                 cp.usuario_id, cp.created_at, cp.updated_at,
                 u.nombre as usuario_nombre, 'loto5' as juego
          FROM control_previo_loto5 cp
          LEFT JOIN usuarios u ON cp.usuario_id = u.id
          WHERE 1=1
        `;
        const paramsL5 = [];

        if (fechaDesde) { sqlL5 += ' AND cp.fecha >= ?'; paramsL5.push(fechaDesde); }
        if (fechaHasta) { sqlL5 += ' AND cp.fecha <= ?'; paramsL5.push(fechaHasta); }

        sqlL5 += ` ORDER BY cp.fecha DESC, cp.created_at DESC LIMIT ${maxLimit}`;

        const loto5Data = await query(sqlL5, paramsL5);
        resultados = resultados.concat(loto5Data);
      } catch (e) {
        console.log('Tabla control_previo_loto5 no disponible');
      }
    }

    // Obtener BRINCO si no se especifica juego o es brinco
    if (!juego || juego === 'brinco') {
      try {
        let sqlB = `
          SELECT cp.id, cp.numero_sorteo, cp.fecha, cp.archivo,
                 cp.registros_validos as total_registros,
                 cp.apuestas_total as total_apuestas,
                 cp.registros_anulados as total_anulados,
                 cp.recaudacion as total_recaudacion,
                 cp.usuario_id, cp.created_at, cp.updated_at,
                 u.nombre as usuario_nombre, 'brinco' as juego
          FROM control_previo_brinco cp
          LEFT JOIN usuarios u ON cp.usuario_id = u.id
          WHERE 1=1
        `;
        const paramsB = [];

        if (fechaDesde) { sqlB += ' AND cp.fecha >= ?'; paramsB.push(fechaDesde); }
        if (fechaHasta) { sqlB += ' AND cp.fecha <= ?'; paramsB.push(fechaHasta); }

        sqlB += ` ORDER BY cp.fecha DESC, cp.created_at DESC LIMIT ${maxLimit}`;

        const brincoData = await query(sqlB, paramsB);
        resultados = resultados.concat(brincoData);
      } catch (e) {
        console.log('Tabla control_previo_brinco no disponible');
      }
    }

    // Obtener QUINI 6 si no se especifica juego o es quini6
    if (!juego || juego === 'quini6') {
      try {
        let sqlQ6 = `
          SELECT cp.id, cp.numero_sorteo, cp.fecha, cp.archivo,
                 cp.registros_validos as total_registros,
                 cp.apuestas_total as total_apuestas,
                 cp.registros_anulados as total_anulados,
                 cp.recaudacion as total_recaudacion,
                 cp.usuario_id, cp.created_at, cp.updated_at,
                 u.nombre as usuario_nombre, 'quini6' as juego
          FROM control_previo_quini6 cp
          LEFT JOIN usuarios u ON cp.usuario_id = u.id
          WHERE 1=1
        `;
        const paramsQ6 = [];

        if (fechaDesde) { sqlQ6 += ' AND cp.fecha >= ?'; paramsQ6.push(fechaDesde); }
        if (fechaHasta) { sqlQ6 += ' AND cp.fecha <= ?'; paramsQ6.push(fechaHasta); }

        sqlQ6 += ` ORDER BY cp.fecha DESC, cp.created_at DESC LIMIT ${maxLimit}`;

        const quini6Data = await query(sqlQ6, paramsQ6);
        resultados = resultados.concat(quini6Data);
      } catch (e) {
        console.log('Tabla control_previo_quini6 no disponible');
      }
    }

    // Ordenar por fecha y limitar
    resultados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    resultados = resultados.slice(0, maxLimit);

    return successResponse(res, resultados);

  } catch (error) {
    console.error('Error listando control previo general:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * GET /api/historial/control-previo/:id
 * Obtiene detalle de un registro específico de control previo
 */
const obtenerDetalleControlPrevio = async (req, res) => {
  try {
    const { id } = req.params;
    const { juego } = req.query;

    const juegosValidos = ['quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'brinco', 'quini6'];
    if (!juego || !juegosValidos.includes(juego)) {
      return errorResponse(res, `Debe especificar juego válido: ${juegosValidos.join(', ')}`, 400);
    }

    const tablaMap = {
      'quiniela': 'control_previo_quiniela',
      'poceada': 'control_previo_poceada',
      'tombolina': 'control_previo_tombolina',
      'loto': 'control_previo_loto',
      'loto5': 'control_previo_loto5',
      'brinco': 'control_previo_brinco',
      'quini6': 'control_previo_quini6'
    };
    const tabla = tablaMap[juego];

    const [registro] = await query(`
      SELECT cp.*, u.nombre as usuario_nombre
      FROM ${tabla} cp
      LEFT JOIN usuarios u ON cp.usuario_id = u.id
      WHERE cp.id = ?
    `, [id]);

    if (!registro) {
      return errorResponse(res, 'Registro no encontrado', 404);
    }

    return successResponse(res, registro);

  } catch (error) {
    console.error('Error obteniendo detalle CP:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * GET /api/historial/escrutinios
 * Lista el historial de escrutinios de todos los juegos combinado
 */
const listarEscrutiniosGeneral = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta, juego, limit } = req.query;
    const maxLimit = parseInt(limit) || 50;

    let resultados = [];

    // Obtener Quiniela
    if (!juego || juego === 'quiniela') {
      let sqlQ = `
        SELECT e.*, u.nombre as usuario_nombre, 'quiniela' as juego
        FROM escrutinio_quiniela e
        LEFT JOIN usuarios u ON e.usuario_id = u.id
        WHERE 1=1
      `;
      const paramsQ = [];

      if (fechaDesde) { sqlQ += ' AND e.fecha >= ?'; paramsQ.push(fechaDesde); }
      if (fechaHasta) { sqlQ += ' AND e.fecha <= ?'; paramsQ.push(fechaHasta); }

      sqlQ += ` ORDER BY e.fecha DESC, e.created_at DESC LIMIT ${maxLimit}`;

      const quinielaData = await query(sqlQ, paramsQ);
      resultados = resultados.concat(quinielaData);
    }

    // Obtener Poceada
    if (!juego || juego === 'poceada') {
      let sqlP = `
        SELECT e.*, u.nombre as usuario_nombre, 'poceada' as juego
        FROM escrutinio_poceada e
        LEFT JOIN usuarios u ON e.usuario_id = u.id
        WHERE 1=1
      `;
      const paramsP = [];

      if (fechaDesde) { sqlP += ' AND e.fecha >= ?'; paramsP.push(fechaDesde); }
      if (fechaHasta) { sqlP += ' AND e.fecha <= ?'; paramsP.push(fechaHasta); }

      sqlP += ` ORDER BY e.fecha DESC, e.created_at DESC LIMIT ${maxLimit}`;

      const poceadaData = await query(sqlP, paramsP);
      resultados = resultados.concat(poceadaData);
    }

    // Obtener Tombolina
    if (!juego || juego === 'tombolina') {
      try {
        let sqlT = `
          SELECT e.*, u.nombre as usuario_nombre, 'tombolina' as juego
          FROM escrutinio_tombolina e
          LEFT JOIN usuarios u ON e.usuario_id = u.id
          WHERE 1=1
        `;
        const paramsT = [];

        if (fechaDesde) { sqlT += ' AND e.fecha >= ?'; paramsT.push(fechaDesde); }
        if (fechaHasta) { sqlT += ' AND e.fecha <= ?'; paramsT.push(fechaHasta); }

        sqlT += ` ORDER BY e.fecha DESC, e.created_at DESC LIMIT ${maxLimit}`;

        const tombolinaData = await query(sqlT, paramsT);
        resultados = resultados.concat(tombolinaData);
      } catch (e) {
        console.log('Tabla escrutinio_tombolina no disponible');
      }
    }

    // Obtener Loto
    if (!juego || juego === 'loto') {
      try {
        let sqlL = `
          SELECT e.*, u.nombre as usuario_nombre, 'loto' as juego
          FROM escrutinio_loto e
          LEFT JOIN usuarios u ON e.usuario_id = u.id
          WHERE 1=1
        `;
        const paramsL = [];

        if (fechaDesde) { sqlL += ' AND e.fecha >= ?'; paramsL.push(fechaDesde); }
        if (fechaHasta) { sqlL += ' AND e.fecha <= ?'; paramsL.push(fechaHasta); }

        sqlL += ` ORDER BY e.fecha DESC, e.created_at DESC LIMIT ${maxLimit}`;

        const lotoData = await query(sqlL, paramsL);
        resultados = resultados.concat(lotoData);
      } catch (e) {
        console.log('Tabla escrutinio_loto no disponible');
      }
    }

    // Obtener Loto 5
    if (!juego || juego === 'loto5') {
      try {
        let sqlL5 = `
          SELECT e.*, u.nombre as usuario_nombre, 'loto5' as juego
          FROM escrutinio_loto5 e
          LEFT JOIN usuarios u ON e.usuario_id = u.id
          WHERE 1=1
        `;
        const paramsL5 = [];

        if (fechaDesde) { sqlL5 += ' AND e.fecha >= ?'; paramsL5.push(fechaDesde); }
        if (fechaHasta) { sqlL5 += ' AND e.fecha <= ?'; paramsL5.push(fechaHasta); }

        sqlL5 += ` ORDER BY e.fecha DESC, e.created_at DESC LIMIT ${maxLimit}`;

        const loto5Data = await query(sqlL5, paramsL5);
        resultados = resultados.concat(loto5Data);
      } catch (e) {
        console.log('Tabla escrutinio_loto5 no disponible');
      }
    }

    // Obtener BRINCO
    if (!juego || juego === 'brinco') {
      try {
        let sqlB = `
          SELECT e.*, u.nombre as usuario_nombre, 'brinco' as juego
          FROM escrutinio_brinco e
          LEFT JOIN usuarios u ON e.usuario_id = u.id
          WHERE 1=1
        `;
        const paramsB = [];

        if (fechaDesde) { sqlB += ' AND e.fecha >= ?'; paramsB.push(fechaDesde); }
        if (fechaHasta) { sqlB += ' AND e.fecha <= ?'; paramsB.push(fechaHasta); }

        sqlB += ` ORDER BY e.fecha DESC, e.created_at DESC LIMIT ${maxLimit}`;

        const brincoData = await query(sqlB, paramsB);
        resultados = resultados.concat(brincoData);
      } catch (e) {
        console.log('Tabla escrutinio_brinco no disponible');
      }
    }

    // Obtener QUINI 6
    if (!juego || juego === 'quini6') {
      try {
        let sqlQ6 = `
          SELECT e.*, u.nombre as usuario_nombre, 'quini6' as juego
          FROM escrutinio_quini6 e
          LEFT JOIN usuarios u ON e.usuario_id = u.id
          WHERE 1=1
        `;
        const paramsQ6 = [];

        if (fechaDesde) { sqlQ6 += ' AND e.fecha >= ?'; paramsQ6.push(fechaDesde); }
        if (fechaHasta) { sqlQ6 += ' AND e.fecha <= ?'; paramsQ6.push(fechaHasta); }

        sqlQ6 += ` ORDER BY e.fecha DESC, e.created_at DESC LIMIT ${maxLimit}`;

        const quini6Data = await query(sqlQ6, paramsQ6);
        resultados = resultados.concat(quini6Data);
      } catch (e) {
        console.log('Tabla escrutinio_quini6 no disponible');
      }
    }

    // Ordenar por fecha y limitar
    resultados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    resultados = resultados.slice(0, maxLimit);

    return successResponse(res, resultados);

  } catch (error) {
    console.error('Error listando escrutinios general:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * GET /api/historial/escrutinios/:id
 * Obtiene detalle de un escrutinio específico
 */
const obtenerDetalleEscrutinio = async (req, res) => {
  try {
    const { id } = req.params;
    const { juego } = req.query;

    const juegosValidos = ['quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'brinco', 'quini6'];
    if (!juego || !juegosValidos.includes(juego)) {
      return errorResponse(res, `Debe especificar juego válido: ${juegosValidos.join(', ')}`, 400);
    }

    const tablaMap = {
      'quiniela': 'escrutinio_quiniela',
      'poceada': 'escrutinio_poceada',
      'tombolina': 'escrutinio_tombolina',
      'loto': 'escrutinio_loto',
      'loto5': 'escrutinio_loto5',
      'brinco': 'escrutinio_brinco',
      'quini6': 'escrutinio_quini6'
    };
    const tabla = tablaMap[juego];

    const [registro] = await query(`
      SELECT e.*, u.nombre as usuario_nombre
      FROM ${tabla} e
      LEFT JOIN usuarios u ON e.usuario_id = u.id
      WHERE e.id = ?
    `, [id]);

    if (!registro) {
      return errorResponse(res, 'Registro no encontrado', 404);
    }

    return successResponse(res, registro);

  } catch (error) {
    console.error('Error obteniendo detalle escrutinio:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * GET /api/historial/escrutinios/:id/agencias
 * Obtiene los premios por agencia de un escrutinio
 */
const obtenerAgenciasEscrutinio = async (req, res) => {
  try {
    const { id } = req.params;
    const { juego } = req.query;

    const juegosValidos = ['quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'brinco', 'quini6'];
    if (!juego || !juegosValidos.includes(juego)) {
      return errorResponse(res, `Debe especificar juego válido: ${juegosValidos.join(', ')}`, 400);
    }

    const agencias = await query(`
      SELECT 
        epa.*,
        CASE epa.codigo_provincia
          WHEN '51' THEN 'CABA'
          WHEN '53' THEN 'Buenos Aires'
          WHEN '54' THEN 'Catamarca'
          WHEN '55' THEN 'Córdoba'
          WHEN '56' THEN 'Corrientes'
          WHEN '57' THEN 'Chaco'
          WHEN '58' THEN 'Chubut'
          WHEN '59' THEN 'Entre Ríos'
          WHEN '60' THEN 'Formosa'
          WHEN '61' THEN 'Jujuy'
          WHEN '62' THEN 'La Pampa'
          WHEN '63' THEN 'La Rioja'
          WHEN '64' THEN 'Mendoza'
          WHEN '65' THEN 'Misiones'
          WHEN '66' THEN 'Neuquén'
          WHEN '67' THEN 'Río Negro'
          WHEN '68' THEN 'Salta'
          WHEN '69' THEN 'San Juan'
          WHEN '70' THEN 'San Luis'
          WHEN '71' THEN 'Santa Cruz'
          WHEN '72' THEN 'Santa Fe'
          WHEN '73' THEN 'Santiago del Estero'
          WHEN '74' THEN 'Tucumán'
          WHEN '75' THEN 'Tierra del Fuego'
          ELSE epa.codigo_provincia
        END as provincia_nombre
      FROM escrutinio_premios_agencia epa
      WHERE epa.escrutinio_id = ? AND epa.juego = ?
      ORDER BY epa.codigo_provincia, epa.codigo_agencia
    `, [id, juego]);

    return successResponse(res, agencias);

  } catch (error) {
    console.error('Error obteniendo agencias escrutinio:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * GET /api/historial/extractos
 * Lista los extractos (números ganadores) guardados en los escrutinios
 * Query params: fecha, fechaDesde, fechaHasta, juego, modalidad
 */
const listarExtractos = async (req, res) => {
  try {
    const { fecha, fechaDesde, fechaHasta, juego, modalidad } = req.query;

    let resultados = [];

    // Si se especifica fecha exacta, usar esa; sino usar el rango
    const fechaFiltro = fecha || null;
    const desde = fechaDesde || (fecha ? null : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const hasta = fechaHasta || (fecha ? null : new Date().toISOString().split('T')[0]);

    // Obtener extractos de Quiniela
    if (!juego || juego === 'quiniela') {
      let sqlQ = `
        SELECT 
          e.id, e.fecha, e.numero_sorteo, e.modalidad,
          e.resumen_premios, e.total_ganadores, e.total_premios,
          e.created_at, e.usuario_nombre,
          'quiniela' as juego
        FROM escrutinio_quiniela e
        WHERE 1=1
      `;
      const paramsQ = [];

      if (fechaFiltro) {
        sqlQ += ' AND e.fecha = ?';
        paramsQ.push(fechaFiltro);
      } else {
        if (desde) { sqlQ += ' AND e.fecha >= ?'; paramsQ.push(desde); }
        if (hasta) { sqlQ += ' AND e.fecha <= ?'; paramsQ.push(hasta); }
      }

      if (modalidad) {
        sqlQ += ' AND e.modalidad = ?';
        paramsQ.push(modalidad);
      }

      sqlQ += ' ORDER BY e.fecha DESC, e.numero_sorteo DESC LIMIT 100';

      const quinielaData = await query(sqlQ, paramsQ);

      // Parsear resumen_premios para extraer los extractos
      for (const item of quinielaData) {
        try {
          const resumen = item.resumen_premios ? JSON.parse(item.resumen_premios) : {};
          item.extractos = resumen.porExtracto || [];
          delete item.resumen_premios; // No enviar el JSON completo
        } catch (e) {
          item.extractos = [];
        }
      }

      resultados = resultados.concat(quinielaData);
    }

    // Obtener extractos de Poceada
    if (!juego || juego === 'poceada') {
      let sqlP = `
        SELECT 
          e.id, e.fecha, e.numero_sorteo,
          e.resumen_premios, e.total_ganadores, e.total_premios,
          e.created_at, e.usuario_nombre,
          'N' as modalidad,
          'poceada' as juego
        FROM escrutinio_poceada e
        WHERE 1=1
      `;
      const paramsP = [];

      if (fechaFiltro) {
        sqlP += ' AND e.fecha = ?';
        paramsP.push(fechaFiltro);
      } else {
        if (desde) { sqlP += ' AND e.fecha >= ?'; paramsP.push(desde); }
        if (hasta) { sqlP += ' AND e.fecha <= ?'; paramsP.push(hasta); }
      }

      sqlP += ' ORDER BY e.fecha DESC, e.numero_sorteo DESC LIMIT 100';

      const poceadaData = await query(sqlP, paramsP);

      // Parsear resumen_premios para extraer el extracto
      for (const item of poceadaData) {
        try {
          const resumen = item.resumen_premios ? JSON.parse(item.resumen_premios) : {};
          item.extracto = resumen.extracto || {};
          delete item.resumen_premios;
        } catch (e) {
          item.extracto = {};
        }
      }

      resultados = resultados.concat(poceadaData);
    }

    // Ordenar por fecha desc
    resultados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    return successResponse(res, resultados);

  } catch (error) {
    console.error('Error listando extractos:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * GET /api/historial/dashboard/datos
 * Obtiene los datos para el dashboard de reportes (similar a lotba_dashboard)
 * Soporta: Detallado, Totalizado por agencia, Estadísticas
 */
const obtenerDatosDashboard = async (req, res) => {
  try {
    const {
      fechaDesde, fechaHasta,
      sorteoDesde, sorteoHasta,
      juego, // 'quiniela', 'poceada', o vacío para todos
      agencia,
      tipoConsulta = 'detallado', // 'detallado', 'totalizado', 'comparativo'
      limit = 1000,
      offset = 0
    } = req.query;

    let resultados = [];
    const maxLimit = Math.min(parseInt(limit) || 1000, 5000);
    const offsetNum = parseInt(offset) || 0;

    // Construir filtros base
    const buildWhere = (prefix = '') => {
      let where = '';
      const params = [];
      if (fechaDesde) { where += ` AND ${prefix}fecha >= ?`; params.push(fechaDesde); }
      if (fechaHasta) { where += ` AND ${prefix}fecha <= ?`; params.push(fechaHasta); }
      if (sorteoDesde) { where += ` AND ${prefix}numero_sorteo >= ?`; params.push(sorteoDesde); }
      if (sorteoHasta) { where += ` AND ${prefix}numero_sorteo <= ?`; params.push(sorteoHasta); }
      return { where, params };
    };

    if (tipoConsulta === 'detallado') {
      // Datos detallados por sorteo
      if (!juego || juego === 'quiniela') {
        const { where: whereQ, params: paramsQ } = buildWhere('cp.');

        const sqlQ = `
          SELECT 
            cp.id, cp.fecha, cp.numero_sorteo as sorteo, cp.modalidad,
            cp.total_registros, cp.total_tickets, cp.total_apuestas,
            cp.total_anulados, cp.total_recaudacion as recaudacion_total,
            COALESCE(eq.total_premios, 0) as total_premios,
            COALESCE(eq.total_ganadores, 0) as total_ganadores,
            cp.usuario_nombre,
            cp.created_at,
            'quiniela' as juego
          FROM control_previo_quiniela cp
          LEFT JOIN escrutinio_quiniela eq ON cp.fecha = eq.fecha 
            AND cp.numero_sorteo = eq.numero_sorteo 
            AND cp.modalidad = eq.modalidad
          WHERE 1=1 ${whereQ}
          ORDER BY cp.fecha DESC, cp.numero_sorteo DESC
          LIMIT ${maxLimit} OFFSET ${offsetNum}
        `;
        const quinielaData = await query(sqlQ, paramsQ);
        resultados = resultados.concat(quinielaData);
      }

      if (!juego || juego === 'poceada') {
        const { where: whereP, params: paramsP } = buildWhere('cp.');

        const sqlP = `
          SELECT 
            cp.id, cp.fecha, cp.numero_sorteo as sorteo, 'N' as modalidad,
            cp.total_registros, cp.total_tickets, cp.total_apuestas,
            cp.total_anulados, cp.total_recaudacion as recaudacion_total,
            COALESCE(ep.total_premios, 0) as total_premios,
            COALESCE(ep.total_ganadores, 0) as total_ganadores,
            cp.usuario_nombre,
            cp.created_at,
            'poceada' as juego
          FROM control_previo_poceada cp
          LEFT JOIN escrutinio_poceada ep ON cp.fecha = ep.fecha 
            AND cp.numero_sorteo = ep.numero_sorteo
          WHERE 1=1 ${whereP}
          ORDER BY cp.fecha DESC, cp.numero_sorteo DESC
          LIMIT ${maxLimit} OFFSET ${offsetNum}
        `;
        const poceadaData = await query(sqlP, paramsP);
        resultados = resultados.concat(poceadaData);
      }

      if (!juego || juego === 'tombolina') {
        const { where: whereT, params: paramsT } = buildWhere('cp.');

        const sqlT = `
          SELECT
            cp.id, cp.fecha, cp.numero_sorteo as sorteo, 'U' as modalidad,
            cp.total_registros, cp.total_tickets, cp.total_apuestas,
            cp.total_anulados, cp.total_recaudacion as recaudacion_total,
            COALESCE(et.total_premios, 0) as total_premios,
            COALESCE(et.total_ganadores, 0) as total_ganadores,
            cp.usuario_nombre,
            cp.created_at,
            'tombolina' as juego
          FROM control_previo_tombolina cp
          LEFT JOIN escrutinio_tombolina et ON cp.fecha = et.fecha
            AND cp.numero_sorteo = et.numero_sorteo
          WHERE 1=1 ${whereT}
          ORDER BY cp.fecha DESC, cp.numero_sorteo DESC
          LIMIT ${maxLimit} OFFSET ${offsetNum}
        `;
        const tombolinaData = await query(sqlT, paramsT);
        resultados = resultados.concat(tombolinaData);
      }

      if (!juego || juego === 'loto') {
        const paramsL = [];
        let whereL = '';
        if (fechaDesde) { whereL += ' AND cp.created_at >= ?'; paramsL.push(fechaDesde); }
        if (fechaHasta) { whereL += ' AND cp.created_at <= ?'; paramsL.push(fechaHasta + ' 23:59:59'); }
        if (sorteoDesde) { whereL += ' AND cp.numero_sorteo >= ?'; paramsL.push(sorteoDesde); }
        if (sorteoHasta) { whereL += ' AND cp.numero_sorteo <= ?'; paramsL.push(sorteoHasta); }

        const sqlL = `
          SELECT
            cp.id, DATE(cp.created_at) as fecha, cp.numero_sorteo as sorteo, 'U' as modalidad,
            cp.registros_validos as total_registros,
            (cp.registros_validos + cp.registros_anulados) as total_tickets,
            cp.apuestas_total as total_apuestas,
            cp.registros_anulados as total_anulados,
            cp.recaudacion as recaudacion_total,
            COALESCE(el.total_premios, 0) as total_premios,
            COALESCE(el.total_ganadores, 0) as total_ganadores,
            NULL as usuario_nombre,
            cp.created_at,
            'loto' as juego
          FROM control_previo_loto cp
          LEFT JOIN escrutinio_loto el ON cp.numero_sorteo = el.numero_sorteo
          WHERE 1=1 ${whereL}
          ORDER BY cp.created_at DESC
          LIMIT ${maxLimit} OFFSET ${offsetNum}
        `;
        const lotoData = await query(sqlL, paramsL);
        resultados = resultados.concat(lotoData);
      }

      // LOTO 5
      if (!juego || juego === 'loto5') {
        const paramsL5 = [];
        let whereL5 = '';
        if (fechaDesde) { whereL5 += ' AND cp.created_at >= ?'; paramsL5.push(fechaDesde); }
        if (fechaHasta) { whereL5 += ' AND cp.created_at <= ?'; paramsL5.push(fechaHasta + ' 23:59:59'); }
        if (sorteoDesde) { whereL5 += ' AND cp.numero_sorteo >= ?'; paramsL5.push(sorteoDesde); }
        if (sorteoHasta) { whereL5 += ' AND cp.numero_sorteo <= ?'; paramsL5.push(sorteoHasta); }

        const sqlL5 = `
          SELECT
            cp.id, DATE(cp.created_at) as fecha, cp.numero_sorteo as sorteo, 'U' as modalidad,
            cp.registros_validos as total_registros,
            (cp.registros_validos + cp.registros_anulados) as total_tickets,
            cp.apuestas_total as total_apuestas,
            cp.registros_anulados as total_anulados,
            cp.recaudacion as recaudacion_total,
            COALESCE(el5.total_premios, 0) as total_premios,
            COALESCE(el5.total_ganadores, 0) as total_ganadores,
            NULL as usuario_nombre,
            cp.created_at,
            'loto5' as juego
          FROM control_previo_loto5 cp
          LEFT JOIN escrutinio_loto5 el5 ON cp.numero_sorteo = el5.numero_sorteo
          WHERE 1=1 ${whereL5}
          ORDER BY cp.created_at DESC
          LIMIT ${maxLimit} OFFSET ${offsetNum}
        `;
        const loto5Data = await query(sqlL5, paramsL5);
        resultados = resultados.concat(loto5Data);
      }

      // QUINI 6
      if (!juego || juego === 'quini6') {
        const paramsQ6 = [];
        let whereQ6 = '';
        if (fechaDesde) { whereQ6 += ' AND cp.fecha >= ?'; paramsQ6.push(fechaDesde); }
        if (fechaHasta) { whereQ6 += ' AND cp.fecha <= ?'; paramsQ6.push(fechaHasta); }
        if (sorteoDesde) { whereQ6 += ' AND cp.numero_sorteo >= ?'; paramsQ6.push(sorteoDesde); }
        if (sorteoHasta) { whereQ6 += ' AND cp.numero_sorteo <= ?'; paramsQ6.push(sorteoHasta); }

        const sqlQ6 = `
          SELECT
            cp.id, cp.fecha, cp.numero_sorteo as sorteo, 'U' as modalidad,
            cp.registros_validos as total_registros,
            (cp.registros_validos + cp.registros_anulados) as total_tickets,
            cp.apuestas_total as total_apuestas,
            cp.registros_anulados as total_anulados,
            cp.recaudacion as recaudacion_total,
            COALESCE(eq6.total_premios, 0) as total_premios,
            COALESCE(eq6.total_ganadores, 0) as total_ganadores,
            NULL as usuario_nombre,
            cp.created_at,
            'quini6' as juego
          FROM control_previo_quini6 cp
          LEFT JOIN escrutinio_quini6 eq6 ON cp.numero_sorteo = eq6.numero_sorteo
          WHERE 1=1 ${whereQ6}
          ORDER BY cp.fecha DESC, cp.numero_sorteo DESC
          LIMIT ${maxLimit} OFFSET ${offsetNum}
        `;
        const quini6Data = await query(sqlQ6, paramsQ6);
        resultados = resultados.concat(quini6Data);
      }

      // BRINCO
      if (!juego || juego === 'brinco') {
        const paramsB = [];
        let whereB = '';
        if (fechaDesde) { whereB += ' AND cp.fecha >= ?'; paramsB.push(fechaDesde); }
        if (fechaHasta) { whereB += ' AND cp.fecha <= ?'; paramsB.push(fechaHasta); }
        if (sorteoDesde) { whereB += ' AND cp.numero_sorteo >= ?'; paramsB.push(sorteoDesde); }
        if (sorteoHasta) { whereB += ' AND cp.numero_sorteo <= ?'; paramsB.push(sorteoHasta); }

        const sqlB = `
          SELECT
            cp.id, cp.fecha, cp.numero_sorteo as sorteo, 'U' as modalidad,
            cp.registros_validos as total_registros,
            (cp.registros_validos + cp.registros_anulados) as total_tickets,
            cp.apuestas_total as total_apuestas,
            cp.registros_anulados as total_anulados,
            cp.recaudacion as recaudacion_total,
            COALESCE(eb.total_premios, 0) as total_premios,
            COALESCE(eb.total_ganadores, 0) as total_ganadores,
            NULL as usuario_nombre,
            cp.created_at,
            'brinco' as juego
          FROM control_previo_brinco cp
          LEFT JOIN escrutinio_brinco eb ON cp.numero_sorteo = eb.numero_sorteo
          WHERE 1=1 ${whereB}
          ORDER BY cp.fecha DESC, cp.numero_sorteo DESC
          LIMIT ${maxLimit} OFFSET ${offsetNum}
        `;
        const brincoData = await query(sqlB, paramsB);
        resultados = resultados.concat(brincoData);
      }

      // Hipicas (desde facturacion_turfito)
      if (!juego || juego === 'hipicas') {
        let whereH = '';
        const paramsH = [];
        if (fechaDesde) { whereH += ' AND fecha_sorteo >= ?'; paramsH.push(fechaDesde); }
        if (fechaHasta) { whereH += ' AND fecha_sorteo <= ?'; paramsH.push(fechaHasta); }
        if (agencia) { whereH += ' AND agency LIKE ?'; paramsH.push(`%${agencia}%`); }

        const sqlH = `
          SELECT
            NULL as id, fecha_sorteo as fecha, sorteo, 'H' as modalidad,
            COUNT(*) as total_registros, 0 as total_tickets, 0 as total_apuestas,
            0 as total_anulados,
            SUM(recaudacion_total) as recaudacion_total,
            SUM(total_premios) as total_premios,
            SUM(importe_cancelaciones) as cancelaciones,
            SUM(devoluciones) as devoluciones,
            0 as total_ganadores,
            '' as usuario_nombre,
            MAX(created_at) as created_at,
            'hipicas' as juego
          FROM facturacion_turfito
          WHERE 1=1 ${whereH}
          GROUP BY fecha_sorteo, sorteo
          ORDER BY fecha_sorteo DESC, sorteo DESC
          LIMIT ${maxLimit} OFFSET ${offsetNum}
        `;
        const hipicasData = await query(sqlH, paramsH);
        resultados = resultados.concat(hipicasData);
      }

      // Ordenar combinados por fecha
      resultados.sort((a, b) => {
        const fechaComp = new Date(b.fecha) - new Date(a.fecha);
        return fechaComp !== 0 ? fechaComp : b.sorteo - a.sorteo;
      });
      resultados = resultados.slice(0, maxLimit);

    } else if (tipoConsulta === 'totalizado') {
      // Totalizado por agencia/provincia
      // - Agencias 51 (CABA): mostrar individualmente
      // - Otras provincias: agrupar por provincia

      const PROVINCIAS_NOMBRES = {
        '51': 'CABA',
        '53': 'Buenos Aires',
        '54': 'Catamarca',
        '55': 'Córdoba',
        '56': 'Corrientes',
        '57': 'Chaco',
        '58': 'Chubut',
        '59': 'Entre Ríos',
        '60': 'Formosa',
        '61': 'Jujuy',
        '62': 'La Pampa',
        '63': 'La Rioja',
        '64': 'Mendoza',
        '65': 'Misiones',
        '66': 'Neuquén',
        '67': 'Río Negro',
        '68': 'Salta',
        '69': 'San Juan',
        '70': 'San Luis',
        '71': 'Santa Cruz',
        '72': 'Santa Fe',
        '73': 'Sgo. del Estero',
        '74': 'Tucumán',
        '75': 'Tierra del Fuego'
      };

      // Consulta que diferencia CABA (51) del resto
      const buildTotalizadoQuery = (tablaEscrutinio, juegoNombre) => {
        return `
          SELECT 
            CASE 
              WHEN epa.codigo_provincia = '51' THEN epa.cta_cte
              ELSE CONCAT('PROV-', epa.codigo_provincia)
            END as agencia,
            CASE 
              WHEN epa.codigo_provincia = '51' THEN epa.cta_cte
              ELSE epa.codigo_provincia
            END as codigo,
            epa.codigo_provincia,
            SUM(epa.total_ganadores) as total_ganadores,
            SUM(epa.total_premios) as total_premios,
            COUNT(DISTINCT epa.escrutinio_id) as total_sorteos,
            '${juegoNombre}' as juego
          FROM escrutinio_premios_agencia epa
          INNER JOIN ${tablaEscrutinio} e ON epa.escrutinio_id = e.id AND epa.juego = '${juegoNombre}'
          WHERE 1=1
        `;
      };

      // Query para obtener datos de venta por agencia desde control_previo_agencias
      // Formato clave: CABA = "51-XXXXX" (para matchear con escrutinio_premios_agencia.cta_cte)
      const buildVentaQuery = (juegoNombre) => {
        return `
          SELECT
            CASE
              WHEN cpa.codigo_provincia = '51' THEN CONCAT('51-', RIGHT(cpa.codigo_agencia, 5))
              ELSE CONCAT('PROV-', cpa.codigo_provincia)
            END as agencia_key,
            SUM(cpa.total_tickets) as total_tickets,
            SUM(cpa.total_apuestas) as total_apuestas,
            SUM(cpa.total_anulados) as total_anulados,
            SUM(cpa.total_recaudacion) as total_recaudacion
          FROM control_previo_agencias cpa
          WHERE cpa.juego = '${juegoNombre}'
        `;
      };

      if (!juego || juego === 'quiniela') {
        let sqlQ = buildTotalizadoQuery('escrutinio_quiniela', 'quiniela');
        const paramsQ = [];
        if (fechaDesde) { sqlQ += ' AND e.fecha >= ?'; paramsQ.push(fechaDesde); }
        if (fechaHasta) { sqlQ += ' AND e.fecha <= ?'; paramsQ.push(fechaHasta); }
        if (sorteoDesde) { sqlQ += ' AND e.numero_sorteo >= ?'; paramsQ.push(sorteoDesde); }
        if (sorteoHasta) { sqlQ += ' AND e.numero_sorteo <= ?'; paramsQ.push(sorteoHasta); }
        if (agencia) {
          sqlQ += ' AND epa.cta_cte LIKE ?';
          paramsQ.push(`%${agencia}%`);
        }
        sqlQ += ` GROUP BY
          CASE WHEN epa.codigo_provincia = '51' THEN epa.cta_cte ELSE CONCAT('PROV-', epa.codigo_provincia) END,
          CASE WHEN epa.codigo_provincia = '51' THEN epa.cta_cte ELSE epa.codigo_provincia END,
          epa.codigo_provincia
          ORDER BY total_premios DESC`;

        // Query de ventas con los mismos filtros de fecha/sorteo
        let sqlVQ = buildVentaQuery('quiniela');
        const paramsVQ = [];
        if (fechaDesde) { sqlVQ += ' AND cpa.fecha >= ?'; paramsVQ.push(fechaDesde); }
        if (fechaHasta) { sqlVQ += ' AND cpa.fecha <= ?'; paramsVQ.push(fechaHasta); }
        if (sorteoDesde) { sqlVQ += ' AND cpa.numero_sorteo >= ?'; paramsVQ.push(sorteoDesde); }
        if (sorteoHasta) { sqlVQ += ' AND cpa.numero_sorteo <= ?'; paramsVQ.push(sorteoHasta); }
        if (agencia) { sqlVQ += ' AND cpa.codigo_agencia LIKE ?'; paramsVQ.push(`%${agencia}%`); }
        sqlVQ += ` GROUP BY CASE WHEN cpa.codigo_provincia = '51' THEN CONCAT(LEFT(cpa.codigo_agencia, 2), '-', SUBSTRING(cpa.codigo_agencia, 3)) ELSE CONCAT('PROV-', cpa.codigo_provincia) END`;

        const [quinielaData, ventaDataQ] = await Promise.all([
          query(sqlQ, paramsQ),
          query(sqlVQ, paramsVQ).catch(() => [])
        ]);

        // Indexar ventas por agencia_key
        const ventaMapQ = {};
        ventaDataQ.forEach(v => { ventaMapQ[v.agencia_key] = v; });

        // Merge premios + ventas
        quinielaData.forEach(row => {
          // Guardar clave original antes de sobreescribir (CABA: "51-XXXXX", Prov: "PROV-XX")
          const ventaKey = row.agencia;
          if (row.codigo_provincia !== '51') {
            row.nombre = PROVINCIAS_NOMBRES[row.codigo_provincia] || `Provincia ${row.codigo_provincia}`;
            row.agencia = row.nombre;
          } else {
            row.nombre = row.agencia;
          }
          const venta = ventaMapQ[ventaKey] || {};
          row.total_tickets = parseInt(venta.total_tickets) || 0;
          row.total_apuestas = parseInt(venta.total_apuestas) || 0;
          row.total_anulados = parseInt(venta.total_anulados) || 0;
          row.total_recaudacion = parseFloat(venta.total_recaudacion) || 0;
        });
        resultados = resultados.concat(quinielaData);
      }

      if (!juego || juego === 'poceada') {
        let sqlP = buildTotalizadoQuery('escrutinio_poceada', 'poceada');
        const paramsP = [];
        if (fechaDesde) { sqlP += ' AND e.fecha >= ?'; paramsP.push(fechaDesde); }
        if (fechaHasta) { sqlP += ' AND e.fecha <= ?'; paramsP.push(fechaHasta); }
        if (sorteoDesde) { sqlP += ' AND e.numero_sorteo >= ?'; paramsP.push(sorteoDesde); }
        if (sorteoHasta) { sqlP += ' AND e.numero_sorteo <= ?'; paramsP.push(sorteoHasta); }
        if (agencia) {
          sqlP += ' AND epa.cta_cte LIKE ?';
          paramsP.push(`%${agencia}%`);
        }
        sqlP += ` GROUP BY
          CASE WHEN epa.codigo_provincia = '51' THEN epa.cta_cte ELSE CONCAT('PROV-', epa.codigo_provincia) END,
          CASE WHEN epa.codigo_provincia = '51' THEN epa.cta_cte ELSE epa.codigo_provincia END,
          epa.codigo_provincia
          ORDER BY total_premios DESC`;

        // Query de ventas poceada
        let sqlVP = buildVentaQuery('poceada');
        const paramsVP = [];
        if (fechaDesde) { sqlVP += ' AND cpa.fecha >= ?'; paramsVP.push(fechaDesde); }
        if (fechaHasta) { sqlVP += ' AND cpa.fecha <= ?'; paramsVP.push(fechaHasta); }
        if (sorteoDesde) { sqlVP += ' AND cpa.numero_sorteo >= ?'; paramsVP.push(sorteoDesde); }
        if (sorteoHasta) { sqlVP += ' AND cpa.numero_sorteo <= ?'; paramsVP.push(sorteoHasta); }
        if (agencia) { sqlVP += ' AND cpa.codigo_agencia LIKE ?'; paramsVP.push(`%${agencia}%`); }
        sqlVP += ` GROUP BY CASE WHEN cpa.codigo_provincia = '51' THEN CONCAT(LEFT(cpa.codigo_agencia, 2), '-', SUBSTRING(cpa.codigo_agencia, 3)) ELSE CONCAT('PROV-', cpa.codigo_provincia) END`;

        const [poceadaData, ventaDataP] = await Promise.all([
          query(sqlP, paramsP),
          query(sqlVP, paramsVP).catch(() => [])
        ]);

        const ventaMapP = {};
        ventaDataP.forEach(v => { ventaMapP[v.agencia_key] = v; });

        poceadaData.forEach(row => {
          const ventaKey = row.agencia;
          if (row.codigo_provincia !== '51') {
            row.nombre = PROVINCIAS_NOMBRES[row.codigo_provincia] || `Provincia ${row.codigo_provincia}`;
            row.agencia = row.nombre;
          } else {
            row.nombre = row.agencia;
          }
          const venta = ventaMapP[ventaKey] || {};
          row.total_tickets = parseInt(venta.total_tickets) || 0;
          row.total_apuestas = parseInt(venta.total_apuestas) || 0;
          row.total_anulados = parseInt(venta.total_anulados) || 0;
          row.total_recaudacion = parseFloat(venta.total_recaudacion) || 0;
        });
        resultados = resultados.concat(poceadaData);
      }

      if (!juego || juego === 'tombolina') {
        let sqlT = buildTotalizadoQuery('escrutinio_tombolina', 'tombolina');
        const paramsT = [];
        if (fechaDesde) { sqlT += ' AND e.fecha >= ?'; paramsT.push(fechaDesde); }
        if (fechaHasta) { sqlT += ' AND e.fecha <= ?'; paramsT.push(fechaHasta); }
        if (sorteoDesde) { sqlT += ' AND e.numero_sorteo >= ?'; paramsT.push(sorteoDesde); }
        if (sorteoHasta) { sqlT += ' AND e.numero_sorteo <= ?'; paramsT.push(sorteoHasta); }
        if (agencia) {
          sqlT += ' AND epa.cta_cte LIKE ?';
          paramsT.push(`%${agencia}%`);
        }
        sqlT += ` GROUP BY
          CASE WHEN epa.codigo_provincia = '51' THEN epa.cta_cte ELSE CONCAT('PROV-', epa.codigo_provincia) END,
          CASE WHEN epa.codigo_provincia = '51' THEN epa.cta_cte ELSE epa.codigo_provincia END,
          epa.codigo_provincia
          ORDER BY total_premios DESC`;

        // Query de ventas tombolina
        let sqlVT = buildVentaQuery('tombolina');
        const paramsVT = [];
        if (fechaDesde) { sqlVT += ' AND cpa.fecha >= ?'; paramsVT.push(fechaDesde); }
        if (fechaHasta) { sqlVT += ' AND cpa.fecha <= ?'; paramsVT.push(fechaHasta); }
        if (sorteoDesde) { sqlVT += ' AND cpa.numero_sorteo >= ?'; paramsVT.push(sorteoDesde); }
        if (sorteoHasta) { sqlVT += ' AND cpa.numero_sorteo <= ?'; paramsVT.push(sorteoHasta); }
        if (agencia) { sqlVT += ' AND cpa.codigo_agencia LIKE ?'; paramsVT.push(`%${agencia}%`); }
        sqlVT += ` GROUP BY CASE WHEN cpa.codigo_provincia = '51' THEN CONCAT(LEFT(cpa.codigo_agencia, 2), '-', SUBSTRING(cpa.codigo_agencia, 3)) ELSE CONCAT('PROV-', cpa.codigo_provincia) END`;

        const [tombolinaData, ventaDataT] = await Promise.all([
          query(sqlT, paramsT),
          query(sqlVT, paramsVT).catch(() => [])
        ]);

        const ventaMapT = {};
        ventaDataT.forEach(v => { ventaMapT[v.agencia_key] = v; });

        tombolinaData.forEach(row => {
          const ventaKey = row.agencia;
          if (row.codigo_provincia !== '51') {
            row.nombre = PROVINCIAS_NOMBRES[row.codigo_provincia] || `Provincia ${row.codigo_provincia}`;
            row.agencia = row.nombre;
          } else {
            row.nombre = row.agencia;
          }
          const venta = ventaMapT[ventaKey] || {};
          row.total_tickets = parseInt(venta.total_tickets) || 0;
          row.total_apuestas = parseInt(venta.total_apuestas) || 0;
          row.total_anulados = parseInt(venta.total_anulados) || 0;
          row.total_recaudacion = parseFloat(venta.total_recaudacion) || 0;
        });
        resultados = resultados.concat(tombolinaData);
      }

      // BLOQUE GENÉRICO PARA OTROS JUEGOS (Quini 6, Brinco, Loto, etc.)
      const otrosJuegos = ['quini6', 'brinco', 'loto', 'loto5'];
      for (const j of otrosJuegos) {
        if (!juego || juego === j) {
          // Nota: Para estos juegos usamos la tabla genérica de escrutinio_premios_agencia
          // y cruzamos con control_previo_agencias para ventas
          let sqlGen = buildTotalizadoQuery('escrutinio_premios_agencia', j);
          // Modificar buildTotalizadoQuery localmente porque para estos el INNER JOIN es distinto
          sqlGen = `
            SELECT 
              CASE WHEN epa.codigo_provincia = '51' THEN epa.cta_cte ELSE CONCAT('PROV-', epa.codigo_provincia) END as agencia,
              CASE WHEN epa.codigo_provincia = '51' THEN epa.cta_cte ELSE epa.codigo_provincia END as codigo,
              epa.codigo_provincia,
              SUM(epa.total_ganadores) as total_ganadores,
              SUM(epa.total_premios) as total_premios,
              COUNT(DISTINCT epa.escrutinio_id) as total_sorteos,
              '${j}' as juego
            FROM escrutinio_premios_agencia epa
            WHERE epa.juego = '${j}'
          `;
          const paramsGen = [];
          // Nota: Sin tabla de sorteo específica, el filtro de fecha debe ir sobre control_previo_agencias o similares
          // Por ahora filtramos lo que haya en premios_agencia si tiene fecha (añadir columna si falta)
          // O simplemente mostrar acumulados. 
          sqlGen += ` GROUP BY agencia, codigo, epa.codigo_provincia ORDER BY total_premios DESC`;

          let sqlVGen = buildVentaQuery(j);
          const paramsVGen = [];
          if (fechaDesde) { sqlVGen += ' AND cpa.fecha >= ?'; paramsVGen.push(fechaDesde); }
          if (fechaHasta) { sqlVGen += ' AND cpa.fecha <= ?'; paramsVGen.push(fechaHasta); }
          if (agencia) { sqlVGen += ' AND cpa.codigo_agencia LIKE ?'; paramsVGen.push(`%${agencia}%`); }
          sqlVGen += ` GROUP BY agencia_key`;

          const [premiosData, ventaData] = await Promise.all([
            query(sqlGen, paramsGen).catch(() => []),
            query(sqlVGen, paramsVGen).catch(() => [])
          ]);

          if (premiosData.length > 0 || ventaData.length > 0) {
            const vMap = {};
            ventaData.forEach(v => { vMap[v.agencia_key] = v; });

            // Si hay ventas pero no premios, también queremos verlas en totalizado? 
            // El usuario pidió "Agencias c/Premio", pero si juego está seleccionado, mostramos todo lo que haya.
            const merged = (premiosData.length > 0 ? premiosData : ventaData.map(v => ({
              agencia: v.agencia_key,
              codigo: v.agencia_key,
              codigo_provincia: v.agencia_key.startsWith('PROV-') ? v.agencia_key.split('-')[1] : '51',
              total_ganadores: 0,
              total_premios: 0,
              total_sorteos: 0,
              juego: j
            })));

            merged.forEach(row => {
              const ventaKey = row.agencia;
              if (row.codigo_provincia !== '51') {
                row.nombre = PROVINCIAS_NOMBRES[row.codigo_provincia] || `Provincia ${row.codigo_provincia}`;
                row.agencia = row.nombre;
              } else {
                row.nombre = row.agencia;
              }
              const v = vMap[ventaKey] || vMap[row.agencia] || {};
              row.total_tickets = parseInt(v.total_tickets) || 0;
              row.total_apuestas = parseInt(v.total_apuestas) || 0;
              row.total_anulados = parseInt(v.total_anulados) || 0;
              row.total_recaudacion = parseFloat(v.total_recaudacion) || 0;
            });
            resultados = resultados.concat(merged);
          }
        }
      }

      // Hipicas totalizado por agencia
      if (!juego || juego === 'hipicas') {
        let whereHT = '';
        const paramsHT = [];
        if (fechaDesde) { whereHT += ' AND fecha_sorteo >= ?'; paramsHT.push(fechaDesde); }
        if (fechaHasta) { whereHT += ' AND fecha_sorteo <= ?'; paramsHT.push(fechaHasta); }
        if (agencia) { whereHT += ' AND agency LIKE ?'; paramsHT.push(`%${agencia}%`); }

        const hipicasTot = await query(`
          SELECT
            agency as agencia,
            agency as codigo,
            agency as nombre,
            'CABA' as codigo_provincia,
            SUM(recaudacion_total) as total_recaudacion,
            SUM(importe_cancelaciones) as cancelaciones,
            SUM(devoluciones) as devoluciones,
            SUM(total_premios) as total_premios,
            0 as total_ganadores,
            0 as total_tickets,
            0 as total_apuestas,
            0 as total_anulados,
            COUNT(DISTINCT CONCAT(fecha_sorteo, sorteo)) as total_sorteos,
            'hipicas' as juego
          FROM facturacion_turfito
          WHERE 1=1 ${whereHT}
          GROUP BY agency
          ORDER BY total_recaudacion DESC
        `, paramsHT);

        resultados = resultados.concat(hipicasTot);
      }

      // Ordenar por premios
      resultados.sort((a, b) => parseFloat(b.total_premios) - parseFloat(a.total_premios));

    } else if (tipoConsulta === 'agencias_venta') {
      // NUEVO: Datos de ventas por agencia desde control_previo_agencias
      // - Agencias 51 (CABA): mostrar individualmente
      // - Otras provincias: agrupar por provincia

      const PROVINCIAS_NOMBRES = {
        '51': 'CABA',
        '53': 'Buenos Aires',
        '54': 'Catamarca',
        '55': 'Córdoba',
        '56': 'Corrientes',
        '57': 'Chaco',
        '58': 'Chubut',
        '59': 'Entre Ríos',
        '60': 'Formosa',
        '61': 'Jujuy',
        '62': 'La Pampa',
        '63': 'La Rioja',
        '64': 'Mendoza',
        '65': 'Misiones',
        '66': 'Neuquén',
        '67': 'Río Negro',
        '68': 'Salta',
        '69': 'San Juan',
        '70': 'San Luis',
        '71': 'Santa Cruz',
        '72': 'Santa Fe',
        '73': 'Sgo. del Estero',
        '74': 'Tucumán',
        '75': 'Tierra del Fuego'
      };

      // Construir query para ventas por agencia
      let sqlVentas = `
        SELECT 
          CASE 
            WHEN cpa.codigo_provincia = '51' THEN cpa.codigo_agencia
            ELSE CONCAT('PROV-', cpa.codigo_provincia)
          END as agencia,
          CASE 
            WHEN cpa.codigo_provincia = '51' THEN cpa.codigo_agencia
            ELSE cpa.codigo_provincia
          END as codigo,
          cpa.codigo_provincia,
          SUM(cpa.total_tickets) as total_tickets,
          SUM(cpa.total_apuestas) as total_apuestas,
          SUM(cpa.total_anulados) as total_anulados,
          SUM(cpa.total_recaudacion) as total_recaudacion,
          COUNT(DISTINCT CONCAT(cpa.fecha, '-', cpa.numero_sorteo)) as total_sorteos,
          cpa.juego
        FROM control_previo_agencias cpa
        WHERE 1=1
      `;
      const paramsVentas = [];

      if (fechaDesde) { sqlVentas += ' AND cpa.fecha >= ?'; paramsVentas.push(fechaDesde); }
      if (fechaHasta) { sqlVentas += ' AND cpa.fecha <= ?'; paramsVentas.push(fechaHasta); }
      if (sorteoDesde) { sqlVentas += ' AND cpa.numero_sorteo >= ?'; paramsVentas.push(sorteoDesde); }
      if (sorteoHasta) { sqlVentas += ' AND cpa.numero_sorteo <= ?'; paramsVentas.push(sorteoHasta); }
      if (juego && juego !== 'todos') { sqlVentas += ' AND cpa.juego = ?'; paramsVentas.push(juego); }
      if (agencia) {
        sqlVentas += ' AND cpa.codigo_agencia LIKE ?';
        paramsVentas.push(`%${agencia}%`);
      }

      sqlVentas += ` GROUP BY 
        CASE WHEN cpa.codigo_provincia = '51' THEN cpa.codigo_agencia ELSE CONCAT('PROV-', cpa.codigo_provincia) END,
        CASE WHEN cpa.codigo_provincia = '51' THEN cpa.codigo_agencia ELSE cpa.codigo_provincia END,
        cpa.codigo_provincia,
        cpa.juego
        ORDER BY total_recaudacion DESC
        LIMIT ${maxLimit}
      `;

      resultados = await query(sqlVentas, paramsVentas);

      // Agregar nombre de provincia
      resultados.forEach(row => {
        if (row.codigo_provincia !== '51') {
          row.nombre = PROVINCIAS_NOMBRES[row.codigo_provincia] || `Provincia ${row.codigo_provincia}`;
          row.agencia = row.nombre;
        } else {
          row.nombre = row.agencia;
        }
      });

      // Hipicas ventas por agencia
      if (!juego || juego === 'hipicas') {
        let whereHV = '';
        const paramsHV = [];
        if (fechaDesde) { whereHV += ' AND fecha_sorteo >= ?'; paramsHV.push(fechaDesde); }
        if (fechaHasta) { whereHV += ' AND fecha_sorteo <= ?'; paramsHV.push(fechaHasta); }
        if (agencia) { whereHV += ' AND agency LIKE ?'; paramsHV.push(`%${agencia}%`); }

        const hipicasVentas = await query(`
          SELECT
            agency as agencia,
            agency as codigo,
            'CABA' as codigo_provincia,
            0 as total_tickets,
            0 as total_apuestas,
            0 as total_anulados,
            SUM(recaudacion_total) as total_recaudacion,
            SUM(importe_cancelaciones) as cancelaciones,
            SUM(devoluciones) as devoluciones,
            SUM(total_premios) as total_premios,
            COUNT(DISTINCT CONCAT(fecha_sorteo, sorteo)) as total_sorteos,
            'hipicas' as juego
          FROM facturacion_turfito
          WHERE 1=1 ${whereHV}
          GROUP BY agency
          ORDER BY total_recaudacion DESC
        `, paramsHV);

        hipicasVentas.forEach(row => { row.nombre = row.agencia; });
        resultados = resultados.concat(hipicasVentas);
      }

    } else if (tipoConsulta === 'comparativo') {
      // Comparativo entre juegos
      const paramsC = [];
      let whereC = '';
      if (fechaDesde) { whereC += ' AND fecha >= ?'; paramsC.push(fechaDesde); }
      if (fechaHasta) { whereC += ' AND fecha <= ?'; paramsC.push(fechaHasta); }

      // Quiniela
      const [quinielaStats] = await query(`
        SELECT 
          'quiniela' as juego,
          COUNT(*) as total_sorteos,
          SUM(total_recaudacion) as total_recaudacion,
          SUM(total_tickets) as total_tickets,
          SUM(total_apuestas) as total_apuestas,
          SUM(total_anulados) as total_anulados
        FROM control_previo_quiniela
        WHERE 1=1 ${whereC}
      `, paramsC);

      const [quinielaPremios] = await query(`
        SELECT 
          SUM(total_premios) as total_premios,
          SUM(total_ganadores) as total_ganadores
        FROM escrutinio_quiniela
        WHERE 1=1 ${whereC}
      `, paramsC);

      // Poceada
      const [poceadaStats] = await query(`
        SELECT 
          'poceada' as juego,
          COUNT(*) as total_sorteos,
          SUM(total_recaudacion) as total_recaudacion,
          SUM(total_tickets) as total_tickets,
          SUM(total_apuestas) as total_apuestas,
          SUM(total_anulados) as total_anulados
        FROM control_previo_poceada
        WHERE 1=1 ${whereC}
      `, paramsC);

      const [poceadaPremios] = await query(`
        SELECT 
          SUM(total_premios) as total_premios,
          SUM(total_ganadores) as total_ganadores
        FROM escrutinio_poceada
        WHERE 1=1 ${whereC}
      `, paramsC);

      resultados = [
        {
          juego: 'quiniela',
          total_sorteos: quinielaStats?.total_sorteos || 0,
          total_recaudacion: quinielaStats?.total_recaudacion || 0,
          total_tickets: quinielaStats?.total_tickets || 0,
          total_apuestas: quinielaStats?.total_apuestas || 0,
          total_anulados: quinielaStats?.total_anulados || 0,
          total_premios: quinielaPremios?.total_premios || 0,
          total_ganadores: quinielaPremios?.total_ganadores || 0
        },
        {
          juego: 'poceada',
          total_sorteos: poceadaStats?.total_sorteos || 0,
          total_recaudacion: poceadaStats?.total_recaudacion || 0,
          total_tickets: poceadaStats?.total_tickets || 0,
          total_apuestas: poceadaStats?.total_apuestas || 0,
          total_anulados: poceadaStats?.total_anulados || 0,
          total_premios: poceadaPremios?.total_premios || 0,
          total_ganadores: poceadaPremios?.total_ganadores || 0
        }
      ];

      // Hipicas comparativo
      let whereHC = '';
      const paramsHC = [];
      if (fechaDesde) { whereHC += ' AND fecha_sorteo >= ?'; paramsHC.push(fechaDesde); }
      if (fechaHasta) { whereHC += ' AND fecha_sorteo <= ?'; paramsHC.push(fechaHasta); }

      const [hipicasComp] = await query(`
        SELECT
          COUNT(DISTINCT CONCAT(fecha_sorteo, sorteo)) as total_sorteos,
          COALESCE(SUM(recaudacion_total), 0) as total_recaudacion,
          COALESCE(SUM(total_premios), 0) as total_premios,
          COALESCE(SUM(importe_cancelaciones), 0) as cancelaciones,
          COALESCE(SUM(devoluciones), 0) as devoluciones,
          COUNT(DISTINCT agency) as total_agencias
        FROM facturacion_turfito
        WHERE 1=1 ${whereHC}
      `, paramsHC);

      if (parseInt(hipicasComp?.total_sorteos) > 0) {
        resultados.push({
          juego: 'hipicas',
          total_sorteos: hipicasComp?.total_sorteos || 0,
          total_recaudacion: hipicasComp?.total_recaudacion || 0,
          total_tickets: 0,
          total_apuestas: 0,
          total_anulados: 0,
          cancelaciones: hipicasComp?.cancelaciones || 0,
          devoluciones: hipicasComp?.devoluciones || 0,
          total_premios: hipicasComp?.total_premios || 0,
          total_ganadores: 0,
          total_agencias: hipicasComp?.total_agencias || 0
        });
      }
    }

    return successResponse(res, {
      tipoConsulta,
      total: resultados.length,
      data: resultados
    });

  } catch (error) {
    console.error('Error obteniendo datos dashboard:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * GET /api/historial/dashboard/stats
 * Obtiene estadísticas resumidas para el dashboard
 */
const obtenerStatsDashboard = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta, sorteoDesde, sorteoHasta, juego } = req.query;

    // Construir condiciones WHERE
    let whereQ = '', whereP = '';
    const paramsQ = [], paramsP = [];

    if (fechaDesde) {
      whereQ += ' AND fecha >= ?'; paramsQ.push(fechaDesde);
      whereP += ' AND fecha >= ?'; paramsP.push(fechaDesde);
    }
    if (fechaHasta) {
      whereQ += ' AND fecha <= ?'; paramsQ.push(fechaHasta);
      whereP += ' AND fecha <= ?'; paramsP.push(fechaHasta);
    }
    if (sorteoDesde) {
      whereQ += ' AND numero_sorteo >= ?'; paramsQ.push(sorteoDesde);
      whereP += ' AND numero_sorteo >= ?'; paramsP.push(sorteoDesde);
    }
    if (sorteoHasta) {
      whereQ += ' AND numero_sorteo <= ?'; paramsQ.push(sorteoHasta);
      whereP += ' AND numero_sorteo <= ?'; paramsP.push(sorteoHasta);
    }

    let stats = {
      total_recaudacion: 0,
      total_premios: 0,
      total_apuestas: 0,
      total_tickets: 0,
      total_sorteos: 0,
      total_agencias_premiadas: 0,  // Agencias que pagaron premios
      total_provincias_activas: 0,   // Provincias con apuestas
      porcentaje_premios: 0
    };

    const agenciasSet = new Set();
    const provinciasSet = new Set();

    // Quiniela
    if (!juego || juego === 'quiniela') {
      const [cpQ] = await query(`
        SELECT 
          COUNT(*) as sorteos,
          COALESCE(SUM(total_recaudacion), 0) as recaudacion,
          COALESCE(SUM(total_tickets), 0) as tickets,
          COALESCE(SUM(total_apuestas), 0) as apuestas
        FROM control_previo_quiniela
        WHERE 1=1 ${whereQ}
      `, paramsQ);

      const [escQ] = await query(`
        SELECT COALESCE(SUM(total_premios), 0) as premios
        FROM escrutinio_quiniela
        WHERE 1=1 ${whereQ}
      `, paramsQ);

      stats.total_recaudacion += parseFloat(cpQ?.recaudacion || 0);
      stats.total_tickets += parseInt(cpQ?.tickets || 0);
      stats.total_apuestas += parseInt(cpQ?.apuestas || 0);
      stats.total_sorteos += parseInt(cpQ?.sorteos || 0);
      stats.total_premios += parseFloat(escQ?.premios || 0);

      // Contar agencias únicas que pagaron premios (del escrutinio)
      const agenciasQ = await query(`
        SELECT DISTINCT epa.cta_cte
        FROM escrutinio_premios_agencia epa
        INNER JOIN escrutinio_quiniela eq ON epa.escrutinio_id = eq.id AND epa.juego = 'quiniela'
        WHERE 1=1 ${whereQ}
      `, paramsQ);
      agenciasQ.forEach(a => agenciasSet.add(a.cta_cte));

      // Contar provincias activas desde control_previo_agencias (más preciso)
      const provinciasQ = await query(`
        SELECT DISTINCT codigo_provincia
        FROM control_previo_agencias
        WHERE juego = 'quiniela' ${whereQ}
      `, paramsQ);
      provinciasQ.forEach(p => provinciasSet.add(String(p.codigo_provincia)));
    }

    // Poceada
    if (!juego || juego === 'poceada') {
      const [cpP] = await query(`
        SELECT 
          COUNT(*) as sorteos,
          COALESCE(SUM(total_recaudacion), 0) as recaudacion,
          COALESCE(SUM(total_tickets), 0) as tickets,
          COALESCE(SUM(total_apuestas), 0) as apuestas
        FROM control_previo_poceada
        WHERE 1=1 ${whereP}
      `, paramsP);

      const [escP] = await query(`
        SELECT COALESCE(SUM(total_premios), 0) as premios
        FROM escrutinio_poceada
        WHERE 1=1 ${whereP}
      `, paramsP);

      stats.total_recaudacion += parseFloat(cpP?.recaudacion || 0);
      stats.total_tickets += parseInt(cpP?.tickets || 0);
      stats.total_apuestas += parseInt(cpP?.apuestas || 0);
      stats.total_sorteos += parseInt(cpP?.sorteos || 0);
      stats.total_premios += parseFloat(escP?.premios || 0);

      // Contar agencias únicas que pagaron premios (del escrutinio)
      const agenciasP = await query(`
        SELECT DISTINCT epa.cta_cte
        FROM escrutinio_premios_agencia epa
        INNER JOIN escrutinio_poceada ep ON epa.escrutinio_id = ep.id AND epa.juego = 'poceada'
        WHERE 1=1 ${whereP}
      `, paramsP);
      agenciasP.forEach(a => agenciasSet.add(a.cta_cte));

      // Contar provincias activas desde control_previo_agencias
      const provsP = await query(`
        SELECT DISTINCT codigo_provincia
        FROM control_previo_agencias
        WHERE juego = 'poceada' ${whereP}
      `, paramsP);
      provsP.forEach(p => provinciasSet.add(String(p.codigo_provincia)));
    }

    // Tombolina
    if (!juego || juego === 'tombolina') {
      const [cpT] = await query(`
        SELECT 
          COUNT(*) as sorteos,
          COALESCE(SUM(total_recaudacion), 0) as recaudacion,
          COALESCE(SUM(total_tickets), 0) as tickets,
          COALESCE(SUM(total_apuestas), 0) as apuestas
        FROM control_previo_tombolina
        WHERE 1=1 ${whereQ}
      `, paramsQ);

      const [escT] = await query(`
        SELECT COALESCE(SUM(total_premios), 0) as premios
        FROM escrutinio_tombolina
        WHERE 1=1 ${whereQ}
      `, paramsQ);

      stats.total_recaudacion += parseFloat(cpT?.recaudacion || 0);
      stats.total_tickets += parseInt(cpT?.tickets || 0);
      stats.total_apuestas += parseInt(cpT?.apuestas || 0);
      stats.total_sorteos += parseInt(cpT?.sorteos || 0);
      stats.total_premios += parseFloat(escT?.premios || 0);

      const agenciasT = await query(`
        SELECT DISTINCT epa.cta_cte
        FROM escrutinio_premios_agencia epa
        INNER JOIN escrutinio_tombolina et ON epa.escrutinio_id = et.id AND epa.juego = 'tombolina'
        WHERE 1=1 ${whereQ.replace(/fecha/g, 'et.fecha').replace(/numero_sorteo/g, 'et.numero_sorteo')}
      `, paramsQ);
      agenciasT.forEach(a => agenciasSet.add(a.cta_cte));

      const provinciasT = await query(`
        SELECT DISTINCT codigo_provincia
        FROM control_previo_agencias
        WHERE juego = 'tombolina' ${whereQ}
      `, paramsQ);
      provinciasT.forEach(p => provinciasSet.add(String(p.codigo_provincia)));
    }

    // BLOQUE GENÉRICO PARA OTROS JUEGOS (Quini 6, Brinco, Loto, etc.)
    const otrosJuegosStats = ['quini6', 'brinco', 'loto', 'loto5'];
    for (const j of otrosJuegosStats) {
      if (!juego || juego === j) {
        // Ventas desde control_previo_agencias
        const [cpGen] = await query(`
          SELECT 
            COUNT(DISTINCT CONCAT(fecha, numero_sorteo)) as sorteos,
            COALESCE(SUM(total_recaudacion), 0) as recaudacion,
            COALESCE(SUM(total_tickets), 0) as tickets,
            COALESCE(SUM(total_apuestas), 0) as apuestas
          FROM control_previo_agencias
          WHERE juego = ? ${whereQ}
        `, [j, ...paramsQ]);

        // Premios desde escrutinio_premios_agencia
        // Para juegos genéricos, como no tenemos tabla de escrutinio principal con fecha,
        // no podemos filtrar premios por fecha fácilmente sin un join complejo.
        // Por ahora, si hay filtro de fecha, intentamos no romper la consulta.
        const [escGen] = await query(`
          SELECT 
            COALESCE(SUM(total_premios), 0) as premios
          FROM escrutinio_premios_agencia
          WHERE juego = ? 
        `, [j]);

        stats.total_recaudacion += parseFloat(cpGen?.recaudacion || 0);
        stats.total_tickets += parseInt(cpGen?.tickets || 0);
        stats.total_apuestas += parseInt(cpGen?.apuestas || 0);
        stats.total_sorteos += parseInt(cpGen?.sorteos || 0);
        stats.total_premios += parseFloat(escGen?.premios || 0);

        // Agencias premiadas
        const agenciasGen = await query(`
          SELECT DISTINCT cta_cte
          FROM escrutinio_premios_agencia
          WHERE juego = ? 
        `, [j]);
        agenciasGen.forEach(a => agenciasSet.add(a.cta_cte));

        // Provincias activas
        const provinciasGen = await query(`
          SELECT DISTINCT codigo_provincia
          FROM control_previo_agencias
          WHERE juego = ? ${whereQ}
        `, [j, ...paramsQ]);
        provinciasGen.forEach(p => provinciasSet.add(String(p.codigo_provincia)));
      }
    }

    // Hipicas (desde facturacion_turfito)
    if (!juego || juego === 'hipicas') {
      let whereH = '';
      const paramsH = [];
      if (fechaDesde) { whereH += ' AND fecha_sorteo >= ?'; paramsH.push(fechaDesde); }
      if (fechaHasta) { whereH += ' AND fecha_sorteo <= ?'; paramsH.push(fechaHasta); }

      const [hipStats] = await query(`
        SELECT
          COUNT(DISTINCT CONCAT(fecha_sorteo, sorteo)) as sorteos,
          COALESCE(SUM(recaudacion_total), 0) as recaudacion,
          COALESCE(SUM(total_premios), 0) as premios,
          COALESCE(SUM(importe_cancelaciones), 0) as cancelaciones,
          COALESCE(SUM(devoluciones), 0) as devoluciones,
          COUNT(DISTINCT agency) as agencias
        FROM facturacion_turfito
        WHERE 1=1 ${whereH}
      `, paramsH);

      stats.total_recaudacion += parseFloat(hipStats?.recaudacion || 0);
      stats.total_premios += parseFloat(hipStats?.premios || 0);
      stats.total_sorteos += parseInt(hipStats?.sorteos || 0);
      stats.total_cancelaciones = (stats.total_cancelaciones || 0) + parseFloat(hipStats?.cancelaciones || 0);
      stats.total_devoluciones = (stats.total_devoluciones || 0) + parseFloat(hipStats?.devoluciones || 0);

      // Agencias de hipicas
      const agenciasH = await query(`
        SELECT DISTINCT agency FROM facturacion_turfito
        WHERE total_premios > 0 ${whereH}
      `, paramsH);
      agenciasH.forEach(a => agenciasSet.add('HIP-' + a.agency));
    }

    // Loto
    if (!juego || juego === 'loto') {
      let whereL = '';
      const paramsL = [];
      if (fechaDesde) { whereL += ' AND created_at >= ?'; paramsL.push(fechaDesde); }
      if (fechaHasta) { whereL += ' AND created_at <= ?'; paramsL.push(fechaHasta + ' 23:59:59'); }
      if (sorteoDesde) { whereL += ' AND numero_sorteo >= ?'; paramsL.push(sorteoDesde); }
      if (sorteoHasta) { whereL += ' AND numero_sorteo <= ?'; paramsL.push(sorteoHasta); }

      const [cpL] = await query(`
        SELECT
          COUNT(*) as sorteos,
          COALESCE(SUM(recaudacion), 0) as recaudacion,
          COALESCE(SUM(registros_validos + registros_anulados), 0) as tickets,
          COALESCE(SUM(apuestas_total), 0) as apuestas
        FROM control_previo_loto
        WHERE 1=1 ${whereL}
      `, paramsL);

      let whereLe = '';
      const paramsLe = [];
      if (fechaDesde) { whereLe += ' AND fecha_sorteo >= ?'; paramsLe.push(fechaDesde); }
      if (fechaHasta) { whereLe += ' AND fecha_sorteo <= ?'; paramsLe.push(fechaHasta); }
      if (sorteoDesde) { whereLe += ' AND numero_sorteo >= ?'; paramsLe.push(sorteoDesde); }
      if (sorteoHasta) { whereLe += ' AND numero_sorteo <= ?'; paramsLe.push(sorteoHasta); }

      const [escL] = await query(`
        SELECT COALESCE(SUM(total_premios), 0) as premios
        FROM escrutinio_loto
        WHERE 1=1 ${whereLe}
      `, paramsLe);

      stats.total_recaudacion += parseFloat(cpL?.recaudacion || 0);
      stats.total_tickets += parseInt(cpL?.tickets || 0);
      stats.total_apuestas += parseInt(cpL?.apuestas || 0);
      stats.total_sorteos += parseInt(cpL?.sorteos || 0);
      stats.total_premios += parseFloat(escL?.premios || 0);
    }

    // NUEVO: Contar agencias ÚNICAS de CABA (51) con ventas desde control_previo_agencias
    // Solo cuenta una vez cada agencia, sin importar en cuántos sorteos vendió
    let whereAgencias = '';
    const paramsAgencias = [];
    if (fechaDesde) { whereAgencias += ' AND fecha >= ?'; paramsAgencias.push(fechaDesde); }
    if (fechaHasta) { whereAgencias += ' AND fecha <= ?'; paramsAgencias.push(fechaHasta); }
    if (sorteoDesde) { whereAgencias += ' AND numero_sorteo >= ?'; paramsAgencias.push(sorteoDesde); }
    if (sorteoHasta) { whereAgencias += ' AND numero_sorteo <= ?'; paramsAgencias.push(sorteoHasta); }
    if (juego && juego !== 'todos') { whereAgencias += ' AND juego = ?'; paramsAgencias.push(juego); }

    const [agenciasVenta] = await query(`
      SELECT COUNT(DISTINCT codigo_agencia) as total
      FROM control_previo_agencias
      WHERE total_recaudacion > 0 
        AND codigo_provincia = '51'
        ${whereAgencias}
    `, paramsAgencias);

    stats.total_agencias_venta = parseInt(agenciasVenta?.total || 0);
    stats.total_agencias_premiadas = agenciasSet.size;
    stats.total_provincias_activas = provinciasSet.size;
    stats.porcentaje_premios = stats.total_recaudacion > 0
      ? ((stats.total_premios / stats.total_recaudacion) * 100).toFixed(2)
      : 0;

    return successResponse(res, stats);

  } catch (error) {
    console.error('Error obteniendo stats dashboard:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * GET /api/historial/dashboard/filtros
 * Obtiene los valores únicos para los filtros del dashboard
 */
const obtenerFiltrosDashboard = async (req, res) => {
  try {
    // Obtener rango de fechas
    const [fechasQ] = await query(`
      SELECT MIN(fecha) as min_fecha, MAX(fecha) as max_fecha
      FROM control_previo_quiniela
    `);
    const [fechasP] = await query(`
      SELECT MIN(fecha) as min_fecha, MAX(fecha) as max_fecha
      FROM control_previo_poceada
    `);

    // Obtener rango de sorteos
    const [sorteosQ] = await query(`
      SELECT MIN(numero_sorteo) as min_sorteo, MAX(numero_sorteo) as max_sorteo
      FROM control_previo_quiniela
    `);
    const [sorteosP] = await query(`
      SELECT MIN(numero_sorteo) as min_sorteo, MAX(numero_sorteo) as max_sorteo
      FROM control_previo_poceada
    `);

    // Calcular rangos combinados
    const fechas = [fechasQ?.min_fecha, fechasP?.min_fecha].filter(Boolean);
    const fechasMax = [fechasQ?.max_fecha, fechasP?.max_fecha].filter(Boolean);
    const sorteos = [sorteosQ?.min_sorteo, sorteosP?.min_sorteo].filter(Boolean);
    const sorteosMax = [sorteosQ?.max_sorteo, sorteosP?.max_sorteo].filter(Boolean);

    return successResponse(res, {
      fechas: {
        min: fechas.length ? new Date(Math.min(...fechas.map(d => new Date(d)))).toISOString().split('T')[0] : null,
        max: fechasMax.length ? new Date(Math.max(...fechasMax.map(d => new Date(d)))).toISOString().split('T')[0] : null
      },
      sorteos: {
        min: sorteos.length ? Math.min(...sorteos) : null,
        max: sorteosMax.length ? Math.max(...sorteosMax) : null
      },
      juegos: ['quiniela', 'poceada'],
      modalidades: ['R', 'P', 'M', 'V', 'N']
    });

  } catch (error) {
    console.error('Error obteniendo filtros dashboard:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

module.exports = {
  listarControlPrevio,
  listarEscrutinios,
  obtenerGanadores,
  obtenerPremiosAgencias,
  obtenerResumen,
  buscarSorteo,
  // Nuevos endpoints generales
  listarControlPrevioGeneral,
  obtenerDetalleControlPrevio,
  listarEscrutiniosGeneral,
  obtenerDetalleEscrutinio,
  obtenerAgenciasEscrutinio,
  listarExtractos,
  // Dashboard endpoints
  obtenerDatosDashboard,
  obtenerStatsDashboard,
  obtenerFiltrosDashboard
};
