'use strict';

/**
 * QUINI 6 Controller - Control Previo
 * Procesa archivos NTF de QUINI 6 (código de juego: 86)
 * 
 * QUINI 6 tiene las siguientes modalidades:
 * - Tradicional Primera: 6 números del 1-45, premios por 6/5/4 aciertos
 * - Tradicional Segunda: 6 números del 1-45, premios por 6/5/4 aciertos
 * - Revancha: 6 números del 1-45, premio por 6 aciertos
 * - Siempre Sale: 6 números del 1-45, premio garantizado (ajusta aciertos si no hay ganador)
 * - Premio Extra: Números adicionales sorteados
 */

const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const crypto = require('crypto');
const { query } = require('../../config/database');
const { successResponse, errorResponse, PROVINCIAS } = require('../../shared/helpers');

// ============================================================
// CONFIGURACIÓN NTF QUINI 6
// ============================================================

// Parte genérica del NTF (común a todos los juegos)
// Posiciones 1-based del PDF convertidas a 0-based para JavaScript
const NTF_GENERIC = {
  VERSION_GENERICA: { start: 0, length: 2 },      // Pos 1-2: "02" - Versión parte genérica
  JUEGO: { start: 2, length: 2 },                  // Pos 3-4: Código de juego (86 = QUINI 6)
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

// Parte Específica QUINI 6
// La parte genérica tiene 200 caracteres, la específica empieza en posición 201 (índice 200)
const NTF_QUINI6 = {
  VERSION_ESPECIFICA: { start: 200, length: 2 },   // Pos 201-202: Versión NTF QUINI 6
  INSTANCIAS: { start: 202, length: 1 },           // Pos 203: Instancias jugadas (1=Trad, 2=Trad+Rev, 3=Trad+Rev+SS)
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

// Combinaciones para apuestas múltiples de QUINI 6
// C(n, 6) - cuántas combinaciones de 6 números se forman con n números
const COMBINACIONES_QUINI6 = {
  6: 1,       // Simple
  7: 7,       // C(7,6)
  8: 28,      // C(8,6)
  9: 84,      // C(9,6)
  10: 210,    // C(10,6)
  11: 462,    // C(11,6)
  12: 924     // C(12,6)
};

// Descripción de instancias
const INSTANCIAS_QUINI6 = {
  '1': 'Tradicional',
  '2': 'Tradicional + Revancha',
  '3': 'Tradicional + Revancha + Siempre Sale'
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
  if (r === 6 && COMBINACIONES_QUINI6[n]) {
    return COMBINACIONES_QUINI6[n];
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
 * Decodifica la secuencia de 25 caracteres de QUINI 6 a un array de números (1-45)
 * Igual que BRINCO pero los números van de 1 a 45
 */
function decodificarNumerosQuini6(secuencia25) {
  const numeros = [];
  for (let i = 0; i < Math.min(25, (secuencia25 || '').length); i++) {
    const letra = secuencia25[i].toUpperCase();
    const binario = BINARY_CODE[letra] || '0000';
    for (let j = 0; j < 4; j++) {
      if (binario[j] === '1') {
        const numero = i * 4 + j;
        // QUINI 6 usa números del 1 al 45 (el bit 0 corresponde al número 1)
        if (numero >= 0 && numero <= 44) {
          numeros.push(numero + 1); // +1 porque QUINI 6 es 1-indexed
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
// PROCESAMIENTO NTF QUINI 6
// ============================================================

/**
 * Procesa el contenido del archivo TXT NTF de QUINI 6
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
  const porInstancia = { '1': 0, '2': 0, '3': 0 };
  
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (linea.length < 237) continue; // Longitud mínima para QUINI 6
    
    totalRegistros++;
    
    // Extraer campos genéricos
    const juego = extraerCampo(linea, NTF_GENERIC.JUEGO);
    if (juego !== '86') continue; // Solo procesar QUINI 6 (código 86)
    
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
    
    // Extraer campos específicos QUINI 6
    const versionEspecifica = extraerCampo(linea, NTF_QUINI6.VERSION_ESPECIFICA);
    const instancias = extraerCampo(linea, NTF_QUINI6.INSTANCIAS) || '1';
    const apuestasSimplesCampo = parseInt(extraerCampo(linea, NTF_QUINI6.APUESTAS_SIMPLES) || '1');
    const cantidadNumeros = parseInt(extraerCampo(linea, NTF_QUINI6.CANTIDAD_NUMEROS) || '6');
    const secuenciaNumeros = extraerCampo(linea, NTF_QUINI6.SECUENCIA_NUMEROS);
    
    // Decodificar números jugados
    const numerosJugados = decodificarNumerosQuini6(secuenciaNumeros);
    
    // Determinar si está cancelado
    const esCancelado = fechaCancelacion && fechaCancelacion.trim() !== '' && fechaCancelacion.trim() !== '00000000';
    
    // Calcular combinaciones según cantidad de números
    const combinaciones = COMBINACIONES_QUINI6[cantidadNumeros] || 1;
    
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
      instanciasDescripcion: INSTANCIAS_QUINI6[instancias] || 'Desconocida',
      apuestasSimples: apuestasSimplesCampo,
      cantidadNumeros,
      secuenciaNumeros,
      numerosJugados,
      combinaciones,
      cancelado: esCancelado,
      fechaCancelacion: esCancelado ? fechaCancelacion : null,
      rawLine: linea
    };
    
    registros.push(registro);
    
    // Actualizar estadísticas
    if (esCancelado) {
      registrosCancelados++;
      recaudacionCancelada += valorRealApuesta;
    } else {
      registrosValidos++;
      recaudacionValida += valorRealApuesta;
      apuestasSimples += apuestasSimplesCampo;
      
      // Contar por instancia
      if (porInstancia.hasOwnProperty(instancias)) {
        porInstancia[instancias]++;
      }
    }
    
    // Estadísticas por provincia
    const provinciaKey = provincia || 'DESCONOCIDA';
    if (!porProvincia[provinciaKey]) {
      porProvincia[provinciaKey] = {
        nombre: PROVINCIAS[provinciaKey] || provinciaKey,
        registros: 0,
        cancelados: 0,
        recaudacion: 0,
        apuestasSimples: 0
      };
    }
    if (esCancelado) {
      porProvincia[provinciaKey].cancelados++;
    } else {
      porProvincia[provinciaKey].registros++;
      porProvincia[provinciaKey].recaudacion += valorRealApuesta;
      porProvincia[provinciaKey].apuestasSimples += apuestasSimplesCampo;
    }
    
    // Estadísticas por agencia
    const agenciaKey = `${provincia}-${agencia}`;
    if (!porAgencia[agenciaKey]) {
      porAgencia[agenciaKey] = {
        provincia,
        agencia,
        registros: 0,
        cancelados: 0,
        recaudacion: 0,
        apuestasSimples: 0,
        porInstancia: { '1': 0, '2': 0, '3': 0 }
      };
    }
    if (esCancelado) {
      porAgencia[agenciaKey].cancelados++;
    } else {
      porAgencia[agenciaKey].registros++;
      porAgencia[agenciaKey].recaudacion += valorRealApuesta;
      porAgencia[agenciaKey].apuestasSimples += apuestasSimplesCampo;
      if (porAgencia[agenciaKey].porInstancia.hasOwnProperty(instancias)) {
        porAgencia[agenciaKey].porInstancia[instancias]++;
      }
    }
  }
  
  return {
    sorteo: numeroSorteo,
    totalRegistros,
    registrosValidos,
    registrosCancelados,
    recaudacionValida,
    recaudacionCancelada,
    apuestasSimples,
    porInstancia: {
      tradicional: porInstancia['1'],
      tradicionalRevancha: porInstancia['2'],
      tradicionalRevanchaSiempreSale: porInstancia['3']
    },
    porProvincia: Object.values(porProvincia).sort((a, b) => b.recaudacion - a.recaudacion),
    porAgencia: Object.values(porAgencia).sort((a, b) => b.recaudacion - a.recaudacion),
    registros
  };
}

/**
 * Parsea el archivo XML de control previo
 */
async function parsearXmlControlPrevio(contenido) {
  try {
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    const resultado = await parser.parseStringPromise(contenido);
    
    // Extraer datos del XML (estructura puede variar según el proveedor)
    return {
      raw: resultado,
      procesado: true
    };
  } catch (error) {
    console.error('Error parseando XML:', error.message);
    return { raw: null, procesado: false, error: error.message };
  }
}

// ============================================================
// CONTROLADORES HTTP
// ============================================================

/**
 * Procesa un archivo ZIP que contiene archivos NTF de QUINI 6
 * POST /api/control-previo/quini6/procesar-zip
 */
async function procesarZip(req, res) {
  let tempDir = null;
  
  try {
    if (!req.file) {
      return errorResponse(res, 'No se recibió ningún archivo', 400);
    }
    
    console.log('✅ Archivo recibido QUINI 6:', req.file.originalname);
    
    // Usar req.file.path (diskStorage) en lugar de buffer
    const zipPath = req.file.path;
    
    // Crear directorio temporal único
    const tempId = crypto.randomBytes(8).toString('hex');
    tempDir = path.join(__dirname, '../../../uploads/temp', `quini6_${tempId}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Extraer archivos desde el path del ZIP
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempDir, true);
    
    // Limpiar el ZIP temporal
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    
    // Función para buscar archivos recursivamente (ZIP puede tener subcarpetas)
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
    
    const todosLosArchivos = buscarArchivosRecursivo(tempDir);
    const files = todosLosArchivos.map(f => f.name);
    console.log('📁 Archivos encontrados en ZIP QUINI 6:', files);
    
    // Buscar archivos TXT - QUINI 6 puede ser:
    // - QN6 + dígitos + .TXT (ej: QN6051676.TXT)
    // - QUINI + algo + .TXT
    const txtFileInfo = todosLosArchivos.find(f => {
      const name = f.name.toUpperCase();
      const esQN6 = (name.startsWith('QN6') || name.includes('QUINI')) && name.endsWith('.TXT');
      if (esQN6) {
        console.log(`✅ Archivo TXT QUINI 6 encontrado: ${f.name} en ${f.path}`);
        return true;
      }
      return false;
    });
    
    const xmlFileInfo = todosLosArchivos.find(f => f.name.toUpperCase().endsWith('CP.XML'));
    const hashFileInfo = todosLosArchivos.find(f => f.name.toUpperCase().endsWith('.HASH') && !f.name.toUpperCase().includes('CP'));
    const hashCPFileInfo = todosLosArchivos.find(f => f.name.toUpperCase().endsWith('CP.HASH'));
    
    if (!txtFileInfo) {
      console.log('❌ No se encontró archivo TXT. Archivos disponibles:', files);
      limpiarDirectorio(tempDir);
      return errorResponse(res, `No se encontraron archivos NTF de QUINI 6 (QN6*.TXT) en el ZIP. Archivos encontrados: ${files.join(', ')}`, 400);
    }
    
    // Procesar TXT
    const contenidoNTF = fs.readFileSync(txtFileInfo.path, 'latin1');
    const resultadoNTF = await procesarArchivoNTF(contenidoNTF);
    
    // Procesar XML si existe
    let resultadoXML = null;
    if (xmlFileInfo) {
      const contenidoXML = fs.readFileSync(xmlFileInfo.path, 'utf8');
      resultadoXML = await parsearXmlControlPrevio(contenidoXML);
    }
    
    // Limpiar directorio temporal
    limpiarDirectorio(tempDir);
    
    // Preparar respuesta con estructura compatible con frontend
    return successResponse(res, {
      archivo: txtFileInfo.name,
      archivoXml: xmlFileInfo ? xmlFileInfo.name : null,
      tipoJuego: 'QUINI 6',
      codigoJuego: '86',
      sorteo: resultadoNTF.numeroSorteo,
      
      // Estructura resumen compatible con frontend
      resumen: {
        totalRegistros: resultadoNTF.resumen?.totalRegistros || 0,
        registros: resultadoNTF.resumen?.registros || 0,
        anulados: resultadoNTF.resumen?.anulados || 0,
        apuestasTotal: resultadoNTF.resumen?.apuestasTotal || 0,
        recaudacion: resultadoNTF.resumen?.recaudacion || 0,
        recaudacionAnulada: resultadoNTF.resumen?.recaudacionAnulada || 0,
        online: {
          registros: 0,
          apuestas: 0,
          recaudacion: 0,
          anulados: 0
        }
      },
      
      provincias: resultadoNTF.provincias || [],
      agencias: resultadoNTF.agencias || [],
      registrosNTF: resultadoNTF.registros || [],
      
      datosOficiales: resultadoXML,
      
      comparacion: resultadoXML ? {
        registros: {
          calculado: resultadoNTF.resumen?.registros || 0,
          oficial: resultadoXML.registrosValidos || 0,
          diferencia: (resultadoNTF.resumen?.registros || 0) - (resultadoXML.registrosValidos || 0)
        },
        anulados: {
          calculado: resultadoNTF.resumen?.anulados || 0,
          oficial: resultadoXML.registrosAnulados || 0,
          diferencia: (resultadoNTF.resumen?.anulados || 0) - (resultadoXML.registrosAnulados || 0)
        },
        apuestas: {
          calculado: resultadoNTF.resumen?.apuestasTotal || 0,
          oficial: resultadoXML.apuestas || 0,
          diferencia: (resultadoNTF.resumen?.apuestasTotal || 0) - (resultadoXML.apuestas || 0)
        },
        recaudacion: {
          calculado: resultadoNTF.resumen?.recaudacion || 0,
          oficial: resultadoXML.recaudacion || 0,
          diferencia: (resultadoNTF.resumen?.recaudacion || 0) - (resultadoXML.recaudacion || 0)
        }
      } : null,
      
      seguridad: {
        txt: !!txtFileInfo,
        xml: !!xmlFileInfo,
        hash: !!hashFileInfo,
        hashCP: !!hashCPFileInfo
      }
    }, 'Archivo QUINI 6 procesado correctamente');
    
  } catch (error) {
    console.error('Error procesando ZIP QUINI 6:', error);
    if (tempDir) limpiarDirectorio(tempDir);
    return errorResponse(res, `Error procesando archivo: ${error.message}`, 500);
  }
}

/**
 * Procesa archivo NTF directo (sin ZIP)
 * POST /api/control-previo/quini6/procesar
 */
async function procesarNTF(req, res) {
  try {
    if (!req.file) {
      return errorResponse(res, 'No se recibió ningún archivo', 400);
    }
    
    const contenido = req.file.buffer.toString('latin1');
    const resultado = await procesarArchivoNTF(contenido);
    
    return successResponse(res, {
      archivo: req.file.originalname,
      juego: 'QUINI 6',
      codigoJuego: '86',
      ...resultado
    }, 'Archivo NTF de QUINI 6 procesado correctamente');
    
  } catch (error) {
    console.error('Error procesando NTF QUINI 6:', error);
    return errorResponse(res, `Error procesando archivo: ${error.message}`, 500);
  }
}

/**
 * Guarda el resultado del control previo en la base de datos
 * POST /api/control-previo/quini6/guardar-resultado
 */
async function guardarResultado(req, res) {
  try {
    const { 
      sorteo, 
      archivo, 
      registrosValidos, 
      registrosCancelados, 
      recaudacionValida,
      apuestasSimples,
      porInstancia,
      observaciones 
    } = req.body;
    
    if (!sorteo) {
      return errorResponse(res, 'El número de sorteo es requerido', 400);
    }
    
    // TODO: Crear tabla control_previo_quini6 si no existe
    // Por ahora, usar la tabla genérica o crear una específica
    
    const resultado = {
      sorteo,
      archivo,
      registrosValidos,
      registrosCancelados,
      recaudacionValida,
      apuestasSimples,
      porInstancia,
      fechaProcesamiento: new Date().toISOString(),
      observaciones
    };
    
    // Guardar en archivo JSON como respaldo
    const backupDir = path.join(__dirname, '../../../uploads/quini6');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupFile = path.join(backupDir, `control_previo_${sorteo}_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(resultado, null, 2));
    
    return successResponse(res, {
      guardado: true,
      archivo: backupFile,
      resultado
    }, 'Resultado de control previo guardado');
    
  } catch (error) {
    console.error('Error guardando resultado QUINI 6:', error);
    return errorResponse(res, `Error guardando resultado: ${error.message}`, 500);
  }
}

/**
 * Obtiene estadísticas de un sorteo procesado
 * GET /api/control-previo/quini6/estadisticas/:sorteo
 */
async function obtenerEstadisticas(req, res) {
  try {
    const { sorteo } = req.params;
    
    const backupDir = path.join(__dirname, '../../../uploads/quini6');
    const archivos = fs.existsSync(backupDir) 
      ? fs.readdirSync(backupDir).filter(f => f.includes(`control_previo_${sorteo}`))
      : [];
    
    if (archivos.length === 0) {
      return errorResponse(res, 'No se encontraron datos para este sorteo', 404);
    }
    
    // Leer el archivo más reciente
    const archivoMasReciente = archivos.sort().reverse()[0];
    const contenido = fs.readFileSync(path.join(backupDir, archivoMasReciente), 'utf8');
    const datos = JSON.parse(contenido);
    
    return successResponse(res, datos, 'Estadísticas obtenidas correctamente');
    
  } catch (error) {
    console.error('Error obteniendo estadísticas QUINI 6:', error);
    return errorResponse(res, `Error: ${error.message}`, 500);
  }
}

module.exports = {
  procesarZip,
  procesarNTF,
  guardarResultado,
  obtenerEstadisticas,
  // Exportar funciones de utilidad para testing/escrutinio
  procesarArchivoNTF,
  decodificarNumerosQuini6,
  calcularCombinaciones,
  COMBINACIONES_QUINI6,
  INSTANCIAS_QUINI6
};
