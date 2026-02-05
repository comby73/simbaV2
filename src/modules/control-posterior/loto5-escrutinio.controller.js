/**
 * Loto 5 Escrutinio Controller - Control Posterior
 * Port del Python Loto5Analyzer escrutinio a Node.js
 *
 * Juego único (sin modalidades separadas como Loto Plus)
 * Código de juego NTF: 12
 *
 * Niveles de premio:
 * - 5 aciertos: 1er premio (pozo del XML PRIMER_PREMIO.TOTALES)
 * - 4 aciertos: 2do premio (pozo del XML SEGUNDO_PREMIO.TOTALES)
 * - 3 aciertos: 3er premio = devolución del valor de la apuesta
 * - Agenciero: 1% del total de pozos (1er + 2do premio)
 */

const { query } = require('../../config/database');
const { successResponse, errorResponse } = require('../../shared/helpers');

const BINARY_CODE = {
  'A': '0000', 'B': '0001', 'C': '0010', 'D': '0011',
  'E': '0100', 'F': '0101', 'G': '0110', 'H': '0111',
  'I': '1000', 'J': '1001', 'K': '1010', 'L': '1011',
  'M': '1100', 'N': '1101', 'O': '1110', 'P': '1111'
};

const COMBINACIONES_LOTO5 = {
  5: 1, 6: 6, 7: 21, 8: 56, 9: 126, 10: 252, 11: 462,
  12: 792, 13: 1287, 14: 2002, 15: 3003, 16: 4368,
  17: 6188, 18: 8568
};

const LOTO5_GAME_CODE = '12';

/**
 * Calcula C(n, k)
 */
function combinaciones(n, k) {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  let num = 1, den = 1;
  for (let i = n; i > n - k; i--) num *= i;
  for (let i = 1; i <= k; i++) den *= i;
  return Math.round(num / den);
}

/**
 * Decodifica secuencia A-P a números (rango 0-36)
 */
function decodificarNumerosLoto5(secuencia25) {
  const numeros = [];
  for (let i = 0; i < Math.min(25, secuencia25.length); i++) {
    const letra = secuencia25[i].toUpperCase();
    const binario = BINARY_CODE[letra] || '0000';
    for (let j = 0; j < 4; j++) {
      if (binario[j] === '1') {
        const numero = i * 4 + j;
        if (numero >= 0 && numero <= 36) {
          numeros.push(numero);
        }
      }
    }
  }
  return [...new Set(numeros)].sort((a, b) => a - b);
}

/**
 * Calcula ganadores múltiples para apuesta con más de 5 números
 * Fórmula: C(aciertos, nivel) * C(totalNumeros - aciertos, 5 - nivel)
 */
function calcularGanadoresMultiples(betNumbers, extractNumbers, numbersCount) {
  const betSet = new Set(betNumbers);
  let hits = 0;
  for (const num of betSet) {
    if (extractNumbers.has(num)) hits++;
  }

  const ganadores = { 5: 0, 4: 0, 3: 0 };
  if (hits < 3) return ganadores;

  for (const nivel of [5, 4, 3]) {
    if (hits >= nivel) {
      ganadores[nivel] = combinaciones(hits, nivel) * combinaciones(numbersCount - hits, 5 - nivel);
    }
  }
  return ganadores;
}

/**
 * Cuenta aciertos simples
 */
function countHits(betNumbers, extractNumbers) {
  let hits = 0;
  for (const num of betNumbers) {
    if (extractNumbers.has(num)) hits++;
  }
  return hits;
}

/**
 * Texto para cantidad de ganadores
 */
function ganadoresTexto(n) {
  if (n === 0) return 'VACANTE';
  if (n === 1) return 'UN (1) GANADOR';
  const basicos = {
    2: 'DOS', 3: 'TRES', 4: 'CUATRO', 5: 'CINCO',
    6: 'SEIS', 7: 'SIETE', 8: 'OCHO', 9: 'NUEVE', 10: 'DIEZ'
  };
  if (basicos[n]) return `${basicos[n]} (${n}) GANADORES`;
  return `${n} GANADORES`;
}

/**
 * Ejecuta el escrutinio de Loto 5
 * Recibe:
 * - registrosNTF: array de registros parseados del control previo
 * - extracto: { numeros: [5 números 0-36] }
 * - datosControlPrevio: datos del control previo con datosOficiales.premios del XML
 */
const ejecutar = async (req, res) => {
  const { registrosNTF, extracto, datosControlPrevio } = req.body;

  if (!registrosNTF || !extracto) {
    return errorResponse(res, 'Faltan datos para ejecutar el escrutinio', 400);
  }

  if (!extracto.numeros || extracto.numeros.length < 5) {
    return errorResponse(res, 'Extracto incompleto: se requieren 5 números del sorteo', 400);
  }

  try {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`=== ESCRUTINIO LOTO 5 ===`);
    console.log(`${'='.repeat(50)}`);
    console.log(`Registros recibidos: ${registrosNTF.length}`);
    console.log(`Extracto (5 números): ${extracto.numeros.join(', ')}`);

    // Premios del XML vienen de datosOficiales.premios
    const xmlPremios = datosControlPrevio?.datosOficiales?.premios || {};
    console.log(`Premios XML disponibles: ${Object.keys(xmlPremios).join(', ') || 'NINGUNO'}`);

    const resultado = runScrutiny(registrosNTF, extracto, datosControlPrevio, xmlPremios);

    console.log(`\nRESULTADOS:`);
    console.log(`  5 aciertos: ${resultado.porNivel[5]?.ganadores || 0} ganadores`);
    console.log(`  4 aciertos: ${resultado.porNivel[4]?.ganadores || 0} ganadores`);
    console.log(`  3 aciertos: ${resultado.porNivel[3]?.ganadores || 0} ganadores`);
    console.log(`  Total ganadores: ${resultado.totalGanadores}`);
    console.log(`  Total premios: $${resultado.totalPremios}`);
    console.log(`${'='.repeat(50)}\n`);

    // Guardar en BD
    try {
      await guardarEscrutinioLoto5(resultado, datosControlPrevio, req.user);
      resultado.resguardo = { success: true };
    } catch (errGuardar) {
      console.error('⚠️ Error guardando escrutinio Loto 5 (no crítico):', errGuardar.message);
      resultado.resguardo = { success: false, error: errGuardar.message };
    }

    return successResponse(res, resultado, 'Escrutinio Loto 5 completado correctamente');
  } catch (error) {
    console.error('Error en escrutinio Loto 5:', error);
    return errorResponse(res, 'Error ejecutando escrutinio: ' + error.message, 500);
  }
};

/**
 * Ejecuta el escrutinio completo de Loto 5
 * Juego único: 5/4/3 aciertos, sin modalidades
 */
function runScrutiny(registrosNTF, extracto, datosControlPrevio, xmlPremios) {
  const extractNumbers = new Set(extracto.numeros.map(n => parseInt(n)));

  // Estructura de resultados por nivel
  const porNivel = {
    5: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0, agenciasGanadoras: [] },
    4: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 },
    3: { ganadores: 0, premioUnitario: 0, totalPremios: 0, importesApuesta: [] }
  };

  let totalGanadores = 0;
  let totalPremios = 0;
  let totalRegistros = 0;
  let totalApuestas = 0;
  let totalRecaudacion = 0;

  for (const reg of registrosNTF) {
    if (reg.tipoJuego !== 'Loto 5') continue;
    if (reg.cancelado || reg.isCanceled) continue;

    totalRegistros++;

    const cantNum = parseInt(reg.cantNum || 5);
    const nroApuestas = COMBINACIONES_LOTO5[cantNum] || combinaciones(cantNum, 5);
    totalApuestas += nroApuestas;

    const importe = parseFloat(reg.importe || 0);
    totalRecaudacion += importe;

    // Decodificar números
    let betNumbers = [];
    if (reg.numeros && Array.isArray(reg.numeros)) {
      betNumbers = reg.numeros.map(n => parseInt(n));
    } else if (reg.secuencia) {
      betNumbers = decodificarNumerosLoto5(reg.secuencia);
    }

    if (betNumbers.length < 5) continue;

    // Calcular ganadores
    if (cantNum === 5) {
      // Apuesta simple (5 números)
      const hits = countHits(betNumbers, extractNumbers);
      if (hits >= 3) {
        porNivel[hits].ganadores++;
        if (hits === 5) {
          porNivel[5].agenciasGanadoras.push({
            agencia: reg.agencia || '',
            agenciaCompleta: reg.agenciaCompleta || '',
            ticket: reg.ticket || '',
            importe: importe,
            numerosJugados: betNumbers.slice()
          });
        }
        if (hits === 3) {
          // 3 aciertos = devolución del valor de la apuesta
          porNivel[3].importesApuesta.push(importe);
        }
      }
    } else {
      // Apuesta múltiple (más de 5 números)
      const ganadoresMultiples = calcularGanadoresMultiples(betNumbers, extractNumbers, cantNum);
      for (const nivel of [5, 4, 3]) {
        porNivel[nivel].ganadores += ganadoresMultiples[nivel];
      }
      if (ganadoresMultiples[5] > 0) {
        porNivel[5].agenciasGanadoras.push({
          agencia: reg.agencia || '',
          agenciaCompleta: reg.agenciaCompleta || '',
          ticket: reg.ticket || '',
          esMultiple: true,
          cantidad: ganadoresMultiples[5],
          importe: importe,
          numerosJugados: betNumbers.slice()
        });
      }
      if (ganadoresMultiples[3] > 0) {
        // Para múltiples, cada combinación ganadora de 3 devuelve el valor unitario
        const valorUnitario = importe / nroApuestas;
        for (let i = 0; i < ganadoresMultiples[3]; i++) {
          porNivel[3].importesApuesta.push(valorUnitario);
        }
      }
    }
  }

  // Obtener pozos del XML
  const pozoXml5 = parseFloat(xmlPremios.primerPremio?.totales || 0);
  const pozoXml4 = parseFloat(xmlPremios.segundoPremio?.totales || 0);
  const pozoXml3 = parseFloat(xmlPremios.tercerPremio?.totales || 0);

  // 5 aciertos: 1er premio
  porNivel[5].pozoXml = pozoXml5;
  if (porNivel[5].ganadores > 0 && pozoXml5 > 0) {
    porNivel[5].premioUnitario = pozoXml5 / porNivel[5].ganadores;
    porNivel[5].totalPremios = pozoXml5;
  } else if (porNivel[5].ganadores === 0) {
    porNivel[5].pozoVacante = pozoXml5;
  }

  // 4 aciertos: 2do premio
  porNivel[4].pozoXml = pozoXml4;
  if (porNivel[4].ganadores > 0 && pozoXml4 > 0) {
    porNivel[4].premioUnitario = pozoXml4 / porNivel[4].ganadores;
    porNivel[4].totalPremios = pozoXml4;
  } else if (porNivel[4].ganadores === 0) {
    porNivel[4].pozoVacante = pozoXml4;
  }

  // 3 aciertos: devolución del valor de la apuesta
  porNivel[3].pozoXml = pozoXml3;
  if (porNivel[3].ganadores > 0) {
    // Cada ganador de 3 aciertos recibe el valor de su apuesta como devolución
    const totalDevolucion = porNivel[3].importesApuesta.reduce((sum, v) => sum + v, 0);
    porNivel[3].totalPremios = totalDevolucion;
    porNivel[3].premioUnitario = totalDevolucion / porNivel[3].ganadores;
    porNivel[3].esDevolucion = true;
  }

  // Agenciero: 1% del total de pozos (1er + 2do)
  const totalPozosPrincipales = pozoXml5 + pozoXml4;
  const pozoAgencieroXml = parseFloat(xmlPremios.agenciero?.totales || 0);
  const agenciero = {
    ganadores: porNivel[5].agenciasGanadoras.length,
    premioUnitario: 0,
    totalPremios: 0,
    pozoXml: pozoAgencieroXml
  };

  if (agenciero.ganadores > 0) {
    // Si hay agenciero del XML, usar ese valor. Si no, calcular como 1% del total
    const pozoAgenciero = pozoAgencieroXml > 0 ? pozoAgencieroXml : totalPozosPrincipales * 0.01;
    agenciero.premioUnitario = pozoAgenciero / agenciero.ganadores;
    agenciero.totalPremios = pozoAgenciero;
  }

  // Fondo de reserva (informativo)
  const fondoReserva = parseFloat(xmlPremios.fondoReserva?.monto || 0);

  // Totales
  for (const nivel of [5, 4, 3]) {
    totalGanadores += porNivel[nivel].ganadores;
    totalPremios += porNivel[nivel].totalPremios;
    porNivel[nivel].ganadoresTexto = ganadoresTexto(porNivel[nivel].ganadores);
  }
  totalPremios += agenciero.totalPremios;

  // Limpiar campo interno
  delete porNivel[3].importesApuesta;

  // Comparación con control previo
  const cpRegistros = datosControlPrevio?.registros || datosControlPrevio?.resumen?.registros || totalRegistros;
  const cpApuestas = datosControlPrevio?.apuestasTotal || datosControlPrevio?.resumen?.apuestasTotal || totalApuestas;
  const cpRecaudacion = datosControlPrevio?.recaudacion || datosControlPrevio?.resumen?.recaudacion || totalRecaudacion;

  return {
    numeroSorteo: datosControlPrevio?.sorteo || datosControlPrevio?.numeroSorteo || 'S/N',
    fechaSorteo: datosControlPrevio?.fecha || '',
    totalGanadores,
    totalPremios,
    porNivel,
    agenciero,
    fondoReserva,
    comparacion: {
      registros: {
        controlPrevio: cpRegistros,
        controlPosterior: totalRegistros,
        coincide: Math.abs(cpRegistros - totalRegistros) <= 1
      },
      apuestas: {
        controlPrevio: cpApuestas,
        controlPosterior: totalApuestas,
        coincide: Math.abs(cpApuestas - totalApuestas) <= 1
      },
      recaudacion: {
        controlPrevio: cpRecaudacion,
        controlPosterior: totalRecaudacion,
        coincide: Math.abs(cpRecaudacion - totalRecaudacion) < 1
      }
    },
    extractoUsado: {
      numeros: [...extractNumbers]
    }
  };
}

/**
 * Guarda los resultados del escrutinio de Loto 5 en la BD
 */
async function guardarEscrutinioLoto5(resultado, datosControlPrevio, user) {
  const sorteo = resultado.numeroSorteo || 'N/A';

  await query(`
    INSERT INTO escrutinio_loto5
    (numero_sorteo, fecha_sorteo, total_ganadores, total_premios,
     datos_json, usuario_id)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      total_ganadores = VALUES(total_ganadores),
      total_premios = VALUES(total_premios),
      datos_json = VALUES(datos_json),
      usuario_id = VALUES(usuario_id),
      updated_at = CURRENT_TIMESTAMP
  `, [
    sorteo,
    resultado.fechaSorteo || new Date().toISOString().split('T')[0],
    resultado.totalGanadores || 0,
    resultado.totalPremios || 0,
    JSON.stringify(resultado),
    user?.id || null
  ]);
}

module.exports = {
  ejecutar,
  runScrutiny,
  decodificarNumerosLoto5,
  calcularGanadoresMultiples,
  combinaciones
};
