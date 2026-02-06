'use strict';

/**
 * BRINCO Escrutinio Controller - Control Posterior
 * Ejecuta el escrutinio de BRINCO comparando los registros NTF con el extracto oficial
 * 
 * BRINCO tiene dos modalidades:
 * - BRINCO Tradicional: 6 números del 1-41, premios por 6/5/4/3 aciertos
 * - BRINCO Junior Siempre Sale: 6 números del 1-41, premio por 5+ aciertos (siempre sale ganador)
 */

const path = require('path');
const fs = require('fs');
const { query } = require('../../config/database');
const { successResponse, errorResponse } = require('../../shared/helpers');

// ============================================================
// CONSTANTES Y CONFIGURACIÓN
// ============================================================

// Código binario para decodificar la secuencia de números
const BINARY_CODE = {
  'A': '0000', 'B': '0001', 'C': '0010', 'D': '0011',
  'E': '0100', 'F': '0101', 'G': '0110', 'H': '0111',
  'I': '1000', 'J': '1001', 'K': '1010', 'L': '1011',
  'M': '1100', 'N': '1101', 'O': '1110', 'P': '1111'
};

// Combinaciones C(n, 6) para apuestas múltiples de BRINCO
const COMBINACIONES_BRINCO = {
  6: 1,       // Simple
  7: 7,       // C(7,6)
  8: 28,      // C(8,6)
  9: 84,      // C(9,6)
  10: 210,    // C(10,6)
  11: 462,    // C(11,6)
  12: 924     // C(12,6)
};

// ============================================================
// FUNCIONES DE UTILIDAD
// ============================================================

/**
 * Calcula factorial con cache para optimización
 */
const factorialCache = {};
function factorial(n) {
  if (n in factorialCache) return factorialCache[n];
  if (n <= 1) return 1;
  const result = n * factorial(n - 1);
  factorialCache[n] = result;
  return result;
}

/**
 * Calcula coeficiente binomial C(n, k) = n! / (k! * (n-k)!)
 */
function combinaciones(n, k) {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  return Math.floor(factorial(n) / (factorial(k) * factorial(n - k)));
}

/**
 * Decodifica la secuencia de 25 caracteres de BRINCO a un array de números (0-40)
 * Los números van de 0 a 40 según formato LOTBA
 */
function decodificarNumerosBrinco(secuencia25) {
  const numeros = [];
  for (let i = 0; i < Math.min(25, (secuencia25 || '').length); i++) {
    const letra = secuencia25[i].toUpperCase();
    const binario = BINARY_CODE[letra] || '0000';
    for (let j = 0; j < 4; j++) {
      if (binario[j] === '1') {
        const numero = i * 4 + j;
        // BRINCO usa números del 0 al 40 (41 números posibles)
        if (numero >= 0 && numero <= 40) {
          numeros.push(numero); // NO +1, números van de 0 a 40
        }
      }
    }
  }
  return [...new Set(numeros)].sort((a, b) => a - b);
}

/**
 * Cuenta cuántos números de la apuesta están en el extracto
 */
function contarAciertos(numerosJugados, numerosGanadores) {
  const setGanadores = new Set(numerosGanadores);
  let aciertos = 0;
  for (const num of numerosJugados) {
    if (setGanadores.has(num)) aciertos++;
  }
  return aciertos;
}

/**
 * Calcula ganadores múltiples para una apuesta de más de 6 números
 * Para BRINCO, calcula cuántas combinaciones de 6 números tienen X aciertos
 */
function calcularGanadoresMultiples(numerosJugados, numerosGanadores, cantidadNumeros) {
  const setGanadores = new Set(numerosGanadores);
  let aciertos = 0;
  for (const num of numerosJugados) {
    if (setGanadores.has(num)) aciertos++;
  }

  const ganadores = { 6: 0, 5: 0, 4: 0, 3: 0 };
  const noAciertos = cantidadNumeros - aciertos;

  // Para cada nivel de aciertos
  // Fórmula: C(aciertos, nivel) * C(noAciertos, 6 - nivel)
  for (const nivel of [6, 5, 4, 3]) {
    if (aciertos >= nivel && noAciertos >= (6 - nivel)) {
      ganadores[nivel] = combinaciones(aciertos, nivel) * combinaciones(noAciertos, 6 - nivel);
    }
  }

  return ganadores;
}

/**
 * Convierte un número a texto
 */
function numeroALetras(n) {
  if (n === 0) return 'VACANTE';
  if (n === 1) return 'UN (1) GANADOR';

  const basicos = {
    2: 'DOS', 3: 'TRES', 4: 'CUATRO', 5: 'CINCO',
    6: 'SEIS', 7: 'SIETE', 8: 'OCHO', 9: 'NUEVE', 10: 'DIEZ'
  };

  if (basicos[n]) return `${basicos[n]} (${n}) GANADORES`;
  return `${n} GANADORES`;
}

// ============================================================
// FUNCIÓN PRINCIPAL DE ESCRUTINIO
// ============================================================

/**
 * Ejecuta el escrutinio completo de BRINCO
 * @param {Array} registrosNTF - Registros del archivo NTF
 * @param {Object} extracto - Datos del extracto oficial (números ganadores de ambas modalidades)
 * @param {Object} datosControlPrevio - Datos del control previo (recaudación, etc.)
 * @param {Number} registrosAnulados - Cantidad de registros anulados
 */
function runScrutiny(registrosNTF, extracto, datosControlPrevio, registrosAnulados = 0) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('=== ESCRUTINIO BRINCO ===');
  console.log(`${'='.repeat(60)}`);
  
  // Validar extracto
  if (!extracto.tradicional || !extracto.tradicional.numeros || extracto.tradicional.numeros.length !== 6) {
    throw new Error('Extracto BRINCO Tradicional incompleto: se requieren 6 números');
  }
  
  const numerosTradicional = extracto.tradicional.numeros.map(n => parseInt(n));
  const numerosJunior = extracto.junior?.numeros?.map(n => parseInt(n)) || numerosTradicional;
  const aciertosRequeridosJunior = extracto.junior?.aciertosRequeridos || 5;
  
  console.log(`BRINCO Tradicional - Números ganadores: ${numerosTradicional.join(', ')}`);
  console.log(`BRINCO Junior - Números ganadores: ${numerosJunior.join(', ')}`);
  console.log(`BRINCO Junior - Aciertos requeridos: ${aciertosRequeridosJunior}`);
  console.log(`Registros recibidos: ${registrosNTF.length}`);
  
  // Estructuras para acumular resultados
  const porNivelTradicional = {
    6: { ganadores: 0, premioUnitario: 0, totalPremios: 0, agenciasGanadoras: [] },
    5: { ganadores: 0, premioUnitario: 0, totalPremios: 0 },
    4: { ganadores: 0, premioUnitario: 0, totalPremios: 0 },
    3: { ganadores: 0, premioUnitario: 0, totalPremios: 0 }
  };
  
  const porNivelJunior = {
    6: { ganadores: 0, premioUnitario: 0, totalPremios: 0, agenciasGanadoras: [] },
    5: { ganadores: 0, premioUnitario: 0, totalPremios: 0, agenciasGanadoras: [] }
  };
  
  // Estadísticas por cantidad de números jugados
  const porCantidadNumeros = {};
  for (let i = 6; i <= 12; i++) {
    porCantidadNumeros[i] = {
      combinaciones: COMBINACIONES_BRINCO[i],
      registros: 0,
      ganadoresTrad: { 6: 0, 5: 0, 4: 0, 3: 0 },
      ganadoresJunior: { 6: 0, 5: 0 }
    };
  }
  
  let totalRegistrosValidos = 0;
  let totalApuestas = 0;
  let totalRecaudacion = 0;
  
  const ganadoresDetalle = [];
  
  // Filtrar solo registros de BRINCO válidos
  const registrosBrinco = registrosNTF.filter(r => 
    (r.tipo === 'BRC' || r.tipoJuego === 'BRC' || r.tipoJuego === 'Brinco') &&
    !r.cancelado && !r.isCanceled
  );
  
  console.log(`Registros BRINCO válidos: ${registrosBrinco.length} de ${registrosNTF.length}`);
  
  // Procesar cada registro
  for (const registro of registrosBrinco) {
    totalRegistrosValidos++;
    
    // Determinar cantidad de números jugados
    const cantNum = parseInt(registro.cantidadNumeros || registro.cantNum || 6);
    const combinacionesApuesta = COMBINACIONES_BRINCO[cantNum] || 1;
    totalApuestas += combinacionesApuesta;
    
    // Obtener importe
    const importe = parseFloat(registro.valorRealApuesta || registro.importe || registro.monto || 0);
    totalRecaudacion += importe;
    
    // Obtener números jugados
    let numerosJugados = [];
    if (registro.numerosJugados && Array.isArray(registro.numerosJugados)) {
      numerosJugados = registro.numerosJugados.map(n => parseInt(n));
    } else if (registro.secuenciaNumeros || registro.secuencia) {
      numerosJugados = decodificarNumerosBrinco(registro.secuenciaNumeros || registro.secuencia);
    }
    
    if (numerosJugados.length < 6) {
      console.warn(`Registro con pocos números (${numerosJugados.length}): secuencia=${registro.secuenciaNumeros}`);
      continue;
    }
    
    // Registrar estadísticas por cantidad de números
    if (porCantidadNumeros[cantNum]) {
      porCantidadNumeros[cantNum].registros++;
    }
    
    const codProv = registro.provincia || '51';
    const codAgenciaStr = (registro.agencia || '').toString();
    const codAgencia = codAgenciaStr.replace(/^51/, '').padStart(5, '0');
    
    // ===============================
    // ANÁLISIS BRINCO TRADICIONAL
    // ===============================
    if (cantNum === 6) {
      // Apuesta simple
      const aciertos = contarAciertos(numerosJugados, numerosTradicional);
      
      if (aciertos >= 3) {
        porNivelTradicional[aciertos].ganadores++;
        
        ganadoresDetalle.push({
          ticket: registro.ticket || registro.numeroTicket,
          agencia: `${codProv}-${codAgencia}`,
          provincia: codProv,
          cta_cte: `${codProv}-${codAgencia}`,
          modalidad: 'Tradicional',
          aciertos: aciertos,
          tipo: `BRINCO Tradicional ${aciertos} aciertos`,
          premio: 0,
          numerosJugados: numerosJugados.slice()
        });
        
        if (aciertos === 6) {
          porNivelTradicional[6].agenciasGanadoras.push({
            agencia: registro.agencia || '',
            provincia: codProv,
            ctaCte: `${codProv}-${codAgencia}`,
            ticket: registro.ticket || registro.numeroTicket || '',
            importe: importe,
            numerosJugados: numerosJugados.slice()
          });
        }
        
        if (porCantidadNumeros[cantNum]) {
          porCantidadNumeros[cantNum].ganadoresTrad[aciertos]++;
        }
      }
    } else {
      // Apuesta múltiple
      const ganadoresMultiples = calcularGanadoresMultiples(numerosJugados, numerosTradicional, cantNum);
      
      for (const nivel of [6, 5, 4, 3]) {
        if (ganadoresMultiples[nivel] > 0) {
          porNivelTradicional[nivel].ganadores += ganadoresMultiples[nivel];
          
          if (nivel === 6) {
            porNivelTradicional[6].agenciasGanadoras.push({
              agencia: registro.agencia || '',
              provincia: codProv,
              ctaCte: `${codProv}-${codAgencia}`,
              esMultiple: true,
              cantidad: ganadoresMultiples[nivel],
              ticket: registro.ticket || registro.numeroTicket || '',
              importe: importe,
              numerosJugados: numerosJugados.slice()
            });
          }
          
          for (let k = 0; k < ganadoresMultiples[nivel]; k++) {
            ganadoresDetalle.push({
              ticket: registro.ticket || registro.numeroTicket,
              agencia: `${codProv}-${codAgencia}`,
              provincia: codProv,
              cta_cte: `${codProv}-${codAgencia}`,
              modalidad: 'Tradicional',
              aciertos: nivel,
              tipo: `BRINCO Tradicional ${nivel} aciertos (múltiple)`,
              premio: 0,
              numerosJugados: numerosJugados.slice()
            });
          }
          
          if (porCantidadNumeros[cantNum]) {
            porCantidadNumeros[cantNum].ganadoresTrad[nivel] += ganadoresMultiples[nivel];
          }
        }
      }
    }
    
    // ===============================
    // ANÁLISIS BRINCO JUNIOR
    // ===============================
    if (cantNum === 6) {
      const aciertosJunior = contarAciertos(numerosJugados, numerosJunior);
      
      if (aciertosJunior >= aciertosRequeridosJunior) {
        const nivelJunior = aciertosJunior >= 6 ? 6 : 5;
        porNivelJunior[nivelJunior].ganadores++;
        
        ganadoresDetalle.push({
          ticket: registro.ticket || registro.numeroTicket,
          agencia: `${codProv}-${codAgencia}`,
          provincia: codProv,
          cta_cte: `${codProv}-${codAgencia}`,
          modalidad: 'Junior',
          aciertos: aciertosJunior,
          tipo: `BRINCO Junior ${aciertosJunior} aciertos`,
          premio: 0,
          numerosJugados: numerosJugados.slice()
        });
        
        // Agregar a agenciasGanadoras de Junior (5+ aciertos)
        porNivelJunior[nivelJunior].agenciasGanadoras.push({
          agencia: registro.agencia || '',
          provincia: codProv,
          ctaCte: `${codProv}-${codAgencia}`,
          ticket: registro.ticket || registro.numeroTicket || '',
          importe: importe,
          aciertos: aciertosJunior,
          numerosJugados: numerosJugados.slice()
        });
        
        if (porCantidadNumeros[cantNum]) {
          porCantidadNumeros[cantNum].ganadoresJunior[nivelJunior]++;
        }
      }
    } else {
      // Apuesta múltiple para Junior
      const ganadoresMultiplesJunior = calcularGanadoresMultiples(numerosJugados, numerosJunior, cantNum);
      
      for (const nivel of [6, 5]) {
        if (ganadoresMultiplesJunior[nivel] > 0 && nivel >= aciertosRequeridosJunior) {
          porNivelJunior[nivel].ganadores += ganadoresMultiplesJunior[nivel];
          
          // Agregar a agenciasGanadoras de Junior (apuesta múltiple)
          porNivelJunior[nivel].agenciasGanadoras.push({
            agencia: registro.agencia || '',
            provincia: codProv,
            ctaCte: `${codProv}-${codAgencia}`,
            ticket: registro.ticket || registro.numeroTicket || '',
            importe: importe,
            aciertos: nivel,
            cantidadCombinaciones: ganadoresMultiplesJunior[nivel],
            esMultiple: true,
            numerosJugados: numerosJugados.slice()
          });
          
          for (let k = 0; k < ganadoresMultiplesJunior[nivel]; k++) {
            ganadoresDetalle.push({
              ticket: registro.ticket || registro.numeroTicket,
              agencia: `${codProv}-${codAgencia}`,
              provincia: codProv,
              cta_cte: `${codProv}-${codAgencia}`,
              modalidad: 'Junior',
              aciertos: nivel,
              tipo: `BRINCO Junior ${nivel} aciertos (múltiple)`,
              premio: 0,
              numerosJugados: numerosJugados.slice()
            });
          }
          
          if (porCantidadNumeros[cantNum]) {
            porCantidadNumeros[cantNum].ganadoresJunior[nivel] += ganadoresMultiplesJunior[nivel];
          }
        }
      }
    }
  }
  
  // Obtener premios del extracto
  const premiosTradicional = extracto.tradicional.premios || {};
  const premiosJunior = extracto.junior?.premios || {};
  
  // Mapeo de nivel de aciertos a key del JSON
  // JSON usa: "1" = 6 aciertos, "2" = 5 aciertos, "3" = 4 aciertos, "4" = 3 aciertos
  const nivelToKey = { 6: '1', 5: '2', 4: '3', 3: '4' };
  
  // Asignar premios unitarios del extracto a cada nivel
  for (const nivel of [6, 5, 4, 3]) {
    const key = nivelToKey[nivel];
    // Buscar por key de nivel de premio ("1", "2", etc.) o por número de aciertos (6, 5, etc.)
    const premioInfo = premiosTradicional[key] || premiosTradicional[nivel] || premiosTradicional[nivel.toString()] || {};
    porNivelTradicional[nivel].premioUnitario = parseFloat(premioInfo.premio_por_ganador || premioInfo.premioUnitario || 0);
    porNivelTradicional[nivel].ganadores_extracto = parseInt(premioInfo.winners || premioInfo.ganadores || 0);
    porNivelTradicional[nivel].totalPremios = porNivelTradicional[nivel].ganadores * porNivelTradicional[nivel].premioUnitario;
    porNivelTradicional[nivel].ganadoresTexto = numeroALetras(porNivelTradicional[nivel].ganadores);
  }
  
  // Premios Junior - usualmente solo hay un nivel (key "1")
  for (const nivel of [6, 5]) {
    // Junior usa "1" como único key para su premio
    const premioInfo = premiosJunior['1'] || premiosJunior[nivel] || premiosJunior[nivel.toString()] || {};
    porNivelJunior[nivel].premioUnitario = parseFloat(premioInfo.premio_por_ganador || premioInfo.premioUnitario || 0);
    porNivelJunior[nivel].ganadores_extracto = parseInt(premioInfo.winners || premioInfo.ganadores || 0);
    porNivelJunior[nivel].totalPremios = porNivelJunior[nivel].ganadores * porNivelJunior[nivel].premioUnitario;
    porNivelJunior[nivel].ganadoresTexto = numeroALetras(porNivelJunior[nivel].ganadores);
  }
  
  // Agregar premio a cada ganador en agenciasGanadoras
  for (const nivel of [6, 5, 4, 3]) {
    const premioUnitario = porNivelTradicional[nivel].premioUnitario;
    porNivelTradicional[nivel].agenciasGanadoras.forEach(g => {
      const cantPremios = g.esMultiple ? (g.cantidad || g.cantidadCombinaciones || 1) : 1;
      g.premioUnitario = premioUnitario;
      g.premio = premioUnitario * cantPremios;
    });
  }
  
  for (const nivel of [6, 5]) {
    const premioUnitario = porNivelJunior[nivel].premioUnitario;
    porNivelJunior[nivel].agenciasGanadoras.forEach(g => {
      const cantPremios = g.esMultiple ? (g.cantidadCombinaciones || 1) : 1;
      g.premioUnitario = premioUnitario;
      g.premio = premioUnitario * cantPremios;
    });
  }
  
  // Calcular totales
  const totalGanadoresTradicional = porNivelTradicional[6].ganadores + porNivelTradicional[5].ganadores + 
                                     porNivelTradicional[4].ganadores + porNivelTradicional[3].ganadores;
  const totalGanadoresJunior = porNivelJunior[6].ganadores + porNivelJunior[5].ganadores;
  
  const totalPremiosTradicional = porNivelTradicional[6].totalPremios + porNivelTradicional[5].totalPremios + 
                                   porNivelTradicional[4].totalPremios + porNivelTradicional[3].totalPremios;
  const totalPremiosJunior = porNivelJunior[6].totalPremios + porNivelJunior[5].totalPremios;
  
  // Estímulo agenciero
  const estimuloTradicional = extracto.tradicional?.estimulo?.monto || 0;
  const estimuloJunior = extracto.junior?.estimulo?.monto || 0;
  
  console.log(`\nRESULTADOS BRINCO TRADICIONAL:`);
  console.log(`  6 aciertos: ${porNivelTradicional[6].ganadores} ganadores`);
  console.log(`  5 aciertos: ${porNivelTradicional[5].ganadores} ganadores`);
  console.log(`  4 aciertos: ${porNivelTradicional[4].ganadores} ganadores`);
  console.log(`  3 aciertos: ${porNivelTradicional[3].ganadores} ganadores`);
  console.log(`  Total ganadores: ${totalGanadoresTradicional}`);
  
  console.log(`\nRESULTADOS BRINCO JUNIOR:`);
  console.log(`  6 aciertos: ${porNivelJunior[6].ganadores} ganadores`);
  console.log(`  5 aciertos: ${porNivelJunior[5].ganadores} ganadores`);
  console.log(`  Total ganadores: ${totalGanadoresJunior}`);
  
  console.log(`${'='.repeat(60)}\n`);
  
  return {
    juego: 'Brinco',
    sorteo: datosControlPrevio?.sorteo || registrosNTF[0]?.sorteo,
    fechaProcesamiento: new Date().toISOString(),
    
    extracto: {
      tradicional: {
        numeros: numerosTradicional
      },
      junior: {
        numeros: numerosJunior,
        aciertosRequeridos: aciertosRequeridosJunior
      }
    },
    
    resumen: {
      registrosValidos: totalRegistrosValidos,
      registrosAnulados: registrosAnulados,
      apuestasTotal: totalApuestas,
      recaudacion: totalRecaudacion
    },
    
    tradicional: {
      porNivel: porNivelTradicional,
      totalGanadores: totalGanadoresTradicional,
      totalPremios: totalPremiosTradicional,
      estimulo: estimuloTradicional
    },
    
    junior: {
      porNivel: porNivelJunior,
      totalGanadores: totalGanadoresJunior,
      totalPremios: totalPremiosJunior,
      aciertosRequeridos: aciertosRequeridosJunior,
      estimulo: estimuloJunior
    },
    
    porCantidadNumeros,
    ganadoresDetalle,
    
    comparacion: {
      tradicional: {
        6: {
          txt: porNivelTradicional[6].ganadores,
          extracto: porNivelTradicional[6].ganadores_extracto || 0,
          diferencia: porNivelTradicional[6].ganadores - (porNivelTradicional[6].ganadores_extracto || 0)
        },
        5: {
          txt: porNivelTradicional[5].ganadores,
          extracto: porNivelTradicional[5].ganadores_extracto || 0,
          diferencia: porNivelTradicional[5].ganadores - (porNivelTradicional[5].ganadores_extracto || 0)
        },
        4: {
          txt: porNivelTradicional[4].ganadores,
          extracto: porNivelTradicional[4].ganadores_extracto || 0,
          diferencia: porNivelTradicional[4].ganadores - (porNivelTradicional[4].ganadores_extracto || 0)
        },
        3: {
          txt: porNivelTradicional[3].ganadores,
          extracto: porNivelTradicional[3].ganadores_extracto || 0,
          diferencia: porNivelTradicional[3].ganadores - (porNivelTradicional[3].ganadores_extracto || 0)
        }
      },
      junior: {
        6: {
          txt: porNivelJunior[6].ganadores,
          extracto: porNivelJunior[6].ganadores_extracto || 0,
          diferencia: porNivelJunior[6].ganadores - (porNivelJunior[6].ganadores_extracto || 0)
        },
        5: {
          txt: porNivelJunior[5].ganadores,
          extracto: porNivelJunior[5].ganadores_extracto || 0,
          diferencia: porNivelJunior[5].ganadores - (porNivelJunior[5].ganadores_extracto || 0)
        }
      }
    },
    
    // Datos del control previo para mostrar en frontend
    datosControlPrevio: {
      totalApuestas: totalApuestas,
      totalRecaudacion: totalRecaudacion,
      registros: totalRegistrosValidos,
      anulados: registrosAnulados,
      recaudacion: totalRecaudacion,
      totalAnulados: registrosAnulados
    }
  };
}

// ============================================================
// ENDPOINT PRINCIPAL
// ============================================================

/**
 * POST /api/control-posterior/brinco/escrutinio
 * Ejecuta el escrutinio de BRINCO
 */
const ejecutar = async (req, res) => {
  const { registrosNTF, extracto, datosControlPrevio, registrosAnulados } = req.body;
  
  if (!registrosNTF || !extracto) {
    return errorResponse(res, 'Faltan datos para ejecutar el escrutinio', 400);
  }
  
  if (!extracto.tradicional || !extracto.tradicional.numeros || extracto.tradicional.numeros.length !== 6) {
    return errorResponse(res, 'Extracto incompleto: se requieren 6 números para BRINCO Tradicional', 400);
  }
  
  try {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`=== ESCRUTINIO BRINCO ===`);
    console.log(`${'='.repeat(50)}`);
    console.log(`Registros recibidos: ${registrosNTF.length}`);
    console.log(`BRINCO Tradicional: ${extracto.tradicional.numeros.join(', ')}`);
    if (extracto.junior?.numeros) {
      console.log(`BRINCO Junior: ${extracto.junior.numeros.join(', ')}`);
    }
    
    const resultado = runScrutiny(registrosNTF, extracto, datosControlPrevio, registrosAnulados);
    
    console.log(`\nRESULTADOS:`);
    console.log(`  TRADICIONAL:`);
    console.log(`    6 aciertos: ${resultado.tradicional.porNivel[6].ganadores}`);
    console.log(`    5 aciertos: ${resultado.tradicional.porNivel[5].ganadores}`);
    console.log(`    4 aciertos: ${resultado.tradicional.porNivel[4].ganadores}`);
    console.log(`    3 aciertos: ${resultado.tradicional.porNivel[3].ganadores}`);
    console.log(`  JUNIOR:`);
    console.log(`    Ganadores: ${resultado.junior.totalGanadores}`);
    console.log(`${'='.repeat(50)}\n`);
    
    // TODO: Guardar en base de datos cuando se cree la tabla
    
    return successResponse(res, resultado, 'Escrutinio BRINCO completado correctamente');
    
  } catch (error) {
    console.error('Error en escrutinio BRINCO:', error);
    return errorResponse(res, 'Error ejecutando escrutinio: ' + error.message, 500);
  }
};

/**
 * Obtiene información de ganadores del primer premio (6 aciertos) para reportes
 */
const obtenerGanadoresPrimerPremio = async (req, res) => {
  const { sorteo } = req.params;
  
  try {
    // TODO: Implementar consulta a BD cuando se cree la tabla
    return successResponse(res, [], 'Ganadores del primer premio');
  } catch (error) {
    console.error('Error obteniendo ganadores:', error);
    return errorResponse(res, 'Error obteniendo ganadores: ' + error.message, 500);
  }
};

module.exports = {
  ejecutar,
  obtenerGanadoresPrimerPremio,
  runScrutiny,
  decodificarNumerosBrinco,
  calcularGanadoresMultiples,
  contarAciertos,
  COMBINACIONES_BRINCO
};
