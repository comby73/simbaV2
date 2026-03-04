'use strict';

/**
 * BRINCO Controller - Control Previo
 * Procesa archivos NTF de BRINCO (código de juego: 13)
 * 
 * BRINCO tiene dos modalidades:
 * - BRINCO Tradicional: 6 números del 1-41, premios por 6/5/4/3 aciertos
 * - BRINCO Junior Siempre Sale: 6 números del 1-41, premio por 5+ aciertos
 */

const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const crypto = require('crypto');
const { query } = require('../../config/database');
const { successResponse, errorResponse, PROVINCIAS } = require('../../shared/helpers');
const { buscarFechaProgramacion } = require('../../shared/control-previo.helper');

// ============================================================
// CONFIGURACIÓN NTF BRINCO
// ============================================================

// Parte genérica del NTF (común a todos los juegos)
// Posiciones 1-based del PDF convertidas a 0-based para JavaScript
const NTF_GENERIC = {
  VERSION_GENERICA: { start: 0, length: 2 },      // Pos 1-2: "02" - Versión parte genérica
  JUEGO: { start: 2, length: 2 },                  // Pos 3-4: Código de juego (13 = BRINCO)
  NUMERO_SORTEO: { start: 4, length: 6 },          // Pos 5-10: Número de sorteo
  CANTIDAD_SORTEOS: { start: 10, length: 2 },      // Pos 11-12: Cantidad de sorteos jugados
  PROVEEDOR: { start: 12, length: 1 },             // Pos 13: Proveedor
  PROVINCIA: { start: 13, length: 2 },             // Pos 14-15: Provincia
  AGENCIA: { start: 15, length: 5 },               // Pos 16-20: Agencia (Cuenta Corriente C.A.B.A.)
  DIGITO_VERIF: { start: 20, length: 1 },          // Pos 21: Dígito verificador
  ID_TERMINAL_VENTA: { start: 21, length: 8 },     // Pos 22-29: ID terminal venta
  ID_USUARIO_VENTA: { start: 29, length: 8 },      // Pos 30-37: ID usuario venta
  MODO_VENTA: { start: 37, length: 2 },            // Pos 38-39: Modo de venta
  FECHA_VENTA: { start: 39, length: 8 },           // Pos 40-47: Fecha de venta (AAAAMMDD)
  HORA_VENTA: { start: 47, length: 6 },            // Pos 48-53: Hora de venta (HHMMSS)
  ID_TERMINAL_CANCEL: { start: 53, length: 8 },    // Pos 54-61: ID terminal cancelación
  ID_USUARIO_CANCEL: { start: 61, length: 8 },     // Pos 62-69: ID usuario cancelación
  MODO_CANCELACION: { start: 69, length: 1 },      // Pos 70: Modo cancelación
  FECHA_CANCELACION: { start: 70, length: 8 },     // Pos 71-78: Fecha cancelación (AAAAMMDD o espacios)
  HORA_CANCELACION: { start: 78, length: 6 },      // Pos 79-84: Hora cancelación (HHMMSS o espacios)
  CANTIDAD_PARTES: { start: 84, length: 2 },       // Pos 85-86: Cantidad de partes
  NUMERO_TICKET: { start: 86, length: 12 },        // Pos 87-98: Número de ticket
  ORDINAL_APUESTA: { start: 98, length: 2 },       // Pos 99-100: Ordinal de apuesta
  TIPO_DOCUMENTO: { start: 100, length: 1 },       // Pos 101: Tipo de documento
  NUMERO_DOCUMENTO: { start: 101, length: 12 },    // Pos 102-113: Número de documento
  AGENCIA_AMIGA: { start: 113, length: 8 },        // Pos 114-121: Agencia amiga web
  VALOR_APUESTA: { start: 121, length: 10 },       // Pos 122-131: Valor del Apuesta (EEEEEEEEEDD)
  VALOR_REAL_APUESTA: { start: 131, length: 10 },  // Pos 132-141: Valor real del Apuesta
  CODIGO_PROMOCION: { start: 141, length: 10 },    // Pos 142-151: Código Único Promoción
  ID_SESION: { start: 151, length: 12 },           // Pos 152-163: ID sesión tickets
  ID_EXTERNO_TICKET: { start: 163, length: 30 },   // Pos 164-193: ID externo ticket
  RESERVADO: { start: 193, length: 7 }             // Pos 194-200: Reservado
};

// Parte Específica BRINCO
// La parte genérica tiene 200 caracteres, la específica empieza en posición 201 (índice 200)
const NTF_BRINCO = {
  VERSION_ESPECIFICA: { start: 200, length: 2 },   // Pos 201-202: Versión NTF BRINCO
  INSTANCIAS: { start: 202, length: 1 },           // Pos 203: Cantidad de instancias (01-99)
  APUESTAS_SIMPLES: { start: 203, length: 7 },     // Pos 204-210: Cantidad apuestas simples
  CANTIDAD_NUMEROS: { start: 210, length: 2 },     // Pos 211-212: Cantidad de números jugados (6-12)
  SECUENCIA_NUMEROS: { start: 212, length: 25 }    // Pos 213-237: Números jugados (codificación binaria)
};

// Código binario para decodificar la secuencia de números
// Cada letra A-P representa un patrón de 4 bits
const BINARY_CODE = {
  'A': '0000', 'B': '0001', 'C': '0010', 'D': '0011',
  'E': '0100', 'F': '0101', 'G': '0110', 'H': '0111',
  'I': '1000', 'J': '1001', 'K': '1010', 'L': '1011',
  'M': '1100', 'N': '1101', 'O': '1110', 'P': '1111'
};

// Combinaciones para apuestas múltiples de BRINCO
// C(n, 6) - cuántas combinaciones de 6 números se forman con n números
const COMBINACIONES_BRINCO = {
  6: 1,       // Simple
  7: 7,       // C(7,6)
  8: 28,      // C(8,6)
  9: 84,      // C(9,6)
  10: 210,    // C(10,6)
  11: 462,    // C(11,6)
  12: 924     // C(12,6)
};

// ============================================================
// FUNCIONES DE UTILIDAD
// ============================================================

/**
 * Calcula combinaciones C(n, r) = n! / (r! * (n-r)!)
 */
function calcularCombinaciones(n, r) {
  if (r === 0 || r === n) return 1;
  if (r > n) return 0;
  
  // Usar la tabla predefinida si está disponible
  if (r === 6 && COMBINACIONES_BRINCO[n]) {
    return COMBINACIONES_BRINCO[n];
  }
  
  // Calcular manualmente
  let numerator = 1;
  let denominator = 1;
  for (let i = 0; i < r; i++) {
    numerator *= (n - i);
    denominator *= (i + 1);
  }
  return Math.round(numerator / denominator);
}

/**
 * Decodifica la secuencia de 25 caracteres de BRINCO a un array de números (0-40 en BRINCO)
 * Los números van de 0 a 40 según formato LOTBA (00, 01, ..., 40)
 */
function decodificarNumerosBrinco(secuencia25) {
  const numeros = [];
  for (let i = 0; i < Math.min(25, (secuencia25 || '').length); i++) {
    const letra = secuencia25[i].toUpperCase();
    const binario = BINARY_CODE[letra] || '0000';
    for (let j = 0; j < 4; j++) {
      if (binario[j] === '1') {
        const numero = i * 4 + j;
        // BRINCO usa números del 0 al 40 (41 números posibles)
        if (numero >= 0 && numero <= 40) {
          numeros.push(numero); // NO +1, números van de 0 a 40
        }
      }
    }
  }
  return [...new Set(numeros)].sort((a, b) => a - b);
}

/**
 * Extrae un campo del registro NTF según la configuración de posición
 */
function extraerCampo(linea, config) {
  return (linea.substr(config.start, config.length) || '').trim();
}

/**
 * Convierte un valor monetario del NTF (EEEEEEEEEDD) a número
 * 8 dígitos enteros + 2 decimales
 */
function parsearValorMonetario(valor) {
  if (!valor || valor.trim() === '') return 0;
  const limpio = valor.replace(/\D/g, '');
  const cents = parseInt(limpio) || 0;
  return cents / 100;
}

function normalizarFechaControlPrevio(value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{8}$/.test(raw)) {
    const yyyyFirst = `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
    if (!Number.isNaN(new Date(yyyyFirst).getTime())) return yyyyFirst;

    const ddFirst = `${raw.substring(4, 8)}-${raw.substring(2, 4)}-${raw.substring(0, 2)}`;
    if (!Number.isNaN(new Date(ddFirst).getTime())) return ddFirst;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split('/');
    const iso = `${yyyy}-${mm}-${dd}`;
    if (!Number.isNaN(new Date(iso).getTime())) return iso;
  }

  const soloDigitos = raw.replace(/\D/g, '');
  if (/^\d{8}$/.test(soloDigitos)) {
    const yyyyFirst = `${soloDigitos.substring(0, 4)}-${soloDigitos.substring(4, 6)}-${soloDigitos.substring(6, 8)}`;
    if (!Number.isNaN(new Date(yyyyFirst).getTime())) return yyyyFirst;

    const ddFirst = `${soloDigitos.substring(4, 8)}-${soloDigitos.substring(2, 4)}-${soloDigitos.substring(0, 2)}`;
    if (!Number.isNaN(new Date(ddFirst).getTime())) return ddFirst;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];

  return null;
}

/**
 * Limpia un directorio recursivamente
 */
function limpiarDirectorio(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn('Error limpiando directorio:', e.message);
  }
}

// ============================================================
// PROCESAMIENTO NTF BRINCO
// ============================================================

/**
 * Procesa el contenido del archivo TXT NTF de BRINCO
 */
async function procesarArchivoNTF(contenido) {
  const lineas = contenido.split('\n');
  const registros = [];
  
  let totalRegistros = 0;
  let registrosValidos = 0;
  let registrosCancelados = 0;
  let recaudacionValida = 0;
  let recaudacionCancelada = 0;
  let apuestasSimples = 0;
  let numeroSorteo = null;
  
  const porProvincia = {};
  const porAgencia = {};
  
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (linea.length < 237) continue; // Longitud mínima para BRINCO
    
    totalRegistros++;
    
    // Extraer campos genéricos
    const juego = extraerCampo(linea, NTF_GENERIC.JUEGO);
    if (juego !== '13') continue; // Solo procesar BRINCO (código 13)
    
    if (!numeroSorteo) {
      numeroSorteo = extraerCampo(linea, NTF_GENERIC.NUMERO_SORTEO);
    }
    
    const provinciaRaw = extraerCampo(linea, NTF_GENERIC.PROVINCIA);
    const agenciaRaw = extraerCampo(linea, NTF_GENERIC.AGENCIA);
    const agenciaNormalizada = String(agenciaRaw || '').padStart(5, '0');
    const esVentaWeb = agenciaNormalizada === '88880';
    const provincia = '51'; // Regla de negocio: BRINCO se liquida en CABA
    const agencia = agenciaNormalizada;
    const ctaCte = esVentaWeb ? '5188880' : `51${agenciaNormalizada}`;
    const ticket = extraerCampo(linea, NTF_GENERIC.NUMERO_TICKET);
    const fechaVenta = extraerCampo(linea, NTF_GENERIC.FECHA_VENTA);
    const horaVenta = extraerCampo(linea, NTF_GENERIC.HORA_VENTA);
    const fechaCancelacion = extraerCampo(linea, NTF_GENERIC.FECHA_CANCELACION);
    const valorApuesta = parsearValorMonetario(extraerCampo(linea, NTF_GENERIC.VALOR_APUESTA));
    const valorRealApuesta = parsearValorMonetario(extraerCampo(linea, NTF_GENERIC.VALOR_REAL_APUESTA));
    
    // Extraer campos específicos BRINCO
    const versionEspecifica = extraerCampo(linea, NTF_BRINCO.VERSION_ESPECIFICA);
    const instancias = parseInt(extraerCampo(linea, NTF_BRINCO.INSTANCIAS) || '1');
    const apuestasSimplesCampo = parseInt(extraerCampo(linea, NTF_BRINCO.APUESTAS_SIMPLES) || '1');
    const cantidadNumeros = parseInt(extraerCampo(linea, NTF_BRINCO.CANTIDAD_NUMEROS) || '6');
    const secuenciaNumeros = extraerCampo(linea, NTF_BRINCO.SECUENCIA_NUMEROS);
    
    // Decodificar números jugados
    const numerosJugados = decodificarNumerosBrinco(secuenciaNumeros);
    
    // Determinar si está cancelado
    const esCancelado = fechaCancelacion && fechaCancelacion.trim() !== '' && fechaCancelacion.trim() !== '00000000';
    
    // Calcular combinaciones según cantidad de números
    const combinaciones = COMBINACIONES_BRINCO[cantidadNumeros] || 1;
    
    const registro = {
      linea: i + 1,
      juego,
      sorteo: numeroSorteo,
      provincia,
      agencia,
      ctaCte,
      esVentaWeb,
      provinciaOriginal: provinciaRaw,
      ticket,
      fechaVenta,
      horaVenta,
      valorApuesta,
      valorRealApuesta,
      versionEspecifica,
      instancias,
      apuestasSimples: apuestasSimplesCampo,
      cantidadNumeros,
      secuenciaNumeros,
      numerosJugados,
      combinaciones,
      cancelado: esCancelado,
      fechaCancelacion: esCancelado ? fechaCancelacion : null,
      tipoJuego: 'Brinco',
      tipo: 'BRN'
    };
    
    registros.push(registro);
    
    // Estadísticas
    if (esCancelado) {
      registrosCancelados++;
      recaudacionCancelada += valorRealApuesta;
    } else {
      registrosValidos++;
      recaudacionValida += valorRealApuesta;
      apuestasSimples += apuestasSimplesCampo;
      
      // Por provincia
      const provinciaKey = '51';
      if (!porProvincia[provinciaKey]) {
        porProvincia[provinciaKey] = {
          codigo: provinciaKey,
          nombre: PROVINCIAS[provinciaKey]?.nombre || 'Ciudad Autónoma de Buenos Aires',
          registros: 0,
          apuestas: 0,
          recaudacion: 0
        };
      }
      porProvincia[provinciaKey].registros++;
      porProvincia[provinciaKey].apuestas += apuestasSimplesCampo;
      porProvincia[provinciaKey].recaudacion += valorRealApuesta;
      
      // Por agencia
      const keyAgencia = ctaCte;
      if (!porAgencia[keyAgencia]) {
        porAgencia[keyAgencia] = {
          ctaCte: keyAgencia,
          provincia,
          agencia,
          esVentaWeb,
          registros: 0,
          apuestas: 0,
          recaudacion: 0
        };
      }
      porAgencia[keyAgencia].registros++;
      porAgencia[keyAgencia].apuestas += apuestasSimplesCampo;
      porAgencia[keyAgencia].recaudacion += valorRealApuesta;
    }
  }
  
  return {
    numeroSorteo,
    registros,
    resumen: {
      totalRegistros,
      registros: registrosValidos,
      anulados: registrosCancelados,
      apuestasTotal: apuestasSimples,
      recaudacion: recaudacionValida,
      recaudacionAnulada: recaudacionCancelada
    },
    provincias: Object.values(porProvincia),
    agencias: Object.values(porAgencia)
  };
}

/**
 * Parsea el XML de control previo de BRINCO
 * Estructura XML:
 * <CONTROL_PREVIO>
 *   <BRINCO>
 *     <CODIGO_JUEGO>13</CODIGO_JUEGO>
 *     <SORTEO>1335</SORTEO>
 *     <REGISTROS_VALIDOS>11606</REGISTROS_VALIDOS>
 *     ...
 *   </BRINCO>
 * </CONTROL_PREVIO>
 */
async function parsearXmlControlPrevio(contenidoXml) {
  const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
  
  try {
    const resultado = await parser.parseStringPromise(contenidoXml);
    
    // Buscar la raíz BRINCO
    let root = null;
    if (resultado.CONTROL_PREVIO && resultado.CONTROL_PREVIO.BRINCO) {
      root = resultado.CONTROL_PREVIO.BRINCO;
    } else if (resultado.BRINCO) {
      root = resultado.BRINCO;
    }
    
    if (!root) {
      console.warn('⚠️ No se encontró BRINCO en el XML');
      return { raw: resultado, procesado: false };
    }
    
    console.log('📊 XML BRINCO parseado:', {
      sorteo: root.SORTEO,
      registrosValidos: root.REGISTROS_VALIDOS,
      recaudacion: root.RECAUDACION_BRUTA
    });
    
    return {
      raw: resultado,
      procesado: true,
      sorteo: root.SORTEO,
      fecha: root.FECHA_SORTEO,
      codigoJuego: root.CODIGO_JUEGO,
      registrosValidos: parseInt(root.REGISTROS_VALIDOS || 0),
      registrosAnulados: parseInt(root.REGISTROS_ANULADOS || 0),
      apuestas: parseInt(root.APUESTAS_EN_SORTEO || 0),
      recaudacion: parseFloat(root.RECAUDACION_BRUTA || 0),
      fondoComun: parseFloat(root.FONDO_COMUN || 0),
      recaudacionDistribuir: parseFloat(root.RECAUDACION_A_DISTRIBUIR || 0),
      premiosDistribuir: parseFloat(root.IMPORTE_TOTAL_PREMIOS_A_DISTRIBUIR || 0)
    };
  } catch (error) {
    console.error('Error parseando XML de BRINCO:', error);
    return { raw: null, procesado: false, error: error.message };
  }
}

// ============================================================
// ENDPOINTS
// ============================================================

/**
 * POST /api/control-previo/brinco/procesar
 * Procesa el ZIP de BRINCO (TXT + XML + Hash)
 */
const procesarZip = async (req, res) => {
  console.log('🎯 procesarZip BRINCO llamado');
  
  try {
    if (!req.file) {
      console.log('❌ No hay archivo en req.file');
      return errorResponse(res, 'No se recibió ningún archivo', 400);
    }
    console.log('✅ Archivo recibido:', req.file.originalname);
    
    const zipPath = req.file.path;
    const extractPath = path.join(__dirname, '../../../uploads/temp', `brn_extract_${Date.now()}`);
    
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }
    
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractPath, true);
    
    // Función para buscar archivos recursivamente
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
    
    // Buscar archivos TXT - BRINCO puede ser:
    // - BRN + dígitos + .TXT (ej: BRN051676.TXT)
    // - BRINCO + dígitos + .TXT
    const txtFileInfo = todosLosArchivos.find(f => {
      const name = f.name.toUpperCase();
      const esBRN = (name.includes('BRN') || name.includes('BRINCO')) && name.endsWith('.TXT');
      if (esBRN) {
        console.log(`✅ Archivo TXT BRINCO encontrado: ${f.name} en ${f.path}`);
        return true;
      }
      return false;
    });
    
    const xmlFileInfo = todosLosArchivos.find(f => f.name.toUpperCase().endsWith('CP.XML'));
    const hashFileInfo = todosLosArchivos.find(f => f.name.toUpperCase().endsWith('.HASH') && !f.name.toUpperCase().includes('CP'));
    const hashCPFileInfo = todosLosArchivos.find(f => f.name.toUpperCase().endsWith('CP.HASH'));
    const pdfFileInfo = todosLosArchivos.find(f => f.name.toUpperCase().endsWith('.PDF'));
    
    if (!txtFileInfo) {
      console.log('❌ No se encontró archivo TXT. Archivos disponibles:', files);
      limpiarDirectorio(extractPath);
      return errorResponse(res, `No se encontró archivo TXT de BRINCO (BRN*.TXT). Archivos en ZIP: ${files.join(', ')}`, 400);
    }
    
    // Procesar TXT
    const txtContent = fs.readFileSync(txtFileInfo.path, 'latin1');
    const logsTxt = await procesarArchivoNTF(txtContent);
    
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
    
    // Leer hash oficial del TXT si existe
    let hashTxtOficial = null;
    if (hashFileInfo) {
      hashTxtOficial = fs.readFileSync(hashFileInfo.path, 'utf8').trim();
    }
    
    // Leer hash oficial del XML si existe
    let hashXmlOficial = null;
    let hashXmlCalculado = null;
    if (hashCPFileInfo) {
      hashXmlOficial = fs.readFileSync(hashCPFileInfo.path, 'utf8').trim();
      if (xmlFileInfo) {
        const xmlContentForHash = fs.readFileSync(xmlFileInfo.path, 'utf8');
        hashXmlCalculado = crypto.createHash('sha512').update(xmlContentForHash).digest('hex');
      }
    }
    
    // Verificar archivos de seguridad
    const archivosSeguridad = {
      archivos: {
        txt: !!txtFileInfo,
        xml: !!xmlFileInfo,
        hash: !!hashFileInfo,
        hashCP: !!hashCPFileInfo,
        pdf: !!pdfFileInfo
      },
      verificado: hashTxtOficial ? hashTxtCalculado === hashTxtOficial : null,
      verificadoXml: hashXmlOficial && hashXmlCalculado ? hashXmlCalculado === hashXmlOficial : null
    };
    
    // Limpiar temporales
    limpiarDirectorio(extractPath);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    
    // Preparar respuesta
    const resultado = {
      archivo: req.file.originalname,
      fechaProcesamiento: new Date().toISOString(),
      tipoJuego: 'Brinco',
      sorteo: logsTxt.numeroSorteo,
      
      // Datos calculados del TXT (compatibilidad con frontend)
      resumen: {
        ...logsTxt.resumen,
        online: {
          registros: 0,
          apuestas: 0,
          recaudacion: 0,
          anulados: 0
        }
      },
      provincias: logsTxt.provincias,
      agencias: logsTxt.agencias,
      registrosNTF: logsTxt.registros,
      
      // Datos oficiales del XML (para comparación)
      datosOficiales: datosXml ? {
        sorteo: datosXml.sorteo,
        fechaSorteo: datosXml.fecha,
        registrosValidos: datosXml.registrosValidos,
        registrosAnulados: datosXml.registrosAnulados,
        apuestas: datosXml.apuestas,
        recaudacion: datosXml.recaudacion,
        premios: datosXml.premios
      } : null,
      
      // Comparación de datos (TXT vs XML)
      comparacion: datosXml ? {
        registros: {
          calculado: logsTxt.resumen.registros,
          oficial: datosXml.registrosValidos,
          diferencia: logsTxt.resumen.registros - datosXml.registrosValidos
        },
        anulados: {
          calculado: logsTxt.resumen.anulados,
          oficial: datosXml.registrosAnulados,
          diferencia: logsTxt.resumen.anulados - datosXml.registrosAnulados
        },
        apuestas: {
          calculado: logsTxt.resumen.apuestasTotal,
          oficial: datosXml.apuestas,
          diferencia: logsTxt.resumen.apuestasTotal - datosXml.apuestas
        },
        recaudacion: {
          calculado: logsTxt.resumen.recaudacion,
          oficial: datosXml.recaudacion,
          diferencia: logsTxt.resumen.recaudacion - datosXml.recaudacion
        }
      } : null,
      
      seguridad: archivosSeguridad
    };
    
    console.log(`✅ BRINCO procesado: Sorteo ${logsTxt.numeroSorteo}, ${logsTxt.resumen.registros} registros válidos`);
    
    // Guardar en BD para alimentar Dashboard/Reportes
    try {
      const resguardoInfo = await guardarControlPrevioBrincoDB(logsTxt, datosXml, req.user, req.file.originalname);
      resultado.resguardo = resguardoInfo;
    } catch (errGuardar) {
      console.error('⚠️ Error guardando resguardo Brinco (no crítico):', errGuardar.message);
      resultado.resguardo = { success: false, error: errGuardar.message };
    }
    
    return successResponse(res, resultado, 'Archivo BRINCO procesado correctamente');
    
  } catch (error) {
    console.error('❌ Error procesando ZIP BRINCO:', error);
    return errorResponse(res, 'Error procesando archivo: ' + error.message, 500);
  }
};

/**
 * Guarda los resultados del control previo de BRINCO en la BD
 * Alimenta control_previo_brinco Y control_previo_agencias (para Dashboard)
 */
async function guardarControlPrevioBrincoDB(logsTxt, datosXml, user, nombreArchivo) {
  try {
    const sorteoStr = logsTxt.numeroSorteo || 'N/A';
    const sorteo = parseInt(sorteoStr, 10) || 0; // Convertir a INT
    const resumen = logsTxt.resumen || {};
    
    // Obtener fecha de sorteo: programación > XML > NTF
    let fecha = await buscarFechaProgramacion('brinco', sorteo);
    if (fecha) {
      console.log(`📅 BRINCO sorteo ${sorteo}: fecha desde programación = ${fecha}`);
    }

    if (!fecha && datosXml?.fecha) {
      fecha = normalizarFechaControlPrevio(datosXml.fecha);
    } else if (!fecha && logsTxt.registros && logsTxt.registros.length > 0) {
      const fv = logsTxt.registros[0].fechaVenta;
      fecha = normalizarFechaControlPrevio(fv);
    }
    if (!fecha) {
      throw new Error(`No se pudo determinar fecha de sorteo para BRINCO (${sorteo})`);
    }

    let controlPrevioId = 0;

    // INSERT/UPDATE en control_previo_brinco (si falla, igual intentamos guardar agencias)
    try {
      const result = await query(`
        INSERT INTO control_previo_brinco
        (numero_sorteo, fecha, archivo, registros_validos, registros_anulados,
         apuestas_total, recaudacion, datos_json, usuario_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          archivo = VALUES(archivo),
          fecha = VALUES(fecha),
          registros_validos = VALUES(registros_validos),
          registros_anulados = VALUES(registros_anulados),
          apuestas_total = VALUES(apuestas_total),
          recaudacion = VALUES(recaudacion),
          datos_json = VALUES(datos_json),
          usuario_id = VALUES(usuario_id),
          updated_at = CURRENT_TIMESTAMP
      `, [
        sorteo, // Ahora es INT
        fecha,
        nombreArchivo,
        resumen.registros || 0,
        resumen.anulados || 0,
        resumen.apuestasTotal || 0,
        resumen.recaudacion || 0,
        JSON.stringify(logsTxt.resumen),
        user?.id || null
      ]);

      controlPrevioId = result.insertId || 0;
      if (!controlPrevioId) {
        const [row] = await query('SELECT id FROM control_previo_brinco WHERE numero_sorteo = ? ORDER BY id DESC LIMIT 1', [sorteo]);
        controlPrevioId = row?.id || 0;
      }
    } catch (errResguardo) {
      console.warn(`⚠️ BRINCO: no se pudo guardar en control_previo_brinco (continuo con agencias): ${errResguardo.message}`);
    }

    // Guardar datos por agencia en control_previo_agencias (alimenta Dashboard)
    const agencias = logsTxt.agencias;
    if (agencias && agencias.length > 0) {
      await query(
        'DELETE FROM control_previo_agencias WHERE juego = ? AND numero_sorteo = ?',
        ['brinco', sorteo]
      );

      const valores = [];
      const placeholders = [];

      for (const ag of agencias) {
        const agenciaNormalizada = String(ag.agencia || '').padStart(5, '0');
        const esVentaWeb = agenciaNormalizada === '88880';
        const codigoAgencia = esVentaWeb ? '5188880' : `51${agenciaNormalizada}`;
        placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        valores.push(
          controlPrevioId || 0,
          'brinco',
          fecha,
          sorteo,
          'U', // Brinco modalidad única
          codigoAgencia,
          '51',
          ag.registros || 0,   // total_tickets
          ag.apuestas || 0,    // total_apuestas
          0,                   // total_anulados (brinco no separa por agencia)
          ag.recaudacion || 0  // total_recaudacion
        );
      }

      if (placeholders.length > 0) {
        await query(`
          INSERT INTO control_previo_agencias 
            (control_previo_id, juego, fecha, numero_sorteo, modalidad, codigo_agencia, 
             codigo_provincia, total_tickets, total_apuestas, total_anulados, total_recaudacion)
          VALUES ${placeholders.join(', ')}
        `, valores);
      }

      console.log(`✅ Guardadas ${agencias.length} agencias para Control Previo BRINCO (sorteo: ${sorteo})`);
    }

    console.log(`✅ Control Previo BRINCO guardado en BD (sorteo: ${sorteo}, ID: ${controlPrevioId})`);
    return { success: true, id: controlPrevioId };

  } catch (error) {
    console.error('❌ Error guardando Control Previo BRINCO:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Guardar resultado del control previo de BRINCO
 */
const guardarResultado = async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data) {
      return errorResponse(res, 'No se recibieron datos para guardar', 400);
    }
    
    // TODO: Implementar guardado en BD cuando se cree la tabla correspondiente
    console.log('📝 Guardando resultado BRINCO:', data.sorteo);
    
    return successResponse(res, { guardado: true }, 'Resultado BRINCO guardado correctamente');
    
  } catch (error) {
    console.error('Error guardando resultado BRINCO:', error);
    return errorResponse(res, 'Error guardando resultado: ' + error.message, 500);
  }
};

module.exports = {
  procesarZip,
  guardarResultado,
  decodificarNumerosBrinco,
  calcularCombinaciones,
  COMBINACIONES_BRINCO,
  BINARY_CODE
};
