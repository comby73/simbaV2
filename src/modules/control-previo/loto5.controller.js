/**
 * Loto 5 Controller - Control Previo
 * Port del Python Loto5Analyzer a Node.js
 *
 * Procesa archivos ZIP con NTF de Loto 5 Plus
 *
 * Código de juego NTF: 05 (Loto 5)
 *
 * Rango de números: 0-36 (37 números posibles)
 * Apuesta base: 5 números
 */

const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const crypto = require('crypto');
const { query } = require('../../config/database');
const { successResponse, errorResponse, PROVINCIAS } = require('../../shared/helpers');
const { buscarFechaProgramacion } = require('../../shared/control-previo.helper');

// Código de juego Loto 5 en el NTF
const LOTO5_GAME_CODE = '05';
const LOTO5_GAME_CODES = ['05']; // Array para compatibilidad

// Posiciones NTF genéricas (idénticas a todos los juegos)
const NTF_GENERIC = {
  VERSION_GENERICA:     { start: 0,   length: 2 },
  JUEGO:                { start: 2,   length: 2 },
  NUMERO_SORTEO:        { start: 4,   length: 6 },
  CANTIDAD_SORTEOS:     { start: 10,  length: 2 },
  PROVEEDOR:            { start: 12,  length: 1 },
  PROVINCIA:            { start: 13,  length: 2 },
  AGENCIA:              { start: 15,  length: 5 },
  DIGITO_VERIF:         { start: 20,  length: 1 },
  ID_TERMINAL_VENTA:    { start: 21,  length: 8 },
  ID_USUARIO_VENTA:     { start: 29,  length: 8 },
  MODO_VENTA:           { start: 37,  length: 2 },
  FECHA_VENTA:          { start: 39,  length: 8 },
  HORA_VENTA:           { start: 47,  length: 6 },
  ID_TERMINAL_CANCEL:   { start: 53,  length: 8 },
  ID_USUARIO_CANCEL:    { start: 61,  length: 8 },
  MODO_CANCELACION:     { start: 69,  length: 1 },
  FECHA_CANCELACION:    { start: 70,  length: 8 },
  HORA_CANCELACION:     { start: 78,  length: 6 },
  CANTIDAD_PARTES:      { start: 84,  length: 2 },
  NUMERO_TICKET:        { start: 86,  length: 12 },
  ORDINAL_APUESTA:      { start: 98,  length: 2 },
  TIPO_DOCUMENTO:       { start: 100, length: 1 },
  NUMERO_DOCUMENTO:     { start: 101, length: 12 },
  AGENCIA_AMIGA:        { start: 113, length: 8 },
  VALOR_APUESTA:        { start: 121, length: 10 },
  VALOR_REAL_APUESTA:   { start: 131, length: 10 },
  CODIGO_PROMOCION:     { start: 141, length: 10 },
  ID_SESION:            { start: 151, length: 12 },
  ID_EXTERNO_TICKET:    { start: 163, length: 30 },
  RESERVADO:            { start: 193, length: 7 }
};

// Parte específica Loto 5 (después de la genérica de 200 chars)
const NTF_LOTO5 = {
  VERSION_ESPECIFICA:   { start: 200, length: 2 },
  MODALIDAD:            { start: 202, length: 2 },
  CANTIDAD_SORTEOS_ESP: { start: 204, length: 2 },
  TIPO_APUESTA:         { start: 206, length: 2 },
  CANTIDAD_NUMEROS:     { start: 210, length: 2 },
  SECUENCIA_NUMEROS:    { start: 212, length: 25 },
  NUMERO_PLUS:          { start: 237, length: 1 }
};

// Código binario A-P (mismo que Poceada/Loto)
const BINARY_CODE = {
  'A': '0000', 'B': '0001', 'C': '0010', 'D': '0011',
  'E': '0100', 'F': '0101', 'G': '0110', 'H': '0111',
  'I': '1000', 'J': '1001', 'K': '1010', 'L': '1011',
  'M': '1100', 'N': '1101', 'O': '1110', 'P': '1111'
};

// Combinaciones C(n,5) para apuestas múltiples de Loto 5
const COMBINACIONES_LOTO5 = {
  5: 1,
  6: 6,
  7: 21,
  8: 56,
  9: 126,
  10: 252,
  11: 462,
  12: 792,
  13: 1287,
  14: 2002,
  15: 3003,
  16: 4368,
  17: 6188,
  18: 8568
};

/**
 * Calcula C(n, r)
 */
function calcularCombinaciones(n, r) {
  if (r === 0 || r === n) return 1;
  if (r > n) return 0;
  if (COMBINACIONES_LOTO5[n] && r === 5) return COMBINACIONES_LOTO5[n];
  let num = 1, den = 1;
  for (let i = n; i > n - r; i--) num *= i;
  for (let i = 1; i <= r; i++) den *= i;
  return Math.round(num / den);
}

/**
 * Decodifica la secuencia de 25 caracteres a números (0-36 para Loto 5)
 * Mismo algoritmo que Loto pero rango limitado a 0-36
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
 * Procesa el ZIP de Loto 5 (TXT + XML + Hash)
 */
const procesarZip = async (req, res) => {
  console.log('🔵 procesarZip Loto 5 llamado');
  try {
    if (!req.file) {
      return errorResponse(res, 'No se recibió ningún archivo', 400);
    }
    console.log('✅ Archivo recibido:', req.file.originalname);

    const zipPath = req.file.path;
    const extractPath = path.join(__dirname, '../../../uploads/temp', `loto5_extract_${Date.now()}`);

    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractPath, true);

    // Buscar archivos recursivamente
    function buscarArchivosRecursivo(dir) {
      let resultados = [];
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          resultados = resultados.concat(buscarArchivosRecursivo(fullPath));
        } else {
          resultados.push({ name: item, path: fullPath });
        }
      }
      return resultados;
    }

    const todosLosArchivos = buscarArchivosRecursivo(extractPath);
    const files = todosLosArchivos.map(f => f.name);
    console.log('📁 Archivos encontrados en ZIP:', files);

    // Buscar archivo TXT de Loto 5: LT5*.TXT o L5*.TXT
    const txtFileInfo = todosLosArchivos.find(f => {
      const name = f.name.toUpperCase();
      return (name.startsWith('LT5') || name.startsWith('L5')) && name.endsWith('.TXT');
    });

    const xmlFileInfo = todosLosArchivos.find(f => f.name.toUpperCase().endsWith('CP.XML'));
    const hashFileInfo = todosLosArchivos.find(f => f.name.toUpperCase().endsWith('.HASH') && !f.name.toUpperCase().includes('CP'));
    const hashCPFileInfo = todosLosArchivos.find(f => f.name.toUpperCase().endsWith('CP.HASH'));

    if (!txtFileInfo) {
      limpiarDirectorio(extractPath);
      return errorResponse(res, `No se encontró archivo TXT de Loto 5 (L5*.TXT o LT5*.TXT). Archivos en ZIP: ${files.join(', ')}`, 400);
    }

    // Procesar TXT
    const txtContent = fs.readFileSync(txtFileInfo.path, 'latin1');
    const logsTxt = procesarArchivoNTF(txtContent);

    // Procesar XML si existe
    let datosXml = null;
    if (xmlFileInfo) {
      const xmlContent = fs.readFileSync(xmlFileInfo.path, 'utf8');
      datosXml = await parsearXmlControlPrevio(xmlContent);
    } else {
      console.warn('⚠️ No se encontró archivo XML de control previo (CP.XML)');
    }

    // Calcular hashes
    const hashTxtCalculado = crypto.createHash('sha512').update(txtContent).digest('hex');
    let hashTxtOficial = null;
    if (hashFileInfo) {
      hashTxtOficial = fs.readFileSync(hashFileInfo.path, 'utf8').trim();
    }

    let hashXmlOficial = null;
    let hashXmlCalculado = null;
    if (hashCPFileInfo) {
      hashXmlOficial = fs.readFileSync(hashCPFileInfo.path, 'utf8').trim();
      if (xmlFileInfo) {
        const xmlContentForHash = fs.readFileSync(xmlFileInfo.path, 'utf8');
        hashXmlCalculado = crypto.createHash('sha512').update(xmlContentForHash).digest('hex');
      }
    }

    const archivosSeguridad = {
      txt: !!txtFileInfo,
      xml: !!xmlFileInfo,
      hash: !!hashFileInfo,
      hashCP: !!hashCPFileInfo,
      hashCoincide: hashTxtOficial ? hashTxtCalculado === hashTxtOficial : null,
      hashXmlCoincide: hashXmlOficial && hashXmlCalculado ? hashXmlCalculado === hashXmlOficial : null
    };

    // Limpiar temporales
    limpiarDirectorio(extractPath);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    // Preparar respuesta
    const resultado = {
      archivo: req.file.originalname,
      fechaProcesamiento: new Date().toISOString(),
      tipoJuego: 'Loto 5',
      sorteo: logsTxt.numeroSorteo,
      resumen: logsTxt.resumen,
      provincias: logsTxt.provincias,
      datosOficiales: datosXml,
      comparacion: datosXml ? {
        registros: {
          calculado: logsTxt.resumen.registros,
          oficial: datosXml.registrosValidos || 0,
          diferencia: logsTxt.resumen.registros - (datosXml.registrosValidos || 0)
        },
        anulados: {
          calculado: logsTxt.resumen.anulados,
          oficial: datosXml.registrosAnulados || 0,
          diferencia: logsTxt.resumen.anulados - (datosXml.registrosAnulados || 0)
        },
        apuestas: {
          calculado: logsTxt.resumen.apuestasTotal,
          oficial: datosXml.apuestas || 0,
          diferencia: logsTxt.resumen.apuestasTotal - (datosXml.apuestas || 0)
        },
        recaudacion: {
          calculado: logsTxt.resumen.recaudacion,
          oficial: datosXml.recaudacion || 0,
          diferencia: logsTxt.resumen.recaudacion - (datosXml.recaudacion || 0)
        }
      } : null,
      seguridad: {
        archivos: archivosSeguridad,
        hashCalculado: hashTxtCalculado,
        hashOficial: hashTxtOficial,
        hashXmlCalculado,
        hashXmlOficial,
        verificado: archivosSeguridad.hashCoincide,
        verificadoXml: archivosSeguridad.hashXmlCoincide
      },
      registrosNTF: logsTxt.registrosParseados
    };

    // Guardar en BD
    try {
      await guardarControlPrevioLoto5(resultado, req.user, req.file.originalname);
      resultado.resguardo = { success: true };
    } catch (errGuardar) {
      console.error('⚠️ Error guardando resguardo Loto 5 (no crítico):', errGuardar.message);
      resultado.resguardo = { success: false, error: errGuardar.message };
    }

    return successResponse(res, resultado, 'Loto 5 procesado correctamente');

  } catch (error) {
    console.error('Error procesando Loto 5:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * Procesa el contenido NTF de Loto 5
 * Filtra por código de juego 12
 */
function procesarArchivoNTF(content) {
  // Loto 5 NTF: genérica (200) + específica (~38+) = mínimo 232 caracteres
  const lines = content.split('\n').filter(l => l.trim().length >= 232);
  console.log(`📊 Loto 5: ${lines.length} líneas de >= 232 caracteres`);

  let numeroSorteo = '';
  let registros = 0;
  let anulados = 0;
  let apuestasTotal = 0;
  let recaudacion = 0;
  const provincias = {};
  const registrosParseados = [];

  // Contadores para Online (Agencia 88880)
  let onlineRegistros = 0;
  let onlineApuestas = 0;
  let onlineRecaudacion = 0;
  let onlineAnulados = 0;

  // Debug: mostrar códigos de juego encontrados
  const codigosEncontrados = new Set();
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const code = lines[i].substr(NTF_GENERIC.JUEGO.start, NTF_GENERIC.JUEGO.length);
    codigosEncontrados.add(code);
  }
  console.log(`📊 Códigos de juego encontrados en primeras 10 líneas:`, Array.from(codigosEncontrados));
  console.log(`📊 Buscando código: ${LOTO5_GAME_CODE}`);

  for (const line of lines) {
    const gameCode = line.substr(NTF_GENERIC.JUEGO.start, NTF_GENERIC.JUEGO.length);

    // Solo procesar códigos de Loto 5 (12 o 05)
    if (!LOTO5_GAME_CODES.includes(gameCode)) continue;

    if (!numeroSorteo) {
      numeroSorteo = line.substr(NTF_GENERIC.NUMERO_SORTEO.start, NTF_GENERIC.NUMERO_SORTEO.length).trim();
    }

    // Fecha de cancelación
    const cancelDate = line.substr(NTF_GENERIC.FECHA_CANCELACION.start, NTF_GENERIC.FECHA_CANCELACION.length);
    const isCanceled = cancelDate.trim() !== '';

    // Valor de apuesta (8 enteros + 2 decimales)
    const valorApuestaRaw = line.substr(NTF_GENERIC.VALOR_APUESTA.start, NTF_GENERIC.VALOR_APUESTA.length);
    const valorCentavos = parseInt(valorApuestaRaw) || 0;
    const valor = valorCentavos / 100;

    // Cantidad de números jugados
    const cantNum = parseInt(line.substr(NTF_LOTO5.CANTIDAD_NUMEROS.start, NTF_LOTO5.CANTIDAD_NUMEROS.length)) || 5;

    // Combinaciones C(n, 5)
    const nroApuestas = COMBINACIONES_LOTO5[cantNum] || calcularCombinaciones(cantNum, 5);

    // Secuencia de números
    const secuencia = line.substr(NTF_LOTO5.SECUENCIA_NUMEROS.start, NTF_LOTO5.SECUENCIA_NUMEROS.length);

    const provCod = line.substr(NTF_GENERIC.PROVINCIA.start, NTF_GENERIC.PROVINCIA.length);
    const ordinal = line.substr(NTF_GENERIC.ORDINAL_APUESTA.start, NTF_GENERIC.ORDINAL_APUESTA.length).trim();
    const esRegistroUnico = ordinal === '01' || ordinal === '' || ordinal === '1';

    const agenciaCompleta = provCod + line.substr(NTF_GENERIC.AGENCIA.start, NTF_GENERIC.AGENCIA.length).trim();
    const esVentaWeb = agenciaCompleta === '5188880';

    if (isCanceled) {
      if (esRegistroUnico) {
        anulados++;
        if (esVentaWeb) onlineAnulados++;
      }
    } else {
      if (esRegistroUnico) registros++;
      apuestasTotal += nroApuestas;
      recaudacion += valor;

      // Acumular Online (Agencia 88880)
      if (esVentaWeb) {
        onlineRegistros++;
        onlineApuestas += nroApuestas;
        onlineRecaudacion += valor;
      }

      // Acumular por provincia
      const provInfo = PROVINCIAS[provCod] || { nombre: `Provincia ${provCod}`, codigo: provCod };
      const key = provInfo.nombre;
      if (!provincias[key]) {
        provincias[key] = { registros: 0, apuestas: 0, recaudacion: 0, codigo: provCod, ventaWeb: 0 };
      }
      provincias[key].registros++;
      provincias[key].apuestas += nroApuestas;
      provincias[key].recaudacion += valor;
      if (esVentaWeb) provincias[key].ventaWeb++;

      // Guardar registro para escrutinio
      registrosParseados.push({
        tipoJuego: 'Loto 5',
        gameCode,
        agencia: line.substr(NTF_GENERIC.AGENCIA.start, NTF_GENERIC.AGENCIA.length),
        agenciaCompleta,
        esVentaWeb,
        ticket: line.substr(NTF_GENERIC.NUMERO_TICKET.start, NTF_GENERIC.NUMERO_TICKET.length),
        secuencia,
        cantNum,
        importe: valor
      });
    }
  }

  // Contabilizar ventas web totales
  let totalVentaWeb = 0;
  for (const key in provincias) {
    totalVentaWeb += provincias[key].ventaWeb || 0;
  }

  return {
    numeroSorteo,
    resumen: {
      registros,
      anulados,
      apuestasTotal,
      recaudacion,
      ventaWeb: totalVentaWeb,
      online: {
        registros: onlineRegistros,
        apuestas: onlineApuestas,
        recaudacion: onlineRecaudacion,
        anulados: onlineAnulados
      }
    },
    provincias,
    registrosParseados
  };
}

/**
 * Parsea el XML de control previo de Loto 5
 * Estructura: CONTROL_PREVIO > LOTO_5_PLUS con PRIMER_PREMIO, SEGUNDO_PREMIO, TERCER_PREMIO
 */
async function parsearXmlControlPrevio(xmlContent) {
  const parser = new xml2js.Parser({ explicitArray: false });
  const result = await parser.parseStringPromise(xmlContent);

  let root = null;

  if (result.CONTROL_PREVIO) {
    root = result.CONTROL_PREVIO.LOTO_5_PLUS ||
           result.CONTROL_PREVIO.LOTO5_PLUS ||
           result.CONTROL_PREVIO.LOTO_5 ||
           result.CONTROL_PREVIO;
  } else if (result.LOTO_5_PLUS) {
    root = result.LOTO_5_PLUS;
  } else if (result.DatosSorteo) {
    const ds = result.DatosSorteo;
    return {
      sorteo: ds.NumeroSorteo || ds.Sorteo,
      fecha: ds.FechaSorteo,
      registrosValidos: parseInt(ds.RegistrosValidos || 0),
      registrosAnulados: parseInt(ds.RegistrosAnulados || 0),
      apuestas: parseInt(ds.ApuestasEnSorteo || ds.Apuestas || 0),
      recaudacion: parseFloat(ds.RecaudacionBruta || ds.Recaudacion || 0),
      premios: parsearPremiosXml(ds),
      formato: 'DatosSorteo'
    };
  }

  if (!root) {
    console.warn('⚠️ No se encontró estructura XML conocida de Loto 5');
    return null;
  }

  // Extraer premios del XML
  const premios = {
    primerPremio: {
      monto: parseFloat(root.PRIMER_PREMIO?.MONTO || 0),
      pozoVacante: parseFloat(root.PRIMER_PREMIO?.POZO_VACANTE || 0),
      pozoAsegurar: parseFloat(root.PRIMER_PREMIO?.POZO_A_ASEGURAR || 0),
      totales: parseFloat(root.PRIMER_PREMIO?.TOTALES || 0)
    },
    segundoPremio: {
      monto: parseFloat(root.SEGUNDO_PREMIO?.MONTO || 0),
      pozoVacante: parseFloat(root.SEGUNDO_PREMIO?.POZO_VACANTE || 0),
      pozoAsegurar: parseFloat(root.SEGUNDO_PREMIO?.POZO_A_ASEGURAR || 0),
      totales: parseFloat(root.SEGUNDO_PREMIO?.TOTALES || 0)
    },
    tercerPremio: {
      monto: parseFloat(root.TERCER_PREMIO?.MONTO || 0),
      pozoVacante: parseFloat(root.TERCER_PREMIO?.POZO_VACANTE || 0),
      pozoAsegurar: parseFloat(root.TERCER_PREMIO?.POZO_A_ASEGURAR || 0),
      totales: parseFloat(root.TERCER_PREMIO?.TOTALES || 0)
    },
    agenciero: {
      monto: parseFloat(root.PREMIO_AGENCIERO?.MONTO || 0),
      totales: parseFloat(root.PREMIO_AGENCIERO?.TOTALES || 0)
    },
    fondoReserva: {
      monto: parseFloat(root.FONDO_RESERVA?.MONTO || root.FONDO_COMPENSADOR?.MONTO || 0)
    }
  };

  return {
    sorteo: root.SORTEO || root.NumeroSorteo,
    fecha: root.FECHA_SORTEO || root.FechaSorteo,
    codigoJuego: root.CODIGO_JUEGO,
    registrosValidos: parseInt(root.REGISTROS_VALIDOS || 0),
    registrosAnulados: parseInt(root.REGISTROS_ANULADOS || 0),
    apuestas: parseInt(root.APUESTAS_EN_SORTEO || 0),
    recaudacion: parseFloat(root.RECAUDACION_BRUTA || 0),
    recaudacionDistribuir: parseFloat(root.RECAUDACION_A_DISTRIBUIR || 0),
    importeTotalPremios: parseFloat(root.IMPORTE_TOTAL_PREMIOS_A_DISTRIBUIR || 0),
    arancel: parseFloat(root.ARANCEL || 0),
    premios,
    formato: 'CONTROL_PREVIO'
  };
}

function parsearPremiosXml(ds) {
  return {
    primerPremio: { totales: parseFloat(ds.PrimerPremio || 0), monto: 0, pozoVacante: 0 },
    segundoPremio: { totales: parseFloat(ds.SegundoPremio || 0), monto: 0, pozoVacante: 0 },
    tercerPremio: { totales: parseFloat(ds.TercerPremio || 0), monto: 0, pozoVacante: 0 },
    agenciero: { totales: parseFloat(ds.PremioAgenciero || 0), monto: 0 }
  };
}

/**
 * Guarda los resultados del control previo de Loto 5 en la BD
 * Alimenta control_previo_loto5 Y control_previo_agencias (para Dashboard)
 */
async function guardarControlPrevioLoto5(resultado, user, nombreArchivo) {
  const sorteo = resultado.sorteo || 'N/A';
  const sorteoNum = parseInt(sorteo, 10) || 0;
  const resumen = resultado.resumen || {};
  
  // Buscar fecha en programación primero
  let fecha = await buscarFechaProgramacion('loto5', sorteoNum);
  if (fecha) {
    console.log(`📅 Loto5 sorteo ${sorteoNum}: fecha desde programación = ${fecha}`);
  } else {
    throw new Error(`No se encontró fecha de sorteo para Loto 5 (${sorteoNum}) en programación`);
  }

  const insertResult = await query(`
    INSERT INTO control_previo_loto5
    (numero_sorteo, fecha, archivo, registros_validos, registros_anulados,
     apuestas_total, recaudacion, datos_json, usuario_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      fecha = VALUES(fecha),
      archivo = VALUES(archivo),
      registros_validos = VALUES(registros_validos),
      registros_anulados = VALUES(registros_anulados),
      apuestas_total = VALUES(apuestas_total),
      recaudacion = VALUES(recaudacion),
      datos_json = VALUES(datos_json),
      usuario_id = VALUES(usuario_id),
      updated_at = CURRENT_TIMESTAMP
  `, [
    sorteoNum,
    fecha,
    nombreArchivo,
    resumen.registros || 0,
    resumen.anulados || 0,
    resumen.apuestasTotal || 0,
    resumen.recaudacion || 0,
    JSON.stringify(resultado),
    user?.id || null
  ]);

  // Obtener el ID para guardar agencias
  let controlPrevioId = insertResult.insertId;
  if (!controlPrevioId) {
    const [row] = await query('SELECT id FROM control_previo_loto5 WHERE numero_sorteo = ?', [sorteo]);
    controlPrevioId = row?.id || 0;
  }

  // Guardar datos por agencia en control_previo_agencias (alimenta Dashboard)
  const registrosNTF = resultado.registrosNTF;
  if (registrosNTF && registrosNTF.length > 0 && controlPrevioId) {
    try {
      const fechaControl = fecha;

      // Agrupar por agencia
      const agenciasMap = new Map();
      for (const reg of registrosNTF) {
        const codigoCompleto = reg.agenciaCompleta || ('51' + (reg.agencia || '00000'));
        if (!agenciasMap.has(codigoCompleto)) {
          agenciasMap.set(codigoCompleto, {
            codigoProvincia: codigoCompleto.substring(0, 2),
            totalTickets: 0,
            totalApuestas: 0,
            totalRecaudacion: 0,
            ticketsSet: new Set()
          });
        }
        const ag = agenciasMap.get(codigoCompleto);
        ag.ticketsSet.add(reg.ticket);
        ag.totalApuestas++;
        ag.totalRecaudacion += reg.importe || 0;
      }

      // Eliminar previos y insertar
      await query('DELETE FROM control_previo_agencias WHERE juego = ? AND numero_sorteo = ?', ['loto5', sorteo]);
      
      const valores = [];
      const placeholders = [];
      for (const [codigo, ag] of agenciasMap) {
        placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        valores.push(
          controlPrevioId, 'loto5', fechaControl, sorteo, 'U',
          codigo, ag.codigoProvincia,
          ag.ticketsSet.size, ag.totalApuestas, 0, ag.totalRecaudacion
        );
      }
      if (placeholders.length > 0) {
        await query(`
          INSERT INTO control_previo_agencias 
            (control_previo_id, juego, fecha, numero_sorteo, modalidad, codigo_agencia, 
             codigo_provincia, total_tickets, total_apuestas, total_anulados, total_recaudacion)
          VALUES ${placeholders.join(', ')}
        `, valores);
        console.log(`✅ Guardadas ${agenciasMap.size} agencias para Control Previo LOTO 5 (sorteo: ${sorteo})`);
      }
    } catch (errAg) {
      console.error('⚠️ Error guardando agencias Loto 5 (no crítico):', errAg.message);
    }
  }
}

function limpiarDirectorio(directory) {
  if (fs.existsSync(directory)) {
    fs.readdirSync(directory).forEach((file) => {
      const curPath = path.join(directory, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        limpiarDirectorio(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(directory);
  }
}

module.exports = {
  procesarZip,
  decodificarNumerosLoto5,
  calcularCombinaciones,
  LOTO5_GAME_CODE,
  COMBINACIONES_LOTO5
};
