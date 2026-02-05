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
 * Posiciones corregidas basadas en archivo real:
 * - codigo_juego: 0-4 (ej: "0099" = Palermo)
 * - provincia_agencia: 4-12 (ej: "51000196" = CABA agencia 196)
 * - dato_extra: 12-20 (8 chars, ignorado)
 * - reunion: 20-22 (ej: "05" = reunión 5)
 * - fecha: 22-30 (DDMMYYYY)
 * - ventas: 30-42 (12 chars)
 * - cancelaciones: 42-54 (12 chars)
 * - devoluciones: 54-66 (12 chars)
 * - premios: 66-78 (12 chars)
 */
function parsearLinea(line, debug = false) {
  if (!line || line.length < 78) {
    if (debug) console.log('❌ Línea muy corta:', line?.length, line?.substring(0, 30));
    return null;
  }
  if (line.includes('999999999')) return null;

  try {
    const codigoJuego = line.substring(0, 4).trim();
    const provinciaAgencia = line.substring(4, 12).trim();  // Corregido: era 4-11
    const reunion = line.substring(20, 22).trim();          // Corregido: era 19-22
    const fechaRaw = line.substring(22, 30).trim();
    const ventasRaw = line.substring(30, 42);
    const cancelacionesRaw = line.substring(42, 54);
    const devolucionesRaw = line.substring(54, 66);         // Corregido: era 53-66
    const premioRaw = line.substring(66, 78);               // Corregido: era 64-78

    // Determinar hipódromo
    const hipodromo = HIPODROMOS[codigoJuego];
    if (!hipodromo) {
      if (debug) console.log('❌ Código no reconocido:', codigoJuego, '| Línea:', line.substring(0, 40));
      return null; // No es un código de hipódromo conocido
    }

    // Número de reunión y sorteo concatenado
    const numeroReunion = parseInt(reunion, 10);
    if (isNaN(numeroReunion)) {
      if (debug) console.log('❌ Reunión inválida:', reunion, '| Código:', codigoJuego);
      return null;
    }
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

  // Debug: mostrar primeras líneas para verificar formato
  console.log('📄 Procesando archivo Turfito:', nombreArchivo);
  console.log('📊 Total líneas:', lines.length);
  if (lines.length > 0) {
    console.log('📝 Primera línea (primeros 90 chars):', lines[0].substring(0, 90));
    console.log('📝 Longitud primera línea:', lines[0].length);
    // Debug parseo de primera línea
    const primeraLinea = lines[0];
    console.log('🔍 Desglose primera línea:');
    console.log('   - Código juego (0-4):', primeraLinea.substring(0, 4));
    console.log('   - Prov+Agencia (4-12):', primeraLinea.substring(4, 12));
    console.log('   - Dato extra (12-20):', primeraLinea.substring(12, 20));
    console.log('   - Reunión (20-22):', primeraLinea.substring(20, 22));
    console.log('   - Fecha (22-30):', primeraLinea.substring(22, 30));
  }

  // Contador de reuniones encontradas
  const reunionesEncontradas = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Debug las primeras 5 líneas ignoradas
    const parsed = parsearLinea(line, i < 10);
    if (!parsed) {
      lineasIgnoradas++;
      continue;
    }

    // Contar reuniones
    const reunionKey = `${parsed.hipodromo.abrev}-${parsed.reunion}`;
    reunionesEncontradas[reunionKey] = (reunionesEncontradas[reunionKey] || 0) + 1;

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

  // Log reuniones encontradas
  console.log('🏇 Reuniones encontradas:', reunionesEncontradas);
  console.log('📊 Sorteos únicos:', [...new Set(registros.map(r => r.sorteo))]);

  return {
    registros,
    lineasProcesadas,
    lineasIgnoradas,
    totalAgencias: registros.length,
    sorteosUnicos: [...new Set(registros.map(r => r.sorteo))],
    reunionesEncontradas
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

/**
 * GET /hipicas/ventas
 * Consulta de ventas agrupadas por hipódromo y reunión con filtros de fecha
 * Query params: fechaDesde, fechaHasta
 */
const obtenerVentas = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = req.query;

    let sql = `
      SELECT 
        fecha_sorteo,
        hipodromo_codigo,
        hipodromo_nombre,
        reunion,
        SUM(recaudacion_total) AS recaudacion_bruta,
        SUM(importe_cancelaciones) AS cancelaciones,
        SUM(devoluciones) AS devoluciones,
        SUM(total_premios) AS premios,
        SUM(recaudacion_total - importe_cancelaciones - devoluciones) AS total_neto,
        COUNT(DISTINCT agency) AS agencias
      FROM facturacion_turfito
      WHERE 1=1
    `;
    const params = [];

    if (fechaDesde) {
      sql += ' AND fecha_sorteo >= ?';
      params.push(fechaDesde);
    }

    if (fechaHasta) {
      sql += ' AND fecha_sorteo <= ?';
      params.push(fechaHasta);
    }

    sql += `
      GROUP BY fecha_sorteo, hipodromo_codigo, hipodromo_nombre, reunion
      ORDER BY hipodromo_nombre ASC, CAST(reunion AS UNSIGNED) ASC
    `;

    const registros = await query(sql, params);

    // Calcular totales generales
    const totales = {
      recaudacionBruta: 0,
      cancelaciones: 0,
      devoluciones: 0,
      premios: 0,
      totalNeto: 0
    };

    // Calcular totales por hipódromo
    const totalesPorHipodromo = {};

    for (const r of registros) {
      const recaudacion = parseFloat(r.recaudacion_bruta) || 0;
      const cancelaciones = parseFloat(r.cancelaciones) || 0;
      const devoluciones = parseFloat(r.devoluciones) || 0;
      const premios = parseFloat(r.premios) || 0;
      const neto = parseFloat(r.total_neto) || 0;

      totales.recaudacionBruta += recaudacion;
      totales.cancelaciones += cancelaciones;
      totales.devoluciones += devoluciones;
      totales.premios += premios;
      totales.totalNeto += neto;

      // Acumular por hipódromo
      const hip = r.hipodromo_nombre;
      if (!totalesPorHipodromo[hip]) {
        totalesPorHipodromo[hip] = {
          hipodromo: hip,
          codigo: r.hipodromo_codigo,
          reuniones: 0,
          recaudacion: 0,
          cancelaciones: 0,
          devoluciones: 0,
          premios: 0,
          neto: 0
        };
      }
      totalesPorHipodromo[hip].reuniones++;
      totalesPorHipodromo[hip].recaudacion += recaudacion;
      totalesPorHipodromo[hip].cancelaciones += cancelaciones;
      totalesPorHipodromo[hip].devoluciones += devoluciones;
      totalesPorHipodromo[hip].premios += premios;
      totalesPorHipodromo[hip].neto += neto;
    }

    return successResponse(res, { 
      registros, 
      totales,
      totalesPorHipodromo: Object.values(totalesPorHipodromo),
      filtros: { fechaDesde, fechaHasta }
    });
  } catch (error) {
    console.error('Error obteniendo ventas:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * GET /hipicas/facturacion-ute
 * Calcula la facturación UTE según el modelo del Excel
 * Constantes:
 * - TOPE: $75,000,000
 * - Porcentaje dentro del tope: 2%
 * - Porcentaje sobre el tope: 1.5%
 * - Descuento combinado (16%+5%): 20.2%
 * - IVA: 21%
 */
const calcularFacturacionUTE = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = req.query;

    // Constantes de facturación
    const TOPE = 75000000;
    const PORCENTAJE_DENTRO_TOPE = 0.02;      // 2%
    const PORCENTAJE_SOBRE_TOPE = 0.015;      // 1.5%
    const DESCUENTO_COMBINADO = 0.202;        // 20.2% (efecto de 16% + 5%)
    const IVA = 0.21;                          // 21%

    // Obtener recaudación por hipódromo (solo CABA/Capital Federal)
    let sql = `
      SELECT 
        hipodromo_nombre,
        hipodromo_codigo,
        SUM(recaudacion_total - importe_cancelaciones - devoluciones) AS recaudacion_neta
      FROM facturacion_turfito
      WHERE 1=1
    `;
    const params = [];

    if (fechaDesde) {
      sql += ' AND fecha_sorteo >= ?';
      params.push(fechaDesde);
    }

    if (fechaHasta) {
      sql += ' AND fecha_sorteo <= ?';
      params.push(fechaHasta);
    }

    sql += ' GROUP BY hipodromo_nombre, hipodromo_codigo ORDER BY hipodromo_nombre';

    const hipodromos = await query(sql, params);

    // Calcular recaudación total
    const recaudacionTotal = hipodromos.reduce((sum, h) => sum + (parseFloat(h.recaudacion_neta) || 0), 0);
    const excedente = Math.max(0, recaudacionTotal - TOPE);

    // Calcular facturación por hipódromo
    const facturacionHipodromos = hipodromos.map(h => {
      const recaudacion = parseFloat(h.recaudacion_neta) || 0;
      const participacion = recaudacionTotal > 0 ? recaudacion / recaudacionTotal : 0;
      
      // Dentro y sobre el tope
      const dentroDelTope = TOPE * participacion;
      const sobreElTope = recaudacion - dentroDelTope;

      // Importes
      const importeDentroTope = dentroDelTope * PORCENTAJE_DENTRO_TOPE;
      const descuentoDentroTope = importeDentroTope * DESCUENTO_COMBINADO;
      
      const importeSobreTope = sobreElTope * PORCENTAJE_SOBRE_TOPE;
      const descuentoSobreTope = importeSobreTope * DESCUENTO_COMBINADO;

      // Monto a facturar
      const montoAFacturar = importeDentroTope + importeSobreTope;
      const descuentoTotal = montoAFacturar * DESCUENTO_COMBINADO;
      
      // Base IVA y Total
      const baseIVA = montoAFacturar - descuentoTotal;
      const iva = baseIVA * IVA;
      const total = baseIVA + iva;

      return {
        hipodromo: h.hipodromo_nombre,
        codigo: h.hipodromo_codigo,
        recaudacion: Math.round(recaudacion * 100) / 100,
        participacion: Math.round(participacion * 10000) / 100, // %
        porcentajeOfertado: PORCENTAJE_DENTRO_TOPE * 100,
        porcentajeReduccion: PORCENTAJE_SOBRE_TOPE * 100,
        dentroDelTope: Math.round(dentroDelTope * 100) / 100,
        sobreElTope: Math.round(sobreElTope * 100) / 100,
        importeDentroTope: Math.round(importeDentroTope * 100) / 100,
        descuentoDentroTope: Math.round(descuentoDentroTope * 100) / 100,
        importeSobreTope: Math.round(importeSobreTope * 100) / 100,
        descuentoSobreTope: Math.round(descuentoSobreTope * 100) / 100,
        montoAFacturar: Math.round(montoAFacturar * 100) / 100,
        descuentoTotal: Math.round(descuentoTotal * 100) / 100,
        baseIVA: Math.round(baseIVA * 100) / 100,
        iva: Math.round(iva * 100) / 100,
        total: Math.round(total * 100) / 100
      };
    });

    // Totales de facturación
    const totalesFacturacion = facturacionHipodromos.reduce((acc, h) => ({
      recaudacion: acc.recaudacion + h.recaudacion,
      dentroDelTope: acc.dentroDelTope + h.dentroDelTope,
      sobreElTope: acc.sobreElTope + h.sobreElTope,
      importeDentroTope: acc.importeDentroTope + h.importeDentroTope,
      descuentoDentroTope: acc.descuentoDentroTope + h.descuentoDentroTope,
      importeSobreTope: acc.importeSobreTope + h.importeSobreTope,
      descuentoSobreTope: acc.descuentoSobreTope + h.descuentoSobreTope,
      montoAFacturar: acc.montoAFacturar + h.montoAFacturar,
      descuentoTotal: acc.descuentoTotal + h.descuentoTotal,
      baseIVA: acc.baseIVA + h.baseIVA,
      iva: acc.iva + h.iva,
      total: acc.total + h.total
    }), {
      recaudacion: 0, dentroDelTope: 0, sobreElTope: 0,
      importeDentroTope: 0, descuentoDentroTope: 0,
      importeSobreTope: 0, descuentoSobreTope: 0,
      montoAFacturar: 0, descuentoTotal: 0, baseIVA: 0, iva: 0, total: 0
    });

    // Mapeo de códigos SAP
    const CODIGOS_SAP = {
      'Palermo': 'LCBAJTA009',
      'San Isidro': 'LCBAJTA011',
      'La Plata': 'LCBAJTA010'
    };

    // Generar líneas para SAP (formato completo/reducido)
    const lineasSAP = [];
    facturacionHipodromos.forEach(h => {
      const codigoSAP = CODIGOS_SAP[h.hipodromo] || 'LCBAJTA000';
      // Línea completo (2% sobre parte proporcional del tope)
      lineasSAP.push({
        descripcion: `APUESTAS HIPICAS ${h.hipodromo.toUpperCase()} completo`,
        cantidad: 1,
        unidad: 'C/U',
        importe: Math.round(h.importeDentroTope * 100) / 100,
        codigoSAP: codigoSAP
      });
      // Línea reducido (1.5% sobre excedente)
      lineasSAP.push({
        descripcion: `APUESTAS HIPICAS ${h.hipodromo.toUpperCase()} reducido`,
        cantidad: 1,
        unidad: 'C/U',
        importe: Math.round(h.importeSobreTope * 100) / 100,
        codigoSAP: codigoSAP
      });
    });

    return successResponse(res, {
      periodo: { fechaDesde, fechaHasta },
      constantes: {
        tope: TOPE,
        porcentajeDentroTope: PORCENTAJE_DENTRO_TOPE * 100,
        porcentajeSobreTope: PORCENTAJE_SOBRE_TOPE * 100,
        descuentoCombinado: DESCUENTO_COMBINADO * 100,
        iva: IVA * 100
      },
      recaudacionTotal: Math.round(recaudacionTotal * 100) / 100,
      topeEstipulado: TOPE,
      excedenteSobreTope: Math.round(excedente * 100) / 100,
      hipodromos: facturacionHipodromos,
      lineasSAP: lineasSAP,
      totales: {
        recaudacion: Math.round(totalesFacturacion.recaudacion * 100) / 100,
        dentroDelTope: Math.round(totalesFacturacion.dentroDelTope * 100) / 100,
        sobreElTope: Math.round(totalesFacturacion.sobreElTope * 100) / 100,
        importeDentroTope: Math.round(totalesFacturacion.importeDentroTope * 100) / 100,
        descuentoDentroTope: Math.round(totalesFacturacion.descuentoDentroTope * 100) / 100,
        importeSobreTope: Math.round(totalesFacturacion.importeSobreTope * 100) / 100,
        descuentoSobreTope: Math.round(totalesFacturacion.descuentoSobreTope * 100) / 100,
        montoAFacturar: Math.round(totalesFacturacion.montoAFacturar * 100) / 100,
        descuentoTotal: Math.round(totalesFacturacion.descuentoTotal * 100) / 100,
        baseIVA: Math.round(totalesFacturacion.baseIVA * 100) / 100,
        iva: Math.round(totalesFacturacion.iva * 100) / 100,
        total: Math.round(totalesFacturacion.total * 100) / 100
      }
    }, 'Facturación UTE calculada');
  } catch (error) {
    console.error('Error calculando facturación UTE:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

module.exports = {
  procesarTXT,
  obtenerFacturacion,
  eliminarFacturacion,
  obtenerVentas,
  calcularFacturacionUTE
};
