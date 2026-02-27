const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { query } = require('../../config/database');
const { successResponse, errorResponse, today } = require('../../shared/helpers');
const { guardarEscrutinioQuiniela } = require('../../shared/escrutinio.helper');

// =============================================
// CONFIGURACIÓN DE QUINIELA (igual que Python)
// =============================================

// Multiplicadores por cantidad de cifras
const MULTIPLICADORES = { 1: 7, 2: 70, 3: 600, 4: 3500 };

// Premio fijo por letras (solo CABA, solo si NO ganó por números)
const PREMIO_LETRAS = 1000;

// Topes para redoblona (algoritmo VB6)
const TOPE_GENERAL = 1500;
const TOPE_1_A_2 = 2500;
const TOPE_1_A_3 = 1800;
const TOPE_EXACTAS = 3500; // Apuestas exactas (1-1 y 1-1)
const REL_PAGO_2C = 70;

// Posiciones NTF (0-based)
const NTF_GENERIC = {
  NUMERO_SORTEO: { start: 4, length: 6 },
  PROVINCIA: { start: 13, length: 2 },      // Pos 14-15 (código provincia)
  AGENCIA: { start: 15, length: 5 },
  FECHA_CANCELACION: { start: 70, length: 8 },
  NUMERO_TICKET: { start: 86, length: 12 },
  ORDINAL_APUESTA: { start: 98, length: 2 },
  VALOR_APUESTA: { start: 121, length: 10 }
};

const NTF_QUINIELA = {
  TIPO_SORTEO: { start: 202, length: 2 },
  LOTERIAS_JUGADAS: { start: 204, length: 8 },
  LETRAS: { start: 212, length: 4 },
  TIPO_APUESTA: { start: 216, length: 1 },
  CANTIDAD_CIFRAS: { start: 217, length: 1 },
  NUMERO_APOSTADO_1: { start: 218, length: 4 },
  UBICACION_DESDE_1: { start: 222, length: 2 },
  UBICACION_HASTA_1: { start: 224, length: 2 },
  NUMERO_APOSTADO_2: { start: 226, length: 2 },
  UBICACION_DESDE_2: { start: 228, length: 2 },
  UBICACION_HASTA_2: { start: 230, length: 2 }
};

// Mapeo de provincias
const PROVINCIAS = ['CABA', 'Buenos Aires', 'Córdoba', 'Santa Fe', 'Montevideo', 'Mendoza', 'Entre Ríos'];

// =============================================
// FUNCIONES DE PARSEO
// =============================================

function extraerCampo(line, config) {
  return line.substr(config.start, config.length).trim();
}

// Parsear registros del archivo NTF
function parsearRegistrosNTF(content) {
  const lines = content.split('\n').filter(line => line.length >= 232);
  const registros = [];
  
  for (const line of lines) {
    const fechaCancelacion = extraerCampo(line, NTF_GENERIC.FECHA_CANCELACION);
    const estaAnulado = fechaCancelacion.trim() !== '';
    
    if (estaAnulado) continue; // Ignorar anulados
    
    const registro = {
      numeroTicket: extraerCampo(line, NTF_GENERIC.NUMERO_TICKET),
      ordinal: extraerCampo(line, NTF_GENERIC.ORDINAL_APUESTA),
      valorApuesta: parseInt(extraerCampo(line, NTF_GENERIC.VALOR_APUESTA)) / 100,
      provincia: extraerCampo(line, NTF_GENERIC.PROVINCIA),
      agencia: extraerCampo(line, NTF_GENERIC.AGENCIA),
      tipoSorteo: extraerCampo(line, NTF_QUINIELA.TIPO_SORTEO),
      loteriasJugadas: extraerCampo(line, NTF_QUINIELA.LOTERIAS_JUGADAS),
      letras: extraerCampo(line, NTF_QUINIELA.LETRAS),
      tipoApuesta: extraerCampo(line, NTF_QUINIELA.TIPO_APUESTA),
      cantidadCifras: parseInt(extraerCampo(line, NTF_QUINIELA.CANTIDAD_CIFRAS)) || 2,
      numero1: extraerCampo(line, NTF_QUINIELA.NUMERO_APOSTADO_1),
      ubicacionDesde1: parseInt(extraerCampo(line, NTF_QUINIELA.UBICACION_DESDE_1)) || 1,
      ubicacionHasta1: parseInt(extraerCampo(line, NTF_QUINIELA.UBICACION_HASTA_1)) || 20,
      numero2: extraerCampo(line, NTF_QUINIELA.NUMERO_APOSTADO_2),
      ubicacionDesde2: parseInt(extraerCampo(line, NTF_QUINIELA.UBICACION_DESDE_2)) || 1,
      ubicacionHasta2: parseInt(extraerCampo(line, NTF_QUINIELA.UBICACION_HASTA_2)) || 20
    };
    
    registros.push(registro);
  }
  
  return registros;
}

// =============================================
// LÓGICA DE ESCRUTINIO (replicado del Python)
// =============================================

// Calcula distribución de apuesta entre extractos (igual que Python)
function calcularStakesPorExtracto(totalStake, numExtractos) {
  if (numExtractos <= 0) return [];
  
  const basicAmount = totalStake / numExtractos;
  const roundedAmount = Math.floor(basicAmount * 100) / 100;
  const totalRounded = roundedAmount * numExtractos;
  const difference = Math.round((totalStake - totalRounded) * 100) / 100;
  
  const stakes = Array(numExtractos).fill(roundedAmount);
  stakes[0] = Math.round((stakes[0] + difference) * 100) / 100;
  
  return stakes;
}

function obtenerPosicionesCoincidentes2Cifras(numeros, desde, hasta, numeroObjetivo) {
  const posiciones = [];
  for (let pos = desde; pos <= hasta; pos++) {
    if (pos > numeros.length) continue;
    const drawn = numeros[pos - 1];
    const drawnComp = parseInt((drawn || '').slice(-2).padStart(2, '0'));
    if (drawnComp === numeroObjetivo) {
      posiciones.push(pos);
    }
  }
  return posiciones;
}

function distribuirCoincidenciasMismoNumero(posiciones1, posiciones2) {
  const set1 = new Set(posiciones1);
  const set2 = new Set(posiciones2);

  const solo1 = posiciones1.filter(p => !set2.has(p));
  const solo2 = posiciones2.filter(p => !set1.has(p));
  const ambas = posiciones1.filter(p => set2.has(p));

  let efectivos1 = solo1.length;
  let efectivos2 = solo2.length;
  let rem = ambas.length;

  if (efectivos1 === 0 && rem > 0) {
    efectivos1++;
    rem--;
  }
  if (efectivos2 === 0 && rem > 0) {
    efectivos2++;
    rem--;
  }

  while (rem > 0) {
    if (efectivos1 <= efectivos2) efectivos1++;
    else efectivos2++;
    rem--;
  }

  const posPrimera = solo1[0] || ambas[0] || posiciones1[0] || 0;
  const posSegunda = solo2[0] || ambas.find(p => p !== posPrimera) || posiciones2.find(p => p !== posPrimera) || posiciones2[0] || 0;

  return { efectivos1, efectivos2, posPrimera, posSegunda };
}

function ejecutarEscrutinio(registros, extractos) {
  // Inicializar reporte para las 7 loterías (no solo los extractos cargados)
  const reportePorExtracto = PROVINCIAS.map((nombre, idx) => {
    // Buscar si hay un extracto cargado para esta provincia
    const extractoCargado = extractos.find(e => e.index === idx);
    return {
      index: idx,
      nombre: extractoCargado?.nombre || nombre,
      numeros: extractoCargado?.numeros || [],
      letrasSorteo: extractoCargado?.letras || [],  // Letras del sorteo (del XML)
      cargado: !!extractoCargado,
      totalPagado: 0,
      totalGanadores: 0,
      porCifras: {
        1: { pagado: 0, ganadores: 0, aciertos: 0 },
        2: { pagado: 0, ganadores: 0, aciertos: 0 },
        3: { pagado: 0, ganadores: 0, aciertos: 0 },
        4: { pagado: 0, ganadores: 0, aciertos: 0 }
      },
      redoblona: { pagado: 0, ganadores: 0, aciertos: 0 },
      letras: { pagado: 0, ganadores: 0, aciertos: 0 }  // Contadores de premios por letras
    };
  });

  // Totales generales
  let totalPremios = 0;
  let totalGanadores = 0;
  const ganadoresDetalle = [];
  
  // Para tracking de letras: solo CABA, solo si NO ganó por números
  const ticketsConPremioNumeros = new Set();
  const ticketsConLetras = new Map(); // ticket -> {letras, registro}

  // PRIMERA PASADA: Procesar números (simples y redoblonas)
  for (const reg of registros) {
    let premioRegistro = 0;
    let ganoNumeros = false;
    const loteriasJugadas = reg.loteriasJugadas || '';
    
    // Contar extractos jugados (cada dígito indica CANTIDAD de apuestas, no solo 0/1)
    // Índices: 0=CABA, 1=BsAs, 2=Córdoba, 3=SantaFe, 4=Montevideo, 5=Mendoza, 6=EntreRíos
    let extractosJugados = 0;
    for (let i = 0; i < Math.min(7, loteriasJugadas.length); i++) {
      const cantEnLoteria = parseInt(loteriasJugadas[i]) || 0;
      if (cantEnLoteria > 0) extractosJugados++;
    }
    if (extractosJugados === 0) continue;
    
    // Calcular stakes por extracto (igual que Python)
    const stakesPorExtracto = calcularStakesPorExtracto(reg.valorApuesta, extractosJugados);
    
    // Cifras y número apostado
    const cifras = reg.cantidadCifras || 2;
    const rawNumber = (reg.numero1 || '').trim();
    const numeroApostado = rawNumber.slice(-cifras);
    
    // Posiciones jugadas
    let desde1 = parseInt(reg.ubicacionDesde1) || 0;
    let hasta1 = parseInt(reg.ubicacionHasta1) || 0;
    if (desde1 <= 0) desde1 = 1;
    if (hasta1 <= 0) hasta1 = 20;
    const places1 = Math.max(1, hasta1 - desde1 + 1);
    
    // Recorrer las 7 loterías posibles
    // Índices: 0=CABA, 1=BsAs, 2=Córdoba, 3=SantaFe, 4=Montevideo, 5=Mendoza, 6=EntreRíos
    let extractIndexCounter = 0;
    for (let idx = 0; idx < 7; idx++) {
      const cantEnLoteria = parseInt(loteriasJugadas[idx]) || 0;
      if (idx >= loteriasJugadas.length || cantEnLoteria === 0) continue;
      
      const stakePorExtracto = stakesPorExtracto[extractIndexCounter];
      extractIndexCounter++;
      
      // Usar el reporte que ya tiene los datos del extracto integrados
      const reporte = reportePorExtracto[idx];
      if (!reporte.cargado) continue; // Si no se cargó extracto para esta provincia, saltar
      
      const numeros = reporte.numeros || [];
      
      // ========== APUESTA SIMPLE ==========
      if (reg.tipoApuesta === '0') {
        const stakePorPosicion = stakePorExtracto / places1;
        let premioExtracto = 0;
        let aciertosExtracto = 0;
        
        for (let pos = desde1; pos <= Math.min(hasta1, 20); pos++) {
          if (pos > numeros.length) continue;
          const drawn = numeros[pos - 1];
          if (!drawn) continue;
          
          const drawnComp = drawn.slice(-cifras);
          if (drawnComp === numeroApostado) {
            const multiplicador = MULTIPLICADORES[cifras] || 0;
            const premio = stakePorPosicion * multiplicador;
            premioExtracto += premio;
            aciertosExtracto++;
            
            ganadoresDetalle.push({
              ticket: reg.numeroTicket,
              provincia: reg.provincia || '51',
              agencia: `${reg.provincia || '51'}${(reg.agencia || '').padStart(5, '0')}`,
              tipo: 'SIMPLE',
              cifras: cifras,
              extracto: reportePorExtracto[idx].nombre,
              posicion: pos,
              numeroApostado: numeroApostado,
              numeroSorteado: drawn,
              apuesta: stakePorPosicion,
              multiplicador: multiplicador,
              premio: premio
            });
            
            // Estadística: aciertos
            reportePorExtracto[idx].porCifras[cifras].aciertos++;
          }
        }
        
        if (aciertosExtracto > 0) {
          ganoNumeros = true;
          premioRegistro += premioExtracto;
          reportePorExtracto[idx].totalPagado += premioExtracto;
          reportePorExtracto[idx].totalGanadores++;
          reportePorExtracto[idx].porCifras[cifras].pagado += premioExtracto;
          reportePorExtracto[idx].porCifras[cifras].ganadores++;
        }
      }
      
      // ========== REDOBLONA (algoritmo VB6) ==========
      else if (reg.tipoApuesta === '1') {
        const rawNumber2 = (reg.numero2 || '').trim();
        const numero1_2d = rawNumber.slice(-2).padStart(2, '0');
        const numero2_2d = rawNumber2.slice(-2).padStart(2, '0');
        const num1 = parseInt(numero1_2d);
        const num2 = parseInt(numero2_2d);

        // DEBUG: Log para redoblonas en extractos que no son CABA
        if (idx !== 0) {
          console.log(`[DEBUG REDOB] Procesando redoblona en ${reportePorExtracto[idx].nombre}: ${numero1_2d}-${numero2_2d}, extracto tiene ${numeros.length} números`);
        }
        
        let desde2 = parseInt(reg.ubicacionDesde2) || 0;
        let hasta2 = parseInt(reg.ubicacionHasta2) || 0;
        if (desde2 <= 0) desde2 = 1;
        if (hasta2 <= 0) hasta2 = 20;
        
        // Acotar rangos al extracto
        const topeLen = numeros.length;
        const from1 = Math.max(1, Math.min(desde1, topeLen));
        const to1 = Math.max(1, Math.min(hasta1, topeLen));
        const from2 = Math.max(1, Math.min(desde2, topeLen));
        const to2 = Math.max(1, Math.min(hasta2, topeLen));
        
        const ext1Basica = to1 - from1 + 1;
        const ext2Basica = to2 - from2 + 1;

        // Calcular extensiones efectivas
        let ext1Efectiva = ext1Basica;
        let ext2Efectiva = ext2Basica;

        // Variables para el rango de búsqueda de la segunda (pueden modificarse por corrimiento)
        let from2Busq = from2;
        let to2Busq = to2;

        // Detectar si es cabeza (1-1)
        const primeraEsCabeza = (from1 === 1 && to1 === 1);

        // Corrección: Si primera es exacta (excepto pos 1) y segunda incluye esa pos
        if (from1 === to1 && from1 !== 1 && from2 <= from1 && from1 <= to2) {
          ext2Efectiva = ext2Basica - 1;
        }

        // Regla del 19: cabeza + 1-20 → la segunda busca en 19 posiciones efectivas
        if (primeraEsCabeza && from2 === 1 && to2 === 20) {
          ext2Efectiva = 19;
        }

        // NUEVO: Regla de corrimiento para cabeza + 1-N donde N < 20
        // Si es cabeza (1-1) y la segunda empieza en 1 pero NO llega a 20
        // Ejemplo: cabeza + 1-10 → si acierta cabeza, buscar en 2-11 (misma cantidad de posiciones)
        if (primeraEsCabeza && from2 === 1 && to2 < 20) {
          // El corrimiento se aplicará después si acierta la cabeza
          // ext2Efectiva sigue siendo la misma cantidad (to2 - from2 + 1)
          // porque el rango se desplaza pero no cambia de tamaño
        }

        const posicionesPrimera = obtenerPosicionesCoincidentes2Cifras(numeros, from1, to1, num1);
        let posPrimera = posicionesPrimera[0] || 0;
        let posSegunda = 0;
        let efectivos1 = 0;
        let efectivos2 = 0;

        // Buscar segunda
        if (posicionesPrimera.length > 0) {
          // Aplicar corrimiento si corresponde:
          // Si la primera es cabeza (1-1), acertó en pos 1, y la segunda empieza en 1
          // → desplazar el rango de búsqueda en +1
          if (primeraEsCabeza && posPrimera === 1 && from2 === 1) {
            from2Busq = from2 + 1;  // Empieza en 2
            to2Busq = to2 + 1;       // Termina en N+1 (ej: 10→11, 20→21 pero acotado a 20)
            if (to2Busq > 20) to2Busq = 20;  // Acotar al máximo

            console.log(`[REDOB CORRIMIENTO] Cabeza acertó en pos 1 → Segunda busca de ${from2Busq} a ${to2Busq} (original: ${from2}-${to2})`);
          }

          const posicionesSegunda = obtenerPosicionesCoincidentes2Cifras(numeros, from2Busq, to2Busq, num2);
          posSegunda = posicionesSegunda[0] || 0;

          // Verificar superposición
          const overlap = !(to1 < from2Busq || to2Busq < from1);

          if (overlap && num1 === num2) {
            const distribucion = distribuirCoincidenciasMismoNumero(posicionesPrimera, posicionesSegunda);
            efectivos1 = distribucion.efectivos1;
            efectivos2 = distribucion.efectivos2;
            posPrimera = distribucion.posPrimera || posPrimera;
            posSegunda = distribucion.posSegunda || posSegunda;
          } else {
            efectivos1 = posicionesPrimera.length;
            efectivos2 = posicionesSegunda.length;
          }
        }

        if (efectivos1 > 0 && efectivos2 > 0) {
          ganoNumeros = true;

          // DEBUG: Redoblona ganadora
          console.log(`[REDOB GANADORA] ${reportePorExtracto[idx].nombre}: ${numero1_2d} en pos ${posPrimera}, ${numero2_2d} en pos ${posSegunda}`);

          // Calcular premio VB6
          const valorApuesta = stakePorExtracto;
          const apuestaPorLugar1 = valorApuesta / ext1Efectiva;
          const premioUnitario1 = apuestaPorLugar1 * REL_PAGO_2C;
          const premioFase1 = efectivos1 * premioUnitario1;

          const montoPrimerAcierto = premioFase1;
          const apuestaPorLugar2 = montoPrimerAcierto / ext2Efectiva;
          const premioUnitario2 = apuestaPorLugar2 * REL_PAGO_2C;
          const premioFase2 = efectivos2 * premioUnitario2;

          let totalRedoblonaPremi = premioFase2;

          // Aplicar tope
          const esApuestaExacta = (ext1Basica === 1 && ext2Basica === 1);
          let tope;
          if (esApuestaExacta) {
            tope = valorApuesta * TOPE_EXACTAS;
          } else if ((ext1Efectiva === 1 && ext2Efectiva === 2) || (ext1Efectiva === 2 && ext2Efectiva === 1)) {
            tope = valorApuesta * TOPE_1_A_2;
          } else if ((ext1Efectiva === 1 && ext2Efectiva === 3) || (ext1Efectiva === 3 && ext2Efectiva === 1)) {
            tope = valorApuesta * TOPE_1_A_3;
          } else {
            tope = valorApuesta * TOPE_GENERAL;
          }

          totalRedoblonaPremi = Math.min(totalRedoblonaPremi, tope);

          premioRegistro += totalRedoblonaPremi;
          reportePorExtracto[idx].totalPagado += totalRedoblonaPremi;
          reportePorExtracto[idx].totalGanadores++;
          reportePorExtracto[idx].redoblona.pagado += totalRedoblonaPremi;
          reportePorExtracto[idx].redoblona.ganadores++;
          reportePorExtracto[idx].redoblona.aciertos++;

          ganadoresDetalle.push({
            ticket: reg.numeroTicket,
            provincia: reg.provincia || '51',
            agencia: `${reg.provincia || '51'}${(reg.agencia || '').padStart(5, '0')}`,
            tipo: 'REDOBLONA',
            cifras: 2,
            extracto: reportePorExtracto[idx].nombre,
            posicion: `${posPrimera}+${posSegunda}`,
            numeroApostado: `${numero1_2d}-${numero2_2d}`,
            numeroSorteado: `${numeros[posPrimera-1]}-${numeros[posSegunda-1]}`,
            apuesta: stakePorExtracto,
            multiplicador: REL_PAGO_2C,
            premio: totalRedoblonaPremi
          });
        }
      }
    }
    
    if (ganoNumeros) {
      totalGanadores++;
      totalPremios += premioRegistro;
      ticketsConPremioNumeros.add(reg.numeroTicket);
    }
    
    // Guardar info de letras para segunda pasada
    // Las letras se buscan en TODOS los extractos donde jugó el ticket
    // pero las letras ganadoras son siempre las de CABA
    if (reg.letras && reg.letras.trim().length > 0) {
      // Normalizar letras: quitar espacios y pasar a mayúsculas
      const letrasApuesta = reg.letras.replace(/\s+/g, '').toUpperCase();
      const ticketKey = `${reg.numeroTicket}_${reg.ordinal || '01'}`;
      if (!ticketsConLetras.has(ticketKey) && letrasApuesta.length === 4) {
        // Guardar las loterías jugadas para saber en qué extractos buscar
        ticketsConLetras.set(ticketKey, { 
          letras: letrasApuesta, 
          reg,
          loteriasJugadas: reg.loteriasJugadas || ''
        });
      }
    }
  }
  
  // SEGUNDA PASADA: Letras
  // - Las letras ganadoras son SIEMPRE las de CABA (extracto índice 0)
  // - Pero se buscan ganadores en TODOS los extractos donde el ticket jugó
  // - Un ticket solo puede ganar UNA vez por letras (no importa cuántos extractos)
  const cabaReporte = reportePorExtracto[0];
  
  // Normalizar letras del sorteo: pueden venir como array ['M','M','Q','Q'] o string
  let letrasSorteo = '';
  if (cabaReporte.cargado && cabaReporte.letrasSorteo) {
    if (Array.isArray(cabaReporte.letrasSorteo)) {
      letrasSorteo = cabaReporte.letrasSorteo.map(l => l.toUpperCase()).join('');
    } else if (typeof cabaReporte.letrasSorteo === 'string') {
      letrasSorteo = cabaReporte.letrasSorteo.replace(/\s+/g, '').toUpperCase();
    }
  }
  
  console.log(`[LETRAS] Letras del sorteo CABA: "${letrasSorteo}"`);
  console.log(`[LETRAS] Tickets con letras a verificar: ${ticketsConLetras.size}`);
  console.log(`[LETRAS] Tickets que ganaron por números (excluidos de letras): ${ticketsConPremioNumeros.size}`);
  
  // Mostrar algunas letras de ejemplo del NTF para debug
  let ejemplosLetras = [];
  for (const [key, data] of ticketsConLetras) {
    if (ejemplosLetras.length < 10) {
      ejemplosLetras.push(data.letras);
    } else break;
  }
  console.log(`[LETRAS] Ejemplos de letras en NTF: ${ejemplosLetras.join(', ')}`);
  
  // Contar cuántos coinciden exactamente
  let coincidenciasExactas = 0;
  let excluidosPorNumeros = 0;
  for (const [ticketKey, data] of ticketsConLetras) {
    const ticketNum = ticketKey.split('_')[0];
    if (data.letras === letrasSorteo) {
      coincidenciasExactas++;
      if (ticketsConPremioNumeros.has(ticketNum)) {
        excluidosPorNumeros++;
      }
    }
  }
  console.log(`[LETRAS] Tickets con letras coincidentes: ${coincidenciasExactas}`);
  console.log(`[LETRAS] De esos, excluidos por ganar números: ${excluidosPorNumeros}`);
  
  if (letrasSorteo.length >= 4) {
    
    // Set para evitar que un ticket gane múltiples veces por letras
    const ticketsYaGanaronLetras = new Set();
    
    for (const [ticketKey, data] of ticketsConLetras) {
      const ticketNum = ticketKey.split('_')[0];
      
      // Solo dar letras si NO ganó por números
      if (ticketsConPremioNumeros.has(ticketNum)) continue;
      
      // Solo una vez por ticket
      if (ticketsYaGanaronLetras.has(ticketNum)) continue;
      
      // Verificar si las letras coinciden con las de CABA
      if (data.letras === letrasSorteo) {
        // Buscar en qué extracto asignar el premio (el primero donde jugó)
        const loteriasJugadas = data.loteriasJugadas || '';
        let extractoAsignado = 0; // Por defecto CABA
        
        // Buscar el primer extracto cargado donde jugó
        for (let i = 0; i < Math.min(7, loteriasJugadas.length); i++) {
          const cantEnLoteria = parseInt(loteriasJugadas[i]) || 0;
          if (cantEnLoteria > 0 && reportePorExtracto[i].cargado) {
            extractoAsignado = i;
            break;
          }
        }
        
        ticketsYaGanaronLetras.add(ticketNum);
        totalGanadores++;
        totalPremios += PREMIO_LETRAS;
        
        reportePorExtracto[extractoAsignado].totalPagado += PREMIO_LETRAS;
        reportePorExtracto[extractoAsignado].totalGanadores++;
        reportePorExtracto[extractoAsignado].letras.pagado += PREMIO_LETRAS;
        reportePorExtracto[extractoAsignado].letras.ganadores++;
        reportePorExtracto[extractoAsignado].letras.aciertos++;
        
        const regOriginal = data.reg || {};
        ganadoresDetalle.push({
          ticket: ticketNum,
          provincia: regOriginal.provincia || '51',
          agencia: `${regOriginal.provincia || '51'}${(regOriginal.agencia || '').padStart(5, '0')}`,
          tipo: 'LETRAS',
          cifras: 4,
          extracto: reportePorExtracto[extractoAsignado].nombre,
          posicion: '-',
          numeroApostado: data.letras,
          numeroSorteado: letrasSorteo,
          apuesta: 0,
          multiplicador: PREMIO_LETRAS,
          premio: PREMIO_LETRAS
        });
      }
    }
  }
  
  // CORREGIR: totalGanadores debe ser la SUMA de todos los ganadores por extracto
  // No contar tickets únicos, sino aciertos totales (igual que la tabla)
  const totalGanadoresReal = reportePorExtracto.reduce((sum, rep) => sum + rep.totalGanadores, 0);

  console.log(`[ESCRUTINIO] Total ganadores por tickets únicos: ${totalGanadores}`);
  console.log(`[ESCRUTINIO] Total ganadores real (suma extractos): ${totalGanadoresReal}`);
  console.log(`[ESCRUTINIO] Total premios: ${totalPremios}`);

  // Debug redoblonas por extracto
  for (const rep of reportePorExtracto) {
    if (rep.redoblona.ganadores > 0) {
      console.log(`[REDOBLONA] ${rep.nombre}: ${rep.redoblona.ganadores} ganadores, $${rep.redoblona.pagado}`);
    }
  }

  return {
    totalPremios,
    totalGanadores: totalGanadoresReal,  // Usar la suma real de ganadores por extracto
    reportePorExtracto,
    ganadoresDetalle
  };
}

// =============================================
// ENDPOINT: Ejecutar Control Posterior
// =============================================

const ejecutarControlPosterior = async (req, res) => {
  try {
    const { registrosNTF, extractos, datosControlPrevio, registrosAnulados = 0 } = req.body;
    
    if (!registrosNTF || !extractos) {
      return errorResponse(res, 'Se requieren registros NTF y extractos', 400);
    }
    
    // Ejecutar escrutinio (solo con registros válidos, no anulados)
    const resultado = ejecutarEscrutinio(registrosNTF, extractos);
    
    // Calcular totales REALES desde los registros del TXT
    let apuestasPosterior = 0;
    let recaudacionPosterior = 0;
    let registrosValidosPosterior = 0;  // Solo ordinal 01
    
    for (const reg of registrosNTF) {
      // Sumar recaudación
      recaudacionPosterior += reg.valorApuesta || 0;
      
      // Contar apuestas por lotería jugada
      const loteriasJugadas = reg.loteriasJugadas || '00000000';
      for (let i = 0; i < 7; i++) {
        const cantEnLoteria = parseInt(loteriasJugadas.charAt(i)) || 0;
        apuestasPosterior += cantEnLoteria;
      }
      
      // Contar registros igual que Control Previo (solo ordinal 01)
      const ordinal = (reg.ordinal || '01').trim();
      if (ordinal === '01' || ordinal === '' || ordinal === '1') {
        registrosValidosPosterior++;
      }
    }
    
    // Redondear para evitar errores de punto flotante
    recaudacionPosterior = Math.round(recaudacionPosterior * 100) / 100;
    
    // Registros válidos para comparar (Control Previo solo cuenta válidos, no anulados)
    const totalRegistrosPosterior = registrosValidosPosterior;
    
    // Comparación con Control Previo
    let comparacion = null;
    if (datosControlPrevio) {
      const apuestasPrevio = datosControlPrevio.apuestasTotal || datosControlPrevio.apuestas || 0;
      const recaudacionPrevio = Math.round((datosControlPrevio.recaudacion || 0) * 100) / 100;
      const registrosPrevio = datosControlPrevio.registros || 0;
      
      comparacion = {
        registros: {
          controlPrevio: registrosPrevio,
          controlPosterior: registrosValidosPosterior,  // Solo válidos para comparar
          validos: registrosValidosPosterior,
          anulados: registrosAnulados,
          lineasTXT: registrosNTF.length,  // Total de líneas procesadas
          coincide: registrosPrevio === registrosValidosPosterior  // Comparar solo válidos
        },
        apuestas: {
          controlPrevio: apuestasPrevio,
          controlPosterior: apuestasPosterior,
          coincide: apuestasPrevio === apuestasPosterior
        },
        recaudacion: {
          controlPrevio: recaudacionPrevio,
          controlPosterior: recaudacionPosterior,
          coincide: recaudacionPrevio === recaudacionPosterior
        }
      };
    }
    
    // Preparar respuesta
    const respuesta = {
      ...resultado,
      comparacion,
      estadisticas: {
        lineasTXT: registrosNTF.length,
        registrosValidos: registrosValidosPosterior,
        registrosAnulados: registrosAnulados,
        registrosTotal: totalRegistrosPosterior
      }
    };

    // GUARDAR EN BASE DE DATOS (resguardo)
    try {
      const resguardo = await guardarEscrutinioQuiniela(resultado, datosControlPrevio, req.user);
      respuesta.resguardo = resguardo;
    } catch (errGuardar) {
      console.error('⚠️ Error guardando escrutinio (no crítico):', errGuardar.message);
      respuesta.resguardo = { success: false, error: errGuardar.message };
    }

    return successResponse(res, respuesta, 'Escrutinio ejecutado correctamente');
    
  } catch (error) {
    console.error('Error en control posterior:', error);
    return errorResponse(res, 'Error ejecutando escrutinio: ' + error.message, 500);
  }
};

// =============================================
// ENDPOINT: Generar Excel
// =============================================

const generarExcel = async (req, res) => {
  try {
    const { resultado, numeroSorteo } = req.body;
    
    if (!resultado) {
      return errorResponse(res, 'Se requieren datos del resultado', 400);
    }
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Control de Loterías';
    workbook.created = new Date();
    
    // Hoja 1: Resumen por Extracto
    const wsResumen = workbook.addWorksheet('Resumen');
    wsResumen.columns = [
      { header: 'Extracto', key: 'extracto', width: 20 },
      { header: 'Total Pagado', key: 'totalPagado', width: 15 },
      { header: 'Ganadores', key: 'ganadores', width: 12 },
      { header: '1 Cifra', key: 'cifra1', width: 12 },
      { header: '2 Cifras', key: 'cifra2', width: 12 },
      { header: '3 Cifras', key: 'cifra3', width: 12 },
      { header: '4 Cifras', key: 'cifra4', width: 12 },
      { header: 'Redoblona', key: 'redoblona', width: 12 },
      { header: 'Letras', key: 'letras', width: 12 }
    ];
    
    // Estilo encabezados
    wsResumen.getRow(1).font = { bold: true };
    wsResumen.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    wsResumen.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    for (const rep of resultado.reportePorExtracto) {
      wsResumen.addRow({
        extracto: rep.nombre,
        totalPagado: rep.totalPagado,
        ganadores: rep.totalGanadores,
        cifra1: rep.porCifras[1].pagado,
        cifra2: rep.porCifras[2].pagado,
        cifra3: rep.porCifras[3].pagado,
        cifra4: rep.porCifras[4].pagado,
        redoblona: rep.redoblona.pagado,
        letras: rep.letras.pagado
      });
    }
    
    // Fila de totales
    wsResumen.addRow({
      extracto: 'TOTAL',
      totalPagado: resultado.totalPremios,
      ganadores: resultado.totalGanadores
    });
    wsResumen.lastRow.font = { bold: true };
    
    // Formato moneda
    wsResumen.getColumn('totalPagado').numFmt = '"$"#,##0.00';
    wsResumen.getColumn('cifra1').numFmt = '"$"#,##0.00';
    wsResumen.getColumn('cifra2').numFmt = '"$"#,##0.00';
    wsResumen.getColumn('cifra3').numFmt = '"$"#,##0.00';
    wsResumen.getColumn('cifra4').numFmt = '"$"#,##0.00';
    wsResumen.getColumn('redoblona').numFmt = '"$"#,##0.00';
    wsResumen.getColumn('letras').numFmt = '"$"#,##0.00';
    
    // Hoja 2: Detalle de Ganadores
    const wsDetalle = workbook.addWorksheet('Detalle Ganadores');
    wsDetalle.columns = [
      { header: 'Ticket', key: 'ticket', width: 15 },
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Cifras', key: 'cifras', width: 8 },
      { header: 'Extracto', key: 'extracto', width: 15 },
      { header: 'Posición', key: 'posicion', width: 10 },
      { header: 'N° Apostado', key: 'numeroApostado', width: 12 },
      { header: 'N° Sorteado', key: 'numeroSorteado', width: 12 },
      { header: 'Apuesta', key: 'apuesta', width: 12 },
      { header: 'Multiplicador', key: 'multiplicador', width: 12 },
      { header: 'Premio', key: 'premio', width: 12 }
    ];
    
    wsDetalle.getRow(1).font = { bold: true };
    wsDetalle.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
    wsDetalle.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    for (const ganador of resultado.ganadoresDetalle || []) {
      wsDetalle.addRow(ganador);
    }
    
    wsDetalle.getColumn('apuesta').numFmt = '"$"#,##0.00';
    wsDetalle.getColumn('premio').numFmt = '"$"#,##0.00';
    
    // Enviar archivo
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=ControlPosterior_${numeroSorteo || 'sorteo'}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (error) {
    console.error('Error generando Excel:', error);
    return errorResponse(res, 'Error generando Excel: ' + error.message, 500);
  }
};

// =============================================
// ENDPOINT: Generar PDF Reporte
// =============================================

const generarPDFReporte = async (req, res) => {
  try {
    const { resultado, numeroSorteo, comparacion, modalidad, datosControlPrevio } = req.body;
    
    if (!resultado) {
      return errorResponse(res, 'Se requieren datos del resultado', 400);
    }
    
    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 50, right: 50 } });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Escrutinio_${numeroSorteo || 'sorteo'}.pdf`);
    
    doc.pipe(res);
    
    const fechaHoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const horaGeneracion = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    
    // Mapeo modalidades
    const MODALIDADES = { 'R': 'LA PREVIA', 'P': 'LA PRIMERA', 'M': 'MATUTINA', 'V': 'VESPERTINA', 'N': 'NOCTURNA' };
    const modalidadNombre = MODALIDADES[modalidad] || modalidad || '-';
    
    // ══════════════════════════════════════════════════════════════
    // ENCABEZADO
    // ══════════════════════════════════════════════════════════════
    doc.rect(50, 40, 495, 70).fill('#1e3a5f');
    doc.fillColor('#ffffff').fontSize(22).text('ESCRUTINIO DE QUINIELA', 60, 55, { align: 'center' });
    doc.fontSize(12).text(`Sorteo N° ${numeroSorteo || '-'}  •  ${modalidadNombre}`, 60, 82, { align: 'center' });
    
    doc.moveDown(4);
    
    // ══════════════════════════════════════════════════════════════
    // DATOS DEL SORTEO
    // ══════════════════════════════════════════════════════════════
    const startY = 130;
    
    // Caja de datos
    doc.rect(50, startY, 495, 95).stroke('#ddd');
    doc.rect(50, startY, 495, 25).fill('#f1f5f9');
    doc.fillColor('#334155').fontSize(11).text('DATOS DEL SORTEO', 60, startY + 7);
    
    const ticketsValidos = comparacion?.registros?.controlPrevio || datosControlPrevio?.registros || 0;
    const anulados = comparacion?.registros?.anulados || datosControlPrevio?.registrosAnulados || 0;
    const ticketsTotal = ticketsValidos + anulados;
    const apuestas = comparacion?.apuestas?.controlPrevio || datosControlPrevio?.apuestasTotal || 0;
    const recaudacion = comparacion?.recaudacion?.controlPrevio || datosControlPrevio?.recaudacion || 0;

    doc.fillColor('#333').fontSize(10);
    // Primera fila: Tickets (Total), Tickets Válidos, Anulados
    doc.text(`Tickets:`, 70, startY + 35);
    doc.font('Helvetica-Bold').text(ticketsTotal.toLocaleString('es-AR'), 130, startY + 35);

    doc.font('Helvetica').text(`Válidos:`, 180, startY + 35);
    doc.font('Helvetica-Bold').text(ticketsValidos.toLocaleString('es-AR'), 230, startY + 35);

    doc.font('Helvetica').text(`Anulados:`, 300, startY + 35);
    doc.font('Helvetica-Bold').fillColor('#dc2626').text(anulados.toLocaleString('es-AR'), 360, startY + 35);

    // Segunda fila: Apuestas y Recaudación
    doc.fillColor('#333').font('Helvetica').text(`Apuestas:`, 70, startY + 55);
    doc.font('Helvetica-Bold').text(apuestas.toLocaleString('es-AR'), 130, startY + 55);

    doc.font('Helvetica').text(`Recaudación:`, 220, startY + 55);
    doc.font('Helvetica-Bold').text(`$${recaudacion.toLocaleString('es-AR')}`, 300, startY + 55);

    // Tercera fila: Fecha
    doc.font('Helvetica').text(`Fecha:`, 70, startY + 75);
    doc.text(fechaHoy, 130, startY + 75);
    
    // ══════════════════════════════════════════════════════════════
    // EXTRACTOS SORTEADOS (Números de cada provincia)
    // ══════════════════════════════════════════════════════════════
    let extractosY = startY + 110;
    
    // Obtener extractos del request - filtrar solo los que tienen números
    const extractosRaw = req.body.extractos || [];
    const extractos = extractosRaw.filter(ext => {
      if (ext.cargado === false) return false;
      const nums = ext.numeros || [];
      // Verificar que tenga al menos algunos números válidos
      return nums.some(n => n && n !== '0000' && n !== '----' && n !== '');
    });
    
    if (extractos.length > 0) {
      doc.rect(50, extractosY, 495, 20).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(10).text('EXTRACTOS SORTEADOS', 60, extractosY + 5);
      extractosY += 25;
      
      // Mostrar cada extracto con sus números
      for (const ext of extractos) {
        
        const nums = ext.numeros || [];
        const letras = ext.letras || [];
        
        // Verificar espacio en página
        if (extractosY > 700) {
          doc.addPage();
          extractosY = 50;
        }
        
        // Nombre del extracto
        doc.fillColor('#1e3a5f').fontSize(8).font('Helvetica-Bold');
        doc.text(ext.nombre || 'Extracto', 55, extractosY);
        
        // Números 1-10
        doc.font('Helvetica').fillColor('#333').fontSize(7);
        let numX = 120;
        for (let i = 0; i < 10; i++) {
          doc.text(nums[i] || '----', numX, extractosY, { width: 32, align: 'center' });
          numX += 32;
        }
        
        // Letras (si hay)
        if (letras.length > 0 && letras.some(l => l)) {
          doc.fillColor('#1e3a5f').font('Helvetica-Bold');
          doc.text(letras.join(' '), 450, extractosY, { width: 90, align: 'right' });
        }
        
        extractosY += 10;
        
        // Números 11-20
        doc.font('Helvetica').fillColor('#666').fontSize(7);
        numX = 120;
        for (let i = 10; i < 20; i++) {
          doc.text(nums[i] || '----', numX, extractosY, { width: 32, align: 'center' });
          numX += 32;
        }
        
        extractosY += 14;
      }
      
      extractosY += 10;
    }
    
    // ══════════════════════════════════════════════════════════════
    // GANADORES POR EXTRACTO (PROVINCIA)
    // ══════════════════════════════════════════════════════════════
    const tablaY = extractosY;
    
    doc.rect(50, tablaY, 495, 25).fill('#1e3a5f');
    doc.fillColor('#ffffff').fontSize(11).text('GANADORES POR EXTRACTO', 60, tablaY + 7);
    
    // Encabezados de tabla
    const headerY = tablaY + 30;
    doc.rect(50, headerY, 495, 20).fill('#e2e8f0');
    doc.fillColor('#334155').fontSize(9);
    doc.text('EXTRACTO', 60, headerY + 6);
    doc.text('TICKETS', 180, headerY + 6, { width: 60, align: 'right' });
    doc.text('PREMIO TOTAL', 250, headerY + 6, { width: 90, align: 'right' });
    doc.text('% DEL TOTAL', 350, headerY + 6, { width: 70, align: 'right' });
    doc.text('PROM/TICKET', 430, headerY + 6, { width: 80, align: 'right' });
    
    // Filas de datos
    let rowY = headerY + 25;
    let totalGanadores = 0;
    let totalPremios = 0;
    let filaNum = 0;
    
    // Filtrar solo extractos con datos
    const reporteList = (resultado && resultado.reportePorExtracto) ? resultado.reportePorExtracto : [];
    
    for (const rep of reporteList) {
      // Saltar extractos no cargados o sin datos
      if (rep.cargado === false) continue;
      if (rep.totalGanadores === 0 && rep.totalPagado === 0) continue;
      if (rep.totalGanadores === 0 && rep.totalPagado === 0) continue;
      
      // Línea separadora entre extractos
      doc.strokeColor('#94a3b8').lineWidth(0.5);
      doc.moveTo(50, rowY - 4).lineTo(545, rowY - 4).stroke();
      
      // Alternar color de fondo
      if (filaNum % 2 === 0) {
        doc.rect(50, rowY - 3, 495, 18).fill('#f1f5f9');
      }
      
      const promedio = rep.totalGanadores > 0 ? rep.totalPagado / rep.totalGanadores : 0;
      const porcentaje = resultado.totalPremios > 0 ? (rep.totalPagado / resultado.totalPremios * 100) : 0;
      
      doc.fillColor('#333').fontSize(9);
      doc.font('Helvetica-Bold').text(rep.nombre, 60, rowY);
      doc.font('Helvetica').text(rep.totalGanadores.toLocaleString('es-AR'), 180, rowY, { width: 60, align: 'right' });
      doc.text(`$${rep.totalPagado.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, 250, rowY, { width: 90, align: 'right' });
      doc.text(`${porcentaje.toFixed(1)}%`, 350, rowY, { width: 70, align: 'right' });
      doc.text(`$${promedio.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, 430, rowY, { width: 80, align: 'right' });
      
      totalGanadores += rep.totalGanadores;
      totalPremios += rep.totalPagado;
      rowY += 18;
      filaNum++;
    }
    
    // Línea separadora
    doc.moveTo(50, rowY).lineTo(545, rowY).stroke('#1e3a5f');
    rowY += 5;
    
    // FILA DE TOTALES
    doc.rect(50, rowY - 2, 495, 22).fill('#1e3a5f');
    doc.fillColor('#ffffff').fontSize(10);
    doc.font('Helvetica-Bold').text('TOTAL', 60, rowY + 3);
    doc.text(totalGanadores.toLocaleString('es-AR'), 180, rowY + 3, { width: 60, align: 'right' });
    doc.text(`$${totalPremios.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, 250, rowY + 3, { width: 90, align: 'right' });
    doc.text('100%', 350, rowY + 3, { width: 70, align: 'right' });
    
    // ══════════════════════════════════════════════════════════════
    // DETALLE POR EXTRACTO (Composición de cada provincia)
    // ══════════════════════════════════════════════════════════════
    
    // Verificar si necesitamos nueva página
    if (rowY > 500) {
      doc.addPage();
      rowY = 30;
    }
    
    let detalleY = rowY + 35;
    
    doc.rect(50, detalleY, 495, 25).fill('#1e3a5f');
    doc.fillColor('#ffffff').fontSize(11).text('DETALLE POR EXTRACTO', 60, detalleY + 7);
    
    detalleY += 30;
    
    // Encabezado de la tabla detallada
    doc.rect(50, detalleY, 495, 18).fill('#e2e8f0');
    doc.fillColor('#334155').fontSize(8);
    doc.text('EXTRACTO', 55, detalleY + 5);
    doc.text('1 CIFRA', 130, detalleY + 5, { width: 55, align: 'center' });
    doc.text('2 CIFRAS', 185, detalleY + 5, { width: 55, align: 'center' });
    doc.text('3 CIFRAS', 240, detalleY + 5, { width: 55, align: 'center' });
    doc.text('4 CIFRAS', 295, detalleY + 5, { width: 55, align: 'center' });
    doc.text('REDOB.', 350, detalleY + 5, { width: 50, align: 'center' });
    doc.text('LETRAS', 400, detalleY + 5, { width: 50, align: 'center' });
    doc.text('TOTAL', 455, detalleY + 5, { width: 85, align: 'right' });
    
    // Función para dibujar líneas verticales de separación
    const dibujarDivisoresVerticales = (y, alto, color = '#94a3b8') => {
      doc.strokeColor(color).lineWidth(0.5);
      [130, 185, 240, 295, 350, 400, 455].forEach(x => {
        doc.moveTo(x, y).lineTo(x, y + alto).stroke();
      });
    };
    
    dibujarDivisoresVerticales(detalleY, 18, '#ffffff'); // Líneas blancas en el encabezado
    
    detalleY += 20;
    
    // Sub-encabezado explicativo
    doc.rect(50, detalleY, 495, 12).fill('#f1f5f9');
    doc.fillColor('#64748b').fontSize(6);
    doc.text('Gan./$', 55, detalleY + 3);
    doc.text('Gan.', 130, detalleY + 3, { width: 55, align: 'center' });
    doc.text('Gan.', 185, detalleY + 3, { width: 55, align: 'center' });
    doc.text('Gan.', 240, detalleY + 3, { width: 55, align: 'center' });
    doc.text('Gan.', 295, detalleY + 3, { width: 55, align: 'center' });
    doc.text('Gan.', 350, detalleY + 3, { width: 50, align: 'center' });
    doc.text('Gan.', 400, detalleY + 3, { width: 50, align: 'center' });
    doc.text('TOTAL', 455, detalleY + 3, { width: 85, align: 'right' });
    
    dibujarDivisoresVerticales(detalleY, 12, '#475569'); // Líneas oscuras en el sub-encabezado
    
    detalleY += 14;
    
    // Filas por extracto
    let detFilaNum = 0;
    let totales = { c1t: 0, c1p: 0, c2t: 0, c2p: 0, c3t: 0, c3p: 0, c4t: 0, c4p: 0, rt: 0, rp: 0, lt: 0, lp: 0, total: 0, totalP: 0 };
    
    const reporteListDetalle = (resultado && resultado.reportePorExtracto) ? resultado.reportePorExtracto : [];
    
    for (const rep of reporteListDetalle) {
      // Saltar extractos no cargados o sin datos
      if (rep.cargado === false) continue;
      if (rep.totalGanadores === 0 && rep.totalPagado === 0) continue;
      
      // Línea separadora entre extractos (más nítida)
      doc.strokeColor('#94a3b8').lineWidth(0.5);
      doc.moveTo(50, detalleY - 3).lineTo(545, detalleY - 3).stroke();
      
      // Alternar color de fondo
      if (detFilaNum % 2 === 0) {
        doc.rect(50, detalleY - 2, 495, 28).fill('#f1f5f9');
      }
      
      // Dibujar divisores verticales en la fila (más oscuros)
      dibujarDivisoresVerticales(detalleY - 2, 28, '#475569');
      
      const c1 = rep.porCifras[1];
      const c2 = rep.porCifras[2];
      const c3 = rep.porCifras[3];
      const c4 = rep.porCifras[4];
      const red = rep.redoblona;
      const let_ = rep.letras;
      
      // Acumular totales
      totales.c1t += c1.ganadores; totales.c1p += c1.pagado;
      totales.c2t += c2.ganadores; totales.c2p += c2.pagado;
      totales.c3t += c3.ganadores; totales.c3p += c3.pagado;
      totales.c4t += c4.ganadores; totales.c4p += c4.pagado;
      totales.rt += red.ganadores; totales.rp += red.pagado;
      totales.lt += let_.ganadores; totales.lp += let_.pagado;
      totales.total += rep.totalGanadores; totales.totalP += rep.totalPagado;
      
      // Nombre del extracto
      doc.fillColor('#333').fontSize(8);
      doc.font('Helvetica-Bold').text(rep.nombre.substring(0, 12), 55, detalleY);
      doc.font('Helvetica');
      
      // Primera línea: SOLO cantidad de ganadores
      doc.fontSize(8).fillColor('#333');
      doc.text(c1.ganadores > 0 ? c1.ganadores : '-', 130, detalleY, { width: 55, align: 'center' });
      doc.text(c2.ganadores > 0 ? c2.ganadores : '-', 185, detalleY, { width: 55, align: 'center' });
      doc.text(c3.ganadores > 0 ? c3.ganadores : '-', 240, detalleY, { width: 55, align: 'center' });
      doc.text(c4.ganadores > 0 ? c4.ganadores : '-', 295, detalleY, { width: 55, align: 'center' });
      doc.text(red.ganadores > 0 ? red.ganadores : '-', 350, detalleY, { width: 50, align: 'center' });
      doc.text(let_.ganadores > 0 ? let_.ganadores : '-', 400, detalleY, { width: 50, align: 'center' });
      
      // Total ganadores del extracto
      doc.font('Helvetica-Bold');
      doc.text(rep.totalGanadores, 455, detalleY, { width: 85, align: 'right' });
      doc.font('Helvetica');
      
      detalleY += 12;
      
      // Segunda línea: importes en pesos (formato completo, más grande y oscuro)
      doc.fillColor('#1e293b').fontSize(7).font('Helvetica-Bold');
      const formatPremio = (p) => p > 0 ? `$${p.toLocaleString('es-AR', {maximumFractionDigits: 0})}` : '-';
      doc.text(formatPremio(c1.pagado), 130, detalleY, { width: 55, align: 'center' });
      doc.text(formatPremio(c2.pagado), 185, detalleY, { width: 55, align: 'center' });
      doc.text(formatPremio(c3.pagado), 240, detalleY, { width: 55, align: 'center' });
      doc.text(formatPremio(c4.pagado), 295, detalleY, { width: 55, align: 'center' });
      doc.text(formatPremio(red.pagado), 350, detalleY, { width: 50, align: 'center' });
      doc.text(formatPremio(let_.pagado), 400, detalleY, { width: 50, align: 'center' });
      
      // Total importe del extracto
      doc.text(`$${rep.totalPagado.toLocaleString('es-AR', {maximumFractionDigits: 0})}`, 455, detalleY, { width: 85, align: 'right' });
      doc.font('Helvetica');
      
      detalleY += 16;
      detFilaNum++;
    }
    
    // Línea separadora
    doc.moveTo(50, detalleY).lineTo(545, detalleY).stroke('#1e3a5f');
    detalleY += 3;
    
    // Fila de totales - GANADORES
    doc.rect(50, detalleY, 495, 14).fill('#1e3a5f');
    doc.fillColor('#ffffff').fontSize(7);
    doc.font('Helvetica-Bold').text('TOTAL GAN.', 55, detalleY + 4);
    doc.text(`${totales.c1t}`, 130, detalleY + 4, { width: 55, align: 'center' });
    doc.text(`${totales.c2t}`, 185, detalleY + 4, { width: 55, align: 'center' });
    doc.text(`${totales.c3t}`, 240, detalleY + 4, { width: 55, align: 'center' });
    doc.text(`${totales.c4t}`, 295, detalleY + 4, { width: 55, align: 'center' });
    doc.text(`${totales.rt}`, 350, detalleY + 4, { width: 50, align: 'center' });
    doc.text(`${totales.lt}`, 400, detalleY + 4, { width: 50, align: 'center' });
    doc.text(`${totales.total}`, 455, detalleY + 4, { width: 85, align: 'right' });
    
    dibujarDivisoresVerticales(detalleY, 14, '#ffffff'); // Líneas blancas en total ganadores
    
    detalleY += 14;
    
    // Fila de totales - IMPORTES
    doc.rect(50, detalleY, 495, 16).fill('#334155');
    doc.fillColor('#ffffff').fontSize(7);
    doc.font('Helvetica-Bold').text('TOTAL $', 55, detalleY + 5);
    const fmtTot = (p) => p > 0 ? `$${p.toLocaleString('es-AR', {maximumFractionDigits: 0})}` : '-';
    doc.text(fmtTot(totales.c1p), 130, detalleY + 5, { width: 55, align: 'center' });
    doc.text(fmtTot(totales.c2p), 185, detalleY + 5, { width: 55, align: 'center' });
    doc.text(fmtTot(totales.c3p), 240, detalleY + 5, { width: 55, align: 'center' });
    doc.text(fmtTot(totales.c4p), 295, detalleY + 5, { width: 55, align: 'center' });
    doc.text(fmtTot(totales.rp), 350, detalleY + 5, { width: 50, align: 'center' });
    doc.text(fmtTot(totales.lp), 400, detalleY + 5, { width: 50, align: 'center' });
    doc.text(`$${totales.totalP.toLocaleString('es-AR', {maximumFractionDigits: 0})}`, 455, detalleY + 5, { width: 85, align: 'right' });
    
    dibujarDivisoresVerticales(detalleY, 16, '#ffffff'); // Líneas blancas en total importes
    
    detalleY += 20;
    
    // ══════════════════════════════════════════════════════════════
    // RESUMEN POR TIPO DE APUESTA
    // ══════════════════════════════════════════════════════════════
    
    // Verificar si necesitamos nueva página
    if (detalleY > 580) {
      doc.addPage();
      detalleY = 30;
    }
    
    const resumenY = detalleY + 10;
    
    doc.rect(50, resumenY, 495, 25).fill('#1e3a5f');
    doc.fillColor('#ffffff').fontSize(11).text('RESUMEN POR TIPO DE APUESTA', 60, resumenY + 7);
    
    // Calcular totales
    let tipos = [
      { nombre: '1 Cifra', indice: 'x7', tickets: 0, premio: 0 },
      { nombre: '2 Cifras', indice: 'x70', tickets: 0, premio: 0 },
      { nombre: '3 Cifras', indice: 'x600', tickets: 0, premio: 0 },
      { nombre: '4 Cifras', indice: 'x3500', tickets: 0, premio: 0 },
      { nombre: 'Redoblona', indice: '(*)', tickets: 0, premio: 0 },
      { nombre: 'Letras', indice: '$1000 fijo', tickets: 0, premio: 0 }
    ];
    
    const reporteListTipos = (resultado && resultado.reportePorExtracto) ? resultado.reportePorExtracto : [];
    
    for (const rep of reporteListTipos) {
      if (rep.cargado === false) continue;
      if (rep.totalGanadores === 0 && rep.totalPagado === 0) continue;
      tipos[0].tickets += rep.porCifras[1].ganadores; tipos[0].premio += rep.porCifras[1].pagado;
      tipos[1].tickets += rep.porCifras[2].ganadores; tipos[1].premio += rep.porCifras[2].pagado;
      tipos[2].tickets += rep.porCifras[3].ganadores; tipos[2].premio += rep.porCifras[3].pagado;
      tipos[3].tickets += rep.porCifras[4].ganadores; tipos[3].premio += rep.porCifras[4].pagado;
      tipos[4].tickets += rep.redoblona.ganadores; tipos[4].premio += rep.redoblona.pagado;
      tipos[5].tickets += rep.letras.ganadores; tipos[5].premio += rep.letras.pagado;
    }
    
    // Header
    const tipoHeaderY = resumenY + 30;
    doc.rect(50, tipoHeaderY, 495, 18).fill('#e2e8f0');
    doc.fillColor('#334155').fontSize(9);
    doc.text('TIPO', 60, tipoHeaderY + 5);
    doc.text('ÍNDICE', 180, tipoHeaderY + 5);
    doc.text('TICKETS', 280, tipoHeaderY + 5, { width: 60, align: 'right' });
    doc.text('PREMIO TOTAL', 360, tipoHeaderY + 5, { width: 100, align: 'right' });
    
    let tipoY = tipoHeaderY + 22;
    for (let i = 0; i < tipos.length; i++) {
      const t = tipos[i];
      // Línea separadora
      doc.strokeColor('#94a3b8').lineWidth(0.5);
      doc.moveTo(50, tipoY - 3).lineTo(545, tipoY - 3).stroke();
      if (i % 2 === 0) doc.rect(50, tipoY - 2, 495, 16).fill('#f1f5f9');
      
      doc.fillColor('#333').fontSize(9);
      doc.text(t.nombre, 60, tipoY);
      doc.text(t.indice, 180, tipoY);
      doc.text(t.tickets.toLocaleString('es-AR'), 280, tipoY, { width: 60, align: 'right' });
      doc.text(`$${t.premio.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, 360, tipoY, { width: 100, align: 'right' });
      tipoY += 16;
    }
    
    // Nota explicativa de Redoblona
    tipoY += 5;
    doc.rect(50, tipoY, 495, 55).fill('#fffbeb').stroke('#f59e0b');
    doc.fillColor('#92400e').fontSize(8);
    doc.font('Helvetica-Bold').text('(*) CALCULO REDOBLONA:', 60, tipoY + 8);
    doc.font('Helvetica').fontSize(7).fillColor('#78350f');
    doc.text('Fase 1: Premio1 = (Apuesta / Ext1) x 70 x Aciertos1', 60, tipoY + 20);
    doc.text('Fase 2: Premio2 = (Premio1 / Ext2) x 70 x Aciertos2', 60, tipoY + 30);
    doc.text('Topes maximos: Exacta (1-1): x3500 | 1 a 2 pos: x2500 | 1 a 3 pos: x1800 | General: x1500', 60, tipoY + 42);
    tipoY += 60;
    
    // ══════════════════════════════════════════════════════════════
    // TASA DE DEVOLUCIÓN Y TOTAL PREMIOS
    // ══════════════════════════════════════════════════════════════
    
    // Verificar si necesitamos nueva página
    if (tipoY > 680) {
      doc.addPage();
      tipoY = 50;
    }
    
    const tasaY = tipoY + 20;
    const tasaDevolucion = recaudacion > 0 ? (totalPremios / recaudacion * 100) : 0;
    
    doc.rect(50, tasaY, 240, 50).fill('#dcfce7').stroke('#22c55e');
    doc.fillColor('#166534').fontSize(10).text('TASA DE DEVOLUCIÓN', 60, tasaY + 8);
    doc.fontSize(20).text(`${tasaDevolucion.toFixed(2)}%`, 60, tasaY + 25);
    
    doc.rect(305, tasaY, 240, 50).fill('#dbeafe').stroke('#3b82f6');
    doc.fillColor('#1e40af').fontSize(10).text('TOTAL PREMIOS', 315, tasaY + 8);
    doc.fontSize(20).text(`$${totalPremios.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, 315, tasaY + 25);
    
    // ══════════════════════════════════════════════════════════════
    // PIE DE PÁGINA
    // ══════════════════════════════════════════════════════════════
    const finalY = tasaY + 70;
    doc.rect(50, finalY, 495, 20).fill('#f1f5f9');
    doc.fillColor('#64748b').fontSize(8);
    doc.text(`Generado: ${fechaHoy} a las ${horaGeneracion} | Sistema de Control de Loterias - SIMBA v2`, 60, finalY + 6, { width: 480 });
    
    doc.end();
    
  } catch (error) {
    console.error('Error generando PDF:', error);
    return errorResponse(res, 'Error generando PDF: ' + error.message, 500);
  }
};

module.exports = {
  parsearRegistrosNTF,
  ejecutarEscrutinio,
  ejecutarControlPosterior,
  generarExcel,
  generarPDFReporte
};
