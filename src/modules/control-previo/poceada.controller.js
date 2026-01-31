const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const crypto = require('crypto');
const { query } = require('../../config/database');
const { successResponse, errorResponse, PROVINCIAS } = require('../../shared/helpers');
const { guardarControlPrevioPoceada } = require('../../shared/control-previo.helper');

// Cargar configuración de distribución de juegos
const CONFIG_PATH = path.join(__dirname, '../../config/distribucion-juegos.json');
let configJuegos = null;

/**
 * Carga la configuración de distribución de juegos desde el archivo JSON
 * @returns {object} Configuración de juegos
 */
function cargarConfigJuegos() {
  if (configJuegos) return configJuegos;

  try {
    const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
    configJuegos = JSON.parse(configContent);
    console.log(`✅ Configuración de juegos cargada (versión: ${configJuegos.version})`);
    return configJuegos;
  } catch (error) {
    console.error('⚠️ Error cargando configuración de juegos:', error.message);
    // Retornar configuración por defecto si falla
    return {
      juegos: {
        poceada: {
          porcentajePozoTotal: 45,
          distribucionPremios: {
            primerPremio: { porcentaje: 62 },
            segundoPremio: { porcentaje: 23.5 },
            tercerPremio: { porcentaje: 10 },
            agenteVendedor: { porcentaje: 0.5 },
            fondoReserva: { porcentaje: 4 }
          },
          pozoAsegurado: { primerPremio: 60000000 },
          valorApuesta: { simple: 1100 },
          agenciaVentaWeb: '5188880'
        }
      }
    };
  }
}

/**
 * Recarga la configuración de juegos (útil si se actualiza el archivo)
 */
function recargarConfigJuegos() {
  configJuegos = null;
  return cargarConfigJuegos();
}

// Configuración de posiciones del formato NTF v2 según PDF oficial "2-Diseño Apuestas.pdf"
// Posiciones 1-based convertidas a 0-based para JavaScript
const NTF_GENERIC = {
  VERSION_GENERICA: { start: 0, length: 2 },      // Pos 1-2: "02" - Versión parte genérica
  JUEGO: { start: 2, length: 2 },                  // Pos 3-4: Código de juego (82 = Poceada)
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
  VALOR_APUESTA: { start: 121, length: 10 },       // Pos 122-131: Valor del Apuesta (EEEEEEEEEDD - 8 enteros, 2 decimales)
  VALOR_REAL_APUESTA: { start: 131, length: 10 },  // Pos 132-141: Valor real del Apuesta
  CODIGO_PROMOCION: { start: 141, length: 10 },    // Pos 142-151: Código Único Promoción
  ID_SESION: { start: 151, length: 12 },           // Pos 152-163: ID sesión tickets
  ID_EXTERNO_TICKET: { start: 163, length: 30 },   // Pos 164-193: ID externo ticket
  RESERVADO: { start: 193, length: 7 }             // Pos 194-200: Reservado
};

// Parte Específica Poceada según PDF oficial "2-Diseño Apuestas.pdf"
// Sección 1.1.3.8 QUINIELA POCEADA
// La parte genérica tiene 200 caracteres, así que la específica empieza en posición 201 (índice 200)
const NTF_POCEADA = {
  VERSION_ESPECIFICA: { start: 200, length: 2 },   // Pos 201-202: "01" - NTF Quiniela Poceada versión 1
  LETRAS: { start: 202, length: 4 },               // Pos 203-206: Letras (AN - alfanumérico)
  CANTIDAD_NUMEROS: { start: 206, length: 2 },     // Pos 207-208: Cantidad de números jugados (N - numérico)
  SECUENCIA_NUMEROS: { start: 208, length: 25 }    // Pos 209-233: Números jugados (AN - alfanumérico, codificación según Anexo 2.1)
};

const BINARY_CODE = {
  'A': '0000', 'B': '0001', 'C': '0010', 'D': '0011',
  'E': '0100', 'F': '0101', 'G': '0110', 'H': '0111',
  'I': '1000', 'J': '1001', 'K': '1010', 'L': '1011',
  'M': '1100', 'N': '1101', 'O': '1110', 'P': '1111'
};

const COMBINACIONES_MULTIPLES = {
  8: 1,      // Simple
  9: 9,      // C(9,8)
  10: 45,    // C(10,8)
  11: 165,   // C(11,8)
  12: 495,   // C(12,8)
  13: 1287,  // C(13,8)
  14: 3003,  // C(14,8)
  15: 6435   // C(15,8)
};

/**
 * Calcula combinaciones C(n, r) = n! / (r! * (n-r)!)
 * Igual que la función combinations() del PHP legacy
 */
function calcularCombinaciones(n, r) {
  if (r === 0 || r === n) return 1;
  if (r > n) return 0;

  // Usar la tabla predefinida si está disponible
  if (COMBINACIONES_MULTIPLES[n]) {
    return COMBINACIONES_MULTIPLES[n];
  }

  // Calcular manualmente si no está en la tabla
  let numerator = 1;
  let denominator = 1;

  for (let i = n; i > n - r; i--) {
    numerator *= i;
  }

  for (let i = 1; i <= r; i++) {
    denominator *= i;
  }

  return Math.round(numerator / denominator);
}

/**
 * Decodifica la secuencia de 25 caracteres de Poceada a un array de números (0-99)
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
  return [...new Set(numeros)].sort((a, b) => a - b);
}

/**
 * Procesa el ZIP de Poceada (TXT + XML + Hash)
 */
const procesarZip = async (req, res) => {
  console.log('🔵 procesarZip Poceada llamado');
  try {
    if (!req.file) {
      console.log('❌ No hay archivo en req.file');
      return errorResponse(res, 'No se recibió ningún archivo', 400);
    }
    console.log('✅ Archivo recibido:', req.file.originalname);

    const zipPath = req.file.path;
    const extractPath = path.join(__dirname, '../../../uploads/temp', `pcd_extract_${Date.now()}`);

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

    // Buscar archivos TXT - Poceada puede ser:
    // - PCD + 6 dígitos + .TXT (ej: PCD051676.TXT)
    // - TMB + 6 dígitos + .TXT
    // - También puede estar en minúsculas
    const txtFileInfo = todosLosArchivos.find(f => {
      const name = f.name.toUpperCase();
      // Verificar que contenga PCD o TMB y termine con .TXT
      const esPCD = name.includes('PCD') && name.endsWith('.TXT');
      const esTMB = name.includes('TMB') && name.endsWith('.TXT');
      if (esPCD || esTMB) {
        console.log(`✅ Archivo TXT encontrado: ${f.name} en ${f.path}`);
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
      return errorResponse(res, `No se encontró archivo TXT de Poceada (PCD*.TXT o TMB*.TXT). Archivos en ZIP: ${files.join(', ')}`, 400);
    }

    // Usar rutas completas
    const txtFile = txtFileInfo.name;
    const xmlFile = xmlFileInfo ? xmlFileInfo.name : null;
    const hashFile = hashFileInfo ? hashFileInfo.name : null;
    const hashCPFile = hashCPFileInfo ? hashCPFileInfo.name : null;
    const pdfFile = pdfFileInfo ? pdfFileInfo.name : null;

    // Procesar TXT (usar ruta completa del archivo encontrado)
    const txtContent = fs.readFileSync(txtFileInfo.path, 'latin1');
    const logsTxt = await procesarArchivoNTF(txtContent);

    // Procesar XML
    let datosXml = null;
    if (xmlFileInfo) {
      const xmlContent = fs.readFileSync(xmlFileInfo.path, 'utf8');
      datosXml = await parsearXmlControlPrevio(xmlContent);
    } else {
      console.warn('⚠️  No se encontró archivo XML de control previo (CP.XML)');
    }

    // Obtener valor máximo de apuesta de la BD (como en la versión legacy)
    let valorApuestaMaximaPoceada = 1000; // Default
    try {
      const vRows = await query('SELECT ValorApuestaMaxima FROM valor_Apuestas_Pago_Maximo WHERE juego = "Poceada" LIMIT 1');
      if (vRows.length > 0) {
        valorApuestaMaximaPoceada = parseFloat(vRows[0].ValorApuestaMaxima);
      }
    } catch (dbError) {
      console.error('Error consultando ValorApuestaMaxima:', dbError.message);
    }

    // Calcular hashes
    const hashTxtCalculado = crypto.createHash('sha512').update(txtContent).digest('hex');

    // Leer hash oficial del TXT si existe
    let hashTxtOficial = null;
    if (hashFileInfo) {
      hashTxtOficial = fs.readFileSync(hashFileInfo.path, 'utf8').trim();
    } else {
      console.warn('⚠️  No se encontró archivo HASH del TXT');
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
    } else {
      console.warn('⚠️  No se encontró archivo HASH del XML (CP.HASH)');
    }

    // Verificar archivos de seguridad
    const archivosSeguridad = {
      txt: !!txtFile,
      xml: !!xmlFile,
      hash: !!hashFile,
      hashCP: !!hashCPFile,
      pdf: !!pdfFile,
      hashCoincide: hashTxtOficial ? hashTxtCalculado === hashTxtOficial : null,
      hashXmlCoincide: hashXmlOficial && hashXmlCalculado ? hashXmlCalculado === hashXmlOficial : null
    };

    // Buscar TODOS los pozos de arrastre del sorteo anterior (4 pozos)
    const arrastresCompletos = await buscarTodosArrastresAnterior(logsTxt.numeroSorteo);
    let pozoArrastre = arrastresCompletos.primerPremio;

    // Preparar arrastres adicionales (2do, 3ro, Agenciero)
    let arrastresAdicionales = {
      segundoPremio: arrastresCompletos.segundoPremio,
      tercerPremio: arrastresCompletos.tercerPremio,
      agenciero: arrastresCompletos.agenciero
    };

    // NOTA: Los arrastres SOLO vienen de nuestra BD (del control posterior o carga manual).
    // Cuando no tengamos el histórico, el "Calculado" mostrará 0 y el "Oficial (XML)" mostrará el arrastre real.
    // Si no hay datos, el frontend mostrará un modal para cargar los arrastres manualmente.

    // Calcular distribución de premios según porcentajes
    const distribucionPremios = calcularDistribucionPremios(logsTxt.resumen.recaudacion, pozoArrastre, arrastresAdicionales);

    // DEBUG: Ver valores calculados
    console.log('📊 DEBUG distribucionPremios:');
    console.log('   Recaudación entrada:', logsTxt.resumen.recaudacion);
    console.log('   Arrastres (de BD):', arrastresCompletos);
    console.log('   recaudacionPremios (45%):', distribucionPremios.recaudacionPremios);
    console.log('   primerPremio.monto:', distribucionPremios.primerPremio?.monto);
    console.log('   fondoReserva:', distribucionPremios.fondoReserva);
    console.log('   importeTotalPremios:', distribucionPremios.importeTotalPremios);

    // Limpiar temporales
    limpiarDirectorio(extractPath);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    // Calcular diferencia de apuesta (comparando el valor del archivo con el máximo de la BD)
    // El valor del archivo viene del resumen (recaudacion / registros)
    const valorApuestaArchivo = logsTxt.resumen.registros > 0 ? logsTxt.resumen.recaudacion / logsTxt.resumen.registros : 0;
    const diferenciaApuesta = valorApuestaArchivo - valorApuestaMaximaPoceada;

    // Preparar respuesta con comparación de datos
    const resultado = {
      archivo: req.file.originalname,
      fechaProcesamiento: new Date().toISOString(),
      tipoJuego: 'Poceada',
      sorteo: logsTxt.numeroSorteo,

      // Nuevos campos para compatibilidad legacy (simba)
      ValorApuestaMaximaPoceada: valorApuestaMaximaPoceada,
      ValorDeApuesta: valorApuestaArchivo,
      totalDiferencia: Math.abs(diferenciaApuesta),

      // Datos calculados del TXT
      resumen: logsTxt.resumen,
      provincias: logsTxt.provincias,

      // Datos oficiales del XML (para comparación)
      datosOficiales: datosXml ? {
        sorteo: datosXml.sorteo,
        fechaSorteo: datosXml.fecha,
        registrosValidos: datosXml.registrosValidos,
        registrosAnulados: datosXml.registrosAnulados,
        apuestas: datosXml.apuestas,
        recaudacion: datosXml.recaudacion,
        premios: datosXml.premios,
        fondoReserva: datosXml.fondoReserva,
        // Campos aplanados para compatibilidad legacy facilitada
        primerPremio: datosXml.premios.primero.monto,
        segundoPremio: datosXml.premios.segundo.monto,
        tercerPremio: datosXml.premios.tercero.monto,
        agenciero: datosXml.premios.agenciero,
        fondo: datosXml.fondoReserva
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
        },
        // Comparación de premios con desglose completo
        premios: datosXml.premios ? {
          primerPremio: {
            // Recaudación del 1er premio (62% del pozo)
            recaudacion: {
              calculado: distribucionPremios.primerPremio.monto,
              oficial: datosXml.premios.primero.monto,
              diferencia: distribucionPremios.primerPremio.monto - datosXml.premios.primero.monto
            },
            // Arrastre del pozo (del sorteo anterior)
            pozoVacante: {
              calculado: distribucionPremios.primerPremio.pozoVacante,
              oficial: datosXml.premios.primero.pozoVacante,
              diferencia: distribucionPremios.primerPremio.pozoVacante - datosXml.premios.primero.pozoVacante
            },
            // Diferencia a asegurar (si total < asegurado)
            diferenciaAsegurar: {
              calculado: distribucionPremios.primerPremio.diferenciaAsegurar,
              oficial: datosXml.premios.primero.pozoAsegurar,
              diferencia: distribucionPremios.primerPremio.diferenciaAsegurar - datosXml.premios.primero.pozoAsegurar
            },
            // Importe final del pozo (el mayor entre total y asegurado)
            importeFinal: {
              calculado: distribucionPremios.primerPremio.importeFinal,
              oficial: datosXml.premios.primero.total,
              diferencia: distribucionPremios.primerPremio.importeFinal - datosXml.premios.primero.total
            },
            pozoAsegurado: distribucionPremios.primerPremio.pozoAsegurado
          },
          segundoPremio: {
            // Recaudacion del 2do premio (23.5% del pozo)
            recaudacion: {
              calculado: distribucionPremios.segundoPremio.monto,
              oficial: datosXml.premios.segundo.monto,
              diferencia: distribucionPremios.segundoPremio.monto - datosXml.premios.segundo.monto
            },
            // Arrastre del 2do premio
            pozoVacante: {
              calculado: distribucionPremios.segundoPremio.pozoVacante,
              oficial: datosXml.premios.segundo.pozoVacante,
              diferencia: distribucionPremios.segundoPremio.pozoVacante - datosXml.premios.segundo.pozoVacante
            },
            // Total = Recaudacion + Arrastre
            importeFinal: {
              calculado: distribucionPremios.segundoPremio.total,
              oficial: datosXml.premios.segundo.total,
              diferencia: distribucionPremios.segundoPremio.total - datosXml.premios.segundo.total
            }
          },
          terceroPremio: {
            // Recaudacion del 3er premio (10% del pozo)
            recaudacion: {
              calculado: distribucionPremios.terceroPremio.monto,
              oficial: datosXml.premios.tercero.monto,
              diferencia: distribucionPremios.terceroPremio.monto - datosXml.premios.tercero.monto
            },
            // Arrastre del 3er premio
            pozoVacante: {
              calculado: distribucionPremios.terceroPremio.pozoVacante,
              oficial: datosXml.premios.tercero.pozoVacante,
              diferencia: distribucionPremios.terceroPremio.pozoVacante - datosXml.premios.tercero.pozoVacante
            },
            // Total
            importeFinal: {
              calculado: distribucionPremios.terceroPremio.total,
              oficial: datosXml.premios.tercero.total,
              diferencia: distribucionPremios.terceroPremio.total - datosXml.premios.tercero.total
            }
          },
          agenciero: {
            // Recaudacion Agenciero (0.5% del pozo)
            recaudacion: {
              calculado: distribucionPremios.agenciero.monto,
              oficial: datosXml.premios.agenciero.monto,
              diferencia: distribucionPremios.agenciero.monto - datosXml.premios.agenciero.monto
            },
            // Arrastre Agenciero
            pozoVacante: {
              calculado: distribucionPremios.agenciero.pozoVacante,
              oficial: datosXml.premios.agenciero.pozoVacante, // Este valor no siempre viene en todos los XMLs pero lo forzamos
              diferencia: distribucionPremios.agenciero.pozoVacante - datosXml.premios.agenciero.pozoVacante
            },
            // Total
            importeFinal: {
              calculado: distribucionPremios.agenciero.total,
              oficial: datosXml.premios.agenciero.total,
              diferencia: distribucionPremios.agenciero.total - datosXml.premios.agenciero.total
            }
          },
          fondoReserva: {
            calculado: distribucionPremios.fondoReserva.monto,
            oficial: datosXml.fondoReserva,
            diferencia: distribucionPremios.fondoReserva.monto - datosXml.fondoReserva
          },
          importeTotalPremios: {
            calculado: distribucionPremios.importeTotalPremios,
            oficial: datosXml.importeTotalPremios,
            diferencia: distribucionPremios.importeTotalPremios - datosXml.importeTotalPremios
          }
        } : null
      } : null,

      // Distribución calculada de premios
      distribucionPremios,
      pozoArrastre,
      seguridad: {
        archivos: archivosSeguridad,
        hashCalculado: hashTxtCalculado,
        hashOficial: hashTxtOficial,
        hashXmlCalculado: hashXmlCalculado,
        hashXmlOficial: hashXmlOficial,
        verificado: archivosSeguridad.hashCoincide,
        verificadoXml: archivosSeguridad.hashXmlCoincide
      },
      registrosNTF: logsTxt.registrosParseados // Para el escrutinio
    };

    // GUARDAR EN BASE DE DATOS (resguardo)
    try {
      const resguardo = await guardarControlPrevioPoceada(resultado, req.user, req.file.originalname);
      resultado.resguardo = resguardo;
    } catch (errGuardar) {
      console.error('⚠️ Error guardando resguardo (no crítico):', errGuardar.message);
      resultado.resguardo = { success: false, error: errGuardar.message };
    }

    return successResponse(res, resultado, 'Poceada procesada correctamente');

  } catch (error) {
    console.error('Error procesando Poceada:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

async function procesarArchivoNTF(content) {
  // Según PDF: Parte genérica (200 chars) + Parte específica Poceada (33 chars) = 233 caracteres mínimo
  const lines = content.split('\n').filter(l => l.trim().length >= 233);

  let numeroSorteo = '';
  let registros = 0;
  let anulados = 0;
  let apuestasTotal = 0;
  let recaudacion = 0;
  const provincias = {};
  const registrosParseados = [];

  for (const line of lines) {
    const gameCode = line.substr(NTF_GENERIC.JUEGO.start, NTF_GENERIC.JUEGO.length);
    if (gameCode !== '82') continue; // Solo procesar si el código es 82 (Poceada)

    if (!numeroSorteo) {
      numeroSorteo = line.substr(NTF_GENERIC.NUMERO_SORTEO.start, NTF_GENERIC.NUMERO_SORTEO.length).trim();
    }

    // Fecha de cancelación (posiciones 71-78 según PDF)
    // Según PDF: "AAAAMMDD (espacios en blanco si no está cancelado)"
    const cancelDate = line.substr(NTF_GENERIC.FECHA_CANCELACION.start, NTF_GENERIC.FECHA_CANCELACION.length);
    const isCanceled = cancelDate.trim() !== ''; // Si tiene contenido, está cancelada

    // Valor de apuesta según PDF oficial: Posición 122-131 (10 caracteres)
    // Formato: EEEEEEEEDD (8 enteros, 2 decimales)
    const valorApuestaRaw = line.substr(NTF_GENERIC.VALOR_APUESTA.start, NTF_GENERIC.VALOR_APUESTA.length);
    // Convertir: "0000010000" = 100.00 (últimos 2 dígitos son decimales)
    const valorCentavos = parseInt(valorApuestaRaw) || 0;
    const valor = valorCentavos / 100;

    // Específico Poceada según PDF: Posición 207-208 (2 dígitos)
    const cantNum = parseInt(line.substr(NTF_POCEADA.CANTIDAD_NUMEROS.start, NTF_POCEADA.CANTIDAD_NUMEROS.length)) || 8;

    // Calcular combinaciones C(n, 8) - igual que PHP: combinations($cantidad_de_numeros_jugados, 8)
    const nroApuestas = COMBINACIONES_MULTIPLES[cantNum] || calcularCombinaciones(cantNum, 8);

    const secuencia = line.substr(NTF_POCEADA.SECUENCIA_NUMEROS.start, NTF_POCEADA.SECUENCIA_NUMEROS.length);
    const letras = line.substr(NTF_POCEADA.LETRAS.start, NTF_POCEADA.LETRAS.length);
    const provCod = line.substr(NTF_GENERIC.PROVINCIA.start, NTF_GENERIC.PROVINCIA.length);

    // Contar registros: solo los que tienen ordinal '01' o vacío (igual que Quiniela para consistencia)
    const ordinal = line.substr(NTF_GENERIC.ORDINAL_APUESTA.start, NTF_GENERIC.ORDINAL_APUESTA.length).trim();
    const esRegistroUnico = ordinal === '01' || ordinal === '' || ordinal === '1';

    // Obtener agencia completa (provincia + agencia) para detectar ventas web
    const agenciaCompleta = provCod + line.substr(NTF_GENERIC.AGENCIA.start, NTF_GENERIC.AGENCIA.length).trim();

    // Cargar configuración para obtener la agencia de ventas web
    const config = cargarConfigJuegos();
    const agenciaVentaWeb = config.juegos.poceada.agenciaVentaWeb || '5188880';
    const esVentaWeb = agenciaCompleta === agenciaVentaWeb;

    if (isCanceled) {
      // Registro cancelado
      if (esRegistroUnico) {
        anulados++;
      }
    } else {
      // Registro válido
      if (esRegistroUnico) {
        registros++;
      }
      apuestasTotal += nroApuestas;
      recaudacion += valor;

      const provInfo = PROVINCIAS[provCod] || { nombre: `Provincia ${provCod}`, codigo: provCod };
      const key = provInfo.nombre;

      if (!provincias[key]) {
        provincias[key] = { registros: 0, apuestas: 0, recaudacion: 0, codigo: provCod, ventaWeb: 0 };
      }
      provincias[key].registros++;
      provincias[key].apuestas += nroApuestas;
      provincias[key].recaudacion += valor;

      // Contabilizar ventas web
      if (esVentaWeb) {
        provincias[key].ventaWeb = (provincias[key].ventaWeb || 0) + 1;
      }

      // Guardar registro para escrutinio
      registrosParseados.push({
        tipoJuego: 'Poceada',
        agencia: line.substr(NTF_GENERIC.AGENCIA.start, NTF_GENERIC.AGENCIA.length),
        agenciaCompleta: agenciaCompleta,
        esVentaWeb: esVentaWeb,
        ticket: line.substr(NTF_GENERIC.NUMERO_TICKET.start, NTF_GENERIC.NUMERO_TICKET.length),
        letras,
        secuencia,
        cantNum,
        importe: valor
      });
    }
  }

  // Asegurar que todas las provincias tengan la estructura correcta
  // y calcular totales de ventas web
  let totalVentaWeb = 0;
  for (const key in provincias) {
    if (provincias.hasOwnProperty(key)) {
      const prov = provincias[key];
      if (!prov || typeof prov !== 'object') {
        delete provincias[key];
        continue;
      }
      // Asegurar que todas las propiedades existan
      prov.registros = prov.registros || 0;
      prov.apuestas = prov.apuestas || 0;
      prov.recaudacion = prov.recaudacion || 0;
      prov.codigo = prov.codigo || '';
      prov.ventaWeb = prov.ventaWeb || 0;
      totalVentaWeb += prov.ventaWeb;
    }
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
    provincias: provincias || {},
    registrosParseados
  };
}

async function parsearXmlControlPrevio(xmlContent) {
  const parser = new xml2js.Parser({ explicitArray: false });
  const result = await parser.parseStringPromise(xmlContent);

  // El XML puede tener dos estructuras:
  // 1. <CONTROL_PREVIO><QUINIELA_POCEADA_DE_LA_CIUDAD>...
  // 2. <QUINIELA_POCEADA_DE_LA_CIUDAD>... (directo)
  let root = null;
  if (result.CONTROL_PREVIO && result.CONTROL_PREVIO.QUINIELA_POCEADA_DE_LA_CIUDAD) {
    root = result.CONTROL_PREVIO.QUINIELA_POCEADA_DE_LA_CIUDAD;
  } else if (result.QUINIELA_POCEADA_DE_LA_CIUDAD) {
    root = result.QUINIELA_POCEADA_DE_LA_CIUDAD;
  }

  if (!root) {
    console.warn('⚠️  No se encontró QUINIELA_POCEADA_DE_LA_CIUDAD en el XML');
    return null;
  }

  return {
    sorteo: root.SORTEO,
    fecha: root.FECHA_SORTEO,
    registrosValidos: parseInt(root.REGISTROS_VALIDOS),
    registrosAnulados: parseInt(root.REGISTROS_ANULADOS),
    apuestas: parseInt(root.APUESTAS_EN_SORTEO),
    recaudacion: parseFloat(root.RECAUDACION_BRUTA),
    premios: {
      primero: {
        monto: parseFloat(root.PRIMER_PREMIO?.MONTO || 0),
        ganadores: parseInt(root.PRIMER_PREMIO?.GANADORES || 0),
        total: parseFloat(root.PRIMER_PREMIO?.TOTALES || 0),
        pozoVacante: parseFloat(root.PRIMER_PREMIO?.POZO_VACANTE || 0),
        pozoAsegurar: parseFloat(root.PRIMER_PREMIO?.POZO_A_ASEGURAR || 0)
      },
      segundo: {
        monto: parseFloat(root.SEGUNDO_PREMIO?.MONTO || 0),
        ganadores: parseInt(root.SEGUNDO_PREMIO?.GANADORES || 0),
        total: parseFloat(root.SEGUNDO_PREMIO?.TOTALES || 0),
        pozoVacante: parseFloat(root.SEGUNDO_PREMIO?.POZO_VACANTE || 0)
      },
      tercero: {
        monto: parseFloat(root.TERCER_PREMIO?.MONTO || 0),
        ganadores: parseInt(root.TERCER_PREMIO?.GANADORES || 0),
        total: parseFloat(root.TERCER_PREMIO?.TOTALES || 0),
        pozoVacante: parseFloat(root.TERCER_PREMIO?.POZO_VACANTE || 0)
      },
      letras: parseFloat(root.PREMIO_LETRAS?.TOTALES || 0), // Poceada no tiene premio de letras
      agenciero: {
        monto: parseFloat(root.PREMIO_AGENCIERO?.MONTO || 0),
        total: parseFloat(root.PREMIO_AGENCIERO?.TOTALES || 0),
        pozoVacante: parseFloat(root.PREMIO_AGENCIERO?.POZO_VACANTE || 0)
      }
    },
    fondoReserva: parseFloat(root.FONDO_RESERVA?.MONTO || 0),
    importeTotalPremios: parseFloat(root.IMPORTE_TOTAL_PREMIOS_A_DISTRIBUIR || 0)
  };
}

/**
 * Calcula la distribución de premios según los porcentajes configurados para Poceada
 * Los porcentajes se cargan desde config/distribucion-juegos.json
 * @param {number} recaudacion - Recaudación bruta
 * @param {number} pozoArrastre - Pozo arrastrado del sorteo anterior (primer premio)
 * @param {object} arrastresAdicionales - Arrastres de 2do y 3er premio (opcional)
 * @returns {object} Distribución calculada de premios
 */
function calcularDistribucionPremios(recaudacion, pozoArrastre = 0, arrastresAdicionales = {}) {
  // Cargar configuración desde archivo JSON
  const config = cargarConfigJuegos();
  const poceadaConfig = config.juegos.poceada;
  const distribucion = poceadaConfig.distribucionPremios;

  // Obtener porcentajes desde configuración (dividir por 100 para usar como decimales)
  const PORCENTAJE_REC = poceadaConfig.porcentajePozoTotal / 100;        // 45% de recaudación a premios
  const PRIMER_PREMIO_PORC = distribucion.primerPremio.porcentaje / 100;  // 62% del pozo
  const SEGUNDO_PREMIO_PORC = distribucion.segundoPremio.porcentaje / 100; // 23.5% del pozo
  const TERCERO_PREMIO_PORC = distribucion.tercerPremio.porcentaje / 100;  // 10% del pozo
  const AGENCIERO_PORC = distribucion.agenteVendedor.porcentaje / 100;     // 0.5% del pozo
  const FONDO_PORC = distribucion.fondoReserva.porcentaje / 100;           // 4% del pozo

  const recaudacionPremios = recaudacion * PORCENTAJE_REC;

  // Calcular premios base usando porcentajes del pozo (no calculando el resto)
  const primerPremioBase = recaudacionPremios * PRIMER_PREMIO_PORC;
  const segundoPremioBase = recaudacionPremios * SEGUNDO_PREMIO_PORC;
  const terceroPremioBase = recaudacionPremios * TERCERO_PREMIO_PORC;
  const agencieroBase = recaudacionPremios * AGENCIERO_PORC;
  const fondoReserva = recaudacionPremios * FONDO_PORC;

  // Arrastres adicionales de 2do y 3er premio (si existen)
  const arrastre2do = arrastresAdicionales.segundoPremio || 0;
  const arrastre3ro = arrastresAdicionales.tercerPremio || 0;
  const arrastreAgenciero = arrastresAdicionales.agenciero || 0;

  // Totales = base + arrastre
  const primerPremioTotal = primerPremioBase + pozoArrastre;
  const segundoPremioTotal = segundoPremioBase + arrastre2do;
  const terceroPremioTotal = terceroPremioBase + arrastre3ro;
  const agencieroTotal = agencieroBase + arrastreAgenciero;

  // Pozo asegurado mínimo
  const pozoAsegurado = poceadaConfig.pozoAsegurado.primerPremio;

  // Calcular diferencia a asegurar: si el total < asegurado, la diferencia es lo que falta
  const diferenciaAsegurar = primerPremioTotal < pozoAsegurado ? (pozoAsegurado - primerPremioTotal) : 0;

  // Importe final del pozo: el mayor entre el total calculado y el asegurado
  const importeFinalPozo = Math.max(primerPremioTotal, pozoAsegurado);

  return {
    recaudacionBruta: recaudacion,
    recaudacionPremios: recaudacionPremios,
    porcentajesPozoTotal: poceadaConfig.porcentajePozoTotal,
    configVersion: config.version,
    primerPremio: {
      porcentaje: distribucion.primerPremio.porcentaje,
      monto: primerPremioBase,           // Monto del sorteo actual (recaudación * %)
      pozoVacante: pozoArrastre,         // Arrastre del sorteo anterior
      total: primerPremioTotal,          // Total = monto + arrastre
      pozoAsegurado: pozoAsegurado,      // Mínimo garantizado
      diferenciaAsegurar: diferenciaAsegurar, // Lo que falta para llegar al asegurado
      importeFinal: importeFinalPozo     // Importe final del pozo (el mayor entre total y asegurado)
    },
    segundoPremio: {
      porcentaje: distribucion.segundoPremio.porcentaje,
      monto: segundoPremioBase,
      pozoVacante: arrastre2do,
      total: segundoPremioTotal
    },
    terceroPremio: {
      porcentaje: distribucion.tercerPremio.porcentaje,
      monto: terceroPremioBase,
      pozoVacante: arrastre3ro,
      total: terceroPremioTotal
    },
    agenciero: {
      porcentaje: distribucion.agenteVendedor.porcentaje,
      monto: agencieroBase,
      pozoVacante: arrastreAgenciero,
      total: agencieroTotal
    },
    fondoReserva: {
      porcentaje: distribucion.fondoReserva.porcentaje,
      monto: fondoReserva
    },
    importeTotalPremios: recaudacionPremios
  };
}

async function buscarPozoArrastreAnterior(numeroSorteo) {
  try {
    const numSorteoInt = parseInt(numeroSorteo);
    const anterior = (numSorteoInt - 1).toString().padStart(6, '0');

    // Buscar TODOS los pozos de arrastre del sorteo anterior
    const rows = await query(
      `SELECT pozo_arrastre_siguiente, pozo_segundo_premio, pozo_tercer_premio, arrastre_agenciero
       FROM poceada_sorteos WHERE numero_sorteo = ?`,
      [anterior]
    );

    if (rows.length > 0) {
      const row = rows[0];
      return parseFloat(row.pozo_arrastre_siguiente) || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error buscando pozo arrastre:', error);
    return 0;
  }
}

/**
 * Busca TODOS los arrastres del sorteo anterior (1er, 2do, 3er, agenciero)
 */
async function buscarTodosArrastresAnterior(numeroSorteo) {
  try {
    const numSorteoInt = parseInt(numeroSorteo);
    const anterior = (numSorteoInt - 1).toString().padStart(6, '0');

    const rows = await query(
      `SELECT pozo_arrastre_siguiente, arrastre_segundo_premio, arrastre_tercer_premio, arrastre_agenciero
       FROM poceada_sorteos WHERE numero_sorteo = ?`,
      [anterior]
    );

    if (rows.length > 0) {
      const row = rows[0];
      return {
        primerPremio: parseFloat(row.pozo_arrastre_siguiente) || 0,
        segundoPremio: parseFloat(row.arrastre_segundo_premio) || 0,
        tercerPremio: parseFloat(row.arrastre_tercer_premio) || 0,
        agenciero: parseFloat(row.arrastre_agenciero) || 0
      };
    }
    return { primerPremio: 0, segundoPremio: 0, tercerPremio: 0, agenciero: 0 };
  } catch (error) {
    console.error('Error buscando arrastres completos:', error);
    return { primerPremio: 0, segundoPremio: 0, tercerPremio: 0, agenciero: 0 };
  }
}

/**
 * Endpoint para buscar pozo de arrastre manualmente
 */
const buscarPozo = async (req, res) => {
  const { sorteo } = req.params;
  const pozo = await buscarPozoArrastreAnterior(sorteo);
  return successResponse(res, { pozo });
};

/**
 * Guarda los resultados del control previo en la base de datos (histórico)
 */
const guardarResultado = async (req, res) => {
  const { data } = req.body;
  if (!data || !data.sorteo) {
    return errorResponse(res, 'Datos incompletos', 400);
  }

  try {
    await query(`
      INSERT INTO poceada_sorteos 
      (numero_sorteo, fecha_sorteo, recaudacion_bruta, pozo_primer_premio, pozo_segundo_premio, pozo_tercer_premio, ganadores_primer_premio, ganadores_segundo_premio, ganadores_tercer_premio, pozo_arrastre_siguiente)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
      fecha_sorteo = VALUES(fecha_sorteo), 
      recaudacion_bruta = VALUES(recaudacion_bruta),
      pozo_primer_premio = VALUES(pozo_primer_premio),
      pozo_segundo_premio = VALUES(pozo_segundo_premio),
      pozo_tercer_premio = VALUES(pozo_tercer_premio),
      ganadores_primer_premio = VALUES(ganadores_primer_premio),
      ganadores_segundo_premio = VALUES(ganadores_segundo_premio),
      ganadores_tercer_premio = VALUES(ganadores_tercer_premio),
      pozo_arrastre_siguiente = VALUES(pozo_arrastre_siguiente)
    `, [
      data.sorteo,
      data.fecha || new Date().toISOString().split('T')[0],
      data.recaudacion || 0,
      data.premios?.primero?.total || 0,
      data.premios?.segundo?.total || 0,
      data.premios?.tercero?.total || 0,
      data.premios?.primero?.ganadores || 0,
      data.premios?.segundo?.ganadores || 0,
      data.premios?.tercero?.ganadores || 0,
      data.pozoArrastreSiguiente || 0
    ]);

    return successResponse(res, null, 'Sorteo guardado correctamente');
  } catch (error) {
    return errorResponse(res, 'Error guardando sorteo: ' + error.message, 500);
  }
};

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

/**
 * Obtener la configuración actual de distribución de juegos
 */
const obtenerConfiguracion = async (req, res) => {
  try {
    const config = cargarConfigJuegos();
    return successResponse(res, config, 'Configuración obtenida correctamente');
  } catch (error) {
    return errorResponse(res, 'Error obteniendo configuración: ' + error.message, 500);
  }
};

/**
 * Recargar la configuración desde el archivo (útil después de actualizaciones)
 */
const recargarConfiguracion = async (req, res) => {
  try {
    const config = recargarConfigJuegos();
    return successResponse(res, {
      version: config.version,
      vigencia: config.vigencia,
      juegos: Object.keys(config.juegos)
    }, 'Configuración recargada correctamente');
  } catch (error) {
    return errorResponse(res, 'Error recargando configuración: ' + error.message, 500);
  }
};

/**
 * Endpoint para guardar arrastres manuales (cuando no hay datos del sorteo anterior)
 * Los arrastres se guardan en poceada_sorteos para el sorteo ANTERIOR al actual
 */
const guardarArrastres = async (req, res) => {
  const { sorteo, arrastres } = req.body;
  if (!sorteo || !arrastres) {
    return errorResponse(res, 'Datos incompletos: se requiere sorteo y arrastres', 400);
  }

  try {
    const numSorteoInt = parseInt(sorteo);
    const sorteoAnterior = (numSorteoInt - 1).toString().padStart(6, '0');

    // Guardar los arrastres como datos del sorteo anterior
    // pozo_arrastre_siguiente = arrastre del 1er premio hacia el sorteo actual
    // arrastre_segundo_premio = arrastre del 2do premio
    // arrastre_tercer_premio = arrastre del 3er premio
    // arrastre_agenciero = arrastre del agenciero
    await query(`
      INSERT INTO poceada_sorteos
      (numero_sorteo, pozo_arrastre_siguiente, arrastre_segundo_premio, arrastre_tercer_premio, arrastre_agenciero)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      pozo_arrastre_siguiente = VALUES(pozo_arrastre_siguiente),
      arrastre_segundo_premio = VALUES(arrastre_segundo_premio),
      arrastre_tercer_premio = VALUES(arrastre_tercer_premio),
      arrastre_agenciero = VALUES(arrastre_agenciero)
    `, [
      sorteoAnterior,
      arrastres.primerPremio || 0,
      arrastres.segundoPremio || 0,
      arrastres.tercerPremio || 0,
      arrastres.agenciero || 0
    ]);

    console.log(`✅ Arrastres manuales guardados para sorteo anterior ${sorteoAnterior}:`, arrastres);
    return successResponse(res, null, 'Arrastres guardados correctamente');
  } catch (error) {
    console.error('Error guardando arrastres:', error);
    return errorResponse(res, 'Error guardando arrastres: ' + error.message, 500);
  }
};

module.exports = {
  procesarZip,
  buscarPozo,
  guardarResultado,
  guardarArrastres,
  decodificarNumerosPoceada, // Exportado para escrutinio
  obtenerConfiguracion,
  recargarConfiguracion,
  cargarConfigJuegos // Exportado para uso en otros módulos
};
