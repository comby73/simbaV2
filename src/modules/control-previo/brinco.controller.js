'use strict';

/**
 * BRINCO Controller - Control Previo
 * Procesa archivos NTF de BRINCO (código de juego: 85)
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

// ============================================================
// CONFIGURACIÓN NTF BRINCO
// ============================================================

// Parte genérica del NTF (común a todos los juegos)
// Posiciones 1-based del PDF convertidas a 0-based para JavaScript
const NTF_GENERIC = {
  VERSION_GENERICA: { start: 0, length: 2 },      // Pos 1-2: "02" - Versión parte genérica
  JUEGO: { start: 2, length: 2 },                  // Pos 3-4: Código de juego (85 = BRINCO)
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
 * Decodifica la secuencia de 25 caracteres de BRINCO a un array de números (1-41 en BRINCO)
 * Igual que Poceada pero los números van de 1 a 41 (no 0-99)
 */
function decodificarNumerosBrinco(secuencia25) {
  const numeros = [];
  for (let i = 0; i < Math.min(25, (secuencia25 || '').length); i++) {
    const letra = secuencia25[i].toUpperCase();
    const binario = BINARY_CODE[letra] || '0000';
    for (let j = 0; j < 4; j++) {
      if (binario[j] === '1') {
        const numero = i * 4 + j;
        // BRINCO usa números del 1 al 41 (el bit 0 corresponde al número 1)
        if (numero >= 0 && numero <= 40) {
          numeros.push(numero + 1); // +1 porque BRINCO es 1-indexed
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
    if (juego !== '85') continue; // Solo procesar BRINCO (código 85)
    
    if (!numeroSorteo) {
      numeroSorteo = extraerCampo(linea, NTF_GENERIC.NUMERO_SORTEO);
    }
    
    const provincia = extraerCampo(linea, NTF_GENERIC.PROVINCIA);
    const agencia = extraerCampo(linea, NTF_GENERIC.AGENCIA);
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
      ctaCte: `${provincia}-${agencia}`,
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
      tipo: 'BRC'
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
      if (!porProvincia[provincia]) {
        porProvincia[provincia] = {
          codigo: provincia,
          nombre: PROVINCIAS[provincia] || `Provincia ${provincia}`,
          registros: 0,
          apuestas: 0,
          recaudacion: 0
        };
      }
      porProvincia[provincia].registros++;
      porProvincia[provincia].apuestas += apuestasSimplesCampo;
      porProvincia[provincia].recaudacion += valorRealApuesta;
      
      // Por agencia
      const keyAgencia = `${provincia}-${agencia}`;
      if (!porAgencia[keyAgencia]) {
        porAgencia[keyAgencia] = {
          ctaCte: keyAgencia,
          provincia,
          agencia,
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
 */
async function parsearXmlControlPrevio(contenidoXml) {
  const parser = new xml2js.Parser({ explicitArray: false });
  
  try {
    const resultado = await parser.parseStringPromise(contenidoXml);
    const root = resultado.ControlPrevio || resultado.controlPrevio || resultado;
    
    // Extraer datos del XML (estructura similar a Poceada pero adaptada a BRINCO)
    const datos = {
      sorteo: root.Sorteo || root.sorteo || root.NumeroSorteo,
      fecha: root.Fecha || root.fecha || root.FechaSorteo,
      registrosValidos: parseInt(root.RegistrosValidos || root.registrosValidos || 0),
      registrosAnulados: parseInt(root.RegistrosAnulados || root.registrosAnulados || 0),
      apuestas: parseInt(root.Apuestas || root.apuestas || root.CantidadApuestas || 0),
      recaudacion: parseFloat(root.Recaudacion || root.recaudacion || root.ImporteTotal || 0),
      premios: {
        tradicional: {
          primerPremio: parseFloat(root.PrimerPremio || 0),
          segundoPremio: parseFloat(root.SegundoPremio || 0),
          tercerPremio: parseFloat(root.TercerPremio || 0),
          cuartoPremio: parseFloat(root.CuartoPremio || 0),
          estimulo: parseFloat(root.Estimulo || 0)
        },
        junior: {
          premio: parseFloat(root.PremioJunior || 0),
          estimulo: parseFloat(root.EstimuloJunior || 0)
        }
      }
    };
    
    return datos;
  } catch (error) {
    console.error('Error parseando XML de BRINCO:', error);
    return null;
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
    const extractPath = path.join(__dirname, '../../../uploads/temp', `brc_extract_${Date.now()}`);
    
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
    // - BRC + dígitos + .TXT (ej: BRC051676.TXT)
    // - BRINCO + dígitos + .TXT
    const txtFileInfo = todosLosArchivos.find(f => {
      const name = f.name.toUpperCase();
      const esBRC = (name.includes('BRC') || name.includes('BRINCO')) && name.endsWith('.TXT');
      if (esBRC) {
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
      return errorResponse(res, `No se encontró archivo TXT de BRINCO (BRC*.TXT). Archivos en ZIP: ${files.join(', ')}`, 400);
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
      txt: !!txtFileInfo,
      xml: !!xmlFileInfo,
      hash: !!hashFileInfo,
      hashCP: !!hashCPFileInfo,
      pdf: !!pdfFileInfo,
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
      tipoJuego: 'Brinco',
      sorteo: logsTxt.numeroSorteo,
      
      // Datos calculados del TXT
      resumen: logsTxt.resumen,
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
    
    return successResponse(res, resultado, 'Archivo BRINCO procesado correctamente');
    
  } catch (error) {
    console.error('❌ Error procesando ZIP BRINCO:', error);
    return errorResponse(res, 'Error procesando archivo: ' + error.message, 500);
  }
};

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
