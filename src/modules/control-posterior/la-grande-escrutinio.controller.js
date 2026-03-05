'use strict';

const { query } = require('../../config/database');
const { successResponse, errorResponse } = require('../../shared/helpers');
const { guardarPremiosPorAgencia } = require('../../shared/escrutinio.helper');
const { calcularCombinaciones } = require('../control-previo/quini6.controller');

function normalizarFecha(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function obtenerNumerosExtracto(extracto = {}) {
  if (Array.isArray(extracto.numeros)) return extracto.numeros.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
  if (Array.isArray(extracto.tradicional?.primera)) {
    return extracto.tradicional.primera.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
  }
  if (Array.isArray(extracto.tradicionalPrimera)) {
    return extracto.tradicionalPrimera.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
  }
  return [];
}

function contarAciertos(numerosJugados, numerosGanadores) {
  const setGanadores = new Set(numerosGanadores);
  let aciertos = 0;
  for (const n of (numerosJugados || [])) {
    if (setGanadores.has(n)) aciertos++;
  }
  return aciertos;
}

function calcularGanadoresMultiples(totalNumeros, aciertos, nivelPremio) {
  if (aciertos < nivelPremio || totalNumeros < 6) return 0;
  const noAciertos = totalNumeros - aciertos;
  const faltantes = 6 - nivelPremio;
  return calcularCombinaciones(aciertos, nivelPremio) * calcularCombinaciones(noAciertos, faltantes);
}

function premioDesdeInput(nivel, datosControlPrevio = {}, payloadPremios = {}) {
  const direct = Number(payloadPremios?.[nivel] || 0);
  if (direct > 0) return direct;

  const premios = datosControlPrevio?.datosOficiales?.premios || {};
  const key = nivel === 6 ? 'primerPremio' : (nivel === 5 ? 'segundoPremio' : 'tercerPremio');
  const total = Number(premios?.[key]?.totales || 0);
  const gan = Number(premios?.[key]?.ganadores || 0);
  if (total > 0 && gan > 0) return total / gan;
  return 0;
}

function runScrutiny(registros = [], extracto = {}, datosControlPrevio = {}, payloadPremios = {}) {
  const numerosGanadores = obtenerNumerosExtracto(extracto);

  const resultado = {
    sorteo: datosControlPrevio?.numeroSorteo || datosControlPrevio?.sorteo || null,
    fecha: datosControlPrevio?.fecha || datosControlPrevio?.fechaSorteo || null,
    juego: 'la_grande',
    extracto: {
      tradicionalPrimera: numerosGanadores,
      tradicionalSegunda: [],
      revancha: [],
      siempreSale: [],
      premioExtra: []
    },
    resumen: {
      totalRegistros: 0,
      registrosValidos: 0,
      registrosCancelados: 0,
      totalApuestasSimples: 0,
      recaudacionTotal: 0
    },
    ganadores: {
      tradicionalPrimera: {
        '6': { cantidad: 0, premioUnitario: 0, premioTotal: 0, registros: [] },
        '5': { cantidad: 0, premioUnitario: 0, premioTotal: 0, registros: [] },
        '4': { cantidad: 0, premioUnitario: 0, premioTotal: 0, registros: [] }
      },
      tradicionalSegunda: {
        '6': { cantidad: 0, premioUnitario: 0, premioTotal: 0, registros: [] },
        '5': { cantidad: 0, premioUnitario: 0, premioTotal: 0, registros: [] },
        '4': { cantidad: 0, premioUnitario: 0, premioTotal: 0, registros: [] }
      },
      revancha: { '6': { cantidad: 0, premioUnitario: 0, premioTotal: 0, registros: [] } },
      siempreSale: { cantidad: 0, aciertosRequeridos: 6, premioUnitario: 0, premioTotal: 0, registros: [] },
      premioExtra: { '6': { cantidad: 0, premioUnitario: 0, premioTotal: 0, registros: [] } }
    },
    porAgencia: [],
    totalGanadores: 0,
    totalPremios: 0
  };

  const porAgenciaMap = {};

  for (const reg of registros) {
    resultado.resumen.totalRegistros++;

    if (reg.cancelado || reg.isCanceled) {
      resultado.resumen.registrosCancelados++;
      continue;
    }

    resultado.resumen.registrosValidos++;
    resultado.resumen.totalApuestasSimples += 1;
    resultado.resumen.recaudacionTotal += Number(reg.valorRealApuesta || reg.importe || 0);

    const agencia = String(reg.ctaCte || reg.agenciaCompleta || `${reg.provincia || '51'}${String(reg.agencia || '').padStart(5, '0')}`);
    const provincia = String(reg.provincia || agencia.substring(0, 2) || '51').padStart(2, '0');
    const agenciaCorta = String(reg.agencia || agencia.slice(-5)).padStart(5, '0');

    if (!porAgenciaMap[agencia]) {
      porAgenciaMap[agencia] = {
        provincia,
        agencia: agenciaCorta,
        ctaCte: agencia,
        registros: 0,
        recaudacion: 0,
        premiosTotales: 0,
        ganadores: {
          tradicionalPrimera: { '6': 0, '5': 0, '4': 0 },
          tradicionalSegunda: { '6': 0, '5': 0, '4': 0 },
          revancha: 0,
          siempreSale: 0,
          premioExtra: 0
        }
      };
    }

    const ag = porAgenciaMap[agencia];
    ag.registros++;
    ag.recaudacion += Number(reg.valorRealApuesta || reg.importe || 0);

    const numerosJugados = Array.isArray(reg.numerosJugados)
      ? reg.numerosJugados.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n))
      : [];

    if (numerosJugados.length < 6 || numerosGanadores.length < 6) continue;

    const aciertos = contarAciertos(numerosJugados, numerosGanadores);
    const cantidadNumeros = parseInt(reg.cantidadNumeros || numerosJugados.length, 10) || numerosJugados.length;

    for (const nivel of [6, 5, 4]) {
      if (aciertos < nivel) continue;

      let ganadoresNivel = 0;
      if (cantidadNumeros === 6) {
        ganadoresNivel = aciertos === nivel ? 1 : 0;
      } else {
        ganadoresNivel = calcularGanadoresMultiples(cantidadNumeros, aciertos, nivel);
      }

      if (ganadoresNivel <= 0) continue;

      const nivelKey = String(nivel);
      const premioUnitario = premioDesdeInput(nivel, datosControlPrevio, payloadPremios);
      const premioTotal = premioUnitario * ganadoresNivel;

      resultado.ganadores.tradicionalPrimera[nivelKey].cantidad += ganadoresNivel;
      resultado.ganadores.tradicionalPrimera[nivelKey].premioUnitario = premioUnitario;
      resultado.ganadores.tradicionalPrimera[nivelKey].premioTotal += premioTotal;
      resultado.ganadores.tradicionalPrimera[nivelKey].registros.push({
        ticket: reg.ticket || reg.numeroTicket || '',
        agencia,
        aciertos,
        ganadores: ganadoresNivel,
        premio: premioTotal,
        numerosJugados
      });

      ag.ganadores.tradicionalPrimera[nivelKey] += ganadoresNivel;
      ag.premiosTotales += premioTotal;
    }
  }

  resultado.porAgencia = Object.values(porAgenciaMap);

  for (const nivel of ['6', '5', '4']) {
    resultado.totalGanadores += resultado.ganadores.tradicionalPrimera[nivel].cantidad || 0;
    resultado.totalPremios += resultado.ganadores.tradicionalPrimera[nivel].premioTotal || 0;
  }

  return resultado;
}

async function guardarEscrutinioLaGrandeDB(resultados, user) {
  const sorteo = parseInt(resultados?.sorteo, 10) || 0;
  const fecha = normalizarFecha(resultados?.fecha) || new Date().toISOString().slice(0, 10);

  await query(`
    INSERT INTO escrutinio_la_grande
      (numero_sorteo, fecha, numeros_tradicional, total_apostadores, total_ganadores,
       total_premios, datos_json, usuario_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      fecha = VALUES(fecha),
      numeros_tradicional = VALUES(numeros_tradicional),
      total_apostadores = VALUES(total_apostadores),
      total_ganadores = VALUES(total_ganadores),
      total_premios = VALUES(total_premios),
      datos_json = VALUES(datos_json),
      usuario_id = VALUES(usuario_id),
      updated_at = CURRENT_TIMESTAMP
  `, [
    sorteo,
    fecha,
    (resultados.extracto?.tradicionalPrimera || []).join(','),
    resultados.resumen?.totalApuestasSimples || 0,
    resultados.totalGanadores || 0,
    resultados.totalPremios || 0,
    JSON.stringify(resultados),
    user?.id || null
  ]);

  const [row] = await query('SELECT id FROM escrutinio_la_grande WHERE numero_sorteo = ? ORDER BY id DESC LIMIT 1', [sorteo]);
  const escrutinioId = row?.id;
  if (!escrutinioId) return;

  await query('DELETE FROM escrutinio_la_grande_ganadores WHERE escrutinio_id = ?', [escrutinioId]);

  for (const nivel of ['6', '5', '4']) {
    const data = resultados.ganadores?.tradicionalPrimera?.[nivel];
    if (!data || Number(data.cantidad || 0) <= 0) continue;

    await query(`
      INSERT INTO escrutinio_la_grande_ganadores
        (escrutinio_id, numero_sorteo, nivel_aciertos, cantidad_ganadores, premio_unitario, premio_total)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      escrutinioId,
      sorteo,
      parseInt(nivel, 10),
      Number(data.cantidad || 0),
      Number(data.premioUnitario || 0),
      Number(data.premioTotal || 0)
    ]);
  }

  await query('DELETE FROM escrutinio_premios_agencia WHERE escrutinio_id = ? AND juego = ?', [escrutinioId, 'la_grande']);

  const ganadoresDetalle = [];
  for (const ag of (resultados.porAgencia || [])) {
    const cta = ag.ctaCte || `${ag.provincia}${String(ag.agencia || '').padStart(5, '0')}`;
    const g = ag.ganadores?.tradicionalPrimera || {};

    for (const nivel of ['6', '5', '4']) {
      const cant = Number(g[nivel] || 0);
      const premioUnit = Number(resultados.ganadores?.tradicionalPrimera?.[nivel]?.premioUnitario || 0);
      for (let i = 0; i < cant; i++) {
        ganadoresDetalle.push({ agencia: cta, premio: premioUnit });
      }
    }
  }

  if (ganadoresDetalle.length > 0) {
    await guardarPremiosPorAgencia(escrutinioId, 'la_grande', ganadoresDetalle);
  }
}

async function ejecutar(req, res) {
  try {
    const registros = Array.isArray(req.body?.registros)
      ? req.body.registros
      : (Array.isArray(req.body?.registrosNTF) ? req.body.registrosNTF : []);

    const extracto = req.body?.extracto || {};
    const datosControlPrevio = req.body?.datosControlPrevio || {};
    const premios = req.body?.premios || {};

    const numeros = obtenerNumerosExtracto(extracto);
    if (registros.length === 0) {
      return errorResponse(res, 'No hay registros NTF para escrutar', 400);
    }
    if (numeros.length < 6) {
      return errorResponse(res, 'Extracto incompleto para La Grande: se requieren 6 números', 400);
    }

    const resultados = runScrutiny(registros, extracto, datosControlPrevio, premios);
    resultados.sorteo = resultados.sorteo || datosControlPrevio?.numeroSorteo || datosControlPrevio?.sorteo || null;
    resultados.fecha = normalizarFecha(resultados.fecha || datosControlPrevio?.fecha || datosControlPrevio?.fechaSorteo) || new Date().toISOString().slice(0, 10);

    try {
      await guardarEscrutinioLaGrandeDB(resultados, req.user);
      resultados.resguardo = { success: true };
    } catch (saveErr) {
      console.error('⚠️ Error guardando escrutinio La Grande:', saveErr.message);
      resultados.resguardo = { success: false, error: saveErr.message };
    }

    return successResponse(res, resultados, 'Escrutinio La Grande completado correctamente');
  } catch (error) {
    console.error('Error en escrutinio La Grande:', error);
    return errorResponse(res, `Error ejecutando escrutinio La Grande: ${error.message}`, 500);
  }
}

module.exports = {
  ejecutar,
  runScrutiny,
  contarAciertos,
  calcularGanadoresMultiples
};
