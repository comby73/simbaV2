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
const { guardarPremiosPorAgencia } = require('../../shared/escrutinio.helper');

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

  console.log(`\n${'='.repeat(50)}`);
  console.log(`=== ESCRUTINIO LOTO 5 - DEBUG PREMIOS ===`);
  console.log(`${'='.repeat(50)}`);
  
  // DEBUG: Verificar estructura de datosControlPrevio
  console.log(`📋 DEBUG datosControlPrevio LOTO 5:`);
  console.log(`  - datosOficiales existe: ${!!datosControlPrevio?.datosOficiales}`);
  console.log(`  - premios existe: ${!!datosControlPrevio?.datosOficiales?.premios}`);
  if (datosControlPrevio?.datosOficiales?.premios) {
    const premios = datosControlPrevio.datosOficiales.premios;
    console.log(`  - primerPremio.totales: ${premios.primerPremio?.totales}`);
    console.log(`  - segundoPremio.totales: ${premios.segundoPremio?.totales}`);
    console.log(`  - tercerPremio.totales: ${premios.tercerPremio?.totales}`);
    console.log(`  - agenciero.totales: ${premios.agenciero?.totales}`);
  }

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
          const esVentaWeb = reg.esVentaWeb || reg.agenciaCompleta === '5188880';
          porNivel[5].agenciasGanadoras.push({
            agencia: reg.agencia || '',
            agenciaCompleta: reg.agenciaCompleta || '',
            ticket: reg.ticket || '',
            importe: importe,
            numerosJugados: betNumbers.slice(),
            esVentaWeb
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
        const esVentaWeb = reg.esVentaWeb || reg.agenciaCompleta === '5188880';
        porNivel[5].agenciasGanadoras.push({
          agencia: reg.agencia || '',
          agenciaCompleta: reg.agenciaCompleta || '',
          ticket: reg.ticket || '',
          esMultiple: true,
          cantidad: ganadoresMultiples[5],
          importe: importe,
          numerosJugados: betNumbers.slice(),
          esVentaWeb
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

  // Agenciero: se paga cuando hay ganadores de 5 aciertos (primer premio)
  // El premio va a las agencias que vendieron los tickets ganadores
  const totalPozosPrincipales = pozoXml5 + pozoXml4;
  const pozoAgencieroXml = parseFloat(xmlPremios.agenciero?.totales || 0);
  
  // Contar agencias únicas que vendieron tickets con 5 aciertos (excluyendo venta web)
  const agenciasGanadoras5 = porNivel[5].agenciasGanadoras || [];
  const agenciasUnicas = [...new Set(
    agenciasGanadoras5
      .filter(g => !g.esVentaWeb && g.agenciaCompleta !== '5188880')
      .map(g => g.agenciaCompleta)
  )];
  
  const hayGanadoresDe5 = porNivel[5].ganadores > 0;
  const pozoAgenciero = pozoAgencieroXml > 0 ? pozoAgencieroXml : totalPozosPrincipales * 0.01;
  
  let agenciero;
  if (hayGanadoresDe5 && agenciasUnicas.length > 0) {
    // Hay ganadores de 5 aciertos con agencias físicas
    agenciero = {
      ganadores: agenciasUnicas.length,
      premioUnitario: pozoAgenciero / agenciasUnicas.length,
      totalPremios: pozoAgenciero,
      pozoVacante: 0,
      pozoXml: pozoAgencieroXml,
      agencias: agenciasUnicas
    };
  } else if (hayGanadoresDe5 && agenciasUnicas.length === 0) {
    // Hay ganadores de 5 pero son todos de venta web
    agenciero = {
      ganadores: 0,
      premioUnitario: 0,
      totalPremios: 0,
      pozoVacante: pozoAgenciero,
      pozoXml: pozoAgencieroXml,
      agencias: [],
      nota: 'Ganadores por venta web (sin premio agenciero)'
    };
  } else {
    // No hay ganadores de 5 aciertos
    agenciero = {
      ganadores: 0,
      premioUnitario: 0,
      totalPremios: 0,
      pozoVacante: pozoAgenciero,
      pozoXml: pozoAgencieroXml,
      agencias: []
    };
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
/**
 * Guarda los resultados del escrutinio de Loto 5 en la BD
 * Incluye: escrutinio_loto5 (resumen) + escrutinio_loto5_ganadores (por nivel)
 */
async function guardarEscrutinioLoto5(resultado, datosControlPrevio, user) {
  const sorteo = resultado.numeroSorteo || 'N/A';
  const fecha = resultado.fechaSorteo || new Date().toISOString().split('T')[0];
  
  console.log(`📝 Guardando escrutinio LOTO 5: Sorteo ${sorteo}`);

  // 1. Guardar/actualizar registro principal
  await query(`
    INSERT INTO escrutinio_loto5
    (numero_sorteo, fecha_sorteo, total_ganadores, total_premios,
     extracto, datos_json, usuario_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      total_ganadores = VALUES(total_ganadores),
      total_premios = VALUES(total_premios),
      extracto = VALUES(extracto),
      datos_json = VALUES(datos_json),
      usuario_id = VALUES(usuario_id),
      updated_at = CURRENT_TIMESTAMP
  `, [
    sorteo,
    fecha,
    resultado.totalGanadores || 0,
    resultado.totalPremios || 0,
    JSON.stringify(resultado.extractoUsado || {}),
    JSON.stringify(resultado),
    user?.id || null
  ]);

  // 2. Obtener ID del escrutinio
  const [escrutinioRow] = await query(
    'SELECT id FROM escrutinio_loto5 WHERE numero_sorteo = ?',
    [sorteo]
  );
  const escrutinioId = escrutinioRow?.id;

  if (!escrutinioId) {
    console.warn('⚠️ No se pudo obtener ID del escrutinio LOTO 5');
    return;
  }

  // 3. Guardar ganadores por nivel
  try {
    // Limpiar ganadores anteriores
    await query('DELETE FROM escrutinio_loto5_ganadores WHERE escrutinio_id = ?', [escrutinioId]);

    // Niveles de aciertos (5, 4, 3)
    const niveles = [5, 4, 3];
    
    for (const nivel of niveles) {
      const nivelData = resultado.porNivel?.[nivel];
      if (nivelData && nivelData.ganadores > 0) {
        await query(`
          INSERT INTO escrutinio_loto5_ganadores
          (escrutinio_id, numero_sorteo, aciertos, cantidad_ganadores,
           premio_unitario, premio_total, pozo_xml, pozo_vacante)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          escrutinioId,
          sorteo,
          nivel,
          nivelData.ganadores,
          nivelData.premioUnitario || 0,
          nivelData.totalPremios || 0,
          nivelData.pozoXml || 0,
          nivelData.pozoVacante || 0
        ]);
      }
    }

    // Guardar agenciero
    const agenciero = resultado.agenciero;
    if (agenciero && (agenciero.ganadores > 0 || agenciero.pozoXml > 0)) {
      await query(`
        INSERT INTO escrutinio_loto5_ganadores
        (escrutinio_id, numero_sorteo, aciertos, cantidad_ganadores,
         premio_unitario, premio_total, pozo_xml, pozo_vacante)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        escrutinioId,
        sorteo,
        0, // 0 = agenciero
        agenciero.ganadores || 0,
        agenciero.premioUnitario || 0,
        agenciero.totalPremios || 0,
        agenciero.pozoXml || 0,
        agenciero.pozoVacante || 0
      ]);
    }

    // Guardar premios por agencia (acumulado)
    const ganadoresDetalle = [];
    
    // Ganadores de nivel 5
    const agGanadoras5 = resultado.porNivel?.[5]?.agenciasGanadoras || [];
    const premioUnit5 = resultado.porNivel?.[5]?.premioUnitario || 0;
    for (const ag of agGanadoras5) {
      const cantidad = ag.cantidad || 1;
      for (let i = 0; i < cantidad; i++) {
        ganadoresDetalle.push({
          agencia: ag.agenciaCompleta || ag.agencia,
          premio: premioUnit5
        });
      }
    }
    
    // Agenciero detalles
    const agencieroDet = resultado.agenciero?.detalles || [];
    const agencieroUnit = resultado.agenciero?.premioUnitario || 0;
    for (const det of agencieroDet) {
      ganadoresDetalle.push({
        agencia: det.agenciaCompleta || `${det.provincia || '51'}${(det.agencia || '').padStart(5, '0')}`,
        premio: agencieroUnit
      });
    }
    
    // Limpiar premios por agencia anteriores
    await query('DELETE FROM escrutinio_premios_agencia WHERE escrutinio_id = ? AND juego = ?', 
      [escrutinioId, 'loto5']);
    
    // Guardar
    if (ganadoresDetalle.length > 0) {
      await guardarPremiosPorAgencia(escrutinioId, 'loto5', ganadoresDetalle);
    }

    console.log(`✅ Escrutinio LOTO 5 guardado: Sorteo ${sorteo}, ${resultado.totalGanadores} ganadores, $${resultado.totalPremios?.toLocaleString('es-AR')} premios`);
  } catch (errGanadores) {
    // Si la tabla de ganadores no existe, solo loguear advertencia
    if (errGanadores.code === 'ER_NO_SUCH_TABLE') {
      console.warn('⚠️ Tabla escrutinio_loto5_ganadores no existe. Solo se guardó el JSON principal.');
      console.log('   Ejecute: node database/migration_loto5_ganadores.js');
    } else {
      throw errGanadores;
    }
  }
}

module.exports = {
  ejecutar,
  runScrutiny,
  decodificarNumerosLoto5,
  calcularGanadoresMultiples,
  combinaciones
};
