/**
 * Loto Escrutinio Controller - Control Posterior
 * Port del Python LotoAnalyzer escrutinio a Node.js
 *
 * 4 Modalidades:
 * - Tradicional (código 07): 6 aciertos = 1er, 5 = 2do, 4 = 3er
 * - Match (código 08): Exacto a Tradicional
 * - Desquite (código 09): Exacto a Tradicional
 * - Sale o Sale (código 10): Cascada - si no hay 6, busca 5, luego 4
 *
 * Plus (código 11): Si el número PLUS coincide, el premio se duplica
 * Premio Agenciero: 500000 por cada ganador de 1er premio
 */

const { query } = require('../../config/database');
const { successResponse, errorResponse } = require('../../shared/helpers');

const BINARY_CODE = {
  'A': '0000', 'B': '0001', 'C': '0010', 'D': '0011',
  'E': '0100', 'F': '0101', 'G': '0110', 'H': '0111',
  'I': '1000', 'J': '1001', 'K': '1010', 'L': '1011',
  'M': '1100', 'N': '1101', 'O': '1110', 'P': '1111'
};

const COMBINACIONES_LOTO = {
  6: 1, 7: 7, 8: 28, 9: 84, 10: 210, 11: 462,
  12: 924, 13: 1716, 14: 3003, 15: 5005, 16: 8008,
  17: 12376, 18: 18564
};

// Mapeo de códigos NTF a modalidades
const MODALIDAD_POR_CODIGO = {
  '07': 'Tradicional',
  '08': 'Match',
  '09': 'Desquite',
  '10': 'Sale o Sale',
  '11': 'Plus'
};

// Premio agenciero fijo por ganador de 1er premio
const PREMIO_AGENCIERO = 500000;

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
 * Decodifica secuencia A-P a números (rango 0-45)
 */
function decodificarNumerosLoto(secuencia25) {
  const numeros = [];
  for (let i = 0; i < Math.min(25, secuencia25.length); i++) {
    const letra = secuencia25[i].toUpperCase();
    const binario = BINARY_CODE[letra] || '0000';
    for (let j = 0; j < 4; j++) {
      if (binario[j] === '1') {
        const numero = i * 4 + j;
        if (numero >= 0 && numero <= 45) {
          numeros.push(numero);
        }
      }
    }
  }
  return [...new Set(numeros)].sort((a, b) => a - b);
}

/**
 * Calcula ganadores múltiples para apuesta con más de 6 números
 * Fórmula: C(aciertos, nivel) * C(totalNumeros - aciertos, 6 - nivel)
 */
function calcularGanadoresMultiples(betNumbers, extractNumbers, numbersCount) {
  const betSet = new Set(betNumbers);
  let hits = 0;
  for (const num of betSet) {
    if (extractNumbers.has(num)) hits++;
  }

  const ganadores = { 6: 0, 5: 0, 4: 0 };
  if (hits < 4) return ganadores;

  for (const nivel of [6, 5, 4]) {
    if (hits >= nivel) {
      ganadores[nivel] = combinaciones(hits, nivel) * combinaciones(numbersCount - hits, 6 - nivel);
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
 * Ejecuta el escrutinio de Loto
 * Recibe:
 * - registrosNTF: array de registros parseados del control previo
 * - extracto: { numeros: [6 números], plus: número PLUS (0-9) }
 * - datosControlPrevio: datos del control previo para comparación
 * - premios: { tradicional, match, desquite, saleOSale } - montos de premios por modalidad
 */
const ejecutar = async (req, res) => {
  const { registrosNTF, extracto, datosControlPrevio, premios } = req.body;

  if (!registrosNTF || !extracto) {
    return errorResponse(res, 'Faltan datos para ejecutar el escrutinio', 400);
  }

  if (!extracto.numeros || extracto.numeros.length < 6) {
    return errorResponse(res, 'Extracto incompleto: se requieren 6 números del sorteo', 400);
  }

  try {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`=== ESCRUTINIO LOTO ===`);
    console.log(`${'='.repeat(50)}`);
    console.log(`Registros recibidos: ${registrosNTF.length}`);
    console.log(`Extracto (6 números): ${extracto.numeros.join(', ')}`);
    console.log(`Número PLUS: ${extracto.plus != null ? extracto.plus : 'N/A'}`);

    const resultado = runScrutiny(registrosNTF, extracto, datosControlPrevio, premios);

    console.log(`\nRESULTADOS:`);
    for (const mod of ['Tradicional', 'Match', 'Desquite', 'Sale o Sale']) {
      const r = resultado.porModalidad[mod];
      if (r) {
        console.log(`  ${mod}: ${r.porNivel[6]?.ganadores || 0} 1ros, ${r.porNivel[5]?.ganadores || 0} 2dos, ${r.porNivel[4]?.ganadores || 0} 3ros`);
      }
    }
    console.log(`  Total ganadores: ${resultado.totalGanadores}`);
    console.log(`${'='.repeat(50)}\n`);

    // Guardar en BD
    try {
      await guardarEscrutinioLoto(resultado, datosControlPrevio, req.user);
      resultado.resguardo = { success: true };
    } catch (errGuardar) {
      console.error('⚠️ Error guardando escrutinio Loto (no crítico):', errGuardar.message);
      resultado.resguardo = { success: false, error: errGuardar.message };
    }

    return successResponse(res, resultado, 'Escrutinio Loto completado correctamente');
  } catch (error) {
    console.error('Error en escrutinio Loto:', error);
    return errorResponse(res, 'Error ejecutando escrutinio: ' + error.message, 500);
  }
};

/**
 * Ejecuta el escrutinio completo de Loto con 4 modalidades
 */
function runScrutiny(registrosNTF, extracto, datosControlPrevio, premiosConfig) {
  const extractNumbers = new Set(extracto.numeros.map(n => parseInt(n)));
  const numeroPLUS = extracto.plus != null ? parseInt(extracto.plus) : null;

  // Premios por modalidad (vienen del XML o se ingresan manualmente)
  const premiosPorModalidad = premiosConfig || {};

  // Estructura de resultados por modalidad
  const porModalidad = {};
  const modalidades = ['Tradicional', 'Match', 'Desquite', 'Sale o Sale'];

  for (const mod of modalidades) {
    porModalidad[mod] = {
      registros: 0,
      apuestas: 0,
      recaudacion: 0,
      porNivel: {
        6: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0, agenciasGanadoras: [] },
        5: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 },
        4: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 }
      },
      agenciero: { ganadores: 0, premioUnitario: PREMIO_AGENCIERO, totalPremios: 0 },
      plus: { ganadores: 0, premioExtra: 0 }
    };
  }

  let totalGanadores = 0;
  let totalPremios = 0;
  let totalRegistros = 0;
  let totalApuestas = 0;
  let totalRecaudacion = 0;

  // Separar registros por modalidad
  const registrosPorModalidad = {};
  const registrosPlus = []; // Registros PLUS se vinculan a Tradicional

  for (const reg of registrosNTF) {
    if (reg.tipoJuego !== 'Loto') continue;
    if (reg.cancelado || reg.isCanceled) continue;

    const modalidad = reg.modalidad || MODALIDAD_POR_CODIGO[reg.gameCode] || 'Tradicional';

    if (modalidad === 'Plus') {
      registrosPlus.push(reg);
      continue;
    }

    if (!registrosPorModalidad[modalidad]) {
      registrosPorModalidad[modalidad] = [];
    }
    registrosPorModalidad[modalidad].push(reg);
  }

  // Procesar cada modalidad
  for (const mod of modalidades) {
    const regs = registrosPorModalidad[mod] || [];
    const modResult = porModalidad[mod];

    for (const reg of regs) {
      modResult.registros++;
      totalRegistros++;

      const cantNum = parseInt(reg.cantNum || 6);
      const nroApuestas = COMBINACIONES_LOTO[cantNum] || combinaciones(cantNum, 6);
      modResult.apuestas += nroApuestas;
      totalApuestas += nroApuestas;

      const importe = parseFloat(reg.importe || 0);
      modResult.recaudacion += importe;
      totalRecaudacion += importe;

      // Decodificar números
      let betNumbers = [];
      if (reg.numeros && Array.isArray(reg.numeros)) {
        betNumbers = reg.numeros.map(n => parseInt(n));
      } else if (reg.secuencia) {
        betNumbers = decodificarNumerosLoto(reg.secuencia);
      }

      if (betNumbers.length < 6) continue;

      // Calcular ganadores
      if (cantNum === 6) {
        const hits = countHits(betNumbers, extractNumbers);
        if (hits >= 4) {
          modResult.porNivel[hits].ganadores++;
          if (hits === 6) {
            modResult.porNivel[6].agenciasGanadoras.push({
              agencia: reg.agencia || '',
              agenciaCompleta: reg.agenciaCompleta || '',
              ticket: reg.ticket || ''
            });
          }
        }
      } else {
        const ganadoresMultiples = calcularGanadoresMultiples(betNumbers, extractNumbers, cantNum);
        for (const nivel of [6, 5, 4]) {
          modResult.porNivel[nivel].ganadores += ganadoresMultiples[nivel];
        }
        if (ganadoresMultiples[6] > 0) {
          modResult.porNivel[6].agenciasGanadoras.push({
            agencia: reg.agencia || '',
            agenciaCompleta: reg.agenciaCompleta || '',
            ticket: reg.ticket || '',
            esMultiple: true,
            cantidad: ganadoresMultiples[6]
          });
        }
      }
    }

    // Aplicar regla "Sale o Sale" (cascada)
    if (mod === 'Sale o Sale') {
      aplicarReglaSaleOSale(modResult);
    }

    // Calcular premios por nivel
    const premioModalidad = premiosPorModalidad[mod.toLowerCase()] ||
                            premiosPorModalidad[mod] || 0;

    // Distribuir premio: 1er premio = todo el pozo si hay ganadores de 6
    // Si no hay de 6, el pozo queda vacante (excepto Sale o Sale)
    for (const nivel of [6, 5, 4]) {
      const nivelData = modResult.porNivel[nivel];
      // Para Sale o Sale, el premio se asigna al nivel más alto con ganadores
      // Para las demás modalidades, cada nivel tiene su propio pozo
      if (nivelData.ganadores > 0 && premioModalidad > 0) {
        if (mod === 'Sale o Sale') {
          // En Sale o Sale el premio entero va al nivel ganador (ya resuelto en aplicarReglaSaleOSale)
          if (nivelData._esSaleOSale) {
            nivelData.premioUnitario = premioModalidad / nivelData.ganadores;
            nivelData.totalPremios = premioModalidad;
          }
        } else {
          // Para Tradicional/Match/Desquite: solo el 1er premio usa el pozo completo
          if (nivel === 6) {
            nivelData.premioUnitario = premioModalidad / nivelData.ganadores;
            nivelData.totalPremios = premioModalidad;
          }
          // 2do y 3er premio son fracciones del pozo (si aplica configuración específica)
        }
        totalGanadores += nivelData.ganadores;
        totalPremios += nivelData.totalPremios;
      } else if (nivelData.ganadores === 0) {
        nivelData.pozoVacante = nivel === 6 ? premioModalidad : 0;
      }
      nivelData.ganadoresTexto = ganadoresTexto(nivelData.ganadores);
    }

    // Premio agenciero (solo si hay ganador de 1er premio)
    if (modResult.porNivel[6].ganadores > 0) {
      modResult.agenciero.ganadores = modResult.porNivel[6].agenciasGanadoras.length;
      modResult.agenciero.totalPremios = modResult.agenciero.ganadores * PREMIO_AGENCIERO;
      totalPremios += modResult.agenciero.totalPremios;
    }
  }

  // Procesar PLUS: verificar si algún registro PLUS tiene el número coincidente
  let ganadoresPlus = 0;
  let premioExtraPlus = 0;

  if (numeroPLUS != null) {
    for (const reg of registrosPlus) {
      if (reg.numeroPlus === numeroPLUS) {
        ganadoresPlus++;
        // El PLUS duplica el premio del Tradicional
        // Se vincula al premio del Tradicional del mismo ticket
      }
    }
  }

  // Comparación con control previo
  const cpRegistros = datosControlPrevio?.resumen?.registros || totalRegistros;
  const cpApuestas = datosControlPrevio?.resumen?.apuestasTotal || totalApuestas;
  const cpRecaudacion = datosControlPrevio?.resumen?.recaudacion || totalRecaudacion;

  return {
    numeroSorteo: datosControlPrevio?.sorteo || datosControlPrevio?.numeroSorteo || 'S/N',
    fechaSorteo: datosControlPrevio?.fecha || '',
    totalGanadores,
    totalPremios,
    porModalidad,
    plus: {
      numero: numeroPLUS,
      ganadores: ganadoresPlus,
      premioExtra: premioExtraPlus
    },
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
      numeros: [...extractNumbers],
      plus: numeroPLUS
    }
  };
}

/**
 * Regla "Sale o Sale":
 * Si no hay ganadores de 6 aciertos, el premio pasa a 5 aciertos.
 * Si no hay de 5, pasa a 4 aciertos.
 * Marca el nivel ganador con _esSaleOSale = true
 */
function aplicarReglaSaleOSale(modResult) {
  for (const nivel of [6, 5, 4]) {
    if (modResult.porNivel[nivel].ganadores > 0) {
      modResult.porNivel[nivel]._esSaleOSale = true;
      // Limpiar niveles inferiores que no aplican
      for (let n = nivel - 1; n >= 4; n--) {
        modResult.porNivel[n].ganadores = 0;
      }
      return;
    }
  }
}

/**
 * Guarda los resultados del escrutinio de Loto en la BD
 */
async function guardarEscrutinioLoto(resultado, datosControlPrevio, user) {
  const sorteo = resultado.numeroSorteo || 'N/A';

  await query(`
    INSERT INTO escrutinio_loto
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
  decodificarNumerosLoto,
  calcularGanadoresMultiples,
  combinaciones
};
