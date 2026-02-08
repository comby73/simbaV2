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
const { guardarPremiosPorAgencia } = require('../../shared/escrutinio.helper');

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
    // Si no hay modalidades, permitir continuar sin validación de premios XML
    // Los premios se calcularán como 0 y se marcará VACANTE
    console.log('⚠️ No se encontraron premios XML - se continuará sin premios oficiales');
    return null;
  }

  // Validar solo las modalidades presentes - no requerir todas
  const premiosRequeridos = {
    'Tradicional': ['primerPremio'],
    'Match': ['primerPremio'],
    'Desquite': ['primerPremio'],
    'Sale o Sale': ['primerPremio']
  };

  for (const [mod, campos] of Object.entries(premiosRequeridos)) {
    const premios = modalidades[mod]?.premios;
    if (!premios) continue; // Modalidad no presente, saltar
    
    for (const campo of campos) {
      if (premios[campo] && premios[campo].totales != null) {
        const total = Number(premios[campo].totales);
        if (!Number.isFinite(total) || total < 0) {
          console.log(`⚠️ Premio inválido en XML para ${mod} (${campo}.totales): ${total}`);
          // No fallar, solo advertir
        }
      }
    }
  }

  return null; // Validación más permisiva - permitir continuar
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

  console.log(`\n${'*'.repeat(60)}`);
  console.log(`*** ESCRUTINIO LOTO - RECIBIENDO DATOS ***`);
  console.log(`${'*'.repeat(60)}`);
  console.log(`Registros NTF recibidos: ${registrosNTF ? registrosNTF.length : 'NULL'}`);
  console.log(`Extracto recibido:`, JSON.stringify(extracto));
  
  // DEBUG: Verificar estructura de datosControlPrevio y premios
  console.log(`\n📋 DEBUG datosControlPrevio:`);
  console.log(`  - datosOficiales existe: ${!!datosControlPrevio?.datosOficiales}`);
  console.log(`  - modalidades existe: ${!!datosControlPrevio?.datosOficiales?.modalidades}`);
  if (datosControlPrevio?.datosOficiales?.modalidades) {
    const mods = datosControlPrevio.datosOficiales.modalidades;
    for (const mod of ['Tradicional', 'Match', 'Desquite', 'Sale o Sale']) {
      const modData = mods[mod];
      console.log(`  - ${mod}:`);
      console.log(`      premios existe: ${!!modData?.premios}`);
      console.log(`      agenciero: ${JSON.stringify(modData?.premios?.agenciero)}`);
      console.log(`      primerPremio: ${JSON.stringify(modData?.premios?.primerPremio)}`);
    }
  }
  
  if (registrosNTF && registrosNTF.length > 0) {
    console.log(`Primer registro:`, JSON.stringify(registrosNTF[0]));
    // Verificar que tiene secuencia
    if (registrosNTF[0].secuencia) {
      const numsDecodificados = decodificarNumerosLoto(registrosNTF[0].secuencia);
      console.log(`  → Secuencia: "${registrosNTF[0].secuencia}"`);
      console.log(`  → Números decodificados: [${numsDecodificados.join(', ')}]`);
    }
  }

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
    
    // Debug: mostrar primeros registros
    if (registrosNTF.length > 0) {
      console.log(`Primer registro:`, JSON.stringify(registrosNTF[0], null, 2).substring(0, 500));
      const tiposJuego = [...new Set(registrosNTF.map(r => r.tipoJuego))];
      const modalidades = [...new Set(registrosNTF.map(r => r.modalidad || r.gameCode))];
      console.log(`Tipos de juego encontrados: ${tiposJuego.join(', ')}`);
      console.log(`Modalidades encontradas: ${modalidades.join(', ')}`);
    }
    
    console.log(`Extracto Tradicional: ${extractoValidado.tradicional.join(', ')}`);
    console.log(`Extracto Match: ${extractoValidado.match.join(', ')}`);
    console.log(`Extracto Desquite: ${extractoValidado.desquite.join(', ')}`);
    console.log(`Extracto Sale o Sale: ${extractoValidado.saleOSale.join(', ')}`);
    console.log(`Número PLUS: ${plus != null ? plus : 'N/A'}`);
    
    // Debug: premios XML
    const modPremios = datosControlPrevio?.datosOficiales?.modalidades;
    console.log(`Premios XML disponibles: ${modPremios ? Object.keys(modPremios).join(', ') : 'NINGUNO'}`);
    if (modPremios) {
      for (const mod in modPremios) {
        const p = modPremios[mod]?.premios;
        if (p) {
          console.log(`  ${mod} - 1er: ${p.primerPremio?.totales || 0}, 2do: ${p.segundoPremio?.totales || 0}, 3er: ${p.tercerPremio?.totales || 0}`);
        }
      }
    }

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

  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== INICIO runScrutiny ===`);
  console.log(`Registros recibidos en runScrutiny: ${registrosNTF.length}`);
  console.log(`Extractos usados:`);
  console.log(`  Tradicional: [${[...extractoPorModalidad['Tradicional']].join(', ')}]`);
  console.log(`  Match: [${[...extractoPorModalidad['Match']].join(', ')}]`);
  console.log(`  Desquite: [${[...extractoPorModalidad['Desquite']].join(', ')}]`);
  console.log(`  Sale o Sale: [${[...extractoPorModalidad['Sale o Sale']].join(', ')}]`);
  console.log(`  PLUS: ${numeroPLUS}`);
  
  // ANÁLISIS: Buscar si hay ALGÚN registro que pueda ser ganador de Tradicional
  console.log(`\n📊 ANÁLISIS DE GANADORES POTENCIALES:`);
  const extractoTrad = extractoPorModalidad['Tradicional'];
  let mejorMatchTrad = 0;
  let registroMejorMatch = null;
  
  for (let idx = 0; idx < Math.min(registrosNTF.length, 100000); idx++) {
    const reg = registrosNTF[idx];
    if (reg.cancelado || reg.isCanceled) continue;
    
    let betNumbers = [];
    if (reg.numeros && Array.isArray(reg.numeros)) {
      betNumbers = reg.numeros.map(n => parseInt(n));
    } else if (reg.secuencia) {
      betNumbers = decodificarNumerosLoto(reg.secuencia);
    }
    if (betNumbers.length < 6) continue;
    
    let hits = 0;
    for (const num of betNumbers) {
      if (extractoTrad.has(num)) hits++;
    }
    
    if (hits > mejorMatchTrad) {
      mejorMatchTrad = hits;
      registroMejorMatch = { idx, betNumbers, ticket: reg.ticket, agencia: reg.agenciaCompleta };
    }
    
    if (hits === 6) {
      console.log(`   🏆 ENCONTRADO GANADOR idx=${idx}: nums=[${betNumbers.join(',')}], ticket=${reg.ticket}, agencia=${reg.agenciaCompleta}`);
      break; // Solo reportar el primero
    }
  }
  
  if (mejorMatchTrad < 6) {
    console.log(`   ❌ NO se encontró ganador de 6 en Tradicional. Mejor match: ${mejorMatchTrad} aciertos`);
    if (registroMejorMatch) {
      console.log(`      Mejor registro (idx=${registroMejorMatch.idx}): nums=[${registroMejorMatch.betNumbers.join(',')}]`);
    }
  }

  // Premios del XML (datosOficiales.modalidades)
  const premiosXML = datosControlPrevio?.datosOficiales?.modalidades || {};

  // Estructura de resultados por modalidad
  const porModalidad = {};
  const modalidades4 = ['Tradicional', 'Match', 'Desquite', 'Sale o Sale'];

  for (const mod of modalidades4) {
    porModalidad[mod] = {
      modalidad: mod,  // Agregar nombre para debug
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

  // En LOTO, CADA apuesta participa en TODAS las modalidades con los mismos números
  // No hay registros separados por modalidad - todos se evalúan contra todos los extractos
  
  let totalRegistros = 0;
  let totalApuestas = 0;
  let totalRecaudacion = 0;
  const registrosMultiplicador = []; // código 11 (apuesta adicional al PLUS)

  // Primero: recopilar todos los registros válidos
  const registrosValidos = [];
  
  // Debug: contar registros por tipo para entender la estructura
  const conteoTipos = {};
  const conteoGameCodes = {};
  
  for (const reg of registrosNTF) {
    // Filtrar por tipo de juego (flexible) - incluir Loto y Multiplicador
    const tipoJuego = (reg.tipoJuego || '').toLowerCase();
    const gameCode = reg.gameCode || 'sin-codigo';
    
    // Conteo para debug
    conteoTipos[tipoJuego || 'sin-tipo'] = (conteoTipos[tipoJuego || 'sin-tipo'] || 0) + 1;
    conteoGameCodes[gameCode] = (conteoGameCodes[gameCode] || 0) + 1;
    
    if (tipoJuego && tipoJuego !== 'loto' && tipoJuego !== 'multiplicador') continue;
    if (reg.cancelado || reg.isCanceled) continue;

    // Decodificar números del registro
    let betNumbers = [];
    if (reg.numeros && Array.isArray(reg.numeros)) {
      betNumbers = reg.numeros.map(n => parseInt(n));
    } else if (reg.secuencia) {
      betNumbers = decodificarNumerosLoto(reg.secuencia);
    }
    if (betNumbers.length < 6) continue;

    const cantNum = parseInt(reg.cantNum || 6);
    const nroApuestas = COMBINACIONES_LOTO[cantNum] || combinaciones(cantNum, 6);
    const importe = parseFloat(reg.importe || 0);

    // Si tiene apuesta al Multiplicador (código 11 o tiene numeroPlus), guardar para evaluar PLUS
    if (reg.gameCode === '11' || reg.numeroPlus != null) {
      registrosMultiplicador.push({ ...reg, betNumbers, cantNum });
    }

    // TODOS los registros se procesan para calcular ganadores (incluyendo código 11)
    totalRegistros++;
    totalApuestas += nroApuestas;
    totalRecaudacion += importe;

    registrosValidos.push({
      ...reg,
      betNumbers,
      cantNum,
      nroApuestas
    });
    
    // Log de los primeros 3 registros para verificar decodificación
    if (registrosValidos.length <= 3) {
      console.log(`📋 Registro ${registrosValidos.length}: gameCode=${reg.gameCode}, tipo=${reg.tipoJuego}, cantNum=${cantNum}, nums=[${betNumbers.join(',')}]`);
    }
  }

  console.log(`📊 Registros válidos para escrutinio: ${registrosValidos.length}`);
  console.log(`📊 Registros con apuesta al Multiplicador: ${registrosMultiplicador.length}`);
  console.log(`📊 Conteo por tipoJuego:`, JSON.stringify(conteoTipos));
  console.log(`📊 Conteo por gameCode:`, JSON.stringify(conteoGameCodes));
  
  // Mostrar un ejemplo de los números decodificados vs extracto para verificar
  if (registrosValidos.length > 0) {
    const ejemplo = registrosValidos[0];
    console.log(`📋 Ejemplo registro: secuencia="${ejemplo.secuencia}", numeros=[${ejemplo.betNumbers.join(',')}]`);
  }

  // === Procesar CADA registro contra CADA modalidad ===
  for (const mod of modalidades4) {
    const modResult = porModalidad[mod];
    const extractSet = extractoPorModalidad[mod];
    console.log(`\n🎲 Procesando modalidad ${mod}: Extracto = [${[...extractSet].join(', ')}]`);

    // Todos los registros participan en esta modalidad
    modResult.registros = totalRegistros;
    modResult.apuestas = totalApuestas;
    modResult.recaudacion = totalRecaudacion;

    // Buscar si existe algún registro que coincida con el extracto
    let encontrados6ac = 0;
    let maxHits = 0;
    for (const reg of registrosValidos) {
      const { betNumbers, cantNum } = reg;
      if (cantNum === 6) {
        const hits = countHits(betNumbers, extractSet);
        if (hits > maxHits) maxHits = hits;
        if (hits === 6) encontrados6ac++;
      }
    }
    console.log(`   → Max aciertos encontrados: ${maxHits}, Ganadores de 6: ${encontrados6ac}`);

    for (const reg of registrosValidos) {
      const { betNumbers, cantNum } = reg;
      const ticketNormalizado = (reg.ticket || '').trim();

      // Calcular aciertos contra el extracto de ESTA modalidad
      if (cantNum === 6) {
        const hits = countHits(betNumbers, extractSet);
        if (hits >= 1 && modResult.porNivel[hits]) {
          modResult.porNivel[hits].ganadores++;
          if (hits === 6) {
            console.log(`🏆 GANADOR 6 ACIERTOS en ${mod}: Ticket ${ticketNormalizado}, Agencia ${(reg.agenciaCompleta || '').trim()}, Nums: ${betNumbers.join(',')}`);
            modResult.porNivel[6].agenciasGanadoras.push({
              agencia: (reg.agencia || '').trim(),
              agenciaCompleta: (reg.agenciaCompleta || '').trim(),
              ticket: ticketNormalizado,
              esVentaWeb: reg.esVentaWeb || false,
              importe: parseFloat(reg.importe || 0),
              numerosJugados: reg.betNumbers.slice()
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
            agencia: (reg.agencia || '').trim(),
            agenciaCompleta: (reg.agenciaCompleta || '').trim(),
            ticket: ticketNormalizado,
            esMultiple: true,
            cantidad: ganadoresMultiples[6],
            esVentaWeb: reg.esVentaWeb || false,
            importe: parseFloat(reg.importe || 0),
            numerosJugados: reg.betNumbers.slice()
          });
        }
      }
    }

    // === Distribuir premios según modalidad ===
    const xmlPremios = premiosXML[mod]?.premios || {};
    
    // DEBUG: mostrar premios XML incluyendo agenciero
    console.log(`📊 XML Premios ${mod}:`, {
      primerPremio: xmlPremios.primerPremio?.totales,
      agenciero: xmlPremios.agenciero
    });

    if (mod === 'Tradicional' || mod === 'Match') {
      distribuirPremiosTradMatch(modResult, xmlPremios);
    } else if (mod === 'Desquite') {
      distribuirPremiosDesquite(modResult, xmlPremios);
    } else if (mod === 'Sale o Sale') {
      distribuirPremiosSaleOSale(modResult, xmlPremios);
    }

    // Sumar totales según modalidad - SOLO niveles premiados
    // Tradicional/Match: 6, 5, 4 aciertos
    // Desquite: solo 6 aciertos
    // Sale o Sale: SOLO el nivel ganador (el más alto con ganadores)
    let nivelesParaTotal;
    if (mod === 'Sale o Sale') {
      // En Sale o Sale, solo cuenta el nivel ganador (cascada 6→5→4→3→2→1)
      const nivelGanadorSOS = [6, 5, 4, 3, 2, 1].find(n => modResult.porNivel[n]?.ganadores > 0);
      nivelesParaTotal = nivelGanadorSOS ? [nivelGanadorSOS] : [];
      modResult.nivelGanadorSOS = nivelGanadorSOS; // Guardar para referencia
    } else if (mod === 'Desquite') {
      nivelesParaTotal = [6]; // Solo 6 aciertos
    } else {
      nivelesParaTotal = [6, 5, 4]; // Tradicional y Match: 6, 5, 4 aciertos
    }

    for (const nivel of nivelesParaTotal) {
      const nd = modResult.porNivel[nivel];
      if (nd?.ganadores > 0) totalGanadores += nd.ganadores;
      totalPremios += nd?.totalPremios || 0;
    }
    totalPremios += modResult.agenciero.totalPremios || 0;

    // Texto ganadores (para todos los niveles de referencia)
    for (const nivel of [6, 5, 4, 3, 2, 1]) {
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
  const cpAnulados = cpResumen.anulados || 0;

  // Usamos los totales ya calculados (totalRegistros, totalApuestas, totalRecaudacion)

  return {
    numeroSorteo: datosControlPrevio?.sorteo || datosControlPrevio?.numeroSorteo || 'S/N',
    fechaSorteo: datosControlPrevio?.fecha || '',
    totalGanadores,
    totalPremios,
    porModalidad,
    multiplicador,
    resumen: {
      registros: totalRegistros,
      apuestas: totalApuestas,
      recaudacion: totalRecaudacion,
      anulados: cpAnulados,
      recaudacionAnulada: 0  // LOTO no reporta recaudación anulada separada
    },
    comparacion: {
      registros: {
        controlPrevio: cpRegistros,
        controlPosterior: totalRegistros,
        anulados: cpAnulados,
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
    nd.pozoXml = pool; // Guardar siempre el pozo XML
    if (nd.ganadores > 0 && pool > 0) {
      nd.premioUnitario = pool / nd.ganadores;
      nd.totalPremios = pool;
      nd.pozoVacante = 0;
    } else if (nd.ganadores === 0) {
      nd.pozoVacante = pool;
      nd.totalPremios = 0;
    }
  }

  // Agenciero: pagado a agencias que vendieron tickets con 6 aciertos
  const agPool = xmlPremios.agenciero?.totales || 0;
  const gan6 = modResult.porNivel[6].ganadores;
  
  // DEBUG: log del agenciero
  console.log(`🏪 AGENCIERO ${modResult.modalidad}: gan6=${gan6}, agPool=${agPool}, agenciasGanadoras=${modResult.porNivel[6].agenciasGanadoras.length}`);
  if (modResult.porNivel[6].agenciasGanadoras.length > 0) {
    console.log(`🏪 Agencias ganadoras de 6:`, modResult.porNivel[6].agenciasGanadoras.map(g => ({ ag: g.agenciaCompleta, esVentaWeb: g.esVentaWeb })));
  }
  
  // Guardar siempre el pozo XML del agenciero
  modResult.agenciero.pozoXml = agPool;
  
  if (gan6 > 0) {
    // Contar agencias únicas (excluyendo venta web LOTBA)
    const agenciasUnicas = [...new Set(
      modResult.porNivel[6].agenciasGanadoras
        .filter(g => !g.esVentaWeb)
        .map(g => g.agenciaCompleta)
    )];
    
    // Si hay agencias físicas ganadoras, distribuir entre ellas
    // Si todas son venta web, el agenciero queda vacante (LOTBA no tiene premio agenciero físico)
    if (agenciasUnicas.length > 0 && agPool > 0) {
      modResult.agenciero = {
        ganadores: agenciasUnicas.length,
        premioUnitario: agPool / agenciasUnicas.length,
        totalPremios: agPool,
        pozoVacante: 0,
        pozoXml: agPool,
        agencias: agenciasUnicas
      };
    } else {
      // Hay ganadores de 6 pero todos son venta web, o no hay pozo
      modResult.agenciero = {
        ganadores: 0,
        premioUnitario: 0,
        totalPremios: 0,
        pozoVacante: agPool,
        pozoXml: agPool,
        agencias: [],
        nota: agenciasUnicas.length === 0 && gan6 > 0 ? 'Ganadores por venta web (sin premio agenciero)' : null
      };
    }
  } else {
    // No hay ganadores de 6 aciertos
    modResult.agenciero = {
      ganadores: 0,
      premioUnitario: 0,
      totalPremios: 0,
      pozoVacante: agPool,
      pozoXml: agPool,
      agencias: []
    };
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

  modResult.porNivel[6].pozoXml = pool6;
  if (gan6 > 0 && pool6 > 0) {
    modResult.porNivel[6].premioUnitario = pool6 / gan6;
    modResult.porNivel[6].totalPremios = pool6;
    modResult.porNivel[6].pozoVacante = 0;
  } else {
    modResult.porNivel[6].pozoVacante = pool6;
    modResult.porNivel[6].totalPremios = 0;
  }

  // 5 y 4 no aplican en Desquite
  modResult.porNivel[5].noAplica = true;
  modResult.porNivel[4].noAplica = true;

  // Agenciero
  const agPool = xmlPremios.agenciero?.totales || 0;
  modResult.agenciero.pozoXml = agPool;
  
  if (gan6 > 0) {
    const agenciasUnicas = [...new Set(
      modResult.porNivel[6].agenciasGanadoras
        .filter(g => !g.esVentaWeb)
        .map(g => g.agenciaCompleta)
    )];
    
    if (agenciasUnicas.length > 0 && agPool > 0) {
      modResult.agenciero = {
        ganadores: agenciasUnicas.length,
        premioUnitario: agPool / agenciasUnicas.length,
        totalPremios: agPool,
        pozoVacante: 0,
        pozoXml: agPool,
        agencias: agenciasUnicas
      };
    } else {
      modResult.agenciero = {
        ganadores: 0,
        premioUnitario: 0,
        totalPremios: 0,
        pozoVacante: agPool,
        pozoXml: agPool,
        agencias: [],
        nota: agenciasUnicas.length === 0 && gan6 > 0 ? 'Ganadores por venta web (sin premio agenciero)' : null
      };
    }
  } else {
    modResult.agenciero = {
      ganadores: 0,
      premioUnitario: 0,
      totalPremios: 0,
      pozoVacante: agPool,
      pozoXml: agPool,
      agencias: []
    };
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

  // Guardar pozo XML
  modResult.porNivel[6].pozoXml = poolMayor;

  if (nivelGanador && poolMayor > 0) {
    modResult.porNivel[nivelGanador].premioUnitario = poolMayor / modResult.porNivel[nivelGanador].ganadores;
    modResult.porNivel[nivelGanador].totalPremios = poolMayor;
    modResult.porNivel[nivelGanador]._esSaleOSale = true;
    modResult.porNivel[nivelGanador].pozoVacante = 0;
  } else if (!nivelGanador) {
    // No hay ganadores en ningún nivel, el pozo queda vacante
    modResult.porNivel[6].pozoVacante = poolMayor;
  }

  modResult.nivelGanadorSOS = nivelGanador;

  // Marcar niveles que no ganaron
  for (const nivel of [6, 5, 4]) {
    if (nivel !== nivelGanador) {
      modResult.porNivel[nivel].pozoVacante = 0; // SOS no tiene pozo vacante por nivel
    }
  }

  // Agenciero: SOLO cuando ganan con 6 aciertos
  const agPool = nivelGanador === 6 ? poolMayor * 0.02 : 0;
  modResult.agenciero.pozoXml = agPool;
  modResult.agenciero.soloConSeisAciertos = true;
  
  if (nivelGanador === 6) {
    const agenciasUnicas = [...new Set(
      modResult.porNivel[6].agenciasGanadoras
        .filter(g => !g.esVentaWeb)
        .map(g => g.agenciaCompleta)
    )];
    
    if (agenciasUnicas.length > 0 && agPool > 0) {
      modResult.agenciero = {
        ganadores: agenciasUnicas.length,
        premioUnitario: agPool / agenciasUnicas.length,
        totalPremios: agPool,
        pozoVacante: 0,
        pozoXml: agPool,
        soloConSeisAciertos: true,
        agencias: agenciasUnicas
      };
    } else {
      modResult.agenciero = {
        ganadores: 0,
        premioUnitario: 0,
        totalPremios: 0,
        pozoVacante: agPool,
        pozoXml: agPool,
        soloConSeisAciertos: true,
        agencias: [],
        nota: agenciasUnicas.length === 0 && nivelGanador === 6 ? 'Ganadores por venta web (sin premio agenciero)' : null
      };
    }
  } else {
    // No hay ganadores de 6 aciertos - no aplica agenciero en SOS
    modResult.agenciero = {
      ganadores: 0,
      premioUnitario: 0,
      totalPremios: 0,
      pozoVacante: 0,
      pozoXml: 0,
      soloConSeisAciertos: true,
      agencias: [],
      nota: 'Solo aplica con 6 aciertos'
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

  console.log(`\n🎰 PROCESANDO MULTIPLICADOR`);
  console.log(`   Número PLUS sorteado: ${numeroPLUS}`);
  console.log(`   Registros Multiplicador recibidos: ${registrosMultiplicador.length}`);

  if (numeroPLUS == null) {
    console.log(`   ⚠️ PLUS no definido, saltando Multiplicador`);
    return resultado;
  }

  // Crear mapa de tickets ganadores de 6 en cada modalidad
  const ganadoresDe6PorTicket = {};
  let totalGan6 = 0;
  for (const mod of ['Tradicional', 'Match', 'Desquite', 'Sale o Sale']) {
    const agGanadoras = porModalidad[mod]?.porNivel[6]?.agenciasGanadoras || [];
    for (const g of agGanadoras) {
      const ticketKey = (g.ticket || '').trim();
      if (!ticketKey) continue;
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
      totalGan6++;
    }
  }
  console.log(`   Tickets con 6 aciertos encontrados: ${Object.keys(ganadoresDe6PorTicket).length}`);
  console.log(`   Total ganadores de 6 aciertos: ${totalGan6}`);
  if (Object.keys(ganadoresDe6PorTicket).length > 0) {
    console.log(`   Tickets: ${Object.keys(ganadoresDe6PorTicket).slice(0, 5).join(', ')}${Object.keys(ganadoresDe6PorTicket).length > 5 ? '...' : ''}`);
  }

  // Para Sale o Sale: si el nivel ganador no fue 6, no aplica multiplicador
  const sosNivelGanador = porModalidad['Sale o Sale']?.nivelGanadorSOS;
  if (sosNivelGanador && sosNivelGanador !== 6) {
    console.log(`   Sale o Sale: nivel ganador = ${sosNivelGanador} (no 6), removiendo del mapa`);
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

  // Log registros Multiplicador
  const regConPlusAcertado = registrosMultiplicador.filter(r => {
    const regPlus = r.numeroPlus;
    return regPlus === numeroPLUS || regPlus === String(numeroPLUS) || String(regPlus) === String(numeroPLUS);
  });
  console.log(`   Registros Multiplicador con PLUS acertado (${numeroPLUS}): ${regConPlusAcertado.length}`);
  if (regConPlusAcertado.length > 0 && regConPlusAcertado.length <= 10) {
    regConPlusAcertado.forEach(r => {
      console.log(`     - Ticket: ${r.ticket}, Plus apostado: ${r.numeroPlus}, Agencia: ${r.agenciaCompleta}`);
    });
  }

  // Verificar registros multiplicador que coinciden con PLUS
  for (const reg of registrosMultiplicador) {
    const regPlus = reg.numeroPlus;
    // Comparación flexible entre números y strings
    const plusCoincide = regPlus === numeroPLUS || 
                         regPlus === String(numeroPLUS) || 
                         String(regPlus) === String(numeroPLUS) ||
                         parseInt(regPlus) === parseInt(numeroPLUS);
    
    if (!plusCoincide) continue;

    const ticketKey = (reg.ticket || '').trim();
    const ganEnOtraMod = ganadoresDe6PorTicket[ticketKey];
    
    if (!ganEnOtraMod || ganEnOtraMod.length === 0) {
      // Log para debug: ticket con PLUS correcto pero sin 6 aciertos
      if (regConPlusAcertado.length > 0 && regConPlusAcertado.length <= 20) {
        console.log(`     ⚠️ Ticket ${ticketKey} acertó PLUS pero NO está en ganadores de 6`);
      }
      continue;
    }

    console.log(`   ✓ GANADOR MULTIPLICADOR: Ticket ${ticketKey}, Plus: ${regPlus}`);

    // Este ticket ganó 6 aciertos en alguna modalidad Y acertó el PLUS
    for (const g of ganEnOtraMod) {
      const premioExtra = g.premioUnitario * 2; // 2x adicional (total percibe 3x)
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
        esVentaWeb: g.esVentaWeb,
        importe: parseFloat(reg.importe || 0),
        numerosJugados: reg.betNumbers ? reg.betNumbers.slice() : [],
        numeroPlus: reg.numeroPlus
      });
      console.log(`       → ${g.modalidad}: Premio original $${g.premioUnitario.toLocaleString()}, Extra $${premioExtra.toLocaleString()}`);
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
 * Incluye: escrutinio_loto (resumen) + escrutinio_loto_ganadores (por modalidad/nivel)
 */
async function guardarEscrutinioLoto(resultado, datosControlPrevio, user) {
  const sorteo = resultado.numeroSorteo || 'N/A';
  const fecha = resultado.fechaSorteo || new Date().toISOString().split('T')[0];
  
  console.log(`📝 Guardando escrutinio LOTO: Sorteo ${sorteo}`);

  // 1. Guardar/actualizar registro principal
  await query(`
    INSERT INTO escrutinio_loto
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
    'SELECT id FROM escrutinio_loto WHERE numero_sorteo = ?',
    [sorteo]
  );
  const escrutinioId = escrutinioRow?.id;

  if (!escrutinioId) {
    console.warn('⚠️ No se pudo obtener ID del escrutinio LOTO');
    return;
  }

  // 3. Verificar si existe la tabla de ganadores (si no, solo guardar el JSON principal)
  try {
    // Limpiar ganadores anteriores
    await query('DELETE FROM escrutinio_loto_ganadores WHERE escrutinio_id = ?', [escrutinioId]);

    // 4. Guardar ganadores por modalidad y nivel
    const modalidades = ['Tradicional', 'Match', 'Desquite', 'Sale o Sale'];
    
    for (const mod of modalidades) {
      const modData = resultado.porModalidad?.[mod];
      if (!modData) continue;

      // Niveles de aciertos (6, 5, 4 para Trad/Match, solo 6 para Desquite)
      const niveles = mod === 'Desquite' ? [6] : (mod === 'Sale o Sale' ? [6, 5, 4, 3, 2, 1] : [6, 5, 4]);
      
      for (const nivel of niveles) {
        const nivelData = modData.porNivel?.[nivel];
        if (nivelData && nivelData.ganadores > 0) {
          await query(`
            INSERT INTO escrutinio_loto_ganadores
            (escrutinio_id, numero_sorteo, modalidad, aciertos, cantidad_ganadores,
             premio_unitario, premio_total, pozo_xml, pozo_vacante)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            escrutinioId,
            sorteo,
            mod.toUpperCase().replace(/ /g, '_'),
            nivel,
            nivelData.ganadores,
            nivelData.premioUnitario || 0,
            nivelData.totalPremios || 0,
            nivelData.pozoXml || 0,
            nivelData.pozoVacante || 0
          ]);
        }
      }

      // Guardar agenciero de la modalidad
      const agenciero = modData.agenciero;
      if (agenciero && (agenciero.ganadores > 0 || agenciero.pozoXml > 0)) {
        await query(`
          INSERT INTO escrutinio_loto_ganadores
          (escrutinio_id, numero_sorteo, modalidad, aciertos, cantidad_ganadores,
           premio_unitario, premio_total, pozo_xml, pozo_vacante)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          escrutinioId,
          sorteo,
          mod.toUpperCase().replace(/ /g, '_'),
          0, // 0 = agenciero
          agenciero.ganadores || 0,
          agenciero.premioUnitario || 0,
          agenciero.totalPremios || 0,
          agenciero.pozoXml || 0,
          agenciero.pozoVacante || 0
        ]);
      }
    }

    // 5. Guardar Multiplicador
    const mult = resultado.multiplicador;
    if (mult && mult.ganadores > 0) {
      await query(`
        INSERT INTO escrutinio_loto_ganadores
        (escrutinio_id, numero_sorteo, modalidad, aciertos, cantidad_ganadores,
         premio_unitario, premio_total, pozo_xml, pozo_vacante)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        escrutinioId,
        sorteo,
        'MULTIPLICADOR',
        6, // siempre 6 aciertos + PLUS
        mult.ganadores,
        mult.premioExtra / mult.ganadores,
        mult.premioExtra,
        0,
        0
      ]);
    }

    // 6. Guardar premios por agencia (acumulado)
    // Construir ganadoresDetalle desde agenciasGanadoras de cada modalidad
    const ganadoresDetalle = [];
    for (const mod of modalidades) {
      const modData = resultado.porModalidad?.[mod];
      if (!modData) continue;
      
      const agGanadoras = modData.porNivel?.[6]?.agenciasGanadoras || [];
      const premioUnit = modData.porNivel?.[6]?.premioUnitario || 0;
      
      for (const ag of agGanadoras) {
        // Si es múltiple, tiene varias apuestas ganadoras
        const cantidad = ag.cantidad || 1;
        for (let i = 0; i < cantidad; i++) {
          ganadoresDetalle.push({
            agencia: ag.agenciaCompleta || ag.agencia,
            premio: premioUnit
          });
        }
      }
      
      // Agenciero de esta modalidad
      const agencieroDet = modData.agenciero?.detalles || [];
      const agencieroUnit = modData.agenciero?.premioUnitario || 0;
      for (const det of agencieroDet) {
        ganadoresDetalle.push({
          agencia: det.agenciaCompleta || `${det.provincia || '51'}${(det.agencia || '').padStart(5, '0')}`,
          premio: agencieroUnit
        });
      }
    }
    
    // Limpiar premios por agencia anteriores
    await query('DELETE FROM escrutinio_premios_agencia WHERE escrutinio_id = ? AND juego = ?', 
      [escrutinioId, 'loto']);
    
    // Guardar
    if (ganadoresDetalle.length > 0) {
      await guardarPremiosPorAgencia(escrutinioId, 'loto', ganadoresDetalle);
    }

    console.log(`✅ Escrutinio LOTO guardado: Sorteo ${sorteo}, ${resultado.totalGanadores} ganadores, $${resultado.totalPremios?.toLocaleString('es-AR')} premios`);
  } catch (errGanadores) {
    // Si la tabla de ganadores no existe, solo loguear advertencia
    if (errGanadores.code === 'ER_NO_SUCH_TABLE') {
      console.warn('⚠️ Tabla escrutinio_loto_ganadores no existe. Solo se guardó el JSON principal.');
      console.log('   Ejecute: node database/migration_loto_ganadores.js');
    } else {
      throw errGanadores;
    }
  }
}

module.exports = {
  ejecutar,
  runScrutiny,
  decodificarNumerosLoto,
  calcularGanadoresMultiples,
  combinaciones
};
