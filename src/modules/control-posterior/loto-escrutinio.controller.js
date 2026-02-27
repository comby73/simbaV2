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
 *
 * VERSION: 2026-02-08 v3 - Con debug de datosControlPrevio
 */

console.log('🔄 LOTO ESCRUTINIO CONTROLLER CARGADO - VERSION 2026-02-08 v3');

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
 * - datosControlPrevio: datos del control previo para comparación (incluye datosOficiales.modalidades con premios del XML)
 */
const ejecutar = async (req, res) => {
  const { registrosNTF, extracto, datosControlPrevio } = req.body;

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

    // Extraer premios del XML (datosOficiales.modalidades) automáticamente
    // IMPORTANTE: datosOficiales viene del XML del ZIP (Control Previo), NO del XML de extractos
    console.log('\n📋 DEBUG datosControlPrevio recibido:');
    console.log('   Keys en datosControlPrevio:', Object.keys(datosControlPrevio || {}));
    console.log('   datosOficiales existe?', !!datosControlPrevio?.datosOficiales);
    if (datosControlPrevio?.datosOficiales) {
      console.log('   Keys en datosOficiales:', Object.keys(datosControlPrevio.datosOficiales));
      console.log('   modalidades existe?', !!datosControlPrevio.datosOficiales.modalidades);
      console.log('   formato:', datosControlPrevio.datosOficiales.formato);
    }

    const modalidadesXml = datosControlPrevio?.datosOficiales?.modalidades || {};
    console.log(`\n📊 Modalidades XML del Control Previo: ${Object.keys(modalidadesXml).join(', ') || 'NINGUNA'}`);

    // Debug: mostrar TODOS los premios del XML por modalidad
    console.log('\n💰 PREMIOS DEL XML (Control Previo ZIP):');
    for (const [mod, data] of Object.entries(modalidadesXml)) {
      console.log(`\n   === ${mod.toUpperCase()} ===`);
      const premios = data?.premios || {};
      if (premios.primerPremio) {
        console.log(`   1er Premio: monto=$${premios.primerPremio.monto?.toLocaleString()}, totales=$${premios.primerPremio.totales?.toLocaleString()}`);
      }
      if (premios.segundoPremio) {
        console.log(`   2do Premio: monto=$${premios.segundoPremio.monto?.toLocaleString()}, totales=$${premios.segundoPremio.totales?.toLocaleString()}`);
      }
      if (premios.tercerPremio) {
        console.log(`   3er Premio: monto=$${premios.tercerPremio.monto?.toLocaleString()}, totales=$${premios.tercerPremio.totales?.toLocaleString()}`);
      }
      if (premios.agenciero) {
        console.log(`   🏪 AGENCIERO: monto=$${premios.agenciero.monto?.toLocaleString()}, pozoVacante=$${premios.agenciero.pozoVacante?.toLocaleString()}, TOTALES=$${premios.agenciero.totales?.toLocaleString()}`);
      } else {
        console.log(`   🏪 AGENCIERO: ❌ NO ENCONTRADO EN XML`);
      }
      if (premios.fondoReserva) {
        console.log(`   Fondo Reserva: $${premios.fondoReserva.monto?.toLocaleString()}`);
      }
      if (premios.fondoCompensador) {
        console.log(`   Fondo Compensador: $${premios.fondoCompensador.monto?.toLocaleString()}`);
      }
    }
    console.log('');

    const resultado = runScrutiny(registrosNTF, extracto, datosControlPrevio, modalidadesXml);

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
 * Ejecuta el escrutinio completo de Loto Plus con 4 modalidades
 *
 * IMPORTANTE: En Loto Plus, CADA ticket juega las 4 modalidades simultáneamente.
 * Un mismo ticket de 6 números se compara contra los 4 extractos diferentes.
 * El gameCode '09' es el código general de Loto Plus, NO significa Desquite específicamente.
 */
function runScrutiny(registrosNTF, extracto, datosControlPrevio, modalidadesXml) {
  const numeroPLUS = extracto.plus != null ? parseInt(extracto.plus) : null;

  // Extraer los 4 extractos por modalidad
  // El frontend envía: {tradicional: [], match: [], desquite: [], saleOSale: [], plus: N}
  const extractosPorModalidad = {
    'Tradicional': new Set((extracto.tradicional || extracto.numeros || []).map(n => parseInt(n))),
    'Match': new Set((extracto.match || []).map(n => parseInt(n))),
    'Desquite': new Set((extracto.desquite || []).map(n => parseInt(n))),
    'Sale o Sale': new Set((extracto.saleOSale || []).map(n => parseInt(n)))
  };

  console.log('=== INICIO runScrutiny ===');
  console.log(`Registros recibidos en runScrutiny: ${registrosNTF.length}`);
  console.log('Extractos usados:');
  for (const [mod, nums] of Object.entries(extractosPorModalidad)) {
    console.log(`  ${mod}: [${[...nums].join(', ')}]`);
  }
  console.log(`  PLUS: ${numeroPLUS}`);

  // Premios por modalidad vienen del XML (datosOficiales.modalidades)
  const xmlMods = modalidadesXml || {};

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

  // En Loto Plus, TODOS los registros juegan las 4 modalidades
  // No se separan por modalidad del registro, sino que cada uno se evalúa contra los 4 extractos
  const registrosLoto = registrosNTF.filter(reg =>
    reg.tipoJuego === 'Loto' && !reg.cancelado && !reg.isCanceled
  );

  // Los registros con Plus son para el Multiplicador
  const registrosConPlus = registrosLoto.filter(reg => reg.numeroPlus != null);

  // En Loto Plus, CADA registro se evalúa contra las 4 modalidades
  // Los registros/apuestas/recaudación se cuentan UNA SOLA VEZ (para Tradicional como base)
  // Pero los ganadores se evalúan contra cada extracto

  // Primero procesamos todos los registros UNA vez para contar registros/apuestas/recaudación
  const registrosProcesados = [];
  for (const reg of registrosLoto) {
    const cantNum = parseInt(reg.cantNum || 6);
    const nroApuestas = COMBINACIONES_LOTO[cantNum] || combinaciones(cantNum, 6);
    const importe = parseFloat(reg.importe || 0);

    // Decodificar números
    let betNumbers = [];
    if (reg.numeros && Array.isArray(reg.numeros)) {
      betNumbers = reg.numeros.map(n => parseInt(n));
    } else if (reg.secuencia) {
      betNumbers = decodificarNumerosLoto(reg.secuencia);
    }

    if (betNumbers.length < 6) continue;

    registrosProcesados.push({
      ...reg,
      betNumbers,
      cantNum,
      nroApuestas,
      importe
    });

    totalRegistros++;
    totalApuestas += nroApuestas;
    totalRecaudacion += importe;
  }

  // La recaudación se divide en 4 partes iguales (una por modalidad)
  // Pero para el resumen por modalidad usamos el total
  for (const mod of modalidades) {
    porModalidad[mod].registros = registrosProcesados.length;
    porModalidad[mod].apuestas = totalApuestas;
    porModalidad[mod].recaudacion = totalRecaudacion / 4; // Aproximación
  }

  // Ahora procesamos ganadores para CADA modalidad contra su extracto específico
  for (const mod of modalidades) {
    const modResult = porModalidad[mod];
    const extractNumbers = extractosPorModalidad[mod];

    if (!extractNumbers || extractNumbers.size === 0) {
      console.log(`⚠️ No hay extracto para modalidad ${mod}, saltando...`);
      continue;
    }

    console.log(`\n🎲 Procesando modalidad ${mod}: Extracto = [${[...extractNumbers].join(', ')}]`);

    let maxHits = 0;
    let gan6Count = 0;

    for (const reg of registrosProcesados) {
      const { betNumbers, cantNum, ticket, agenciaCompleta, esVentaWeb, importe, numeroPlus } = reg;

      // Calcular ganadores contra el extracto de ESTA modalidad
      if (cantNum === 6) {
        const hits = countHits(betNumbers, extractNumbers);
        if (hits > maxHits) maxHits = hits;
        if (hits >= 4) {
          modResult.porNivel[hits].ganadores++;
          if (hits === 6) {
            gan6Count++;
            modResult.porNivel[6].agenciasGanadoras.push({
              agencia: reg.agencia || '',
              agenciaCompleta: agenciaCompleta || '',
              ticket: ticket || '',
              esVentaWeb: esVentaWeb || false,
              importe: importe,
              numerosJugados: betNumbers.slice(),
              numeroPlus: numeroPlus
            });
            console.log(`🏆 GANADOR 6 ACIERTOS en ${mod}: Ticket ${ticket}, Agencia ${agenciaCompleta}, Nums: ${betNumbers.join(',')}`);
          }
        }
      } else {
        const ganadoresMultiples = calcularGanadoresMultiples(betNumbers, extractNumbers, cantNum);
        for (const nivel of [6, 5, 4]) {
          modResult.porNivel[nivel].ganadores += ganadoresMultiples[nivel];
        }
        if (ganadoresMultiples[6] > 0) {
          gan6Count += ganadoresMultiples[6];
          modResult.porNivel[6].agenciasGanadoras.push({
            agencia: reg.agencia || '',
            agenciaCompleta: agenciaCompleta || '',
            ticket: ticket || '',
            esMultiple: true,
            cantidad: ganadoresMultiples[6],
            esVentaWeb: esVentaWeb || false,
            importe: importe,
            numerosJugados: betNumbers.slice(),
            numeroPlus: numeroPlus
          });
        }
      }
    }

    console.log(`   → Max aciertos encontrados: ${maxHits}, Ganadores de 6: ${gan6Count}`);

    // Aplicar regla "Sale o Sale" (cascada)
    if (mod === 'Sale o Sale') {
      aplicarReglaSaleOSale(modResult);
    }

    // Obtener premios del XML para esta modalidad
    const xmlMod = xmlMods[mod] || {};
    const xmlPremios = xmlMod.premios || {};

    // Mapeo nivel → nodo XML de premio
    const nivelToXml = {
      6: xmlPremios.primerPremio,  // 6 aciertos = 1er premio
      5: xmlPremios.segundoPremio, // 5 aciertos = 2do premio
      4: xmlPremios.tercerPremio   // 4 aciertos = 3er premio
    };

    // Calcular premios por nivel usando TOTALES del XML
    for (const nivel of [6, 5, 4]) {
      const nivelData = modResult.porNivel[nivel];
      const xmlNivel = nivelToXml[nivel];
      const pozoXml = parseFloat(xmlNivel?.totales || 0);

      // Guardar pozo XML para referencia
      nivelData.pozoXml = pozoXml;

      if (mod === 'Sale o Sale') {
        // En Sale o Sale: cascada - solo el nivel marcado recibe todo el pozo del 1er premio
        const pozoSOS = parseFloat(xmlPremios.primerPremio?.totales || 0);
        if (nivelData.ganadores > 0 && nivelData._esSaleOSale) {
          nivelData.premioUnitario = pozoSOS / nivelData.ganadores;
          nivelData.totalPremios = pozoSOS;
        } else if (nivelData.ganadores === 0 && nivel === 6) {
          nivelData.pozoVacante = pozoSOS;
        }
      } else if (mod === 'Desquite') {
        // Desquite: solo 1er premio (6 aciertos)
        if (nivel === 6) {
          if (nivelData.ganadores > 0 && pozoXml > 0) {
            nivelData.premioUnitario = pozoXml / nivelData.ganadores;
            nivelData.totalPremios = pozoXml;
          } else if (nivelData.ganadores === 0) {
            nivelData.pozoVacante = pozoXml;
          }
        }
        // niveles 5 y 4 no aplican en Desquite
      } else {
        // Tradicional / Match: 3 niveles con pozo independiente del XML
        if (nivelData.ganadores > 0 && pozoXml > 0) {
          nivelData.premioUnitario = pozoXml / nivelData.ganadores;
          nivelData.totalPremios = pozoXml;
        } else if (nivelData.ganadores === 0) {
          nivelData.pozoVacante = pozoXml;
        }
      }

      totalGanadores += nivelData.ganadores;
      totalPremios += nivelData.totalPremios;
      nivelData.ganadoresTexto = ganadoresTexto(nivelData.ganadores);
    }

    // Premio agenciero del XML
    const xmlAgenciero = xmlPremios.agenciero;
    const pozoAgenciero = parseFloat(xmlAgenciero?.totales || 0);

    // DEBUG: Mostrar qué viene del XML para agenciero
    console.log(`📊 XML Premios ${mod}: primerPremio.totales=${xmlPremios.primerPremio?.totales || 0}, agenciero=${JSON.stringify(xmlAgenciero || 'NO EXISTE')}`);

    if (modResult.porNivel[6].ganadores > 0) {
      modResult.agenciero.ganadores = modResult.porNivel[6].agenciasGanadoras.length;
      // Para Sale o Sale: agenciero solo si ganan con 6 aciertos exactos
      if (mod === 'Sale o Sale' && !modResult.porNivel[6]._esSaleOSale) {
        modResult.agenciero.ganadores = 0;
      }
      console.log(`🏪 AGENCIERO ${mod}: gan6=${modResult.porNivel[6].ganadores}, pozoAgenciero=$${pozoAgenciero.toLocaleString()}, agenciasGanadoras=${modResult.agenciero.ganadores}`);
      if (modResult.agenciero.ganadores > 0) {
        modResult.agenciero.premioUnitario = pozoAgenciero > 0 ?
          pozoAgenciero / modResult.agenciero.ganadores : PREMIO_AGENCIERO;
        modResult.agenciero.totalPremios = modResult.agenciero.ganadores * modResult.agenciero.premioUnitario;
        totalPremios += modResult.agenciero.totalPremios;
        console.log(`   → Premio unitario: $${modResult.agenciero.premioUnitario.toLocaleString()}, Total: $${modResult.agenciero.totalPremios.toLocaleString()}`);
      }
    }

    // Fondo de reserva/compensador del XML (informativo)
    modResult.fondoReserva = parseFloat(xmlPremios.fondoReserva?.monto || 0);
    modResult.fondoCompensador = parseFloat(xmlPremios.fondoCompensador?.monto || 0);
  }

  // Procesar Multiplicador (PLUS):
  // Un ganador de Multiplicador es quien tiene:
  //   1) 6 aciertos en cualquier otra modalidad (Tradicional, Match, Desquite, SOS)
  //   2) Su número PLUS coincide con el número PLUS sorteado
  // El premio extra = 2x el premio original de esa modalidad
  // Agenciero Multiplicador = $500.000 fijo por ganador
  let ganadoresPlus = 0;
  let premioExtraPlus = 0;
  const multiplicadorDetalle = [];
  const xmlMultiplicador = xmlMods['Multiplicador'] || {};
  const PREMIO_AGENCIERO_MULTIPLICADOR = 500000;

  if (numeroPLUS != null) {
    console.log(`\n🎰 Procesando Multiplicador: PLUS sorteado = ${numeroPLUS}`);

    // Buscar ganadores: tickets con 6 aciertos en cualquier modalidad Y que acertaron el PLUS
    for (const mod of modalidades) {
      const modResult = porModalidad[mod];
      for (const ganador of modResult.porNivel[6].agenciasGanadoras) {
        if (ganador.numeroPlus != null && parseInt(ganador.numeroPlus) === numeroPLUS) {
          ganadoresPlus++;
          // El premio extra es 2x el premio original (el ganador recibe 3x total)
          const premioOriginal = modResult.porNivel[6].premioUnitario || 0;
          const premioExtra = premioOriginal * 2;
          premioExtraPlus += premioExtra;

          multiplicadorDetalle.push({
            ticket: ganador.ticket,
            agencia: ganador.agenciaCompleta,
            modalidad: mod,
            premioOriginal,
            premioExtra,
            esVentaWeb: ganador.esVentaWeb
          });

          console.log(`   ✓ GANADOR MULTIPLICADOR: Ticket ${ganador.ticket}, Modalidad ${mod}, Plus: ${ganador.numeroPlus}`);
          console.log(`     → Premio original: $${premioOriginal.toLocaleString()}, Extra: $${premioExtra.toLocaleString()}`);
        }
      }
    }

    if (ganadoresPlus > 0) {
      const fondoMultiplicador = parseFloat(xmlMultiplicador.premios?.fondoCompensador?.monto || 0);
      console.log(`   Total Multiplicador: ${ganadoresPlus} ganadores, Premio extra total: $${premioExtraPlus.toLocaleString()}`);
      totalPremios += premioExtraPlus;
      // Agenciero del Multiplicador
      totalPremios += ganadoresPlus * PREMIO_AGENCIERO_MULTIPLICADOR;
    }
  }

  // Comparación con control previo
  // Los datos se envían como spread de datosCalculados/resumen, así que los campos están al nivel raíz
  const cpRegistros = datosControlPrevio?.registros || datosControlPrevio?.resumen?.registros || totalRegistros;
  const cpApuestas = datosControlPrevio?.apuestasTotal || datosControlPrevio?.resumen?.apuestasTotal || totalApuestas;
  const cpRecaudacion = datosControlPrevio?.recaudacion || datosControlPrevio?.resumen?.recaudacion || totalRecaudacion;

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
      tradicional: [...extractosPorModalidad['Tradicional']],
      match: [...extractosPorModalidad['Match']],
      desquite: [...extractosPorModalidad['Desquite']],
      saleOSale: [...extractosPorModalidad['Sale o Sale']],
      plus: numeroPLUS
    },
    multiplicador: {
      numero: numeroPLUS,
      ganadores: ganadoresPlus,
      premioExtra: premioExtraPlus,
      detalle: multiplicadorDetalle
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
