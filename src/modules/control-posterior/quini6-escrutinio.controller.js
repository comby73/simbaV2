'use strict';

/**
 * QUINI 6 Escrutinio Controller - Control Posterior
 * Ejecuta el escrutinio de QUINI 6 comparando apuestas NTF vs extracto oficial
 * 
 * Modalidades:
 * - Tradicional Primera: 6/5/4 aciertos
 * - Tradicional Segunda: 6/5/4 aciertos
 * - Revancha: 6 aciertos
 * - Siempre Sale: aciertos variables (siempre hay ganador)
 * - Premio Extra: 6 números adicionales
 */

const path = require('path');
const fs = require('fs');
const { query } = require('../../config/database');
const { successResponse, errorResponse, formatNumber } = require('../../shared/helpers');
const { 
  decodificarNumerosQuini6, 
  calcularCombinaciones, 
  COMBINACIONES_QUINI6,
  INSTANCIAS_QUINI6
} = require('../control-previo/quini6.controller');

// ============================================================
// FUNCIONES DE ESCRUTINIO
// ============================================================

/**
 * Cuenta cuántos aciertos tiene un conjunto de números jugados vs los ganadores
 */
function contarAciertos(numerosJugados, numerosGanadores) {
  const setGanadores = new Set(numerosGanadores);
  let aciertos = 0;
  for (const num of numerosJugados) {
    if (setGanadores.has(num)) {
      aciertos++;
    }
  }
  return aciertos;
}

/**
 * Calcula ganadores para apuestas múltiples (más de 6 números)
 * Usa combinatoria C(aciertos, nivel) * C(no_aciertos, 6-nivel)
 */
function calcularGanadoresMultiples(totalNumeros, aciertos, nivelPremio) {
  if (aciertos < nivelPremio) return 0;
  if (totalNumeros < 6) return 0;
  
  const noAciertos = totalNumeros - aciertos;
  const faltantes = 6 - nivelPremio;
  
  // C(aciertos, nivelPremio) * C(noAciertos, 6 - nivelPremio)
  const combinacionesAciertos = calcularCombinaciones(aciertos, nivelPremio);
  const combinacionesNoAciertos = calcularCombinaciones(noAciertos, faltantes);
  
  return combinacionesAciertos * combinacionesNoAciertos;
}

/**
 * Ejecuta el escrutinio completo de QUINI 6
 */
async function runScrutiny(registros, extracto) {
  const resultados = {
    sorteo: extracto.sorteo || null,
    fechaEscrutinio: new Date().toISOString(),
    
    // Números del extracto
    extracto: {
      tradicional: {
        primera: extracto.tradicional?.primera || [],
        segunda: extracto.tradicional?.segunda || []
      },
      revancha: extracto.revancha || [],
      siempreSale: extracto.siempreSale || [],
      siempreSaleAciertosRequeridos: extracto.siempreSaleAciertos || 6,
      premioExtra: extracto.premioExtra || []
    },
    
    // Resumen general
    resumen: {
      totalRegistros: 0,
      registrosValidos: 0,
      registrosCancelados: 0,
      totalApuestasSimples: 0,
      recaudacionTotal: 0
    },
    
    // Ganadores por modalidad
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
      revancha: {
        '6': { cantidad: 0, premioUnitario: 0, premioTotal: 0, registros: [] }
      },
      siempreSale: {
        cantidad: 0,
        aciertosRequeridos: extracto.siempreSaleAciertos || 6,
        premioUnitario: 0,
        premioTotal: 0,
        registros: []
      },
      premioExtra: {
        '6': { cantidad: 0, premioUnitario: 0, premioTotal: 0, registros: [] }
      }
    },
    
    // Estadísticas por agencia
    porAgencia: {},
    
    // Estadísticas por instancia
    porInstancia: {
      '1': { registros: 0, recaudacion: 0, ganadores: 0 },
      '2': { registros: 0, recaudacion: 0, ganadores: 0 },
      '3': { registros: 0, recaudacion: 0, ganadores: 0 }
    }
  };
  
  // Números ganadores
  const numsTradPrimera = resultados.extracto.tradicional.primera;
  const numsTradSegunda = resultados.extracto.tradicional.segunda;
  const numsRevancha = resultados.extracto.revancha;
  const numsSiempreSale = resultados.extracto.siempreSale;
  const numsPremioExtra = resultados.extracto.premioExtra;
  const ssAciertosRequeridos = resultados.extracto.siempreSaleAciertosRequeridos;
  
  // Procesar cada registro
  for (const registro of registros) {
    resultados.resumen.totalRegistros++;
    
    if (registro.cancelado) {
      resultados.resumen.registrosCancelados++;
      continue;
    }
    
    resultados.resumen.registrosValidos++;
    resultados.resumen.totalApuestasSimples += registro.apuestasSimples || 1;
    resultados.resumen.recaudacionTotal += registro.valorRealApuesta || 0;
    
    const numerosJugados = registro.numerosJugados || [];
    const cantidadNumeros = registro.cantidadNumeros || numerosJugados.length;
    const instancia = registro.instancias || '1';
    const agenciaKey = registro.ctaCte || `${registro.provincia}-${registro.agencia}`;
    
    // Estadísticas por instancia
    if (resultados.porInstancia[instancia]) {
      resultados.porInstancia[instancia].registros++;
      resultados.porInstancia[instancia].recaudacion += registro.valorRealApuesta || 0;
    }
    
    // Inicializar agencia si no existe
    if (!resultados.porAgencia[agenciaKey]) {
      resultados.porAgencia[agenciaKey] = {
        provincia: registro.provincia,
        agencia: registro.agencia,
        registros: 0,
        recaudacion: 0,
        ganadores: {
          tradicionalPrimera: { '6': 0, '5': 0, '4': 0 },
          tradicionalSegunda: { '6': 0, '5': 0, '4': 0 },
          revancha: 0,
          siempreSale: 0,
          premioExtra: 0
        },
        premiosTotales: 0
      };
    }
    resultados.porAgencia[agenciaKey].registros++;
    resultados.porAgencia[agenciaKey].recaudacion += registro.valorRealApuesta || 0;
    
    let esGanador = false;
    
    // ===========================================
    // TRADICIONAL PRIMERA (instancias 1, 2, 3)
    // ===========================================
    if (numsTradPrimera.length === 6) {
      const aciertos = contarAciertos(numerosJugados, numsTradPrimera);
      
      for (const nivel of [6, 5, 4]) {
        if (aciertos >= nivel) {
          let cantidadGanadores;
          
          if (cantidadNumeros === 6) {
            // Apuesta simple
            cantidadGanadores = aciertos === nivel ? 1 : 0;
          } else {
            // Apuesta múltiple
            cantidadGanadores = calcularGanadoresMultiples(cantidadNumeros, aciertos, nivel);
          }
          
          if (cantidadGanadores > 0) {
            resultados.ganadores.tradicionalPrimera[nivel.toString()].cantidad += cantidadGanadores;
            resultados.ganadores.tradicionalPrimera[nivel.toString()].registros.push({
              linea: registro.linea,
              ticket: registro.ticket,
              agencia: agenciaKey,
              numerosJugados,
              aciertos,
              ganadores: cantidadGanadores
            });
            
            resultados.porAgencia[agenciaKey].ganadores.tradicionalPrimera[nivel.toString()] += cantidadGanadores;
            esGanador = true;
          }
        }
      }
    }
    
    // ===========================================
    // TRADICIONAL SEGUNDA (instancias 1, 2, 3)
    // ===========================================
    if (numsTradSegunda.length === 6) {
      const aciertos = contarAciertos(numerosJugados, numsTradSegunda);
      
      for (const nivel of [6, 5, 4]) {
        if (aciertos >= nivel) {
          let cantidadGanadores;
          
          if (cantidadNumeros === 6) {
            cantidadGanadores = aciertos === nivel ? 1 : 0;
          } else {
            cantidadGanadores = calcularGanadoresMultiples(cantidadNumeros, aciertos, nivel);
          }
          
          if (cantidadGanadores > 0) {
            resultados.ganadores.tradicionalSegunda[nivel.toString()].cantidad += cantidadGanadores;
            resultados.ganadores.tradicionalSegunda[nivel.toString()].registros.push({
              linea: registro.linea,
              ticket: registro.ticket,
              agencia: agenciaKey,
              numerosJugados,
              aciertos,
              ganadores: cantidadGanadores
            });
            
            resultados.porAgencia[agenciaKey].ganadores.tradicionalSegunda[nivel.toString()] += cantidadGanadores;
            esGanador = true;
          }
        }
      }
    }
    
    // ===========================================
    // REVANCHA (solo instancias 2, 3)
    // ===========================================
    if ((instancia === '2' || instancia === '3') && numsRevancha.length === 6) {
      const aciertos = contarAciertos(numerosJugados, numsRevancha);
      
      if (aciertos >= 6) {
        let cantidadGanadores;
        
        if (cantidadNumeros === 6) {
          cantidadGanadores = 1;
        } else {
          cantidadGanadores = calcularGanadoresMultiples(cantidadNumeros, aciertos, 6);
        }
        
        if (cantidadGanadores > 0) {
          resultados.ganadores.revancha['6'].cantidad += cantidadGanadores;
          resultados.ganadores.revancha['6'].registros.push({
            linea: registro.linea,
            ticket: registro.ticket,
            agencia: agenciaKey,
            numerosJugados,
            aciertos,
            ganadores: cantidadGanadores
          });
          
          resultados.porAgencia[agenciaKey].ganadores.revancha += cantidadGanadores;
          esGanador = true;
        }
      }
    }
    
    // ===========================================
    // SIEMPRE SALE (solo instancia 3)
    // ===========================================
    if (instancia === '3' && numsSiempreSale.length === 6) {
      const aciertos = contarAciertos(numerosJugados, numsSiempreSale);
      
      if (aciertos >= ssAciertosRequeridos) {
        let cantidadGanadores;
        
        if (cantidadNumeros === 6) {
          cantidadGanadores = 1;
        } else {
          cantidadGanadores = calcularGanadoresMultiples(cantidadNumeros, aciertos, ssAciertosRequeridos);
        }
        
        if (cantidadGanadores > 0) {
          resultados.ganadores.siempreSale.cantidad += cantidadGanadores;
          resultados.ganadores.siempreSale.registros.push({
            linea: registro.linea,
            ticket: registro.ticket,
            agencia: agenciaKey,
            numerosJugados,
            aciertos,
            ganadores: cantidadGanadores
          });
          
          resultados.porAgencia[agenciaKey].ganadores.siempreSale += cantidadGanadores;
          esGanador = true;
        }
      }
    }
    
    // ===========================================
    // PREMIO EXTRA (todas las instancias si aplica)
    // ===========================================
    if (numsPremioExtra.length === 6) {
      const aciertos = contarAciertos(numerosJugados, numsPremioExtra);
      
      if (aciertos === 6) {
        let cantidadGanadores;
        
        if (cantidadNumeros === 6) {
          cantidadGanadores = 1;
        } else {
          cantidadGanadores = calcularGanadoresMultiples(cantidadNumeros, aciertos, 6);
        }
        
        if (cantidadGanadores > 0) {
          resultados.ganadores.premioExtra['6'].cantidad += cantidadGanadores;
          resultados.ganadores.premioExtra['6'].registros.push({
            linea: registro.linea,
            ticket: registro.ticket,
            agencia: agenciaKey,
            numerosJugados,
            aciertos,
            ganadores: cantidadGanadores
          });
          
          resultados.porAgencia[agenciaKey].ganadores.premioExtra += cantidadGanadores;
          esGanador = true;
        }
      }
    }
    
    // Marcar en estadísticas de instancia
    if (esGanador && resultados.porInstancia[instancia]) {
      resultados.porInstancia[instancia].ganadores++;
    }
  }
  
  // ===========================================
  // ASIGNAR PREMIOS DEL EXTRACTO JSON
  // ===========================================
  
  // Tradicional Primera - premios por nivel
  const premiosPrimera = extracto.tradicional?.premiosPrimera || {};
  for (const nivel of ['6', '5', '4']) {
    const nivelKey = nivel === '6' ? '1' : (nivel === '5' ? '2' : '3');
    const premioInfo = premiosPrimera[nivelKey] || {};
    resultados.ganadores.tradicionalPrimera[nivel].premioUnitario = 
      parseFloat(premioInfo.premio_por_ganador || premioInfo.premioUnitario || 0);
    resultados.ganadores.tradicionalPrimera[nivel].ganadoresExtracto = 
      parseInt(premioInfo.winners || premioInfo.ganadores || 0);
    resultados.ganadores.tradicionalPrimera[nivel].premioTotal = 
      resultados.ganadores.tradicionalPrimera[nivel].cantidad * 
      resultados.ganadores.tradicionalPrimera[nivel].premioUnitario;
  }
  
  // Tradicional Segunda - premios por nivel
  const premiosSegunda = extracto.tradicional?.premiosSegunda || {};
  for (const nivel of ['6', '5', '4']) {
    const nivelKey = nivel === '6' ? '1' : (nivel === '5' ? '2' : '3');
    const premioInfo = premiosSegunda[nivelKey] || {};
    resultados.ganadores.tradicionalSegunda[nivel].premioUnitario = 
      parseFloat(premioInfo.premio_por_ganador || premioInfo.premioUnitario || 0);
    resultados.ganadores.tradicionalSegunda[nivel].ganadoresExtracto = 
      parseInt(premioInfo.winners || premioInfo.ganadores || 0);
    resultados.ganadores.tradicionalSegunda[nivel].premioTotal = 
      resultados.ganadores.tradicionalSegunda[nivel].cantidad * 
      resultados.ganadores.tradicionalSegunda[nivel].premioUnitario;
  }
  
  // Revancha - solo 6 aciertos
  const premiosRevancha = extracto.revanchaPremios || {};
  const premioRevanchaInfo = premiosRevancha['1'] || {};
  resultados.ganadores.revancha['6'].premioUnitario = 
    parseFloat(premioRevanchaInfo.premio_por_ganador || premioRevanchaInfo.premioUnitario || 0);
  resultados.ganadores.revancha['6'].ganadoresExtracto = 
    parseInt(premioRevanchaInfo.winners || premioRevanchaInfo.ganadores || 0);
  resultados.ganadores.revancha['6'].premioTotal = 
    resultados.ganadores.revancha['6'].cantidad * 
    resultados.ganadores.revancha['6'].premioUnitario;
  
  // Siempre Sale
  const premiosSiempreSale = extracto.siempreSalePremios || {};
  const premioSSInfo = premiosSiempreSale['1'] || {};
  resultados.ganadores.siempreSale.premioUnitario = 
    parseFloat(premioSSInfo.premio_por_ganador || premioSSInfo.premioUnitario || 0);
  resultados.ganadores.siempreSale.ganadoresExtracto = 
    parseInt(premioSSInfo.winners || premioSSInfo.ganadores || 0);
  resultados.ganadores.siempreSale.premioTotal = 
    resultados.ganadores.siempreSale.cantidad * 
    resultados.ganadores.siempreSale.premioUnitario;
  
  // Premio Extra
  const premiosPremioExtra = extracto.premioExtraPremios || {};
  const premioExtraInfo = premiosPremioExtra['1'] || {};
  resultados.ganadores.premioExtra['6'].premioUnitario = 
    parseFloat(premioExtraInfo.premio_por_ganador || premioExtraInfo.premioUnitario || 0);
  resultados.ganadores.premioExtra['6'].ganadoresExtracto = 
    parseInt(premioExtraInfo.winners || premioExtraInfo.ganadores || 0);
  resultados.ganadores.premioExtra['6'].premioTotal = 
    resultados.ganadores.premioExtra['6'].cantidad * 
    resultados.ganadores.premioExtra['6'].premioUnitario;
  
  // Calcular totales
  let totalGanadoresTXT = 0;
  let totalGanadoresExtracto = 0;
  let totalPremios = 0;
  
  // Sumar tradicional primera
  for (const nivel of ['6', '5', '4']) {
    totalGanadoresTXT += resultados.ganadores.tradicionalPrimera[nivel].cantidad;
    totalGanadoresExtracto += resultados.ganadores.tradicionalPrimera[nivel].ganadoresExtracto || 0;
    totalPremios += resultados.ganadores.tradicionalPrimera[nivel].premioTotal;
  }
  
  // Sumar tradicional segunda
  for (const nivel of ['6', '5', '4']) {
    totalGanadoresTXT += resultados.ganadores.tradicionalSegunda[nivel].cantidad;
    totalGanadoresExtracto += resultados.ganadores.tradicionalSegunda[nivel].ganadoresExtracto || 0;
    totalPremios += resultados.ganadores.tradicionalSegunda[nivel].premioTotal;
  }
  
  // Sumar revancha
  totalGanadoresTXT += resultados.ganadores.revancha['6'].cantidad;
  totalGanadoresExtracto += resultados.ganadores.revancha['6'].ganadoresExtracto || 0;
  totalPremios += resultados.ganadores.revancha['6'].premioTotal;
  
  // Sumar siempre sale
  totalGanadoresTXT += resultados.ganadores.siempreSale.cantidad;
  totalGanadoresExtracto += resultados.ganadores.siempreSale.ganadoresExtracto || 0;
  totalPremios += resultados.ganadores.siempreSale.premioTotal;
  
  // Sumar premio extra
  totalGanadoresTXT += resultados.ganadores.premioExtra['6'].cantidad;
  totalGanadoresExtracto += resultados.ganadores.premioExtra['6'].ganadoresExtracto || 0;
  totalPremios += resultados.ganadores.premioExtra['6'].premioTotal;
  
  resultados.totales = {
    ganadoresTXT: totalGanadoresTXT,
    ganadoresExtracto: totalGanadoresExtracto,
    premiosTotales: totalPremios
  };
  
  // Estructura de comparación para el frontend (como BRINCO)
  resultados.comparacion = {
    tradicionalPrimera: {},
    tradicionalSegunda: {},
    revancha: {},
    siempreSale: {},
    premioExtra: {}
  };
  
  // Comparación Tradicional Primera
  for (const nivel of ['6', '5', '4']) {
    const data = resultados.ganadores.tradicionalPrimera[nivel];
    resultados.comparacion.tradicionalPrimera[nivel] = {
      txt: data.cantidad,
      extracto: data.ganadoresExtracto || 0,
      diferencia: data.cantidad - (data.ganadoresExtracto || 0),
      premioUnitario: data.premioUnitario,
      premioTotal: data.premioTotal
    };
  }
  
  // Comparación Tradicional Segunda
  for (const nivel of ['6', '5', '4']) {
    const data = resultados.ganadores.tradicionalSegunda[nivel];
    resultados.comparacion.tradicionalSegunda[nivel] = {
      txt: data.cantidad,
      extracto: data.ganadoresExtracto || 0,
      diferencia: data.cantidad - (data.ganadoresExtracto || 0),
      premioUnitario: data.premioUnitario,
      premioTotal: data.premioTotal
    };
  }
  
  // Comparación Revancha
  const revanchaData = resultados.ganadores.revancha['6'];
  resultados.comparacion.revancha['6'] = {
    txt: revanchaData.cantidad,
    extracto: revanchaData.ganadoresExtracto || 0,
    diferencia: revanchaData.cantidad - (revanchaData.ganadoresExtracto || 0),
    premioUnitario: revanchaData.premioUnitario,
    premioTotal: revanchaData.premioTotal
  };
  
  // Comparación Siempre Sale
  const ssData = resultados.ganadores.siempreSale;
  resultados.comparacion.siempreSale = {
    aciertosRequeridos: ssData.aciertosRequeridos,
    txt: ssData.cantidad,
    extracto: ssData.ganadoresExtracto || 0,
    diferencia: ssData.cantidad - (ssData.ganadoresExtracto || 0),
    premioUnitario: ssData.premioUnitario,
    premioTotal: ssData.premioTotal
  };
  
  // Comparación Premio Extra
  const extraData = resultados.ganadores.premioExtra['6'];
  resultados.comparacion.premioExtra['6'] = {
    txt: extraData.cantidad,
    extracto: extraData.ganadoresExtracto || 0,
    diferencia: extraData.cantidad - (extraData.ganadoresExtracto || 0),
    premioUnitario: extraData.premioUnitario,
    premioTotal: extraData.premioTotal
  };
  
  // Convertir porAgencia a array ordenado por recaudación
  resultados.porAgencia = Object.entries(resultados.porAgencia)
    .map(([key, value]) => ({ ctaCte: key, ...value }))
    .sort((a, b) => b.recaudacion - a.recaudacion);
  
  return resultados;
}

// ============================================================
// CONTROLADORES HTTP
// ============================================================

/**
 * Ejecutar escrutinio de QUINI 6
 * POST /api/control-posterior/quini6/escrutinio
 */
async function ejecutar(req, res) {
  try {
    const { registros, extracto } = req.body;
    
    if (!registros || !Array.isArray(registros) || registros.length === 0) {
      return errorResponse(res, 'No se proporcionaron registros para escrutar', 400);
    }
    
    if (!extracto) {
      return errorResponse(res, 'No se proporcionó el extracto oficial', 400);
    }
    
    // Validar extracto
    const tradicionalPrimera = extracto.tradicional?.primera || extracto.tradicional?.primer?.numbers || [];
    const tradicionalSegunda = extracto.tradicional?.segunda?.numbers || extracto.tradicional?.segunda || [];
    const revancha = extracto.revancha?.numbers || extracto.revancha || [];
    const siempreSale = extracto.siempreSale?.numbers || extracto.siempre_sale?.numbers || extracto.siempreSale || [];
    const premioExtra = extracto.premioExtra?.numbers || extracto.premio_extra?.numbers || extracto.premioExtra || [];
    const ssAciertos = extracto.siempreSaleAciertos || extracto.siempre_sale?.winning_hits || 6;
    
    if (tradicionalPrimera.length !== 6) {
      return errorResponse(res, 'El extracto de Tradicional Primera debe tener 6 números', 400);
    }
    
    // Normalizar extracto incluyendo premios
    const extractoNormalizado = {
      sorteo: extracto.sorteo,
      tradicional: {
        primera: tradicionalPrimera.map(n => parseInt(n)),
        segunda: tradicionalSegunda.map(n => parseInt(n)),
        // Premios del extracto
        premiosPrimera: extracto.tradicional?.primer?.prizes || extracto.tradicional?.primera?.prizes || {},
        premiosSegunda: extracto.tradicional?.segunda?.prizes || {}
      },
      revancha: revancha.map(n => parseInt(n)),
      revanchaPremios: extracto.revancha?.prizes || {},
      siempreSale: siempreSale.map(n => parseInt(n)),
      siempreSaleAciertos: parseInt(ssAciertos),
      siempreSalePremios: extracto.siempreSale?.prizes || extracto.siempre_sale?.prizes || {},
      premioExtra: premioExtra.map(n => parseInt(n)),
      premioExtraPremios: extracto.premioExtra?.prizes || extracto.premio_extra?.prizes || {}
    };
    
    // Ejecutar escrutinio
    const resultados = await runScrutiny(registros, extractoNormalizado);
    
    return successResponse(res, resultados, 'Escrutinio de QUINI 6 ejecutado correctamente');
    
  } catch (error) {
    console.error('Error en escrutinio QUINI 6:', error);
    return errorResponse(res, `Error en escrutinio: ${error.message}`, 500);
  }
}

/**
 * Obtener ganadores de un sorteo
 * GET /api/control-posterior/quini6/ganadores/:sorteo
 */
async function obtenerGanadores(req, res) {
  try {
    const { sorteo } = req.params;
    
    // Buscar en archivos guardados
    const backupDir = path.join(__dirname, '../../../uploads/quini6');
    const archivos = fs.existsSync(backupDir) 
      ? fs.readdirSync(backupDir).filter(f => f.includes(`escrutinio_${sorteo}`))
      : [];
    
    if (archivos.length === 0) {
      return errorResponse(res, 'No se encontraron resultados de escrutinio para este sorteo', 404);
    }
    
    const archivoMasReciente = archivos.sort().reverse()[0];
    const contenido = fs.readFileSync(path.join(backupDir, archivoMasReciente), 'utf8');
    const datos = JSON.parse(contenido);
    
    return successResponse(res, datos, 'Ganadores obtenidos correctamente');
    
  } catch (error) {
    console.error('Error obteniendo ganadores QUINI 6:', error);
    return errorResponse(res, `Error: ${error.message}`, 500);
  }
}

/**
 * Guardar resultado de escrutinio
 * POST /api/control-posterior/quini6/guardar-escrutinio
 */
async function guardarEscrutinio(req, res) {
  try {
    const { resultados } = req.body;
    
    if (!resultados) {
      return errorResponse(res, 'No se proporcionaron resultados para guardar', 400);
    }
    
    const sorteo = resultados.sorteo || 'sin_sorteo';
    const backupDir = path.join(__dirname, '../../../uploads/quini6');
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupFile = path.join(backupDir, `escrutinio_${sorteo}_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(resultados, null, 2));
    
    return successResponse(res, {
      guardado: true,
      archivo: backupFile
    }, 'Escrutinio guardado correctamente');
    
  } catch (error) {
    console.error('Error guardando escrutinio QUINI 6:', error);
    return errorResponse(res, `Error: ${error.message}`, 500);
  }
}

/**
 * Exportar resultados a CSV
 * POST /api/control-posterior/quini6/exportar-csv
 */
async function exportarCSV(req, res) {
  try {
    const { resultados, incluirDetalles } = req.body;
    
    if (!resultados) {
      return errorResponse(res, 'No se proporcionaron resultados para exportar', 400);
    }
    
    // Generar CSV
    let csv = 'Modalidad,Nivel,Aciertos,Cantidad Ganadores,Premio Unitario,Premio Total\n';
    
    // Tradicional Primera
    for (const nivel of ['6', '5', '4']) {
      const data = resultados.ganadores.tradicionalPrimera[nivel];
      csv += `Tradicional Primera,${nivel},${nivel} aciertos,${data.cantidad},${data.premioUnitario},${data.premioTotal}\n`;
    }
    
    // Tradicional Segunda
    for (const nivel of ['6', '5', '4']) {
      const data = resultados.ganadores.tradicionalSegunda[nivel];
      csv += `Tradicional Segunda,${nivel},${nivel} aciertos,${data.cantidad},${data.premioUnitario},${data.premioTotal}\n`;
    }
    
    // Revancha
    const revancha = resultados.ganadores.revancha['6'];
    csv += `Revancha,6,6 aciertos,${revancha.cantidad},${revancha.premioUnitario},${revancha.premioTotal}\n`;
    
    // Siempre Sale
    const ss = resultados.ganadores.siempreSale;
    csv += `Siempre Sale,${ss.aciertosRequeridos},${ss.aciertosRequeridos} aciertos,${ss.cantidad},${ss.premioUnitario},${ss.premioTotal}\n`;
    
    // Premio Extra
    const extra = resultados.ganadores.premioExtra['6'];
    csv += `Premio Extra,6,6 aciertos,${extra.cantidad},${extra.premioUnitario},${extra.premioTotal}\n`;
    
    // Agregar detalle por agencia si se solicita
    if (incluirDetalles && resultados.porAgencia) {
      csv += '\n\nDetalle por Agencia\n';
      csv += 'Cuenta Corriente,Provincia,Agencia,Registros,Recaudación,Trad1-6,Trad1-5,Trad1-4,Trad2-6,Trad2-5,Trad2-4,Revancha,Siempre Sale,Premio Extra\n';
      
      for (const ag of resultados.porAgencia) {
        csv += `${ag.ctaCte},${ag.provincia},${ag.agencia},${ag.registros},${ag.recaudacion},`;
        csv += `${ag.ganadores.tradicionalPrimera['6']},${ag.ganadores.tradicionalPrimera['5']},${ag.ganadores.tradicionalPrimera['4']},`;
        csv += `${ag.ganadores.tradicionalSegunda['6']},${ag.ganadores.tradicionalSegunda['5']},${ag.ganadores.tradicionalSegunda['4']},`;
        csv += `${ag.ganadores.revancha},${ag.ganadores.siempreSale},${ag.ganadores.premioExtra}\n`;
      }
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=quini6_escrutinio_${resultados.sorteo || 'export'}.csv`);
    return res.send(csv);
    
  } catch (error) {
    console.error('Error exportando CSV QUINI 6:', error);
    return errorResponse(res, `Error: ${error.message}`, 500);
  }
}

module.exports = {
  ejecutar,
  obtenerGanadores,
  guardarEscrutinio,
  exportarCSV,
  // Exportar funciones de utilidad
  runScrutiny,
  contarAciertos,
  calcularGanadoresMultiples
};
