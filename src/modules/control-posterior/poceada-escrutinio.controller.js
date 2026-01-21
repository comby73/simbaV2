'use strict';

const path = require('path');
const fs = require('fs');
const { query } = require('../../config/database');
const { successResponse, errorResponse } = require('../../shared/helpers');

/**
 * Código binario para decodificar la secuencia de números
 * Cada letra A-P representa un patrón de 4 bits
 * Igual que en el Python: BINARY_CODE
 */
const BINARY_CODE = {
  'A': '0000', 'B': '0001', 'C': '0010', 'D': '0011',
  'E': '0100', 'F': '0101', 'G': '0110', 'H': '0111',
  'I': '1000', 'J': '1001', 'K': '1010', 'L': '1011',
  'M': '1100', 'N': '1101', 'O': '1110', 'P': '1111'
};

/**
 * Combinaciones para apuestas múltiples de Poceada
 * Cantidad de combinaciones de 8 números posibles según cuántos se juegan
 */
const COMBINACIONES_MULTIPLES = {
  8: 1,
  9: 9,
  10: 45,
  11: 165,
  12: 495,
  13: 1287,
  14: 3003,
  15: 6435
};

/**
 * Porcentajes del pozo para cada nivel de aciertos
 * Igual que en Python: premio_porcentajes
 */
const PREMIO_PORCENTAJES = {
  8: 62.0,    // Primer premio: 62%
  7: 23.5,    // Segundo premio: 23.5%
  6: 10.0     // Tercer premio: 10%
  // 4.5% fondo reserva + 0.5% agenciero
};

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
 * Igual que en Python: _combinaciones
 */
function combinaciones(n, k) {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  return Math.floor(factorial(n) / (factorial(k) * factorial(n - k)));
}

/**
 * Decodifica la secuencia de 25 caracteres de Poceada a un array de números (0-99)
 * Cada letra representa 4 bits, cada bit "1" indica que ese número está jugado
 * Igual que en Python: decodificar_numeros_poceada
 * 
 * @param {string} secuencia25 - Secuencia de 25 caracteres (A-P)
 * @returns {number[]} - Array de números del 0 al 99, ordenados
 */
function decodificarNumerosPoceada(secuencia25) {
  const numeros = [];
  for (let i = 0; i < Math.min(25, secuencia25.length); i++) {
    const letra = secuencia25[i].toUpperCase();
    const binario = BINARY_CODE[letra] || '0000';
    for (let j = 0; j < 4; j++) {
      if (binario[j] === '1') {
        const numero = i * 4 + j;
        if (numero >= 0 && numero <= 99) {
          numeros.push(numero);
        }
      }
    }
  }
  // Devolver únicos y ordenados (igual que Python)
  return [...new Set(numeros)].sort((a, b) => a - b);
}

/**
 * Calcula ganadores múltiples para una apuesta de más de 8 números
 * Igual que en Python: _calcular_ganadores_multiples
 * 
 * @param {number[]} betNumbers - Números jugados por el apostador
 * @param {Set<number>} extractNumbers - Set de los 20 números del sorteo
 * @param {number} numbersCount - Cantidad de números jugados (8-15)
 * @returns {Object} - {6: cantidad, 7: cantidad, 8: cantidad}
 */
function calcularGanadoresMultiples(betNumbers, extractNumbers, numbersCount) {
  const betSet = new Set(betNumbers);
  let hits = 0;
  for (const num of betSet) {
    if (extractNumbers.has(num)) hits++;
  }
  
  const ganadores = { 6: 0, 7: 0, 8: 0 };
  
  if (hits < 6) return ganadores;
  
  // Para cada nivel de aciertos (6, 7, 8)
  // Fórmula: C(hits, nivel) * C(numbersCount - hits, 8 - nivel)
  for (const nivel of [6, 7, 8]) {
    if (hits >= nivel) {
      ganadores[nivel] = combinaciones(hits, nivel) * combinaciones(numbersCount - hits, 8 - nivel);
    }
  }
  
  return ganadores;
}

/**
 * Cuenta cuántos números de la apuesta están en el extracto
 * Para apuestas simples de 8 números
 */
function countHits(betNumbers, extractNumbers) {
  let hits = 0;
  for (const num of betNumbers) {
    if (extractNumbers.has(num)) hits++;
  }
  return hits;
}

/**
 * Endpoint para ejecutar el escrutinio de Poceada
 * Recibe los registros del TXT, el extracto (20 números + 4 letras) y datos del control previo
 */
const ejecutar = async (req, res) => {
  const { registrosNTF, extracto, datosControlPrevio, registrosAnulados } = req.body;

  if (!registrosNTF || !extracto) {
    return errorResponse(res, 'Faltan datos para ejecutar el escrutinio', 400);
  }

  if (!extracto.numeros || extracto.numeros.length < 20 || !extracto.letras || extracto.letras.length < 4) {
    return errorResponse(res, 'Extracto incompleto: se requieren 20 números del sorteo y 4 letras', 400);
  }

  try {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`=== ESCRUTINIO POCEADA ===`);
    console.log(`${'='.repeat(50)}`);
    console.log(`Registros recibidos: ${registrosNTF.length}`);
    console.log(`Extracto (20 números): ${extracto.numeros.join(', ')}`);
    console.log(`Letras: ${extracto.letras.join(' ')}`);
    
    const resultado = runScrutiny(registrosNTF, extracto, datosControlPrevio, registrosAnulados);
    
    console.log(`\nRESULTADOS:`);
    console.log(`  Ganadores 8 aciertos: ${resultado.porNivel[8].ganadores}`);
    console.log(`  Ganadores 7 aciertos: ${resultado.porNivel[7].ganadores}`);
    console.log(`  Ganadores 6 aciertos: ${resultado.porNivel[6].ganadores}`);
    console.log(`  Total ganadores: ${resultado.totalGanadores}`);
    console.log(`${'='.repeat(50)}\n`);
    
    return successResponse(res, resultado, 'Escrutinio Poceada completado correctamente');
  } catch (error) {
    console.error('Error en escrutinio Poceada:', error);
    return errorResponse(res, 'Error ejecutando escrutinio: ' + error.message, 500);
  }
};


/**
 * Convierte un número a texto (para cantidad de ganadores)
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

/**
 * Ejecuta el escrutinio completo de Poceada
 * Igual que en Python: run_scrutiny
 */
function runScrutiny(registrosNTF, extracto, datosControlPrevio, registrosAnulados = 0) {
  // Preparar extracto - convertir a Set para búsqueda O(1)
  const extractNumbers = new Set(extracto.numeros.map(n => parseInt(n)));
  const extractLetters = extracto.letras.join('').toUpperCase();
  
  console.log(`Números del sorteo (Set): ${[...extractNumbers].join(', ')}`);
  console.log(`Letras del sorteo: ${extractLetters}`);
  
  // Filtrar solo registros de Poceada
  const registrosPoceada = registrosNTF.filter(r => 
    r.tipo === 'POC' || 
    r.tipoJuego === 'POC' || 
    r.tipoJuego === 'Poceada'
  );
  
  console.log(`Registros Poceada: ${registrosPoceada.length} de ${registrosNTF.length}`);
  
  // Estructuras para acumular resultados
  const porNivel = {
    8: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0, agenciasGanadoras: [] },
    7: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 },
    6: { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 },
    'letras': { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 }
  };
  
  // Estadísticas por cantidad de números jugados
  const porCantidadNumeros = {};
  for (let i = 8; i <= 15; i++) {
    porCantidadNumeros[i] = {
      combinaciones: COMBINACIONES_MULTIPLES[i],
      registros: 0,
      gan8: 0,
      gan7: 0,
      gan6: 0,
      totalPremios: 0
    };
  }
  
  let totalRegistrosValidos = 0;
  let totalApuestas = 0;
  let totalRecaudacion = 0;
  let ganadoresLetras = 0;
  
  // Procesar cada registro
  for (const registro of registrosPoceada) {
    // Saltar registros cancelados (ya vienen filtrados, pero por si acaso)
    if (registro.cancelado || registro.isCanceled) continue;
    
    totalRegistrosValidos++;
    
    // Determinar cantidad de números jugados
    const cantNum = parseInt(registro.cantNum || registro.cantidadNumeros || 8);
    totalApuestas += COMBINACIONES_MULTIPLES[cantNum] || 1;
    
    // Obtener importe
    const importe = parseFloat(registro.importe || registro.monto || 0);
    totalRecaudacion += importe;
    
    // Decodificar números de la apuesta desde la secuencia
    let betNumbers = [];
    if (registro.numeros && Array.isArray(registro.numeros)) {
      betNumbers = registro.numeros.map(n => parseInt(n));
    } else if (registro.secuencia) {
      betNumbers = decodificarNumerosPoceada(registro.secuencia);
    }
    
    if (betNumbers.length < 8) {
      console.warn(`Registro con pocos números (${betNumbers.length}): secuencia=${registro.secuencia}`);
      continue;
    }
    
    // Registrar estadísticas por cantidad de números
    if (porCantidadNumeros[cantNum]) {
      porCantidadNumeros[cantNum].registros++;
    }
    
    let hits = 0;
    
    // Calcular ganadores
    if (cantNum === 8) {
      // Apuesta simple: contar aciertos directamente
      hits = countHits(betNumbers, extractNumbers);
      
      if (hits >= 6) {
        porNivel[hits].ganadores++;
        // Guardar agencia si es 8 aciertos
        if (hits === 8) {
          const codProv = registro.provincia || '51';
          const codAgencia = (registro.agencia || '').toString().padStart(5, '0');
          porNivel[8].agenciasGanadoras.push({
            agencia: registro.agencia || '',
            provincia: codProv,
            ctaCte: `${codProv}-${codAgencia}`,
            posicion: registro.posicion || null
          });
        }
        
        if (porCantidadNumeros[cantNum]) {
          porCantidadNumeros[cantNum][`gan${hits}`]++;
        }
      }
    } else {
      // Apuesta múltiple: calcular combinaciones ganadoras
      hits = countHits(betNumbers, extractNumbers); // Aciertos base para estadísticas
      const ganadoresMultiples = calcularGanadoresMultiples(betNumbers, extractNumbers, cantNum);
      
      if (ganadoresMultiples[8] > 0) {
        const codProv = registro.provincia || '51';
        const codAgencia = (registro.agencia || '').toString().padStart(5, '0');
        porNivel[8].ganadores += ganadoresMultiples[8];
        porNivel[8].agenciasGanadoras.push({
          agencia: registro.agencia || '',
          provincia: codProv,
          ctaCte: `${codProv}-${codAgencia}`,
          esMultiple: true,
          cantidad: ganadoresMultiples[8]
        });
      }
      porNivel[7].ganadores += ganadoresMultiples[7];
      porNivel[6].ganadores += ganadoresMultiples[6];
      
      if (porCantidadNumeros[cantNum]) {
        porCantidadNumeros[cantNum].gan8 += ganadoresMultiples[8];
        porCantidadNumeros[cantNum].gan7 += ganadoresMultiples[7];
        porCantidadNumeros[cantNum].gan6 += ganadoresMultiples[6];
      }
    }
    
    // Verificar letras
    const letrasApuesta = (registro.letras || '').toUpperCase();
    if (letrasApuesta === extractLetters) {
      ganadoresLetras++;
      porNivel['letras'].ganadores++;
    }
  }
  
  // Obtener premios del control previo (del XML)
  // Los premios ya están calculados en el control previo, no los calculamos acá
  const premiosXML = datosControlPrevio?.datosOficiales?.premios || 
                     datosControlPrevio?.premios || {};
  
  const primerPremioTotal = premiosXML?.primero?.total || premiosXML?.primerPremio || 0;
  const segundoPremioTotal = premiosXML?.segundo?.total || premiosXML?.segundoPremio || 0;
  const tercerPremioTotal = premiosXML?.tercero?.total || premiosXML?.tercerPremio || 0;
  const letrasPremioTotal = premiosXML?.letras?.total || premiosXML?.letras || 0;
  
  console.log(`\nPremios del XML:`);
  console.log(`  Primer premio (8 aciertos): $${primerPremioTotal.toLocaleString()}`);
  console.log(`  Segundo premio (7 aciertos): $${segundoPremioTotal.toLocaleString()}`);
  console.log(`  Tercer premio (6 aciertos): $${tercerPremioTotal.toLocaleString()}`);
  console.log(`  Premio Letras: $${letrasPremioTotal.toLocaleString()}`);
  
  // Calcular premio estímulo agenciero (0.5% del pozo, o deducido del 1er premio)
  // Si 1er premio (62%) = X, entonces Pozo = X / 0.62
  // Estímulo (0.5%) = Pozo * 0.005
  let premioEstimuloTotal = 0;
  let pozoEstimado = 0;
  
  if (primerPremioTotal > 0) {
    pozoEstimado = primerPremioTotal / 0.62;
    premioEstimuloTotal = pozoEstimado * 0.005;
  }
  
  // Calcular premios unitarios y totales
  let totalPremios = 0;
  let totalGanadores = 0;

  // Mapeo nivel -> premio total
  const premiosPorNivel = {
    8: primerPremioTotal,
    7: segundoPremioTotal,
    6: tercerPremioTotal,
    'letras': letrasPremioTotal
  };
  
  for (const nivel of [8, 7, 6, 'letras']) {
    const cantGanadores = porNivel[nivel].ganadores;
    let pozoNivel = premiosPorNivel[nivel];
    
    // REGLA ESPECIAL PREMIO LETRAS: Es un premio fijo de $1000 por ganador
    if (nivel === 'letras') {
      const PREMIO_FIJO_LETRAS = 1000; // $1000.00 en pesos
      porNivel[nivel].premioUnitario = PREMIO_FIJO_LETRAS;
      porNivel[nivel].totalPremios = cantGanadores * PREMIO_FIJO_LETRAS;
      porNivel[nivel].pozoVacante = 0; // No hay vacante en premio fijo
      porNivel[nivel].ganadoresTexto = cantGanadores > 0 ? numeroALetras(cantGanadores) : 'VACANTE';
      
      if (cantGanadores > 0) {
        totalPremios += porNivel[nivel].totalPremios;
        totalGanadores += cantGanadores; // Incluimos ganadores de letras en el total general
      }
      continue; // Saltar el procesamiento estándar para letras
    }

    // Agregar texto de ganadores
    porNivel[nivel].ganadoresTexto = numeroALetras(cantGanadores);
    
    if (cantGanadores > 0) {
      porNivel[nivel].premioUnitario = pozoNivel / cantGanadores;
      porNivel[nivel].totalPremios = pozoNivel;
      porNivel[nivel].pozoVacante = 0;
      totalPremios += pozoNivel;
      totalGanadores += cantGanadores; // Solo niveles 8, 7, 6 suman al total oficial
    } else {
      // Pozo vacante - se acumula para siguiente sorteo
      porNivel[nivel].premioUnitario = 0;
      porNivel[nivel].totalPremios = 0;
      porNivel[nivel].pozoVacante = pozoNivel;
    }
  }

  // Estímulo Agenciero (solo si hay ganador de 1er premio, aunque el usuario dijo "igual q si hay ganador")
  // "si no tiene debe ir en pero debe estar igual que si hay ganadores del primero premio debe ir el agenciero"
  // Interpretación: Mostrar SIEMPRE la línea de agenciero. Si no hay ganador, premio 0? O premio VACANTE?
  // Normalmente el estímulo se paga solo si se vende el ticket ganador.
  // Pero mostraremos el valor calculado.
  const agencieroData = {
    ganadores: porNivel[8].ganadores > 0 ? porNivel[8].agenciasGanadoras.length : 0,
    premioUnitario: porNivel[8].ganadores > 0 ? (premioEstimuloTotal / porNivel[8].ganadores) : 0,
    totalPremios: porNivel[8].ganadores > 0 ? premioEstimuloTotal : 0,
    pozoVacante: porNivel[8].ganadores === 0 ? premioEstimuloTotal : 0, 
    ganadoresTexto: porNivel[8].ganadores > 0 ? numeroALetras(porNivel[8].ganadores) : 'VACANTE',
    detalles: porNivel[8].agenciasGanadoras // Lista de agencias para mostrar Cta Cte
  };

  
  // Calcular premios por cantidad de números
  for (let cant = 8; cant <= 15; cant++) {
    const datos = porCantidadNumeros[cant];
    if (datos && datos.registros > 0) {
      let premiosCant = 0;
      if (datos.gan8 > 0 && porNivel[8].premioUnitario > 0) {
        premiosCant += datos.gan8 * porNivel[8].premioUnitario;
      }
      if (datos.gan7 > 0 && porNivel[7].premioUnitario > 0) {
        premiosCant += datos.gan7 * porNivel[7].premioUnitario;
      }
      if (datos.gan6 > 0 && porNivel[6].premioUnitario > 0) {
        premiosCant += datos.gan6 * porNivel[6].premioUnitario;
      }
      datos.totalPremios = premiosCant;
    }
  }
  
  // Construir objeto de comparación con control previo
  const cpRegistros = datosControlPrevio?.registros || datosControlPrevio?.resumen?.registros || totalRegistrosValidos;
  const cpApuestas = datosControlPrevio?.apuestas || datosControlPrevio?.resumen?.apuestasTotal || totalApuestas;
  const cpRecaudacion = datosControlPrevio?.recaudacion || datosControlPrevio?.resumen?.recaudacion || totalRecaudacion;
  
  const comparacion = {
    registros: {
      controlPrevio: cpRegistros,
      controlPosterior: totalRegistrosValidos,
      anulados: registrosAnulados || datosControlPrevio?.resumen?.anulados || 0,
      coincide: Math.abs(cpRegistros - totalRegistrosValidos) <= 1
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
  };
  
  return {
    numeroSorteo: datosControlPrevio?.sorteo || datosControlPrevio?.numeroSorteo || 'S/N',
    fechaSorteo: datosControlPrevio?.fecha || datosControlPrevio?.fechaSorteo || '',
    totalGanadores,
    totalPremios,
    ganadoresLetras,
    porNivel,
    agenciero: agencieroData,
    porCantidadNumeros,
    comparacion,
    premiosXML: {
      primerPremio: primerPremioTotal,
      segundoPremio: segundoPremioTotal,
      tercerPremio: tercerPremioTotal,
      letras: letrasPremioTotal
    },
    extractoUsado: {
      numeros: [...extractNumbers],
      letras: extractLetters
    },
    agenciero: agencieroData
  };
}

module.exports = {
  ejecutar,
  runScrutiny,
  combinaciones,
  calcularGanadoresMultiples,
  decodificarNumerosPoceada
};
