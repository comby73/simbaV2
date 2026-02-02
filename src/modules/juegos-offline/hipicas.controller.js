/**
 * Hipicas Controller - Procesador de archivos TXT de Turfito
 * Port del Python TurfitoLoader a Node.js
 *
 * Hipódromos soportados:
 * - 0099: Palermo (HP) / HAPSA
 * - 0021: La Plata (LP)
 * - 0020: San Isidro (SI)
 */

const { query } = require('../../config/database');
const { successResponse, errorResponse } = require('../../shared/helpers');

// Mapeo de códigos de hipódromo
const HIPODROMOS = {
  '0099': { codigo: '0099', nombre: 'Palermo', abrev: 'HP' },
  '0021': { codigo: '0021', nombre: 'La Plata', abrev: 'LP' },
  '0020': { codigo: '0020', nombre: 'San Isidro', abrev: 'SI' }
};

// Códigos de provincia argentinos
const CODIGOS_PROVINCIA = {
  '51': 'CABA', '53': 'Buenos Aires', '54': 'Catamarca', '55': 'Cordoba',
  '56': 'Corrientes', '57': 'Chaco', '58': 'Chubut', '59': 'Entre Rios',
  '60': 'Formosa', '61': 'Jujuy', '62': 'La Pampa', '63': 'La Rioja',
  '64': 'Mendoza', '65': 'Misiones', '66': 'Neuquen', '67': 'Rio Negro',
  '68': 'Salta', '69': 'San Juan', '70': 'San Luis', '71': 'Santa Cruz',
  '72': 'Santa Fe', '73': 'Santiago del Estero', '74': 'Tucuman',
  '75': 'Tierra del Fuego'
};

/**
 * Parsear un monto desde el TXT (dígitos, dividir por 100)
 */
function safeAmount(str) {
  if (!str) return 0;
  const digits = str.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) / 100 : 0;
}

/**
 * Parsear una línea del TXT de Turfito
 * Posiciones:
 * - codigo_juego: 0-4
 * - provincia_agencia: 4-11
 * - reunion: 19-22
 * - fecha: 22-30 (DDMMYYYY)
 * - ventas: 30-42
 * - cancelaciones: 42-54
 * - devoluciones: 53-66
 * - premios: 64-78
 */
function parsearLinea(line) {
  if (!line || line.length < 75) return null;
  if (line.includes('999999999')) return null;

  try {
    const codigoJuego = line.substring(0, 4).trim();
    const provinciaAgencia = line.substring(4, 11).trim();
    const reunion = line.substring(19, 22).trim();
    const fechaRaw = line.substring(22, 30).trim();
    const ventasRaw = line.substring(30, 42);
    const cancelacionesRaw = line.substring(42, 54);
    const devolucionesRaw = line.substring(53, 66);
    const premioRaw = line.substring(64, 78);

    // Determinar hipódromo
    const hipodromo = HIPODROMOS[codigoJuego];
    if (!hipodromo) return null; // No es un código de hipódromo conocido

    // Número de reunión y sorteo concatenado
    const numeroReunion = parseInt(reunion, 10);
    if (isNaN(numeroReunion)) return null;
    const sorteoConcatenado = `${numeroReunion}-${hipodromo.abrev}`;

    // Agencia (sin ceros a la izquierda)
    const agente = provinciaAgencia.substring(2).replace(/^0+/, '') || '0';

    // Provincia
    const codigoProv = provinciaAgencia.substring(0, 2);
    const provinciaNombre = CODIGOS_PROVINCIA[codigoProv] || codigoProv;

    // Fecha (DDMMYYYY -> YYYY-MM-DD)
    if (fechaRaw.length < 8) return null;
    const dia = fechaRaw.substring(0, 2);
    const mes = fechaRaw.substring(2, 4);
    const anio = fechaRaw.substring(4, 8);
    const fechaSorteo = `${anio}-${mes}-${dia}`;

    // Montos
    const ventas = safeAmount(ventasRaw);
    const cancelaciones = safeAmount(cancelacionesRaw);
    const devoluciones = safeAmount(devolucionesRaw);
    const premios = safeAmount(premioRaw);

    return {
      codigoJuego,
      hipodromo,
      sorteoConcatenado,
      reunion: String(numeroReunion),
      agente,
      provincia: codigoProv,
      provinciaNombre,
      fechaSorteo,
      ventas,
      cancelaciones,
      devoluciones,
      premios
    };
  } catch (err) {
    return null;
  }
}

/**
 * Procesar archivo TXT completo
 * Agrupa por sorteo + agencia, acumula montos
 */
function procesarContenidoTXT(contenido, nombreArchivo) {
  const lines = contenido.split(/\r?\n/);
  const agencias = {};
  let lineasProcesadas = 0;
  let lineasIgnoradas = 0;

  for (const line of lines) {
    if (!line.trim()) continue;

    const parsed = parsearLinea(line);
    if (!parsed) {
      lineasIgnoradas++;
      continue;
    }

    lineasProcesadas++;
    const key = `${parsed.sorteoConcatenado}_${parsed.agente}`;

    if (!agencias[key]) {
      agencias[key] = {
        sorteo: parsed.sorteoConcatenado,
        fecha_sorteo: parsed.fechaSorteo,
        hipodromo_codigo: parsed.hipodromo.codigo,
        hipodromo_nombre: parsed.hipodromo.nombre,
        reunion: parsed.reunion,
        agency: parsed.agente,
        provincia: parsed.provincia,
        provincia_nombre: parsed.provinciaNombre,
        recaudacion_total: 0,
        importe_cancelaciones: 0,
        devoluciones: 0,
        total_premios: 0,
        archivo_origen: nombreArchivo
      };
    }

    agencias[key].recaudacion_total += parsed.ventas;
    agencias[key].importe_cancelaciones += parsed.cancelaciones;
    agencias[key].devoluciones += parsed.devoluciones;
    agencias[key].total_premios += parsed.premios;
  }

  // Redondear montos
  const registros = Object.values(agencias).map(a => ({
    ...a,
    recaudacion_total: Math.round(a.recaudacion_total * 100) / 100,
    importe_cancelaciones: Math.round(a.importe_cancelaciones * 100) / 100,
    devoluciones: Math.round(a.devoluciones * 100) / 100,
    total_premios: Math.round(a.total_premios * 100) / 100
  }));

  return {
    registros,
    lineasProcesadas,
    lineasIgnoradas,
    totalAgencias: registros.length,
    sorteosUnicos: [...new Set(registros.map(r => r.sorteo))]
  };
}

/**
 * POST /hipicas/procesar-txt
 * Recibe archivo TXT, parsea y guarda en BD
 */
const procesarTXT = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No se recibió archivo', 400);
    }

    const contenido = req.file.buffer.toString('utf-8');
    const nombreArchivo = req.file.originalname;

    // Procesar contenido
    const resultado = procesarContenidoTXT(contenido, nombreArchivo);

    if (resultado.registros.length === 0) {
      return errorResponse(res, 'No se encontraron registros válidos en el archivo', 400);
    }

    // Insertar/actualizar en BD
    let insertados = 0;
    let actualizados = 0;
    const errores = [];

    for (const reg of resultado.registros) {
      try {
        const result = await query(`
          INSERT INTO facturacion_turfito (
            sorteo, fecha_sorteo, hipodromo_codigo, hipodromo_nombre,
            reunion, agency, recaudacion_total, importe_cancelaciones,
            devoluciones, total_premios, archivo_origen, usuario_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            fecha_sorteo = VALUES(fecha_sorteo),
            hipodromo_codigo = VALUES(hipodromo_codigo),
            hipodromo_nombre = VALUES(hipodromo_nombre),
            reunion = VALUES(reunion),
            recaudacion_total = VALUES(recaudacion_total),
            importe_cancelaciones = VALUES(importe_cancelaciones),
            devoluciones = VALUES(devoluciones),
            total_premios = VALUES(total_premios),
            archivo_origen = VALUES(archivo_origen),
            updated_at = CURRENT_TIMESTAMP
        `, [
          reg.sorteo, reg.fecha_sorteo, reg.hipodromo_codigo, reg.hipodromo_nombre,
          reg.reunion, reg.agency, reg.recaudacion_total, reg.importe_cancelaciones,
          reg.devoluciones, reg.total_premios, reg.archivo_origen, req.user?.id || null
        ]);

        if (result.affectedRows === 1) {
          insertados++;
        } else if (result.affectedRows === 2) {
          actualizados++;
        }
      } catch (err) {
        if (errores.length < 5) {
          errores.push(`Sorteo ${reg.sorteo}, Agencia ${reg.agency}: ${err.message}`);
        }
      }
    }

    // Calcular totales
    const recaudacionTotal = resultado.registros.reduce((sum, r) => sum + r.recaudacion_total, 0);
    const totalPremios = resultado.registros.reduce((sum, r) => sum + r.total_premios, 0);

    return successResponse(res, {
      registros: resultado.registros,
      totalRegistros: resultado.registros.length,
      totalAgencias: resultado.totalAgencias,
      totalSorteos: resultado.sorteosUnicos.length,
      sorteosUnicos: resultado.sorteosUnicos,
      recaudacionTotal: Math.round(recaudacionTotal * 100) / 100,
      totalPremios: Math.round(totalPremios * 100) / 100,
      lineasProcesadas: resultado.lineasProcesadas,
      lineasIgnoradas: resultado.lineasIgnoradas,
      insertados,
      actualizados,
      errores: errores.length > 0 ? errores : undefined,
      archivo: nombreArchivo
    }, `Hipicas procesado: ${insertados} nuevos, ${actualizados} actualizados de ${resultado.totalAgencias} agencias`);

  } catch (error) {
    console.error('Error procesando TXT Hipicas:', error);
    return errorResponse(res, 'Error procesando archivo: ' + error.message, 500);
  }
};

/**
 * GET /hipicas/facturacion
 * Consultar facturación con filtros
 */
const obtenerFacturacion = async (req, res) => {
  try {
    const { fecha, hipodromo, sorteo, limit = 200, offset = 0 } = req.query;

    let sql = 'SELECT * FROM facturacion_turfito WHERE 1=1';
    const params = [];

    if (fecha) {
      sql += ' AND fecha_sorteo = ?';
      params.push(fecha);
    }

    if (hipodromo) {
      sql += ' AND hipodromo_codigo = ?';
      params.push(hipodromo);
    }

    if (sorteo) {
      sql += ' AND sorteo = ?';
      params.push(sorteo);
    }

    sql += ' ORDER BY fecha_sorteo DESC, sorteo ASC, agency ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const registros = await query(sql, params);

    // Contar total
    let countSql = 'SELECT COUNT(*) as total FROM facturacion_turfito WHERE 1=1';
    const countParams = [];
    if (fecha) { countSql += ' AND fecha_sorteo = ?'; countParams.push(fecha); }
    if (hipodromo) { countSql += ' AND hipodromo_codigo = ?'; countParams.push(hipodromo); }
    if (sorteo) { countSql += ' AND sorteo = ?'; countParams.push(sorteo); }

    const [{ total }] = await query(countSql, countParams);

    return successResponse(res, { registros, total });
  } catch (error) {
    console.error('Error obteniendo facturación:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * DELETE /hipicas/facturacion/:id
 */
const eliminarFacturacion = async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM facturacion_turfito WHERE id = ?', [id]);
    return successResponse(res, null, 'Registro eliminado');
  } catch (error) {
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

module.exports = {
  procesarTXT,
  obtenerFacturacion,
  eliminarFacturacion
};
