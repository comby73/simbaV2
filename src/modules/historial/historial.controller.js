/**
 * Controller para consultar historial de Control Previo y Escrutinios
 * 
 * Provee endpoints para:
 * - Listar historial de control previo (todos los juegos)
 * - Listar historial de escrutinios
 * - Ver detalle de ganadores
 * - Ver premios por agencia/provincia
 * 
 * Juegos soportados: quiniela, quinielaya, poceada, tombolina, loto, loto5, brinco, quini6
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

    const juegosValidos = ['quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'brinco', 'quini6', 'quinielaya'];
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

    const juegosValidos = ['quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'brinco', 'quini6', 'quinielaya'];
    if (!juegosValidos.includes(juego)) {
      return errorResponse(res, 'Juego inválido', 400);
    }

    // Obtener ganadores con paginación
    let sql = `
      SELECT
        g.*,
        a.nombre as agencia_nombre,
        a.direccion as agencia_direccion,
        a.localidad as agencia_localidad
      FROM escrutinio_ganadores g
      LEFT JOIN agencias a
        ON (
          a.numero = g.cta_cte
          OR (
            a.provincia = g.codigo_provincia
            AND LPAD(CAST(a.cuenta_corriente AS CHAR), 5, '0') = LPAD(g.codigo_agencia, 5, '0')
          )
        )
      WHERE g.escrutinio_id = ? AND g.juego = ?
      ORDER BY g.premio DESC
    `;
    const params = [id, juego];

    if (limit) {
      sql += ` LIMIT ${parseInt(limit)}`;
      if (offset) {
        sql += ` OFFSET ${parseInt(offset)}`;
      }
    }

    const ganadoresRaw = await query(sql, params);
    const ganadores = ganadoresRaw.map(g => {
      const codProv = String(g.codigo_provincia || '').padStart(2, '0');
      return {
        ...g,
        provincia_nombre: PROVINCIAS[codProv] || codProv || '-'
      };
    });

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

    const juegosValidos = ['quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'brinco', 'quini6', 'quinielaya'];
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
        SELECT cp.*, 'U' as modalidad, u.nombre as usuario_nombre, 'poceada' as juego
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
          SELECT cp.*, 'U' as modalidad, u.nombre as usuario_nombre, 'tombolina' as juego
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
          SELECT cp.*, 'U' as modalidad, u.nombre as usuario_nombre, 'loto' as juego
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
             'U' as modalidad,
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
             'U' as modalidad,
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
             'U' as modalidad,
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

    const detalleSqlByJuego = {
      quiniela: `
        SELECT cp.*, u.nombre as usuario_nombre
        FROM control_previo_quiniela cp
        LEFT JOIN usuarios u ON cp.usuario_id = u.id
        WHERE cp.id = ?
      `,
      poceada: `
        SELECT cp.*, 'U' as modalidad, u.nombre as usuario_nombre
        FROM control_previo_poceada cp
        LEFT JOIN usuarios u ON cp.usuario_id = u.id
        WHERE cp.id = ?
      `,
      tombolina: `
        SELECT cp.*, 'U' as modalidad, u.nombre as usuario_nombre
        FROM control_previo_tombolina cp
        LEFT JOIN usuarios u ON cp.usuario_id = u.id
        WHERE cp.id = ?
      `,
      loto: `
        SELECT
          cp.id,
          cp.numero_sorteo,
          cp.fecha,
          cp.archivo as nombre_archivo_zip,
          cp.registros_validos as total_registros,
          cp.apuestas_total as total_apuestas,
          cp.registros_anulados as total_anulados,
          cp.recaudacion as total_recaudacion,
          cp.datos_json as datos_adicionales,
          'U' as modalidad,
          cp.usuario_id,
          cp.created_at,
          cp.updated_at,
          u.nombre as usuario_nombre
        FROM control_previo_loto cp
        LEFT JOIN usuarios u ON cp.usuario_id = u.id
        WHERE cp.id = ?
      `,
      loto5: `
        SELECT
          cp.id,
          cp.numero_sorteo,
          cp.fecha,
          cp.archivo as nombre_archivo_zip,
          cp.registros_validos as total_registros,
          cp.apuestas_total as total_apuestas,
          cp.registros_anulados as total_anulados,
          cp.recaudacion as total_recaudacion,
          cp.datos_json as datos_adicionales,
          'U' as modalidad,
          cp.usuario_id,
          cp.created_at,
          cp.updated_at,
          u.nombre as usuario_nombre
        FROM control_previo_loto5 cp
        LEFT JOIN usuarios u ON cp.usuario_id = u.id
        WHERE cp.id = ?
      `,
      brinco: `
        SELECT
          cp.id,
          cp.numero_sorteo,
          cp.fecha,
          cp.archivo as nombre_archivo_zip,
          cp.registros_validos as total_registros,
          cp.apuestas_total as total_apuestas,
          cp.registros_anulados as total_anulados,
          cp.recaudacion as total_recaudacion,
          cp.datos_json as datos_adicionales,
          'U' as modalidad,
          cp.usuario_id,
          cp.created_at,
          cp.updated_at,
          u.nombre as usuario_nombre
        FROM control_previo_brinco cp
        LEFT JOIN usuarios u ON cp.usuario_id = u.id
        WHERE cp.id = ?
      `,
      quini6: `
        SELECT
          cp.id,
          cp.numero_sorteo,
          cp.fecha,
          cp.archivo as nombre_archivo_zip,
          cp.registros_validos as total_registros,
          cp.apuestas_total as total_apuestas,
          cp.registros_anulados as total_anulados,
          cp.recaudacion as total_recaudacion,
          cp.datos_json as datos_adicionales,
          'U' as modalidad,
          cp.usuario_id,
          cp.created_at,
          cp.updated_at,
          u.nombre as usuario_nombre
        FROM control_previo_quini6 cp
        LEFT JOIN usuarios u ON cp.usuario_id = u.id
        WHERE cp.id = ?
      `
    };

    const [registro] = await query(detalleSqlByJuego[juego], [id]);

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

    // Obtener QUINIELA YA
    if (!juego || juego === 'quinielaya') {
      try {
        let sqlQY = `
          SELECT e.*, u.nombre as usuario_nombre, 'quinielaya' as juego
          FROM escrutinio_quiniela_ya e
          LEFT JOIN usuarios u ON e.usuario_id = u.id
          WHERE 1=1
        `;
        const paramsQY = [];

        if (fechaDesde) { sqlQY += ' AND e.fecha >= ?'; paramsQY.push(fechaDesde); }
        if (fechaHasta) { sqlQY += ' AND e.fecha <= ?'; paramsQY.push(fechaHasta); }

        sqlQY += ` ORDER BY e.fecha DESC, e.created_at DESC LIMIT ${maxLimit}`;

        const quinielaYaData = await query(sqlQY, paramsQY);
        resultados = resultados.concat(quinielaYaData);
      } catch (e) {
        console.log('Tabla escrutinio_quiniela_ya no disponible');
      }
    }

    const juegosConRecaudacionEnControlPrevio = new Set(['quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'brinco', 'quini6', 'quinielaya']);
    const fallbackControlPrevio = {
      quiniela: { tabla: 'control_previo_quiniela', campo: 'total_recaudacion', usaModalidad: true },
      poceada: { tabla: 'control_previo_poceada', campo: 'total_recaudacion', usaModalidad: false },
      tombolina: { tabla: 'control_previo_tombolina', campo: 'total_recaudacion', usaModalidad: false },
      loto: { tabla: 'control_previo_loto', campo: 'recaudacion', usaModalidad: false },
      loto5: { tabla: 'control_previo_loto5', campo: 'recaudacion', usaModalidad: false },
      brinco: { tabla: 'control_previo_brinco', campo: 'recaudacion', usaModalidad: false },
      quini6: { tabla: 'control_previo_quini6', campo: 'recaudacion', usaModalidad: false }
    };

    const normalizarModalidadCodigo = (valor) => {
      const v = String(valor || '').trim().toUpperCase();
      if (!v) return null;
      if (['R', 'P', 'M', 'V', 'N'].includes(v)) return v;
      if (v.includes('PREV')) return 'R';
      if (v.includes('PRIM')) return 'P';
      if (v.includes('MAT')) return 'M';
      if (v.includes('VESP')) return 'V';
      if (v.includes('NOC')) return 'N';
      return null;
    };

    // Completar recaudación faltante desde control_previo_agencias
    for (const row of resultados) {
      const recActual = Number(row?.total_recaudacion || row?.recaudacion_total || row?.recaudacion || 0);
      const numeroSorteo = row?.numero_sorteo;
      const juegoRow = String(row?.juego || '').toLowerCase();

      if (!juegosConRecaudacionEnControlPrevio.has(juegoRow)) continue;
      if (!numeroSorteo) continue;
      if (Number.isFinite(recActual) && recActual > 0) {
        row.total_recaudacion = recActual;
        continue;
      }

      try {
        const modalidadOriginal = row?.modalidad || null;
        const modalidadCodigo = normalizarModalidadCodigo(modalidadOriginal);

        let sqlRec = `
          SELECT COALESCE(SUM(cpa.total_recaudacion), 0) as total_recaudacion
          FROM control_previo_agencias cpa
          WHERE cpa.juego = ? AND cpa.numero_sorteo = ?
        `;
        const paramsRec = [juegoRow, numeroSorteo];

        if (row.fecha) {
          sqlRec += ' AND cpa.fecha = ?';
          paramsRec.push(row.fecha);
        }

        if (juegoRow === 'quiniela' && (modalidadOriginal || modalidadCodigo)) {
          sqlRec += ' AND cpa.modalidad IN (?, ?)';
          paramsRec.push(modalidadOriginal || '', modalidadCodigo || '');
        }

        const [recRow] = await query(sqlRec, paramsRec);
        let recCompleta = Number(recRow?.total_recaudacion || 0);

        // Reintento menos estricto: sin fecha (evita mismatch por formato/timezone)
        if (!(Number.isFinite(recCompleta) && recCompleta > 0)) {
          let sqlRec2 = `
            SELECT COALESCE(SUM(cpa.total_recaudacion), 0) as total_recaudacion
            FROM control_previo_agencias cpa
            WHERE cpa.juego = ? AND cpa.numero_sorteo = ?
          `;
          const paramsRec2 = [juegoRow, numeroSorteo];

          if (juegoRow === 'quiniela' && (modalidadOriginal || modalidadCodigo)) {
            sqlRec2 += ' AND cpa.modalidad IN (?, ?)';
            paramsRec2.push(modalidadOriginal || '', modalidadCodigo || '');
          }

          const [recRow2] = await query(sqlRec2, paramsRec2);
          recCompleta = Number(recRow2?.total_recaudacion || 0);
        }

        // Si no hay detalle en control_previo_agencias, buscar en la tabla de control_previo del juego
        if (!(Number.isFinite(recCompleta) && recCompleta > 0) && fallbackControlPrevio[juegoRow]) {
          const cfg = fallbackControlPrevio[juegoRow];
          let sqlCp = `
            SELECT COALESCE(${cfg.campo}, 0) AS total_recaudacion
            FROM ${cfg.tabla}
            WHERE numero_sorteo = ?
          `;
          const paramsCp = [numeroSorteo];

          if (row.fecha) {
            sqlCp += ' AND fecha = ?';
            paramsCp.push(row.fecha);
          }

          if (cfg.usaModalidad && (modalidadOriginal || modalidadCodigo)) {
            sqlCp += ' AND modalidad IN (?, ?)';
            paramsCp.push(modalidadOriginal || '', modalidadCodigo || '');
          }

          sqlCp += ' ORDER BY id DESC LIMIT 1';
          const [cpRow] = await query(sqlCp, paramsCp);
          recCompleta = Number(cpRow?.total_recaudacion || 0);

          // Reintento menos estricto en control_previo: por número (y modalidad en quiniela), sin fecha
          if (!(Number.isFinite(recCompleta) && recCompleta > 0)) {
            let sqlCp2 = `
              SELECT COALESCE(${cfg.campo}, 0) AS total_recaudacion
              FROM ${cfg.tabla}
              WHERE numero_sorteo = ?
            `;
            const paramsCp2 = [numeroSorteo];

            if (cfg.usaModalidad && (modalidadOriginal || modalidadCodigo)) {
              sqlCp2 += ' AND modalidad IN (?, ?)';
              paramsCp2.push(modalidadOriginal || '', modalidadCodigo || '');
            }

            sqlCp2 += ' ORDER BY id DESC LIMIT 1';
            const [cpRow2] = await query(sqlCp2, paramsCp2);
            recCompleta = Number(cpRow2?.total_recaudacion || 0);
          }
        }

        row.total_recaudacion = Number.isFinite(recCompleta) ? recCompleta : 0;
      } catch (e) {
        row.total_recaudacion = Number(row?.total_recaudacion || 0);
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

    const juegosValidos = ['quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'brinco', 'quini6', 'quinielaya'];
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
      'quini6': 'escrutinio_quini6',
      'quinielaya': 'escrutinio_quiniela_ya'
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

    const juegosValidos = ['quiniela', 'poceada', 'tombolina', 'loto', 'loto5', 'brinco', 'quini6', 'quinielaya'];
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
        if (fechaDesde) { whereL += ' AND cp.fecha >= ?'; paramsL.push(fechaDesde); }
        if (fechaHasta) { whereL += ' AND cp.fecha <= ?'; paramsL.push(fechaHasta); }
        if (sorteoDesde) { whereL += ' AND cp.numero_sorteo >= ?'; paramsL.push(sorteoDesde); }
        if (sorteoHasta) { whereL += ' AND cp.numero_sorteo <= ?'; paramsL.push(sorteoHasta); }

        const sqlL = `
          SELECT
            cp.id, cp.fecha as fecha, cp.numero_sorteo as sorteo, 'U' as modalidad,
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
          LEFT JOIN escrutinio_loto el ON cp.fecha = el.fecha AND cp.numero_sorteo = el.numero_sorteo
          WHERE 1=1 ${whereL}
          ORDER BY cp.fecha DESC, cp.numero_sorteo DESC
          LIMIT ${maxLimit} OFFSET ${offsetNum}
        `;
        const lotoData = await query(sqlL, paramsL);
        resultados = resultados.concat(lotoData);
      }

      // LOTO 5
      if (!juego || juego === 'loto5') {
        const paramsL5 = [];
        let whereL5 = '';
        if (fechaDesde) { whereL5 += ' AND cp.fecha >= ?'; paramsL5.push(fechaDesde); }
        if (fechaHasta) { whereL5 += ' AND cp.fecha <= ?'; paramsL5.push(fechaHasta); }
        if (sorteoDesde) { whereL5 += ' AND cp.numero_sorteo >= ?'; paramsL5.push(sorteoDesde); }
        if (sorteoHasta) { whereL5 += ' AND cp.numero_sorteo <= ?'; paramsL5.push(sorteoHasta); }

        const sqlL5 = `
          SELECT
            cp.id, cp.fecha as fecha, cp.numero_sorteo as sorteo, 'U' as modalidad,
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
          LEFT JOIN escrutinio_loto5 el5 ON cp.fecha = el5.fecha AND cp.numero_sorteo = el5.numero_sorteo
          WHERE 1=1 ${whereL5}
          ORDER BY cp.fecha DESC, cp.numero_sorteo DESC
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

      // QUINIELA YA (sin control previo ni extracto)
      if (!juego || juego === 'quinielaya') {
        try {
          const paramsQY = [];
          let whereQY = '';
          if (fechaDesde) { whereQY += ' AND e.fecha >= ?'; paramsQY.push(fechaDesde); }
          if (fechaHasta) { whereQY += ' AND e.fecha <= ?'; paramsQY.push(fechaHasta); }
          if (sorteoDesde) { whereQY += ' AND e.numero_sorteo >= ?'; paramsQY.push(sorteoDesde); }
          if (sorteoHasta) { whereQY += ' AND e.numero_sorteo <= ?'; paramsQY.push(sorteoHasta); }

          const sqlQY = `
            SELECT
              e.id, e.fecha, e.numero_sorteo as sorteo, 'Y' as modalidad,
              e.total_registros,
              e.total_tickets,
              e.total_apuestas,
              e.total_anulados,
              e.total_recaudacion as recaudacion_total,
              e.total_premios,
              e.total_ganadores,
              e.usuario_nombre,
              e.created_at,
              'quinielaya' as juego
            FROM escrutinio_quiniela_ya e
            WHERE 1=1 ${whereQY}
            ORDER BY e.fecha DESC, e.numero_sorteo DESC
            LIMIT ${maxLimit} OFFSET ${offsetNum}
          `;
          const quinielaYaData = await query(sqlQY, paramsQY);
          resultados = resultados.concat(quinielaYaData);
        } catch (e) {
          console.log('Tabla escrutinio_quiniela_ya no disponible');
        }
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
      // Formato clave: CABA = "51XXXXX" (7 dígitos sin guión, igual que escrutinio_premios_agencia.cta_cte)
      const buildVentaQuery = (juegoNombre) => {
        return `
          SELECT
            CASE
              WHEN cpa.codigo_provincia = '51' THEN cpa.codigo_agencia
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

      // Query para juegos que SOLO tienen ventas en control_previo_agencias (sin premios en escrutinio_premios_agencia)
      // Usado para: poceada, quini6
      const buildSoloVentasTotalizadoQuery = (juegoNombre) => {
        return `
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
            0 as total_ganadores,
            0 as total_premios,
            COUNT(DISTINCT cpa.numero_sorteo) as total_sorteos,
            SUM(cpa.total_tickets) as total_tickets,
            SUM(cpa.total_apuestas) as total_apuestas,
            SUM(cpa.total_anulados) as total_anulados,
            SUM(cpa.total_recaudacion) as total_recaudacion,
            '${juegoNombre}' as juego
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
        sqlVQ += ` GROUP BY CASE WHEN cpa.codigo_provincia = '51' THEN cpa.codigo_agencia ELSE CONCAT('PROV-', cpa.codigo_provincia) END`;

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

      // POCEADA: Tiene ventas en control_previo_agencias Y premios en escrutinio_premios_agencia
      if (!juego || juego === 'poceada') {
        // Query de premios desde escrutinio_premios_agencia
        let sqlPPremios = buildTotalizadoQuery('escrutinio_poceada', 'poceada');
        const paramsPPremios = [];
        if (fechaDesde) { sqlPPremios += ' AND e.fecha >= ?'; paramsPPremios.push(fechaDesde); }
        if (fechaHasta) { sqlPPremios += ' AND e.fecha <= ?'; paramsPPremios.push(fechaHasta); }
        if (sorteoDesde) { sqlPPremios += ' AND e.numero_sorteo >= ?'; paramsPPremios.push(sorteoDesde); }
        if (sorteoHasta) { sqlPPremios += ' AND e.numero_sorteo <= ?'; paramsPPremios.push(sorteoHasta); }
        if (agencia) { sqlPPremios += ' AND epa.cta_cte LIKE ?'; paramsPPremios.push(`%${agencia}%`); }
        sqlPPremios += ` GROUP BY
          CASE WHEN epa.codigo_provincia = '51' THEN epa.cta_cte ELSE CONCAT('PROV-', epa.codigo_provincia) END,
          CASE WHEN epa.codigo_provincia = '51' THEN epa.cta_cte ELSE epa.codigo_provincia END,
          epa.codigo_provincia
          ORDER BY total_premios DESC`;

        // Query de ventas desde control_previo_agencias
        let sqlPVentas = buildVentaQuery('poceada');
        const paramsPVentas = [];
        if (fechaDesde) { sqlPVentas += ' AND cpa.fecha >= ?'; paramsPVentas.push(fechaDesde); }
        if (fechaHasta) { sqlPVentas += ' AND cpa.fecha <= ?'; paramsPVentas.push(fechaHasta); }
        if (sorteoDesde) { sqlPVentas += ' AND cpa.numero_sorteo >= ?'; paramsPVentas.push(sorteoDesde); }
        if (sorteoHasta) { sqlPVentas += ' AND cpa.numero_sorteo <= ?'; paramsPVentas.push(sorteoHasta); }
        if (agencia) { sqlPVentas += ' AND cpa.codigo_agencia LIKE ?'; paramsPVentas.push(`%${agencia}%`); }
        sqlPVentas += ` GROUP BY CASE WHEN cpa.codigo_provincia = '51' THEN cpa.codigo_agencia ELSE CONCAT('PROV-', cpa.codigo_provincia) END`;

        const [poceadaPremios, poceadaVentas] = await Promise.all([
          query(sqlPPremios, paramsPPremios).catch(() => []),
          query(sqlPVentas, paramsPVentas).catch(() => [])
        ]);

        // Indexar ventas por agencia
        const ventaMapP = {};
        poceadaVentas.forEach(v => { ventaMapP[v.agencia_key] = v; });

        // Indexar premios por agencia
        const premiosMapP = {};
        poceadaPremios.forEach(p => { premiosMapP[p.agencia] = p; });

        // Combinar: tomar todas las agencias de ventas y agregar premios si existen
        const agenciasSet = new Set([
          ...poceadaVentas.map(v => v.agencia_key),
          ...poceadaPremios.map(p => p.agencia)
        ]);

        const poceadaData = [];
        for (const agKey of agenciasSet) {
          const venta = ventaMapP[agKey] || {};
          const premio = premiosMapP[agKey] || {};
          
          // Determinar código provincia
          let codProv = '51';
          if (agKey.startsWith('PROV-')) {
            codProv = agKey.replace('PROV-', '');
          } else if (premio.codigo_provincia) {
            codProv = premio.codigo_provincia;
          }

          poceadaData.push({
            agencia: agKey,
            codigo: agKey.startsWith('PROV-') ? agKey.replace('PROV-', '') : agKey,
            codigo_provincia: codProv,
            nombre: codProv !== '51' ? (PROVINCIAS_NOMBRES[codProv] || `Provincia ${codProv}`) : agKey,
            total_ganadores: parseInt(premio.total_ganadores) || 0,
            total_premios: parseFloat(premio.total_premios) || 0,
            total_sorteos: parseInt(premio.total_sorteos) || parseInt(venta.total_sorteos) || 0,
            total_tickets: parseInt(venta.total_tickets) || 0,
            total_apuestas: parseInt(venta.total_apuestas) || 0,
            total_anulados: parseInt(venta.total_anulados) || 0,
            total_recaudacion: parseFloat(venta.total_recaudacion) || 0,
            juego: 'poceada'
          });
        }

        // Ajustar nombres para provincias
        poceadaData.forEach(row => {
          if (row.codigo_provincia !== '51') {
            row.agencia = row.nombre;
          }
        });

        resultados = resultados.concat(poceadaData);
      }

      // TOMBOLINA: Cruce de premios + ventas
      if (!juego || juego === 'tombolina') {
        // Premios de escrutinio
        let sqlPremiosTomb = buildTotalizadoQuery('tombolina');
        const paramsPremiosTomb = [];
        if (fechaDesde) { sqlPremiosTomb += ' AND epa.fecha >= ?'; paramsPremiosTomb.push(fechaDesde); }
        if (fechaHasta) { sqlPremiosTomb += ' AND epa.fecha <= ?'; paramsPremiosTomb.push(fechaHasta); }
        if (sorteoDesde) { sqlPremiosTomb += ' AND epa.numero_sorteo >= ?'; paramsPremiosTomb.push(sorteoDesde); }
        if (sorteoHasta) { sqlPremiosTomb += ' AND epa.numero_sorteo <= ?'; paramsPremiosTomb.push(sorteoHasta); }
        if (agencia) { sqlPremiosTomb += ' AND epa.codigo_agencia LIKE ?'; paramsPremiosTomb.push(`%${agencia}%`); }
        sqlPremiosTomb += ` GROUP BY agencia, codigo, epa.codigo_provincia ORDER BY total_premios DESC`;
        const premiosTombolina = await query(sqlPremiosTomb, paramsPremiosTomb).catch(() => []);
        const premiosTombMap = new Map(premiosTombolina.map(p => [p.agencia, p]));

        // Ventas de control_previo_agencias
        let sqlVentasTomb = buildVentaQuery('tombolina');
        const paramsVentasTomb = [];
        if (fechaDesde) { sqlVentasTomb += ' AND cpa.fecha >= ?'; paramsVentasTomb.push(fechaDesde); }
        if (fechaHasta) { sqlVentasTomb += ' AND cpa.fecha <= ?'; paramsVentasTomb.push(fechaHasta); }
        if (sorteoDesde) { sqlVentasTomb += ' AND cpa.numero_sorteo >= ?'; paramsVentasTomb.push(sorteoDesde); }
        if (sorteoHasta) { sqlVentasTomb += ' AND cpa.numero_sorteo <= ?'; paramsVentasTomb.push(sorteoHasta); }
        if (agencia) { sqlVentasTomb += ' AND cpa.codigo_agencia LIKE ?'; paramsVentasTomb.push(`%${agencia}%`); }
        sqlVentasTomb += ` GROUP BY agencia, codigo, cpa.codigo_provincia ORDER BY total_recaudacion DESC`;
        const ventasTombolina = await query(sqlVentasTomb, paramsVentasTomb).catch(() => []);

        // Combinar datos
        const tombolinaData = [];
        const procesadas = new Set();
        for (const premio of premiosTombolina) {
          const venta = ventasTombolina.find(v => v.agencia === premio.agencia);
          procesadas.add(premio.agencia);
          tombolinaData.push({
            agencia: premio.agencia,
            codigo: premio.codigo,
            codigo_provincia: premio.codigo_provincia,
            nombre: premio.nombre,
            total_ganadores: parseInt(premio.total_ganadores) || 0,
            total_premios: parseFloat(premio.total_premios) || 0,
            total_tickets: venta ? parseInt(venta.total_tickets) : 0,
            total_apuestas: venta ? parseInt(venta.total_apuestas) : 0,
            total_anulados: venta ? parseInt(venta.total_anulados) : 0,
            total_recaudacion: venta ? parseFloat(venta.total_recaudacion) : 0,
            juego: 'tombolina'
          });
        }
        for (const venta of ventasTombolina) {
          if (!procesadas.has(venta.agencia)) {
            tombolinaData.push({
              agencia: venta.agencia,
              codigo: venta.codigo,
              codigo_provincia: venta.codigo_provincia,
              nombre: venta.nombre,
              total_ganadores: 0,
              total_premios: 0,
              total_tickets: parseInt(venta.total_tickets) || 0,
              total_apuestas: parseInt(venta.total_apuestas) || 0,
              total_anulados: parseInt(venta.total_anulados) || 0,
              total_recaudacion: parseFloat(venta.total_recaudacion) || 0,
              juego: 'tombolina'
            });
          }
        }
        tombolinaData.forEach(row => {
          if (row.codigo_provincia !== '51') {
            row.nombre = PROVINCIAS_NOMBRES[row.codigo_provincia] || `Provincia ${row.codigo_provincia}`;
            row.agencia = row.nombre;
          }
        });
        resultados = resultados.concat(tombolinaData);
      }

      // QUINI6: Cruce de premios + ventas
      if (!juego || juego === 'quini6') {
        // Premios de escrutinio
        let sqlPremiosQ6 = buildTotalizadoQuery('quini6');
        const paramsPremiosQ6 = [];
        if (fechaDesde) { sqlPremiosQ6 += ' AND epa.fecha >= ?'; paramsPremiosQ6.push(fechaDesde); }
        if (fechaHasta) { sqlPremiosQ6 += ' AND epa.fecha <= ?'; paramsPremiosQ6.push(fechaHasta); }
        if (sorteoDesde) { sqlPremiosQ6 += ' AND epa.numero_sorteo >= ?'; paramsPremiosQ6.push(sorteoDesde); }
        if (sorteoHasta) { sqlPremiosQ6 += ' AND epa.numero_sorteo <= ?'; paramsPremiosQ6.push(sorteoHasta); }
        if (agencia) { sqlPremiosQ6 += ' AND epa.codigo_agencia LIKE ?'; paramsPremiosQ6.push(`%${agencia}%`); }
        sqlPremiosQ6 += ` GROUP BY agencia, codigo, epa.codigo_provincia ORDER BY total_premios DESC`;
        const premiosQuini6 = await query(sqlPremiosQ6, paramsPremiosQ6).catch(() => []);
        const premiosQ6Map = new Map(premiosQuini6.map(p => [p.agencia, p]));

        // Ventas de control_previo_agencias
        let sqlVentasQ6 = buildVentaQuery('quini6');
        const paramsVentasQ6 = [];
        if (fechaDesde) { sqlVentasQ6 += ' AND cpa.fecha >= ?'; paramsVentasQ6.push(fechaDesde); }
        if (fechaHasta) { sqlVentasQ6 += ' AND cpa.fecha <= ?'; paramsVentasQ6.push(fechaHasta); }
        if (sorteoDesde) { sqlVentasQ6 += ' AND cpa.numero_sorteo >= ?'; paramsVentasQ6.push(sorteoDesde); }
        if (sorteoHasta) { sqlVentasQ6 += ' AND cpa.numero_sorteo <= ?'; paramsVentasQ6.push(sorteoHasta); }
        if (agencia) { sqlVentasQ6 += ' AND cpa.codigo_agencia LIKE ?'; paramsVentasQ6.push(`%${agencia}%`); }
        sqlVentasQ6 += ` GROUP BY agencia, codigo, cpa.codigo_provincia ORDER BY total_recaudacion DESC`;
        const ventasQuini6 = await query(sqlVentasQ6, paramsVentasQ6).catch(() => []);

        // Combinar datos
        const quini6Data = [];
        const procesadasQ6 = new Set();
        for (const premio of premiosQuini6) {
          const venta = ventasQuini6.find(v => v.agencia === premio.agencia);
          procesadasQ6.add(premio.agencia);
          quini6Data.push({
            agencia: premio.agencia,
            codigo: premio.codigo,
            codigo_provincia: premio.codigo_provincia,
            nombre: premio.nombre,
            total_ganadores: parseInt(premio.total_ganadores) || 0,
            total_premios: parseFloat(premio.total_premios) || 0,
            total_tickets: venta ? parseInt(venta.total_tickets) : 0,
            total_apuestas: venta ? parseInt(venta.total_apuestas) : 0,
            total_anulados: venta ? parseInt(venta.total_anulados) : 0,
            total_recaudacion: venta ? parseFloat(venta.total_recaudacion) : 0,
            juego: 'quini6'
          });
        }
        for (const venta of ventasQuini6) {
          if (!procesadasQ6.has(venta.agencia)) {
            quini6Data.push({
              agencia: venta.agencia,
              codigo: venta.codigo,
              codigo_provincia: venta.codigo_provincia,
              nombre: venta.nombre,
              total_ganadores: 0,
              total_premios: 0,
              total_tickets: parseInt(venta.total_tickets) || 0,
              total_apuestas: parseInt(venta.total_apuestas) || 0,
              total_anulados: parseInt(venta.total_anulados) || 0,
              total_recaudacion: parseFloat(venta.total_recaudacion) || 0,
              juego: 'quini6'
            });
          }
        }
        quini6Data.forEach(row => {
          if (row.codigo_provincia !== '51') {
            row.nombre = PROVINCIAS_NOMBRES[row.codigo_provincia] || `Provincia ${row.codigo_provincia}`;
            row.agencia = row.nombre;
          }
        });
        resultados = resultados.concat(quini6Data);
      }

      // QUINIELA YA: cruce de premios + ventas
      if (!juego || juego === 'quinielaya') {
        let sqlPremiosQY = buildTotalizadoQuery('escrutinio_quiniela_ya', 'quinielaya');
        const paramsPremiosQY = [];
        if (fechaDesde) { sqlPremiosQY += ' AND e.fecha >= ?'; paramsPremiosQY.push(fechaDesde); }
        if (fechaHasta) { sqlPremiosQY += ' AND e.fecha <= ?'; paramsPremiosQY.push(fechaHasta); }
        if (sorteoDesde) { sqlPremiosQY += ' AND e.numero_sorteo >= ?'; paramsPremiosQY.push(sorteoDesde); }
        if (sorteoHasta) { sqlPremiosQY += ' AND e.numero_sorteo <= ?'; paramsPremiosQY.push(sorteoHasta); }
        if (agencia) { sqlPremiosQY += ' AND epa.cta_cte LIKE ?'; paramsPremiosQY.push(`%${agencia}%`); }
        sqlPremiosQY += ` GROUP BY
          CASE WHEN epa.codigo_provincia = '51' THEN epa.cta_cte ELSE CONCAT('PROV-', epa.codigo_provincia) END,
          CASE WHEN epa.codigo_provincia = '51' THEN epa.cta_cte ELSE epa.codigo_provincia END,
          epa.codigo_provincia
          ORDER BY total_premios DESC`;

        let sqlVentasQY = buildVentaQuery('quinielaya');
        const paramsVentasQY = [];
        if (fechaDesde) { sqlVentasQY += ' AND cpa.fecha >= ?'; paramsVentasQY.push(fechaDesde); }
        if (fechaHasta) { sqlVentasQY += ' AND cpa.fecha <= ?'; paramsVentasQY.push(fechaHasta); }
        if (sorteoDesde) { sqlVentasQY += ' AND cpa.numero_sorteo >= ?'; paramsVentasQY.push(sorteoDesde); }
        if (sorteoHasta) { sqlVentasQY += ' AND cpa.numero_sorteo <= ?'; paramsVentasQY.push(sorteoHasta); }
        if (agencia) { sqlVentasQY += ' AND cpa.codigo_agencia LIKE ?'; paramsVentasQY.push(`%${agencia}%`); }
        sqlVentasQY += ` GROUP BY CASE WHEN cpa.codigo_provincia = '51' THEN cpa.codigo_agencia ELSE CONCAT('PROV-', cpa.codigo_provincia) END`;

        const [premiosQY, ventasQY] = await Promise.all([
          query(sqlPremiosQY, paramsPremiosQY).catch(() => []),
          query(sqlVentasQY, paramsVentasQY).catch(() => [])
        ]);

        const ventasMapQY = {};
        ventasQY.forEach(v => { ventasMapQY[v.agencia_key] = v; });
        const premiosMapQY = {};
        premiosQY.forEach(p => { premiosMapQY[p.agencia] = p; });

        const agenciasSetQY = new Set([
          ...ventasQY.map(v => v.agencia_key),
          ...premiosQY.map(p => p.agencia)
        ]);

        const quinielaYaData = [];
        for (const agKey of agenciasSetQY) {
          const venta = ventasMapQY[agKey] || {};
          const premio = premiosMapQY[agKey] || {};
          let codProv = '51';
          if (agKey.startsWith('PROV-')) codProv = agKey.replace('PROV-', '');
          else if (premio.codigo_provincia) codProv = premio.codigo_provincia;

          quinielaYaData.push({
            agencia: agKey,
            codigo: agKey.startsWith('PROV-') ? agKey.replace('PROV-', '') : agKey,
            codigo_provincia: codProv,
            nombre: codProv !== '51' ? (PROVINCIAS_NOMBRES[codProv] || `Provincia ${codProv}`) : agKey,
            total_ganadores: parseInt(premio.total_ganadores) || 0,
            total_premios: parseFloat(premio.total_premios) || 0,
            total_sorteos: parseInt(premio.total_sorteos) || 0,
            total_tickets: parseInt(venta.total_tickets) || 0,
            total_apuestas: parseInt(venta.total_apuestas) || 0,
            total_anulados: parseInt(venta.total_anulados) || 0,
            total_recaudacion: parseFloat(venta.total_recaudacion) || 0,
            juego: 'quinielaya'
          });
        }

        quinielaYaData.forEach(row => {
          if (row.codigo_provincia !== '51') {
            row.agencia = row.nombre;
          }
        });

        resultados = resultados.concat(quinielaYaData);
      }

      // LOTO: Cruce de premios + ventas
      if (!juego || juego === 'loto') {
        // Premios de escrutinio
        let sqlPremiosLoto = buildTotalizadoQuery('loto');
        const paramsPremiosLoto = [];
        if (fechaDesde) { sqlPremiosLoto += ' AND epa.fecha >= ?'; paramsPremiosLoto.push(fechaDesde); }
        if (fechaHasta) { sqlPremiosLoto += ' AND epa.fecha <= ?'; paramsPremiosLoto.push(fechaHasta); }
        if (sorteoDesde) { sqlPremiosLoto += ' AND epa.numero_sorteo >= ?'; paramsPremiosLoto.push(sorteoDesde); }
        if (sorteoHasta) { sqlPremiosLoto += ' AND epa.numero_sorteo <= ?'; paramsPremiosLoto.push(sorteoHasta); }
        if (agencia) { sqlPremiosLoto += ' AND epa.codigo_agencia LIKE ?'; paramsPremiosLoto.push(`%${agencia}%`); }
        sqlPremiosLoto += ` GROUP BY agencia, codigo, epa.codigo_provincia ORDER BY total_premios DESC`;
        const premiosLoto = await query(sqlPremiosLoto, paramsPremiosLoto).catch(() => []);
        const premiosLotoMap = new Map(premiosLoto.map(p => [p.agencia, p]));

        // Ventas de control_previo_agencias
        let sqlVentasLoto = buildVentaQuery('loto');
        const paramsVentasLoto = [];
        if (fechaDesde) { sqlVentasLoto += ' AND cpa.fecha >= ?'; paramsVentasLoto.push(fechaDesde); }
        if (fechaHasta) { sqlVentasLoto += ' AND cpa.fecha <= ?'; paramsVentasLoto.push(fechaHasta); }
        if (sorteoDesde) { sqlVentasLoto += ' AND cpa.numero_sorteo >= ?'; paramsVentasLoto.push(sorteoDesde); }
        if (sorteoHasta) { sqlVentasLoto += ' AND cpa.numero_sorteo <= ?'; paramsVentasLoto.push(sorteoHasta); }
        if (agencia) { sqlVentasLoto += ' AND cpa.codigo_agencia LIKE ?'; paramsVentasLoto.push(`%${agencia}%`); }
        sqlVentasLoto += ` GROUP BY agencia, codigo, cpa.codigo_provincia ORDER BY total_recaudacion DESC`;
        const ventasLoto = await query(sqlVentasLoto, paramsVentasLoto).catch(() => []);

        // Combinar datos
        const lotoData = [];
        const procesadasLoto = new Set();
        for (const premio of premiosLoto) {
          const venta = ventasLoto.find(v => v.agencia === premio.agencia);
          procesadasLoto.add(premio.agencia);
          lotoData.push({
            agencia: premio.agencia,
            codigo: premio.codigo,
            codigo_provincia: premio.codigo_provincia,
            nombre: premio.nombre,
            total_ganadores: parseInt(premio.total_ganadores) || 0,
            total_premios: parseFloat(premio.total_premios) || 0,
            total_tickets: venta ? parseInt(venta.total_tickets) : 0,
            total_apuestas: venta ? parseInt(venta.total_apuestas) : 0,
            total_anulados: venta ? parseInt(venta.total_anulados) : 0,
            total_recaudacion: venta ? parseFloat(venta.total_recaudacion) : 0,
            juego: 'loto'
          });
        }
        for (const venta of ventasLoto) {
          if (!procesadasLoto.has(venta.agencia)) {
            lotoData.push({
              agencia: venta.agencia,
              codigo: venta.codigo,
              codigo_provincia: venta.codigo_provincia,
              nombre: venta.nombre,
              total_ganadores: 0,
              total_premios: 0,
              total_tickets: parseInt(venta.total_tickets) || 0,
              total_apuestas: parseInt(venta.total_apuestas) || 0,
              total_anulados: parseInt(venta.total_anulados) || 0,
              total_recaudacion: parseFloat(venta.total_recaudacion) || 0,
              juego: 'loto'
            });
          }
        }
        lotoData.forEach(row => {
          if (row.codigo_provincia !== '51') {
            row.nombre = PROVINCIAS_NOMBRES[row.codigo_provincia] || `Provincia ${row.codigo_provincia}`;
            row.agencia = row.nombre;
          }
        });
        resultados = resultados.concat(lotoData);
      }

      // LOTO5: Cruce de premios + ventas
      if (!juego || juego === 'loto5') {
        // Premios de escrutinio
        let sqlPremiosLoto5 = buildTotalizadoQuery('loto5');
        const paramsPremiosLoto5 = [];
        if (fechaDesde) { sqlPremiosLoto5 += ' AND epa.fecha >= ?'; paramsPremiosLoto5.push(fechaDesde); }
        if (fechaHasta) { sqlPremiosLoto5 += ' AND epa.fecha <= ?'; paramsPremiosLoto5.push(fechaHasta); }
        if (sorteoDesde) { sqlPremiosLoto5 += ' AND epa.numero_sorteo >= ?'; paramsPremiosLoto5.push(sorteoDesde); }
        if (sorteoHasta) { sqlPremiosLoto5 += ' AND epa.numero_sorteo <= ?'; paramsPremiosLoto5.push(sorteoHasta); }
        if (agencia) { sqlPremiosLoto5 += ' AND epa.codigo_agencia LIKE ?'; paramsPremiosLoto5.push(`%${agencia}%`); }
        sqlPremiosLoto5 += ` GROUP BY agencia, codigo, epa.codigo_provincia ORDER BY total_premios DESC`;
        const premiosLoto5 = await query(sqlPremiosLoto5, paramsPremiosLoto5).catch(() => []);
        const premiosLoto5Map = new Map(premiosLoto5.map(p => [p.agencia, p]));

        // Ventas de control_previo_agencias
        let sqlVentasLoto5 = buildVentaQuery('loto5');
        const paramsVentasLoto5 = [];
        if (fechaDesde) { sqlVentasLoto5 += ' AND cpa.fecha >= ?'; paramsVentasLoto5.push(fechaDesde); }
        if (fechaHasta) { sqlVentasLoto5 += ' AND cpa.fecha <= ?'; paramsVentasLoto5.push(fechaHasta); }
        if (sorteoDesde) { sqlVentasLoto5 += ' AND cpa.numero_sorteo >= ?'; paramsVentasLoto5.push(sorteoDesde); }
        if (sorteoHasta) { sqlVentasLoto5 += ' AND cpa.numero_sorteo <= ?'; paramsVentasLoto5.push(sorteoHasta); }
        if (agencia) { sqlVentasLoto5 += ' AND cpa.codigo_agencia LIKE ?'; paramsVentasLoto5.push(`%${agencia}%`); }
        sqlVentasLoto5 += ` GROUP BY agencia, codigo, cpa.codigo_provincia ORDER BY total_recaudacion DESC`;
        const ventasLoto5 = await query(sqlVentasLoto5, paramsVentasLoto5).catch(() => []);

        // Combinar datos
        const loto5Data = [];
        const procesadasLoto5 = new Set();
        for (const premio of premiosLoto5) {
          const venta = ventasLoto5.find(v => v.agencia === premio.agencia);
          procesadasLoto5.add(premio.agencia);
          loto5Data.push({
            agencia: premio.agencia,
            codigo: premio.codigo,
            codigo_provincia: premio.codigo_provincia,
            nombre: premio.nombre,
            total_ganadores: parseInt(premio.total_ganadores) || 0,
            total_premios: parseFloat(premio.total_premios) || 0,
            total_tickets: venta ? parseInt(venta.total_tickets) : 0,
            total_apuestas: venta ? parseInt(venta.total_apuestas) : 0,
            total_anulados: venta ? parseInt(venta.total_anulados) : 0,
            total_recaudacion: venta ? parseFloat(venta.total_recaudacion) : 0,
            juego: 'loto5'
          });
        }
        for (const venta of ventasLoto5) {
          if (!procesadasLoto5.has(venta.agencia)) {
            loto5Data.push({
              agencia: venta.agencia,
              codigo: venta.codigo,
              codigo_provincia: venta.codigo_provincia,
              nombre: venta.nombre,
              total_ganadores: 0,
              total_premios: 0,
              total_tickets: parseInt(venta.total_tickets) || 0,
              total_apuestas: parseInt(venta.total_apuestas) || 0,
              total_anulados: parseInt(venta.total_anulados) || 0,
              total_recaudacion: parseFloat(venta.total_recaudacion) || 0,
              juego: 'loto5'
            });
          }
        }
        loto5Data.forEach(row => {
          if (row.codigo_provincia !== '51') {
            row.nombre = PROVINCIAS_NOMBRES[row.codigo_provincia] || `Provincia ${row.codigo_provincia}`;
            row.agencia = row.nombre;
          }
        });
        resultados = resultados.concat(loto5Data);
      }

      // BRINCO: Cruce de premios + ventas
      if (!juego || juego === 'brinco') {
        // Premios de escrutinio
        let sqlPremiosBrinco = buildTotalizadoQuery('brinco');
        const paramsPremiosBrinco = [];
        if (fechaDesde) { sqlPremiosBrinco += ' AND epa.fecha >= ?'; paramsPremiosBrinco.push(fechaDesde); }
        if (fechaHasta) { sqlPremiosBrinco += ' AND epa.fecha <= ?'; paramsPremiosBrinco.push(fechaHasta); }
        if (sorteoDesde) { sqlPremiosBrinco += ' AND epa.numero_sorteo >= ?'; paramsPremiosBrinco.push(sorteoDesde); }
        if (sorteoHasta) { sqlPremiosBrinco += ' AND epa.numero_sorteo <= ?'; paramsPremiosBrinco.push(sorteoHasta); }
        if (agencia) { sqlPremiosBrinco += ' AND epa.codigo_agencia LIKE ?'; paramsPremiosBrinco.push(`%${agencia}%`); }
        sqlPremiosBrinco += ` GROUP BY agencia, codigo, epa.codigo_provincia ORDER BY total_premios DESC`;
        const premiosBrinco = await query(sqlPremiosBrinco, paramsPremiosBrinco).catch(() => []);
        const premiosBrincoMap = new Map(premiosBrinco.map(p => [p.agencia, p]));

        // Ventas de control_previo_agencias
        let sqlVentasBrinco = buildVentaQuery('brinco');
        const paramsVentasBrinco = [];
        if (fechaDesde) { sqlVentasBrinco += ' AND cpa.fecha >= ?'; paramsVentasBrinco.push(fechaDesde); }
        if (fechaHasta) { sqlVentasBrinco += ' AND cpa.fecha <= ?'; paramsVentasBrinco.push(fechaHasta); }
        if (sorteoDesde) { sqlVentasBrinco += ' AND cpa.numero_sorteo >= ?'; paramsVentasBrinco.push(sorteoDesde); }
        if (sorteoHasta) { sqlVentasBrinco += ' AND cpa.numero_sorteo <= ?'; paramsVentasBrinco.push(sorteoHasta); }
        if (agencia) { sqlVentasBrinco += ' AND cpa.codigo_agencia LIKE ?'; paramsVentasBrinco.push(`%${agencia}%`); }
        sqlVentasBrinco += ` GROUP BY agencia, codigo, cpa.codigo_provincia ORDER BY total_recaudacion DESC`;
        const ventasBrinco = await query(sqlVentasBrinco, paramsVentasBrinco).catch(() => []);

        // Combinar datos
        const brincoData = [];
        const procesadasBrinco = new Set();
        for (const premio of premiosBrinco) {
          const venta = ventasBrinco.find(v => v.agencia === premio.agencia);
          procesadasBrinco.add(premio.agencia);
          brincoData.push({
            agencia: premio.agencia,
            codigo: premio.codigo,
            codigo_provincia: premio.codigo_provincia,
            nombre: premio.nombre,
            total_ganadores: parseInt(premio.total_ganadores) || 0,
            total_premios: parseFloat(premio.total_premios) || 0,
            total_tickets: venta ? parseInt(venta.total_tickets) : 0,
            total_apuestas: venta ? parseInt(venta.total_apuestas) : 0,
            total_anulados: venta ? parseInt(venta.total_anulados) : 0,
            total_recaudacion: venta ? parseFloat(venta.total_recaudacion) : 0,
            juego: 'brinco'
          });
        }
        for (const venta of ventasBrinco) {
          if (!procesadasBrinco.has(venta.agencia)) {
            brincoData.push({
              agencia: venta.agencia,
              codigo: venta.codigo,
              codigo_provincia: venta.codigo_provincia,
              nombre: venta.nombre,
              total_ganadores: 0,
              total_premios: 0,
              total_tickets: parseInt(venta.total_tickets) || 0,
              total_apuestas: parseInt(venta.total_apuestas) || 0,
              total_anulados: parseInt(venta.total_anulados) || 0,
              total_recaudacion: parseFloat(venta.total_recaudacion) || 0,
              juego: 'brinco'
            });
          }
        }
        brincoData.forEach(row => {
          if (row.codigo_provincia !== '51') {
            row.nombre = PROVINCIAS_NOMBRES[row.codigo_provincia] || `Provincia ${row.codigo_provincia}`;
            row.agencia = row.nombre;
          }
        });
        resultados = resultados.concat(brincoData);
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
            '51' as codigo_provincia,
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

      // Si no se especificó juego (todos), acumular por agencia sumando todos los juegos
      if (!juego || juego === 'todos') {
        const acumulado = new Map();

        const normalizarCodigoProvincia = (codigo) => {
          if (codigo === null || codigo === undefined) return null;
          const limpio = String(codigo).trim();
          if (!limpio) return null;
          return limpio.padStart(2, '0');
        };

        const construirClaveAcumulado = (row) => {
          const codProv = normalizarCodigoProvincia(row.codigo_provincia);
          if (codProv && codProv !== '51') {
            return `PROV-${codProv}`;
          }

          const agenciaRaw = String(row.agencia || row.codigo || row.cta_cte || '').trim();
          const soloDigitos = agenciaRaw.replace(/\D/g, '');
          if (soloDigitos) return soloDigitos;

          return agenciaRaw || 'DESCONOCIDO';
        };

        const construirDisplayAgencia = (row, clave) => {
          const codProv = normalizarCodigoProvincia(row.codigo_provincia);
          if (codProv && codProv !== '51') {
            return row.nombre || PROVINCIAS_NOMBRES[codProv] || `Provincia ${codProv}`;
          }
          return String(row.agencia || row.codigo || row.cta_cte || clave).replace(/\D/g, '') || (row.agencia || clave);
        };
        
        for (const row of resultados) {
          const clave = construirClaveAcumulado(row);
          const codigoProvincia = normalizarCodigoProvincia(row.codigo_provincia);
          
          if (!acumulado.has(clave)) {
            acumulado.set(clave, {
              agencia: construirDisplayAgencia(row, clave),
              codigo: row.codigo,
              codigo_provincia: codigoProvincia || row.codigo_provincia,
              nombre: construirDisplayAgencia(row, clave),
              total_ganadores: 0,
              total_premios: 0,
              total_sorteos: 0,
              total_tickets: 0,
              total_apuestas: 0,
              total_anulados: 0,
              total_recaudacion: 0,
              cancelaciones: 0,
              devoluciones: 0,
              juegos: [], // Lista de juegos que aportaron
              juego: 'todos'
            });
          }
          
          const acc = acumulado.get(clave);
          if (!acc.codigo_provincia && codigoProvincia) {
            acc.codigo_provincia = codigoProvincia;
          }
          acc.total_ganadores += parseInt(row.total_ganadores) || 0;
          acc.total_premios += parseFloat(row.total_premios) || 0;
          acc.total_sorteos += parseInt(row.total_sorteos) || 0;
          acc.total_tickets += parseInt(row.total_tickets) || 0;
          acc.total_apuestas += parseInt(row.total_apuestas) || 0;
          acc.total_anulados += parseInt(row.total_anulados) || 0;
          acc.total_recaudacion += parseFloat(row.total_recaudacion) || 0;
          acc.cancelaciones += parseFloat(row.cancelaciones) || 0;
          acc.devoluciones += parseFloat(row.devoluciones) || 0;
          
          if (row.juego && !acc.juegos.includes(row.juego)) {
            acc.juegos.push(row.juego);
          }
        }
        
        // Convertir a array y ordenar
        resultados = Array.from(acumulado.values());
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

      let quinielaYaStats = null;
      try {
        [quinielaYaStats] = await query(`
          SELECT
            'quinielaya' as juego,
            COUNT(*) as total_sorteos,
            SUM(total_recaudacion) as total_recaudacion,
            SUM(total_tickets) as total_tickets,
            SUM(total_apuestas) as total_apuestas,
            SUM(total_anulados) as total_anulados,
            SUM(total_premios) as total_premios,
            SUM(total_ganadores) as total_ganadores
          FROM escrutinio_quiniela_ya
          WHERE 1=1 ${whereC}
        `, paramsC);
      } catch (e) {
        quinielaYaStats = null;
      }

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
        },
        {
          juego: 'quinielaya',
          total_sorteos: quinielaYaStats?.total_sorteos || 0,
          total_recaudacion: quinielaYaStats?.total_recaudacion || 0,
          total_tickets: quinielaYaStats?.total_tickets || 0,
          total_apuestas: quinielaYaStats?.total_apuestas || 0,
          total_anulados: quinielaYaStats?.total_anulados || 0,
          total_premios: quinielaYaStats?.total_premios || 0,
          total_ganadores: quinielaYaStats?.total_ganadores || 0
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

    const normalizarCodigoProvincia = (codigo) => {
      if (codigo === null || codigo === undefined) return null;
      const limpio = String(codigo).trim();
      if (!limpio) return null;
      return limpio.padStart(2, '0');
    };

    const provinciaCuentaComoActiva = (codigo) => {
      const cod = normalizarCodigoProvincia(codigo);
      if (!cod) return false;
      if (cod === '51') return false;
      return Boolean(PROVINCIAS[cod]);
    };

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
      agenciasQ.forEach(a => {
        const cta = String(a.cta_cte || '');
        if (cta.startsWith('51') && cta.length >= 7) agenciasSet.add(cta);
      });

      // Contar provincias activas desde control_previo_agencias (más preciso)
      const provinciasQ = await query(`
        SELECT DISTINCT codigo_provincia
        FROM control_previo_agencias
        WHERE juego = 'quiniela' ${whereQ}
      `, paramsQ);
      provinciasQ.forEach(p => {
        if (provinciaCuentaComoActiva(p.codigo_provincia)) {
          provinciasSet.add(normalizarCodigoProvincia(p.codigo_provincia));
        }
      });
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
      agenciasP.forEach(a => {
        const cta = String(a.cta_cte || '');
        if (cta.startsWith('51') && cta.length >= 7) agenciasSet.add(cta);
      });

      // Contar provincias activas desde control_previo_agencias
      const provsP = await query(`
        SELECT DISTINCT codigo_provincia
        FROM control_previo_agencias
        WHERE juego = 'poceada' ${whereP}
      `, paramsP);
      provsP.forEach(p => {
        if (provinciaCuentaComoActiva(p.codigo_provincia)) {
          provinciasSet.add(normalizarCodigoProvincia(p.codigo_provincia));
        }
      });
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
      agenciasT.forEach(a => {
        const cta = String(a.cta_cte || '');
        if (cta.startsWith('51') && cta.length >= 7) agenciasSet.add(cta);
      });

      const provinciasT = await query(`
        SELECT DISTINCT codigo_provincia
        FROM control_previo_agencias
        WHERE juego = 'tombolina' ${whereQ}
      `, paramsQ);
      provinciasT.forEach(p => {
        if (provinciaCuentaComoActiva(p.codigo_provincia)) {
          provinciasSet.add(normalizarCodigoProvincia(p.codigo_provincia));
        }
      });
    }

    // BLOQUE GENÉRICO PARA OTROS JUEGOS (Quini 6, Brinco, Loto, etc.)
    const otrosJuegosStats = ['quini6', 'brinco', 'loto', 'loto5', 'quinielaya'];
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

        // Premios desde escrutinio_premios_agencia.
        // Para Quiniela Ya sí aplicamos filtros de fecha/sorteo con join a su tabla principal.
        let escGen = { premios: 0 };
        if (j === 'quinielaya') {
          const whereEscQY = whereQ
            .replace(/\bfecha\b/g, 'e.fecha')
            .replace(/\bnumero_sorteo\b/g, 'e.numero_sorteo');

          [escGen] = await query(`
            SELECT
              COALESCE(SUM(epa.total_premios), 0) as premios
            FROM escrutinio_premios_agencia epa
            INNER JOIN escrutinio_quiniela_ya e
              ON epa.escrutinio_id = e.id
              AND epa.juego = 'quinielaya'
            WHERE 1=1 ${whereEscQY}
          `, paramsQ);
        } else {
          // escrutinio_premios_agencia no tiene columnas fecha/numero_sorteo.
          // Para estos juegos mantenemos el agregado general de premios sin filtro temporal.
          [escGen] = await query(`
            SELECT
              COALESCE(SUM(total_premios), 0) as premios
            FROM escrutinio_premios_agencia
            WHERE juego = ?
          `, [j]);
        }

        stats.total_recaudacion += parseFloat(cpGen?.recaudacion || 0);
        stats.total_tickets += parseInt(cpGen?.tickets || 0);
        stats.total_apuestas += parseInt(cpGen?.apuestas || 0);
        stats.total_sorteos += parseInt(cpGen?.sorteos || 0);
        stats.total_premios += parseFloat(escGen?.premios || 0);

        // Agencias premiadas
        let agenciasGen = [];
        if (j === 'quinielaya') {
          const whereEscQY = whereQ
            .replace(/\bfecha\b/g, 'e.fecha')
            .replace(/\bnumero_sorteo\b/g, 'e.numero_sorteo');

          agenciasGen = await query(`
            SELECT DISTINCT epa.cta_cte
            FROM escrutinio_premios_agencia epa
            INNER JOIN escrutinio_quiniela_ya e
              ON epa.escrutinio_id = e.id
              AND epa.juego = 'quinielaya'
            WHERE 1=1 ${whereEscQY}
          `, paramsQ);
        } else {
          // Idem: esta tabla no tiene fecha/numero_sorteo para filtrar directamente.
          agenciasGen = await query(`
            SELECT DISTINCT cta_cte
            FROM escrutinio_premios_agencia
            WHERE juego = ?
          `, [j]);
        }
        agenciasGen.forEach(a => {
          const cta = String(a.cta_cte || '');
          if (cta.startsWith('51') && cta.length >= 7) agenciasSet.add(cta);
        });

        // Provincias activas
        const provinciasGen = await query(`
          SELECT DISTINCT codigo_provincia
          FROM control_previo_agencias
          WHERE juego = ? ${whereQ}
        `, [j, ...paramsQ]);
        provinciasGen.forEach(p => {
          if (provinciaCuentaComoActiva(p.codigo_provincia)) {
            provinciasSet.add(normalizarCodigoProvincia(p.codigo_provincia));
          }
        });
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
      // No se suma a agenciasSet para mantener consistencia con el indicador de venta
      // (que mide agencias CABA desde control_previo_agencias).
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
    let fechasQY = null;
    try {
      [fechasQY] = await query(`
        SELECT MIN(fecha) as min_fecha, MAX(fecha) as max_fecha
        FROM escrutinio_quiniela_ya
      `);
    } catch (e) {
      fechasQY = null;
    }

    // Obtener rango de sorteos
    const [sorteosQ] = await query(`
      SELECT MIN(numero_sorteo) as min_sorteo, MAX(numero_sorteo) as max_sorteo
      FROM control_previo_quiniela
    `);
    const [sorteosP] = await query(`
      SELECT MIN(numero_sorteo) as min_sorteo, MAX(numero_sorteo) as max_sorteo
      FROM control_previo_poceada
    `);
    let sorteosQY = null;
    try {
      [sorteosQY] = await query(`
        SELECT MIN(numero_sorteo) as min_sorteo, MAX(numero_sorteo) as max_sorteo
        FROM escrutinio_quiniela_ya
      `);
    } catch (e) {
      sorteosQY = null;
    }

    // Calcular rangos combinados
    const fechas = [fechasQ?.min_fecha, fechasP?.min_fecha, fechasQY?.min_fecha].filter(Boolean);
    const fechasMax = [fechasQ?.max_fecha, fechasP?.max_fecha, fechasQY?.max_fecha].filter(Boolean);
    const sorteos = [sorteosQ?.min_sorteo, sorteosP?.min_sorteo, sorteosQY?.min_sorteo].filter(Boolean);
    const sorteosMax = [sorteosQ?.max_sorteo, sorteosP?.max_sorteo, sorteosQY?.max_sorteo].filter(Boolean);

    return successResponse(res, {
      fechas: {
        min: fechas.length ? new Date(Math.min(...fechas.map(d => new Date(d)))).toISOString().split('T')[0] : null,
        max: fechasMax.length ? new Date(Math.max(...fechasMax.map(d => new Date(d)))).toISOString().split('T')[0] : null
      },
      sorteos: {
        min: sorteos.length ? Math.min(...sorteos) : null,
        max: sorteosMax.length ? Math.max(...sorteosMax) : null
      },
      rangosPorJuego: {
        quiniela: {
          fechas: { min: fechasQ?.min_fecha || null, max: fechasQ?.max_fecha || null },
          sorteos: { min: sorteosQ?.min_sorteo || null, max: sorteosQ?.max_sorteo || null }
        },
        poceada: {
          fechas: { min: fechasP?.min_fecha || null, max: fechasP?.max_fecha || null },
          sorteos: { min: sorteosP?.min_sorteo || null, max: sorteosP?.max_sorteo || null }
        },
        quinielaya: {
          fechas: { min: fechasQY?.min_fecha || null, max: fechasQY?.max_fecha || null },
          sorteos: { min: sorteosQY?.min_sorteo || null, max: sorteosQY?.max_sorteo || null }
        }
      },
      juegos: ['quiniela', 'quinielaya', 'poceada', 'tombolina', 'loto', 'loto5', 'quini6', 'brinco', 'hipicas'],
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
