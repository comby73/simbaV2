/**
 * Loto Controller - Control Previo
 * Port del Python LotoAnalyzer a Node.js
 *
 * Procesa archivos ZIP con NTF de Loto Plus
 *
 * Códigos de juego NTF:
 * - 07: Loto Tradicional
 * - 08: Loto Match
 * - 09: Loto Desquite
 * - 10: Loto Sale o Sale
 * - 11: Loto Multiplicador
 *
 * Rango de números: 0-45 (46 números posibles)
 * Apuesta base: 6 números
 */

const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const crypto = require('crypto');
const { query } = require('../../config/database');
const { successResponse, errorResponse, PROVINCIAS } = require('../../shared/helpers');

const CONFIG_DISTRIBUCION_PATH = path.join(__dirname, '../../../config/loto-distribucion.json');

// Códigos de juego Loto en el NTF
const LOTO_GAME_CODES = {
  '07': 'Tradicional',
  '08': 'Match',
  '09': 'Desquite',
  '10': 'Sale o Sale',
  '11': 'Multiplicador'
};

// Posiciones NTF genéricas (idénticas a Poceada/Quiniela)
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

// Parte específica Loto (después de la genérica de 200 chars)
const NTF_LOTO = {
  VERSION_ESPECIFICA:   { start: 200, length: 2 },
  MODALIDAD:            { start: 202, length: 2 },
  CANTIDAD_SORTEOS_ESP: { start: 204, length: 2 },
  TIPO_APUESTA:         { start: 206, length: 2 },
  CANTIDAD_NUMEROS:     { start: 210, length: 2 },
  SECUENCIA_NUMEROS:    { start: 212, length: 25 },
  NUMERO_PLUS:          { start: 237, length: 1 }
};

// Código binario A-P (mismo que Poceada)
const BINARY_CODE = {
  'A': '0000', 'B': '0001', 'C': '0010', 'D': '0011',
  'E': '0100', 'F': '0101', 'G': '0110', 'H': '0111',
  'I': '1000', 'J': '1001', 'K': '1010', 'L': '1011',
  'M': '1100', 'N': '1101', 'O': '1110', 'P': '1111'
};

// Combinaciones C(n,6) para apuestas múltiples de Loto
const COMBINACIONES_LOTO = {
  6: 1,
  7: 7,
  8: 28,
  9: 84,
  10: 210,
  11: 462,
  12: 924,
  13: 1716,
  14: 3003,
  15: 5005,
  16: 8008,
  17: 12376,
  18: 18564
};

/**
 * Calcula C(n, r)
 */
function calcularCombinaciones(n, r) {
  if (r === 0 || r === n) return 1;
  if (r > n) return 0;
  if (COMBINACIONES_LOTO[n] && r === 6) return COMBINACIONES_LOTO[n];
  let num = 1, den = 1;
  for (let i = n; i > n - r; i--) num *= i;
  for (let i = 1; i <= r; i++) den *= i;
  return Math.round(num / den);
}

/**
 * Decodifica la secuencia de 25 caracteres a números (0-45 para Loto)
 * Mismo algoritmo que Poceada pero rango limitado a 0-45
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
 * Decodifica el número PLUS (posición 238 en NTF)
 * Es un solo carácter A-P que codifica un número 0-9
 */
function decodificarNumeroPlus(charPlus) {
  if (!charPlus || charPlus.trim() === '') return null;
  const letra = charPlus.toUpperCase();
  const binario = BINARY_CODE[letra];
  if (!binario) return null;
  // El número PLUS es el valor decimal del nibble
  const valor = parseInt(binario, 2);
  return valor <= 9 ? valor : null;
}

function normalizarSorteo(valor) {
  const limpio = String(valor || '').trim().replace(/^0+/, '');
  return limpio === '' ? '0' : limpio;
}

/**
 * Procesa el ZIP de Loto (TXT + XML + Hash)
 */
const procesarZip = async (req, res) => {
  console.log('🔵 procesarZip Loto llamado');
  try {
    if (!req.file) {
      return errorResponse(res, 'No se recibió ningún archivo', 400);
    }
    console.log('✅ Archivo recibido:', req.file.originalname);

    const zipPath = req.file.path;
    const extractPath = path.join(__dirname, '../../../uploads/temp', `loto_extract_${Date.now()}`);

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

    // Buscar archivo TXT de Loto: LTO*.TXT o LOT*.TXT
    const txtFileInfo = todosLosArchivos.find(f => {
      const name = f.name.toUpperCase();
      return (name.startsWith('LTO') || name.startsWith('LOT')) && name.endsWith('.TXT');
    });

    const xmlFileInfo = todosLosArchivos.find(f => f.name.toUpperCase().endsWith('CP.XML'));
    const hashFileInfo = todosLosArchivos.find(f => f.name.toUpperCase().endsWith('.HASH') && !f.name.toUpperCase().includes('CP'));
    const hashCPFileInfo = todosLosArchivos.find(f => f.name.toUpperCase().endsWith('CP.HASH'));

    if (!txtFileInfo) {
      limpiarDirectorio(extractPath);
      return errorResponse(res, `No se encontró archivo TXT de Loto (LTO*.TXT o LOT*.TXT). Archivos en ZIP: ${files.join(', ')}`, 400);
    }

    // Procesar TXT
    const txtContent = fs.readFileSync(txtFileInfo.path, 'latin1');
    const logsTxt = procesarArchivoNTF(txtContent);
    if (!logsTxt || !logsTxt.numeroSorteo) {
      limpiarDirectorio(extractPath);
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      return errorResponse(res, 'TXT Loto inválido: no se pudo detectar número de sorteo', 400);
    }
    if (!Array.isArray(logsTxt.registrosParseados) || logsTxt.registrosParseados.length === 0) {
      limpiarDirectorio(extractPath);
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      return errorResponse(res, 'TXT Loto inválido: no hay registros válidos', 400);
    }

    // Procesar XML si existe
    let datosXml = null;
    if (xmlFileInfo) {
      try {
        const xmlContent = fs.readFileSync(xmlFileInfo.path, 'utf8');
        datosXml = await parsearXmlControlPrevio(xmlContent);
      } catch (errXml) {
        limpiarDirectorio(extractPath);
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        return errorResponse(res, errXml.message || 'XML Loto inválido', 400);
      }
    } else {
      console.warn('⚠️ No se encontró archivo XML de control previo (CP.XML)');
    }
    if (datosXml && logsTxt.numeroSorteo) {
      const sorteoTxtNorm = String(logsTxt.numeroSorteo).replace(/^0+/, '') || '0';
      const sorteoXmlNorm = String(datosXml.sorteo).replace(/^0+/, '') || '0';
      if (sorteoTxtNorm !== sorteoXmlNorm) {
      limpiarDirectorio(extractPath);
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      return errorResponse(
        res,
        `Inconsistencia TXT/XML: sorteo TXT ${logsTxt.numeroSorteo} != XML ${datosXml.sorteo}`,
        400
      );
    }
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
      tipoJuego: 'Loto',
      sorteo: logsTxt.numeroSorteo,
      resumen: logsTxt.resumen,
      provincias: logsTxt.provincias,
      modalidades: logsTxt.modalidades,
      datosOficiales: datosXml,
      distribucionConfig: cargarDistribucionLoto(),
      comparacion: datosXml ? {
        registros: {
          calculado: logsTxt.resumen.registros,
          oficial: datosXml.totales?.registrosValidos || 0,
          diferencia: logsTxt.resumen.registros - (datosXml.totales?.registrosValidos || 0)
        },
        anulados: {
          calculado: logsTxt.resumen.anulados,
          oficial: datosXml.totales?.registrosAnulados || 0,
          diferencia: logsTxt.resumen.anulados - (datosXml.totales?.registrosAnulados || 0)
        },
        apuestas: {
          calculado: logsTxt.resumen.apuestasTotal,
          oficial: datosXml.totales?.apuestas || 0,
          diferencia: logsTxt.resumen.apuestasTotal - (datosXml.totales?.apuestas || 0)
        },
        recaudacion: {
          calculado: logsTxt.resumen.recaudacion,
          oficial: datosXml.totales?.recaudacion || 0,
          diferencia: logsTxt.resumen.recaudacion - (datosXml.totales?.recaudacion || 0)
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
      await guardarControlPrevioLoto(resultado, req.user, req.file.originalname);
      resultado.resguardo = { success: true };
    } catch (errGuardar) {
      console.error('⚠️ Error guardando resguardo Loto (no crítico):', errGuardar.message);
      resultado.resguardo = { success: false, error: errGuardar.message };
    }

    return successResponse(res, resultado, 'Loto procesado correctamente');

  } catch (error) {
    console.error('Error procesando Loto:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * Procesa el contenido NTF de Loto
 * Filtra por códigos de juego 07-11
 */
function procesarArchivoNTF(content) {
  // Loto NTF: genérica (200) + específica (~38+) = mínimo 238 caracteres
  const lines = content.split('\n').filter(l => l.trim().length >= 232);

  let numeroSorteo = '';
  let registros = 0;
  let anulados = 0;
  let apuestasTotal = 0;
  let recaudacion = 0;
  const provincias = {};
  const modalidades = {
    'Tradicional': { registros: 0, apuestas: 0, recaudacion: 0 },
    'Match': { registros: 0, apuestas: 0, recaudacion: 0 },
    'Desquite': { registros: 0, apuestas: 0, recaudacion: 0 },
    'Sale o Sale': { registros: 0, apuestas: 0, recaudacion: 0 },
    'Multiplicador': { registros: 0, apuestas: 0, recaudacion: 0 }
  };
  const registrosParseados = [];

  for (const line of lines) {
    const gameCode = line.substr(NTF_GENERIC.JUEGO.start, NTF_GENERIC.JUEGO.length);

    // Solo procesar códigos de Loto (07-11)
    const modalidadNombre = LOTO_GAME_CODES[gameCode];
    if (!modalidadNombre) continue;

    if (!numeroSorteo) {
      numeroSorteo = normalizarSorteo(
        line.substr(NTF_GENERIC.NUMERO_SORTEO.start, NTF_GENERIC.NUMERO_SORTEO.length)
      );
    }

    // Fecha de cancelación
    const cancelDate = line.substr(NTF_GENERIC.FECHA_CANCELACION.start, NTF_GENERIC.FECHA_CANCELACION.length);
    const isCanceled = cancelDate.trim() !== '';

    // Valor de apuesta (8 enteros + 2 decimales)
    const valorApuestaRaw = line.substr(NTF_GENERIC.VALOR_APUESTA.start, NTF_GENERIC.VALOR_APUESTA.length);
    const valorCentavos = parseInt(valorApuestaRaw) || 0;
    const valor = valorCentavos / 100;

    // Cantidad de números jugados
    const cantNum = parseInt(line.substr(NTF_LOTO.CANTIDAD_NUMEROS.start, NTF_LOTO.CANTIDAD_NUMEROS.length)) || 6;

    // Combinaciones C(n, 6)
    const nroApuestas = COMBINACIONES_LOTO[cantNum] || calcularCombinaciones(cantNum, 6);

    // Secuencia de números
    const secuencia = line.substr(NTF_LOTO.SECUENCIA_NUMEROS.start, NTF_LOTO.SECUENCIA_NUMEROS.length);

    // Número PLUS (solo para código 11)
    let numeroPlus = null;
    if (gameCode === '11' && line.length >= 238) {
      const charPlus = line.substr(NTF_LOTO.NUMERO_PLUS.start, NTF_LOTO.NUMERO_PLUS.length);
      numeroPlus = decodificarNumeroPlus(charPlus);
    }

    const provCod = line.substr(NTF_GENERIC.PROVINCIA.start, NTF_GENERIC.PROVINCIA.length);
    const ordinal = line.substr(NTF_GENERIC.ORDINAL_APUESTA.start, NTF_GENERIC.ORDINAL_APUESTA.length).trim();
    const esRegistroUnico = ordinal === '01' || ordinal === '' || ordinal === '1';

    const agenciaCompleta = provCod + line.substr(NTF_GENERIC.AGENCIA.start, NTF_GENERIC.AGENCIA.length).trim();
    const esVentaWeb = agenciaCompleta === '5188880';

    if (isCanceled) {
      if (esRegistroUnico) anulados++;
    } else {
      if (esRegistroUnico) registros++;
      apuestasTotal += nroApuestas;
      recaudacion += valor;

      // Acumular por modalidad
      if (modalidades[modalidadNombre]) {
        modalidades[modalidadNombre].registros++;
        modalidades[modalidadNombre].apuestas += nroApuestas;
        modalidades[modalidadNombre].recaudacion += valor;
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
        tipoJuego: 'Loto',
        modalidad: modalidadNombre,
        gameCode,
        agencia: line.substr(NTF_GENERIC.AGENCIA.start, NTF_GENERIC.AGENCIA.length),
        agenciaCompleta,
        esVentaWeb,
        ticket: line.substr(NTF_GENERIC.NUMERO_TICKET.start, NTF_GENERIC.NUMERO_TICKET.length),
        secuencia,
        cantNum,
        numeroPlus,
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
      ventaWeb: totalVentaWeb
    },
    provincias,
    modalidades,
    registrosParseados
  };
}

// Mapeo nodos XML → nombre amigable de modalidad
const XML_NODO_MAP = {
  'LOTO_TRADICIONAL': 'Tradicional',
  'LOTO_MATCH': 'Match',
  'LOTO_DESQUITE': 'Desquite',
  'LOTO_SOS': 'Sale o Sale',
  'LOTO_MULTIPLICADOR': 'Multiplicador'
};

/**
 * Parsea un nodo de premio del XML (PRIMER_PREMIO, SEGUNDO_PREMIO, etc.)
 * Extrae MONTO, POZO_VACANTE, POZO_A_ASEGURAR, TOTALES
 */
function parsearNodoPremio(node) {
  if (!node) return null;
  return {
    monto: parseFloat(String(node.MONTO || 0).trim()),
    pozoVacante: parseFloat(String(node.POZO_VACANTE || 0).trim()),
    pozoAsegurar: parseFloat(String(node.POZO_A_ASEGURAR || 0).trim()),
    totales: parseFloat(String(node.TOTALES || 0).trim())
  };
}

/**
 * Parsea todos los premios de un nodo de modalidad del XML
 */
function parsearPremiosModalidad(modXml) {
  const premios = {};
  if (modXml.PRIMER_PREMIO) premios.primerPremio = parsearNodoPremio(modXml.PRIMER_PREMIO);
  if (modXml.SEGUNDO_PREMIO) premios.segundoPremio = parsearNodoPremio(modXml.SEGUNDO_PREMIO);
  if (modXml.TERCER_PREMIO) premios.tercerPremio = parsearNodoPremio(modXml.TERCER_PREMIO);
  if (modXml.PREMIO_AGENCIERO) premios.agenciero = parsearNodoPremio(modXml.PREMIO_AGENCIERO);
  if (modXml.FONDO_RESERVA) {
    premios.fondoReserva = { monto: parseFloat(String(modXml.FONDO_RESERVA.MONTO || 0).trim()) };
  }
  if (modXml.FONDO_COMPENSADOR) {
    premios.fondoCompensador = { monto: parseFloat(String(modXml.FONDO_COMPENSADOR.MONTO || 0).trim()) };
  }
  return premios;
}

function esNumeroNoNegativo(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0;
}

function validarPremiosXmlModalidad(nombreMod, premios) {
  const requeridos = {
    'Tradicional': ['primerPremio', 'segundoPremio', 'tercerPremio', 'agenciero'],
    'Match': ['primerPremio', 'segundoPremio', 'tercerPremio', 'agenciero'],
    'Desquite': ['primerPremio', 'agenciero'],
    'Sale o Sale': ['primerPremio']
  };

  const campos = requeridos[nombreMod];
  if (!campos) return null;

  for (const campo of campos) {
    const premio = premios[campo];
    if (!premio) return `Falta premio ${campo} en XML (${nombreMod})`;
    if (!esNumeroNoNegativo(premio.totales)) {
      return `Premio inválido ${campo}.totales en XML (${nombreMod})`;
    }
  }
  return null;
}

function failXml(message) {
  throw new Error(message);
}

/**
 * Parsea el XML de control previo de Loto
 * Estructura real: CONTROL_PREVIO > LOTO_PLUS > {LOTO_TRADICIONAL, LOTO_MATCH, LOTO_DESQUITE, LOTO_SOS, LOTO_MULTIPLICADOR}
 */
async function parsearXmlControlPrevio(xmlContent) {
  const parser = new xml2js.Parser({ explicitArray: false, trim: true });
  const result = await parser.parseStringPromise(xmlContent);

  // Buscar el nodo raíz LOTO_PLUS
  let root = null;
  if (result.CONTROL_PREVIO) {
    root = result.CONTROL_PREVIO.LOTO_PLUS ||
           result.CONTROL_PREVIO.LOTO_DE_LA_CIUDAD ||
           result.CONTROL_PREVIO;
  } else if (result.LOTO_PLUS) {
    root = result.LOTO_PLUS;
  } else if (result.LOTO_DE_LA_CIUDAD) {
    root = result.LOTO_DE_LA_CIUDAD;
  }

  if (!root) {
    failXml('XML Loto inválido: no se encontró estructura CONTROL_PREVIO/LOTO_PLUS');
  }

  const sorteo = root.SORTEO || root.NumeroSorteo || '';
  const fecha = root.FECHA_SORTEO || root.FechaSorteo || '';
  if (!sorteo || !fecha) {
    failXml('XML Loto inválido: falta SORTEO o FECHA_SORTEO');
  }

  // Iterar sobre los 5 nodos de modalidad
  const modalidades = {};
  let totalRegValidos = 0, totalRegAnulados = 0, totalApuestas = 0;
  let totalRecaudacion = 0, totalPremios = 0;

  for (const [nodoXml, nombreMod] of Object.entries(XML_NODO_MAP)) {
    const modXml = root[nodoXml];
    if (!modXml) continue;

    const regVal = parseInt(modXml.REGISTROS_VALIDOS || 0);
    const regAn = parseInt(modXml.REGISTROS_ANULADOS || 0);
    const apuestas = parseInt(modXml.APUESTAS_EN_SORTEO || 0);
    const recBruta = parseFloat(String(modXml.RECAUDACION_BRUTA || 0).trim());
    const recDistribuir = parseFloat(String(modXml.RECAUDACION_A_DISTRIBUIR || 0).trim());
    const impPremios = parseFloat(String(modXml.IMPORTE_TOTAL_PREMIOS_A_DISTRIBUIR || 0).trim());
    const arancel = parseFloat(String(modXml.ARANCEL || 0).trim());

    totalRegValidos += regVal;
    totalRegAnulados += regAn;
    totalApuestas += apuestas;
    totalRecaudacion += recBruta;
    totalPremios += impPremios;

    modalidades[nombreMod] = {
      codigoJuego: parseInt(modXml.CODIGO_JUEGO || 0),
      nodoXml,
      registrosValidos: regVal,
      registrosAnulados: regAn,
      apuestas,
      recaudacionBruta: recBruta,
      recaudacionADistribuir: recDistribuir,
      importeTotalPremios: impPremios,
      arancel,
      premios: parsearPremiosModalidad(modXml)
    };

    const errPremios = validarPremiosXmlModalidad(nombreMod, modalidades[nombreMod].premios || {});
    if (errPremios) {
      failXml(`XML Loto inválido: ${errPremios}`);
    }
  }

  const modalidadesEsperadas = ['Tradicional', 'Match', 'Desquite', 'Sale o Sale', 'Multiplicador'];
  for (const mod of modalidadesEsperadas) {
    if (!modalidades[mod]) {
      failXml(`XML Loto inválido: falta modalidad ${mod}`);
    }
  }

  console.log(`✅ XML Loto parseado: Sorteo ${sorteo}, ${Object.keys(modalidades).length} modalidades`);

  return {
    sorteo,
    fecha,
    totales: {
      registrosValidos: totalRegValidos,
      registrosAnulados: totalRegAnulados,
      apuestas: totalApuestas,
      recaudacion: totalRecaudacion,
      importeTotalPremios: totalPremios
    },
    modalidades,
    formato: 'CONTROL_PREVIO'
  };
}

function cargarDistribucionLoto() {
  try {
    if (!fs.existsSync(CONFIG_DISTRIBUCION_PATH)) return null;
    const raw = fs.readFileSync(CONFIG_DISTRIBUCION_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('⚠️ No se pudo cargar config de distribución Loto:', err.message);
    return null;
  }
}

/**
 * Guarda los resultados del control previo de Loto en la BD
 */
async function guardarControlPrevioLoto(resultado, user, nombreArchivo) {
  const sorteo = resultado.sorteo || 'N/A';
  const resumen = resultado.resumen || {};

  await query(`
    INSERT INTO control_previo_loto
    (numero_sorteo, archivo, registros_validos, registros_anulados,
     apuestas_total, recaudacion, datos_json, usuario_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      archivo = VALUES(archivo),
      registros_validos = VALUES(registros_validos),
      registros_anulados = VALUES(registros_anulados),
      apuestas_total = VALUES(apuestas_total),
      recaudacion = VALUES(recaudacion),
      datos_json = VALUES(datos_json),
      usuario_id = VALUES(usuario_id),
      updated_at = CURRENT_TIMESTAMP
  `, [
    sorteo,
    nombreArchivo,
    resumen.registros || 0,
    resumen.anulados || 0,
    resumen.apuestasTotal || 0,
    resumen.recaudacion || 0,
    JSON.stringify(resultado),
    user?.id || null
  ]);
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
  decodificarNumerosLoto,
  decodificarNumeroPlus,
  calcularCombinaciones,
  LOTO_GAME_CODES,
  COMBINACIONES_LOTO
};
