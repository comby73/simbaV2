/**
 * Loto Escrutinio Controller - Control Posterior
 *
 * 5 Modalidades con extracto propio cada una:
 * - Tradicional (NTF 07): 6/5/4 aciertos (65%/15%/3%), agenciero 2%, fondo reserva 15%
 * - Match (NTF 08): Igual a Tradicional
 * - Desquite (NTF 09): Solo 6 aciertos (80%), agenciero 2%, fondo reserva 18%
 * - Sale o Sale (NTF 10): Cascada 6→5→4→3→2→1 (85%), agenciero 2% solo con 6 aciertos
 * - Multiplicador (NTF 11): Ganadores = 6 aciertos en otra mod + PLUS match → 2x premio extra
 *
 * Premios vienen del XML (TOTALES por nivel por modalidad), no se ingresan manualmente.
 * Cada modalidad tiene su propio extracto de 6 números (0-45).
 * PLUS es un número compartido (0-9).
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
  '11': 'Multiplicador'
};

// Premio agenciero fijo para Multiplicador
const AGENCIERO_MULTIPLICADOR_FIJO = 500000;

function combinaciones(n, k) {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  let num = 1, den = 1;
  for (let i = n; i > n - k; i--) num *= i;
  for (let i = 1; i <= k; i++) den *= i;
  return Math.round(num / den);
}

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

function countHits(betNumbers, extractSet) {
  let hits = 0;
  for (const num of betNumbers) {
    if (extractSet.has(num)) hits++;
  }
  return hits;
}

/**
 * Calcula ganadores múltiples para apuesta con más de 6 números
 * C(aciertos, nivel) * C(totalNums - aciertos, 6 - nivel)
 */
function calcularGanadoresMultiples(betNumbers, extractSet, numbersCount) {
  const betSet = new Set(betNumbers);
  let hits = 0;
  for (const num of betSet) {
    if (extractSet.has(num)) hits++;
  }

  const ganadores = { 6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const nivel of [6, 5, 4, 3, 2, 1]) {
    if (hits >= nivel) {
      ganadores[nivel] = combinaciones(hits, nivel) * combinaciones(numbersCount - hits, 6 - nivel);
    }
  }
  return ganadores;
}

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

function esEnteroEnRango(valor, min, max) {
  if (valor === null || valor === undefined || valor === '') return false;
  const num = Number(valor);
  return Number.isInteger(num) && num >= min && num <= max;
}

function parsearExtractoModalidad(rawArray, label) {
  if (!Array.isArray(rawArray)) {
    return { error: `Extracto inválido para ${label}: debe ser un array de 6 números` };
  }

  if (rawArray.length !== 6) {
    return { error: `Extracto inválido para ${label}: se requieren exactamente 6 números` };
  }

  const numeros = rawArray.map(n => parseInt(n, 10));
  for (let i = 0; i < numeros.length; i++) {
    const num = numeros[i];
    if (!esEnteroEnRango(num, 0, 45)) {
      return { error: `Extracto inválido para ${label}: número fuera de rango (0-45)` };
    }
  }

  const unique = new Set(numeros);
  if (unique.size !== 6) {
    return { error: `Extracto inválido para ${label}: no se permiten números repetidos` };
  }

  return { value: numeros };
}

function validarPremiosXML(datosControlPrevio) {
  const modalidades = datosControlPrevio?.datosOficiales?.modalidades;
  if (!modalidades || typeof modalidades !== 'object') {
    return 'Faltan premios del XML: datosOficiales.modalidades';
  }

  const requeridos = {
    'Tradicional': ['primerPremio', 'segundoPremio', 'tercerPremio', 'agenciero'],
    'Match': ['primerPremio', 'segundoPremio', 'tercerPremio', 'agenciero'],
    'Desquite': ['primerPremio', 'agenciero'],
    'Sale o Sale': ['primerPremio']
  };

  for (const [mod, campos] of Object.entries(requeridos)) {
    const premios = modalidades[mod]?.premios;
    if (!premios) return `Faltan premios XML para la modalidad ${mod}`;
    for (const campo of campos) {
      if (!premios[campo] || premios[campo].totales == null) {
        return `Falta ${campo}.totales en premios XML para ${mod}`;
      }
      const total = Number(premios[campo].totales);
      if (!Number.isFinite(total) || total < 0) {
        return `Premio inválido en XML para ${mod} (${campo}.totales)`;
      }
    }
  }

  return null;
}

/**
 * Endpoint: ejecutar escrutinio de Loto
 * Recibe:
 * - registrosNTF: array de registros parseados del control previo
 * - extracto: { tradicional: [6], match: [6], desquite: [6], saleOSale: [6], plus: 0-9 }
 * - datosControlPrevio: datos del CP incluyendo datosOficiales.modalidades con premios XML
 */
const ejecutar = async (req, res) => {
  const { registrosNTF, extracto, datosControlPrevio } = req.body;

  if (!registrosNTF || !extracto) {
    return errorResponse(res, 'Faltan datos para ejecutar el escrutinio', 400);
  }

  if (!Array.isArray(registrosNTF) || registrosNTF.length === 0) {
    return errorResponse(res, 'registrosNTF inválido o vacío', 400);
  }

  // Validar 4 extractos de 6 números cada uno
  const modKeys = [
    { key: 'tradicional', label: 'Tradicional' },
    { key: 'match', label: 'Match' },
    { key: 'desquite', label: 'Desquite' },
    { key: 'saleOSale', label: 'Sale o Sale' }
  ];

  const extractoValidado = {};
  for (const { key, label } of modKeys) {
    const parsed = parsearExtractoModalidad(extracto[key], label);
    if (parsed.error) {
      return errorResponse(res, parsed.error, 400);
    }
    extractoValidado[key] = parsed.value;
  }

  // Validar PLUS (opcional)
  let plus = null;
  if (extracto.plus !== null && extracto.plus !== undefined && extracto.plus !== '') {
    if (!esEnteroEnRango(extracto.plus, 0, 9)) {
      return errorResponse(res, 'Número PLUS inválido: debe ser entero entre 0 y 9', 400);
    }
    plus = parseInt(extracto.plus, 10);
  }

  // Validar premios XML requeridos
  const errorXML = validarPremiosXML(datosControlPrevio);
  if (errorXML) {
    return errorResponse(res, errorXML, 400);
  }

  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== ESCRUTINIO LOTO PLUS ===`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Registros recibidos: ${registrosNTF.length}`);
    console.log(`Extracto Tradicional: ${extractoValidado.tradicional.join(', ')}`);
    console.log(`Extracto Match: ${extractoValidado.match.join(', ')}`);
    console.log(`Extracto Desquite: ${extractoValidado.desquite.join(', ')}`);
    console.log(`Extracto Sale o Sale: ${extractoValidado.saleOSale.join(', ')}`);
    console.log(`Número PLUS: ${plus != null ? plus : 'N/A'}`);

    const resultado = runScrutiny(registrosNTF, {
      ...extractoValidado,
      plus
    }, datosControlPrevio);

    console.log(`\nRESULTADOS:`);
    for (const mod of ['Tradicional', 'Match', 'Desquite', 'Sale o Sale']) {
      const r = resultado.porModalidad[mod];
      if (r) {
        const g6 = r.porNivel[6]?.ganadores || 0;
        const g5 = r.porNivel[5]?.ganadores || 0;
        const g4 = r.porNivel[4]?.ganadores || 0;
        console.log(`  ${mod}: 6ac=${g6}, 5ac=${g5}, 4ac=${g4}`);
      }
    }
    if (resultado.multiplicador) {
      console.log(`  Multiplicador: ${resultado.multiplicador.ganadores} ganadores`);
    }
    console.log(`  Total ganadores: ${resultado.totalGanadores}`);
    console.log(`  Total premios: $${resultado.totalPremios.toLocaleString('es-AR')}`);
    console.log(`${'='.repeat(60)}\n`);

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
 * Ejecuta el escrutinio completo de Loto Plus
 */
function runScrutiny(registrosNTF, extracto, datosControlPrevio) {
  const numeroPLUS = extracto.plus != null ? parseInt(extracto.plus) : null;

  // Extracto por modalidad (cada una tiene sus 6 números)
  const extractoPorModalidad = {
    'Tradicional': new Set(extracto.tradicional.map(n => parseInt(n))),
    'Match': new Set(extracto.match.map(n => parseInt(n))),
    'Desquite': new Set(extracto.desquite.map(n => parseInt(n))),
    'Sale o Sale': new Set(extracto.saleOSale.map(n => parseInt(n)))
  };

  // Premios del XML (datosOficiales.modalidades)
  const premiosXML = datosControlPrevio?.datosOficiales?.modalidades || {};

  // Estructura de resultados por modalidad
  const porModalidad = {};
  const modalidades4 = ['Tradicional', 'Match', 'Desquite', 'Sale o Sale'];

  for (const mod of modalidades4) {
    porModalidad[mod] = {
      registros: 0,
      apuestas: 0,
      recaudacion: 0,
      porNivel: {
        6: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0, agenciasGanadoras: [] },
        5: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 },
        4: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 },
        3: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 },
        2: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 },
        1: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 }
      },
      agenciero: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 },
      xmlPremios: premiosXML[mod]?.premios || null,
      xmlRecaudacion: premiosXML[mod] || null
    };
  }

  let totalGanadores = 0;
  let totalPremios = 0;

  // Separar registros por modalidad
  const registrosPorModalidad = {};
  const registrosMultiplicador = []; // código 11

  for (const reg of registrosNTF) {
    if (reg.tipoJuego !== 'Loto') continue;
    if (reg.cancelado || reg.isCanceled) continue;

    const modalidad = reg.modalidad || MODALIDAD_POR_CODIGO[reg.gameCode] || 'Tradicional';

    if (modalidad === 'Multiplicador' || modalidad === 'Plus') {
      registrosMultiplicador.push(reg);
      continue;
    }

    if (!registrosPorModalidad[modalidad]) {
      registrosPorModalidad[modalidad] = [];
    }
    registrosPorModalidad[modalidad].push(reg);
  }

  // === Procesar cada modalidad principal ===
  for (const mod of modalidades4) {
    const regs = registrosPorModalidad[mod] || [];
    const modResult = porModalidad[mod];
    const extractSet = extractoPorModalidad[mod];

    for (const reg of regs) {
      modResult.registros++;
      const cantNum = parseInt(reg.cantNum || 6);
      const nroApuestas = COMBINACIONES_LOTO[cantNum] || combinaciones(cantNum, 6);
      modResult.apuestas += nroApuestas;
      modResult.recaudacion += parseFloat(reg.importe || 0);

      // Decodificar números
      let betNumbers = [];
      if (reg.numeros && Array.isArray(reg.numeros)) {
        betNumbers = reg.numeros.map(n => parseInt(n));
      } else if (reg.secuencia) {
        betNumbers = decodificarNumerosLoto(reg.secuencia);
      }
      if (betNumbers.length < 6) continue;

      // Calcular aciertos
      if (cantNum === 6) {
        const hits = countHits(betNumbers, extractSet);
        if (hits >= 1 && modResult.porNivel[hits]) {
          modResult.porNivel[hits].ganadores++;
          if (hits === 6) {
            modResult.porNivel[6].agenciasGanadoras.push({
              agencia: reg.agencia || '',
              agenciaCompleta: reg.agenciaCompleta || '',
              ticket: reg.ticket || '',
              esVentaWeb: reg.esVentaWeb || false
            });
          }
        }
      } else {
        // Apuesta múltiple
        const ganadoresMultiples = calcularGanadoresMultiples(betNumbers, extractSet, cantNum);
        for (const nivel of [6, 5, 4, 3, 2, 1]) {
          if (modResult.porNivel[nivel]) {
            modResult.porNivel[nivel].ganadores += ganadoresMultiples[nivel];
          }
        }
        if (ganadoresMultiples[6] > 0) {
          modResult.porNivel[6].agenciasGanadoras.push({
            agencia: reg.agencia || '',
            agenciaCompleta: reg.agenciaCompleta || '',
            ticket: reg.ticket || '',
            esMultiple: true,
            cantidad: ganadoresMultiples[6],
            esVentaWeb: reg.esVentaWeb || false
          });
        }
      }
    }

    // === Distribuir premios según modalidad ===
    const xmlPremios = premiosXML[mod]?.premios || {};

    if (mod === 'Tradicional' || mod === 'Match') {
      distribuirPremiosTradMatch(modResult, xmlPremios);
    } else if (mod === 'Desquite') {
      distribuirPremiosDesquite(modResult, xmlPremios);
    } else if (mod === 'Sale o Sale') {
      distribuirPremiosSaleOSale(modResult, xmlPremios);
    }

    // Sumar totales según modalidad
    const nivelesParaTotal = (mod === 'Sale o Sale')
      ? [6, 5, 4, 3, 2, 1]
      : (mod === 'Desquite' ? [6] : [6, 5, 4]);

    for (const nivel of nivelesParaTotal) {
      const nd = modResult.porNivel[nivel];
      if (nd?.ganadores > 0) totalGanadores += nd.ganadores;
      totalPremios += nd?.totalPremios || 0;
    }
    totalPremios += modResult.agenciero.totalPremios || 0;

    // Texto ganadores
    for (const nivel of nivelesParaTotal) {
      if (modResult.porNivel[nivel]) {
        modResult.porNivel[nivel].ganadoresTexto = ganadoresTexto(modResult.porNivel[nivel].ganadores);
      }
    }
  }

  // === Multiplicador ===
  const multiplicador = procesarMultiplicador(
    registrosMultiplicador, extractoPorModalidad, numeroPLUS, porModalidad
  );
  totalGanadores += multiplicador.ganadores;
  totalPremios += multiplicador.premioExtra + multiplicador.agenciero.totalPremios;

  // Comparación con control previo
  const cpResumen = datosControlPrevio?.resumen || datosControlPrevio || {};
  const cpRegistros = cpResumen.registros || 0;
  const cpApuestas = cpResumen.apuestasTotal || 0;
  const cpRecaudacion = cpResumen.recaudacion || 0;

  let totalRegistros = 0, totalApuestas = 0, totalRecaudacion = 0;
  for (const mod of modalidades4) {
    totalRegistros += porModalidad[mod].registros;
    totalApuestas += porModalidad[mod].apuestas;
    totalRecaudacion += porModalidad[mod].recaudacion;
  }

  return {
    numeroSorteo: datosControlPrevio?.sorteo || datosControlPrevio?.numeroSorteo || 'S/N',
    fechaSorteo: datosControlPrevio?.fecha || '',
    totalGanadores,
    totalPremios,
    porModalidad,
    multiplicador,
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
      tradicional: [...extractoPorModalidad['Tradicional']],
      match: [...extractoPorModalidad['Match']],
      desquite: [...extractoPorModalidad['Desquite']],
      saleOSale: [...extractoPorModalidad['Sale o Sale']],
      plus: numeroPLUS
    }
  };
}

/**
 * Distribuye premios para Tradicional / Match
 * 6 aciertos: primerPremio.totales (65%)
 * 5 aciertos: segundoPremio.totales (15%)
 * 4 aciertos: tercerPremio.totales (3%)
 * Agenciero: agenciero.totales (2%) - a agencias de ganadores de 6
 */
function distribuirPremiosTradMatch(modResult, xmlPremios) {
  const niveles = [
    { nivel: 6, pool: xmlPremios.primerPremio?.totales || 0 },
    { nivel: 5, pool: xmlPremios.segundoPremio?.totales || 0 },
    { nivel: 4, pool: xmlPremios.tercerPremio?.totales || 0 }
  ];

  for (const { nivel, pool } of niveles) {
    const nd = modResult.porNivel[nivel];
    if (nd.ganadores > 0 && pool > 0) {
      nd.premioUnitario = pool / nd.ganadores;
      nd.totalPremios = pool;
      nd.pozoVacante = 0;
    } else {
      nd.pozoVacante = pool;
      nd.totalPremios = 0;
    }
  }

  // Agenciero: pagado a agencias que vendieron tickets con 6 aciertos
  const agPool = xmlPremios.agenciero?.totales || 0;
  const gan6 = modResult.porNivel[6].ganadores;
  if (gan6 > 0 && agPool > 0) {
    // Contar agencias únicas (excluyendo venta web LOTBA)
    const agenciasUnicas = [...new Set(
      modResult.porNivel[6].agenciasGanadoras
        .filter(g => !g.esVentaWeb)
        .map(g => g.agenciaCompleta)
    )];
    const cantAg = agenciasUnicas.length || 1;
    modResult.agenciero = {
      ganadores: cantAg,
      premioUnitario: agPool / cantAg,
      totalPremios: agPool,
      pozoVacante: 0,
      agencias: agenciasUnicas
    };
  } else {
    modResult.agenciero.pozoVacante = agPool;
  }
}

/**
 * Distribuye premios para Desquite
 * Solo 6 aciertos: primerPremio.totales (80%)
 * Sin 5 ni 4 aciertos
 * Agenciero: agenciero.totales (2%)
 */
function distribuirPremiosDesquite(modResult, xmlPremios) {
  const pool6 = xmlPremios.primerPremio?.totales || 0;
  const gan6 = modResult.porNivel[6].ganadores;

  if (gan6 > 0 && pool6 > 0) {
    modResult.porNivel[6].premioUnitario = pool6 / gan6;
    modResult.porNivel[6].totalPremios = pool6;
    modResult.porNivel[6].pozoVacante = 0;
  } else {
    modResult.porNivel[6].pozoVacante = pool6;
  }

  // 5 y 4 no aplican en Desquite
  modResult.porNivel[5].noAplica = true;
  modResult.porNivel[4].noAplica = true;

  // Agenciero
  const agPool = xmlPremios.agenciero?.totales || 0;
  if (gan6 > 0 && agPool > 0) {
    const agenciasUnicas = [...new Set(
      modResult.porNivel[6].agenciasGanadoras
        .filter(g => !g.esVentaWeb)
        .map(g => g.agenciaCompleta)
    )];
    const cantAg = agenciasUnicas.length || 1;
    modResult.agenciero = {
      ganadores: cantAg,
      premioUnitario: agPool / cantAg,
      totalPremios: agPool,
      pozoVacante: 0,
      agencias: agenciasUnicas
    };
  } else {
    modResult.agenciero.pozoVacante = agPool;
  }
}

/**
 * Distribuye premios para Sale o Sale
 * Cascada: si no hay 6 aciertos → 5 → 4 → 3 → 2 → 1
 * Premio Mayor: primerPremio.totales (85%)
 * Agenciero: solo cuando ganan con 6 aciertos (2% del premio mayor, desde fondo reserva)
 */
function distribuirPremiosSaleOSale(modResult, xmlPremios) {
  const poolMayor = xmlPremios.primerPremio?.totales || 0;

  // Buscar nivel más alto con ganadores (cascada)
  let nivelGanador = null;
  for (const nivel of [6, 5, 4, 3, 2, 1]) {
    if (modResult.porNivel[nivel] && modResult.porNivel[nivel].ganadores > 0) {
      nivelGanador = nivel;
      break;
    }
  }

  if (nivelGanador && poolMayor > 0) {
    modResult.porNivel[nivelGanador].premioUnitario = poolMayor / modResult.porNivel[nivelGanador].ganadores;
    modResult.porNivel[nivelGanador].totalPremios = poolMayor;
    modResult.porNivel[nivelGanador]._esSaleOSale = true;
    modResult.porNivel[nivelGanador].pozoVacante = 0;
  }

  modResult.nivelGanadorSOS = nivelGanador;

  // Marcar niveles que no ganaron
  for (const nivel of [6, 5, 4]) {
    if (nivel !== nivelGanador) {
      modResult.porNivel[nivel].pozoVacante = 0; // SOS no tiene pozo vacante por nivel
    }
  }

  // Agenciero: SOLO cuando ganan con 6 aciertos
  if (nivelGanador === 6) {
    // Agenciero SOS = 2% del premio mayor (desde fondo reserva)
    const agPool = poolMayor * 0.02;
    const agenciasUnicas = [...new Set(
      modResult.porNivel[6].agenciasGanadoras
        .filter(g => !g.esVentaWeb)
        .map(g => g.agenciaCompleta)
    )];
    const cantAg = agenciasUnicas.length || 1;
    modResult.agenciero = {
      ganadores: cantAg,
      premioUnitario: agPool / cantAg,
      totalPremios: agPool,
      pozoVacante: 0,
      soloConSeisAciertos: true,
      agencias: agenciasUnicas
    };
  }
}

/**
 * Procesa Multiplicador
 * Ganadores = quienes acertaron 6 en CUALQUIER otra modalidad Y coincide su PLUS
 * Premio = 2x premio original de esa modalidad (total percibido = 3x)
 * Agenciero = $500,000 fijo por agencia ganadora
 */
function procesarMultiplicador(registrosMultiplicador, extractoPorModalidad, numeroPLUS, porModalidad) {
  const resultado = {
    ganadores: 0,
    premioExtra: 0,
    agenciero: { ganadores: 0, premioUnitario: AGENCIERO_MULTIPLICADOR_FIJO, totalPremios: 0 },
    detalle: [],
    numeroPLUS
  };

  if (numeroPLUS == null) return resultado;

  // Crear mapa de tickets ganadores de 6 en cada modalidad
  const ganadoresDe6PorTicket = {};
  for (const mod of ['Tradicional', 'Match', 'Desquite', 'Sale o Sale']) {
    const agGanadoras = porModalidad[mod]?.porNivel[6]?.agenciasGanadoras || [];
    for (const g of agGanadoras) {
      const ticketKey = g.ticket;
      if (!ganadoresDe6PorTicket[ticketKey]) {
        ganadoresDe6PorTicket[ticketKey] = [];
      }
      ganadoresDe6PorTicket[ticketKey].push({
        modalidad: mod,
        agencia: g.agencia,
        agenciaCompleta: g.agenciaCompleta,
        premioUnitario: porModalidad[mod].porNivel[6].premioUnitario,
        esVentaWeb: g.esVentaWeb
      });
    }
  }

  // Para Sale o Sale: si el nivel ganador no fue 6, no aplica multiplicador
  const sosNivelGanador = porModalidad['Sale o Sale']?.nivelGanadorSOS;
  if (sosNivelGanador && sosNivelGanador !== 6) {
    // Remover entries de SOS del mapa
    for (const ticketKey in ganadoresDe6PorTicket) {
      ganadoresDe6PorTicket[ticketKey] = ganadoresDe6PorTicket[ticketKey].filter(
        g => g.modalidad !== 'Sale o Sale'
      );
      if (ganadoresDe6PorTicket[ticketKey].length === 0) {
        delete ganadoresDe6PorTicket[ticketKey];
      }
    }
  }

  // Verificar registros multiplicador que coinciden con PLUS
  for (const reg of registrosMultiplicador) {
    if (reg.numeroPlus !== numeroPLUS && reg.numeroPlus !== String(numeroPLUS)) continue;

    const ticketKey = reg.ticket;
    const ganEnOtraMod = ganadoresDe6PorTicket[ticketKey];
    if (!ganEnOtraMod || ganEnOtraMod.length === 0) continue;

    // Este ticket ganó 6 aciertos en alguna modalidad Y acertó el PLUS
    for (const g of ganEnOtraMod) {
      const premioExtra = g.premioUnitario * 2; // 2x adicional (total 3x)
      resultado.ganadores++;
      resultado.premioExtra += premioExtra;
      resultado.detalle.push({
        ticket: ticketKey,
        agencia: g.agencia,
        agenciaCompleta: g.agenciaCompleta,
        modalidadOrigen: g.modalidad,
        premioOriginal: g.premioUnitario,
        premioMultiplicador: premioExtra,
        premioTotal: g.premioUnitario * 3,
        esVentaWeb: g.esVentaWeb
      });
    }
  }

  // Agenciero Multiplicador: $500,000 por agencia única ganadora (excluyendo LOTBA)
  const agenciasUnicas = [...new Set(
    resultado.detalle
      .filter(d => !d.esVentaWeb)
      .map(d => d.agenciaCompleta)
  )];
  resultado.agenciero = {
    ganadores: agenciasUnicas.length,
    premioUnitario: AGENCIERO_MULTIPLICADOR_FIJO,
    totalPremios: agenciasUnicas.length * AGENCIERO_MULTIPLICADOR_FIJO,
    agencias: agenciasUnicas
  };

  return resultado;
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
