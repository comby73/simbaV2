const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const crypto = require('crypto');
const { query } = require('../../config/database');
const { successResponse, errorResponse, today } = require('../../shared/helpers');
const { guardarControlPrevioQuiniela } = require('../../shared/control-previo.helper');

// Configuración de posiciones del formato NTF v2 (posiciones 1-based convertidas a 0-based)
// Parte Genérica: 200 caracteres
const NTF_GENERIC = {
  VERSION_GENERICA: { start: 0, length: 2 },      // Pos 1-2: "02"
  JUEGO: { start: 2, length: 2 },                  // Pos 3-4
  NUMERO_SORTEO: { start: 4, length: 6 },          // Pos 5-10
  CANTIDAD_SORTEOS: { start: 10, length: 2 },      // Pos 11-12
  PROVEEDOR: { start: 12, length: 1 },             // Pos 13
  PROVINCIA: { start: 13, length: 2 },             // Pos 14-15
  AGENCIA: { start: 15, length: 5 },               // Pos 16-20
  DIGITO_VERIF: { start: 20, length: 1 },          // Pos 21
  ID_TERMINAL_VENTA: { start: 21, length: 8 },     // Pos 22-29
  ID_USUARIO_VENTA: { start: 29, length: 8 },      // Pos 30-37
  MODO_VENTA: { start: 37, length: 2 },            // Pos 38-39
  FECHA_VENTA: { start: 39, length: 8 },           // Pos 40-47 (AAAAMMDD)
  HORA_VENTA: { start: 47, length: 6 },            // Pos 48-53 (HHMMSS)
  ID_TERMINAL_CANCEL: { start: 53, length: 8 },    // Pos 54-61
  ID_USUARIO_CANCEL: { start: 61, length: 8 },     // Pos 62-69
  MODO_CANCELACION: { start: 69, length: 1 },      // Pos 70
  FECHA_CANCELACION: { start: 70, length: 8 },     // Pos 71-78 (AAAAMMDD o espacios)
  HORA_CANCELACION: { start: 78, length: 6 },      // Pos 79-84 (HHMMSS o espacios)
  CANTIDAD_PARTES: { start: 84, length: 2 },       // Pos 85-86
  NUMERO_TICKET: { start: 86, length: 12 },        // Pos 87-98
  ORDINAL_APUESTA: { start: 98, length: 2 },       // Pos 99-100
  TIPO_DOCUMENTO: { start: 100, length: 1 },       // Pos 101
  NUMERO_DOCUMENTO: { start: 101, length: 12 },    // Pos 102-113
  AGENCIA_AMIGA: { start: 113, length: 8 },        // Pos 114-121
  VALOR_APUESTA: { start: 121, length: 10 },       // Pos 122-131 (8 enteros, 2 decimales)
  VALOR_REAL_APUESTA: { start: 131, length: 10 },  // Pos 132-141
  CODIGO_PROMOCION: { start: 141, length: 10 },    // Pos 142-151
  ID_SESION: { start: 151, length: 12 },           // Pos 152-163
  ID_EXTERNO_TICKET: { start: 163, length: 30 },   // Pos 164-193
  RESERVADO: { start: 193, length: 7 }             // Pos 194-200
};

// Parte Específica Quiniela (desde posición 201)
const NTF_QUINIELA = {
  VERSION_ESPECIFICA: { start: 200, length: 2 },   // Pos 201-202: "02"
  TIPO_SORTEO: { start: 202, length: 2 },          // Pos 203-204 (A, M, V, U, N, AS, MS, VS, US, NS)
  LOTERIAS_JUGADAS: { start: 204, length: 8 },     // Pos 205-212 (cada dígito = una lotería)
  LETRAS: { start: 212, length: 4 },               // Pos 213-216
  TIPO_APUESTA: { start: 216, length: 1 },         // Pos 217 (0=Simple, 1=Redoblona)
  CANTIDAD_CIFRAS: { start: 217, length: 1 },      // Pos 218
  NUMERO_APOSTADO_1: { start: 218, length: 4 },    // Pos 219-222
  UBICACION_DESDE_1: { start: 222, length: 2 },    // Pos 223-224
  UBICACION_HASTA_1: { start: 224, length: 2 },    // Pos 225-226
  NUMERO_APOSTADO_2: { start: 226, length: 2 },    // Pos 227-228 (Redoblona)
  UBICACION_DESDE_2: { start: 228, length: 2 },    // Pos 229-230 (Redoblona)
  UBICACION_HASTA_2: { start: 230, length: 2 }     // Pos 231-232 (Redoblona)
};

// Mapeo de provincias (posición en loterías jugadas)
const PROVINCIAS_MAP = {
  0: { codigo: 'CABA', nombre: 'Ciudad Autónoma', campo_prog: 'prov_caba' },
  1: { codigo: 'PBA', nombre: 'Buenos Aires', campo_prog: 'prov_bsas' },
  2: { codigo: 'CBA', nombre: 'Córdoba', campo_prog: 'prov_cordoba' },
  3: { codigo: 'SFE', nombre: 'Santa Fe', campo_prog: 'prov_santafe' },
  4: { codigo: 'URU', nombre: 'Montevideo', campo_prog: 'prov_montevideo' },
  5: { codigo: 'MZA', nombre: 'Mendoza', campo_prog: 'prov_mendoza' },
  6: { codigo: 'ENR', nombre: 'Entre Ríos', campo_prog: 'prov_entrerios' }
};

// Mapeo de códigos NTF a códigos de programación
const MODALIDAD_NTF_A_PROG = {
  // La Previa
  'A': { codigo: 'R', nombre: 'LA PREVIA' },
  'AS': { codigo: 'R', nombre: 'LA PREVIA' },
  'SR': { codigo: 'R', nombre: 'LA PREVIA' },
  'R': { codigo: 'R', nombre: 'LA PREVIA' },
  'PR': { codigo: 'R', nombre: 'LA PREVIA' },
  'LP': { codigo: 'R', nombre: 'LA PREVIA' },
  // La Primera
  'U': { codigo: 'P', nombre: 'LA PRIMERA' },
  'US': { codigo: 'P', nombre: 'LA PRIMERA' },
  'SU': { codigo: 'P', nombre: 'LA PRIMERA' },
  'SP': { codigo: 'P', nombre: 'LA PRIMERA' },
  'P': { codigo: 'P', nombre: 'LA PRIMERA' },
  'P1': { codigo: 'P', nombre: 'LA PRIMERA' },
  // Matutina
  'M': { codigo: 'M', nombre: 'MATUTINA' },
  'MS': { codigo: 'M', nombre: 'MATUTINA' },
  'SM': { codigo: 'M', nombre: 'MATUTINA' },
  'MA': { codigo: 'M', nombre: 'MATUTINA' },
  // Vespertina
  'V': { codigo: 'V', nombre: 'VESPERTINA' },
  'VS': { codigo: 'V', nombre: 'VESPERTINA' },
  'SV': { codigo: 'V', nombre: 'VESPERTINA' },
  'VE': { codigo: 'V', nombre: 'VESPERTINA' },
  // Nocturna
  'N': { codigo: 'N', nombre: 'NOCTURNA' },
  'NS': { codigo: 'N', nombre: 'NOCTURNA' },
  'SN': { codigo: 'N', nombre: 'NOCTURNA' },
  'NO': { codigo: 'N', nombre: 'NOCTURNA' }
};

/**
 * Buscar programación del sorteo y validar provincias
 * @param {number} numeroSorteo - Número de sorteo
 * @param {object} provinciasNTF - Provincias encontradas en el NTF con sus apuestas/recaudación
 * @param {string} modalidadNTF - Código de modalidad del NTF (A, M, V, U, N)
 */
async function validarContraProgramacion(numeroSorteo, provinciasNTF, modalidadNTF) {
  const resultado = {
    encontrado: false,
    sorteo: null,
    modalidad: {
      codigo: null,
      nombre: null,
      detectada: modalidadNTF
    },
    provincias: [],
    errores: [],
    warnings: []
  };

  try {
    // Convertir número de sorteo a entero (quitar ceros iniciales)
    // Ejemplo: "051912" -> 51912
    const numeroSorteoInt = parseInt(numeroSorteo, 10);
    
    // Buscar sorteo en programación
    const sorteos = await query(
      'SELECT * FROM programacion_sorteos WHERE numero_sorteo = ? AND juego = ?',
      [numeroSorteoInt, 'Quiniela']
    );

    if (sorteos.length === 0) {
      resultado.warnings.push({
        tipo: 'SORTEO_NO_PROGRAMADO',
        mensaje: `Sorteo ${numeroSorteoInt} no encontrado en la programación cargada`
      });
      return resultado;
    }

    const sorteo = sorteos[0];
    resultado.encontrado = true;
    resultado.sorteo = {
      numero: sorteo.numero_sorteo,
      fecha: sorteo.fecha_sorteo,
      hora: sorteo.hora_sorteo,
      modalidad_codigo: sorteo.modalidad_codigo,
      modalidad_nombre: sorteo.modalidad_nombre
    };
    resultado.modalidad.codigo = sorteo.modalidad_codigo;
    resultado.modalidad.nombre = sorteo.modalidad_nombre;

    // Validar modalidad si se detectó una
    if (modalidadNTF) {
      const modalidadMapeada = MODALIDAD_NTF_A_PROG[modalidadNTF.trim().toUpperCase()];
      if (modalidadMapeada && sorteo.modalidad_codigo && modalidadMapeada.codigo !== sorteo.modalidad_codigo) {
        resultado.warnings.push({
          tipo: 'MODALIDAD_NO_COINCIDE',
          mensaje: `Modalidad del archivo (${modalidadNTF} -> ${modalidadMapeada.nombre}) no coincide con programación (${sorteo.modalidad_nombre})`
        });
      }
    }

    // Validar cada provincia
    for (const [index, prov] of Object.entries(PROVINCIAS_MAP)) {
      const provNTF = provinciasNTF[prov.codigo] || { apuestas: 0, recaudacion: 0 };
      const habilitada = sorteo[prov.campo_prog] === 1;
      const tieneApuestas = provNTF.apuestas > 0;

      const estadoProv = {
        indice: parseInt(index),
        codigo: prov.codigo,
        nombre: prov.nombre,
        habilitada,
        apuestas: provNTF.apuestas,
        recaudacion: provNTF.recaudacion,
        estado: 'OK'
      };

      if (!habilitada && tieneApuestas) {
        estadoProv.estado = 'ERROR';
        resultado.errores.push({
          tipo: 'PROVINCIA_NO_HABILITADA',
          provincia: prov.nombre,
          codigo: prov.codigo,
          mensaje: `Provincia ${prov.nombre} NO está habilitada pero tiene ${provNTF.apuestas} apuestas ($${provNTF.recaudacion.toLocaleString()})`,
          apuestas: provNTF.apuestas,
          recaudacion: provNTF.recaudacion
        });
      } else if (habilitada && !tieneApuestas) {
        estadoProv.estado = 'WARNING';
        resultado.warnings.push({
          tipo: 'PROVINCIA_SIN_APUESTAS',
          provincia: prov.nombre,
          codigo: prov.codigo,
          mensaje: `Provincia ${prov.nombre} está habilitada pero no tiene apuestas`
        });
      }

      resultado.provincias.push(estadoProv);
    }

  } catch (error) {
    console.error('Error validando programación:', error);
    resultado.warnings.push({
      tipo: 'ERROR_VALIDACION',
      mensaje: 'No se pudo validar contra la programación: ' + error.message
    });
  }

  return resultado;
}

/**
 * Detectar la modalidad predominante del archivo NTF
 * @param {object} tiposSorteo - Objeto con tipos de sorteo y sus apuestas
 * @returns {string} Código de modalidad (A, M, V, U, N)
 */
function detectarModalidadPredominante(tiposSorteo) {
  if (!tiposSorteo || Object.keys(tiposSorteo).length === 0) {
    return null;
  }

  let maxApuestas = 0;
  let modalidadPrincipal = null;

  for (const [modalidad, datos] of Object.entries(tiposSorteo)) {
    const apuestas = datos.apuestas || 0;
    if (apuestas > maxApuestas) {
      maxApuestas = apuestas;
      modalidadPrincipal = modalidad.trim();
    }
  }

  return modalidadPrincipal;
}

// Procesar archivo ZIP de control previo
const procesarZip = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No se recibió ningún archivo', 400);
    }

    const zipPath = req.file.path;
    const extractPath = path.join(__dirname, '../../../uploads/temp', `extract_${Date.now()}`);
    
    // Crear directorio de extracción
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }

    // Extraer ZIP
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractPath, true);

    // Buscar archivos
    const files = fs.readdirSync(extractPath);
    const txtFile = files.find(f => f.toUpperCase().startsWith('QNL') && f.toUpperCase().endsWith('.TXT'));
    const xmlFile = files.find(f => f.toUpperCase().endsWith('CP.XML'));
    const hashFile = files.find(f => f.toUpperCase().endsWith('.HASH') && !f.toUpperCase().includes('CP'));
    const hashCPFile = files.find(f => f.toUpperCase().endsWith('CP.HASH'));
    const pdfFile = files.find(f => f.toUpperCase().endsWith('.PDF'));

    if (!txtFile) {
      limpiarDirectorio(extractPath);
      return errorResponse(res, 'No se encontró archivo TXT de apuestas', 400);
    }

    // Procesar archivo TXT
    const txtPath = path.join(extractPath, txtFile);
    const txtContent = fs.readFileSync(txtPath, 'latin1');
    const resultadosTxt = await procesarArchivoNTF(txtContent);

    // Procesar archivo XML
    let resultadosXml = null;
    if (xmlFile) {
      const xmlPath = path.join(extractPath, xmlFile);
      const xmlContent = fs.readFileSync(xmlPath, 'utf8');
      resultadosXml = await procesarArchivoXML(xmlContent);
    }

    // Calcular hashes
    const hashTxtCalculado = crypto.createHash('sha512').update(txtContent).digest('hex');
    
    // Leer hash oficial si existe
    let hashTxtOficial = null;
    if (hashFile) {
      hashTxtOficial = fs.readFileSync(path.join(extractPath, hashFile), 'utf8').trim();
    }

    let hashXmlOficial = null;
    if (hashCPFile) {
      hashXmlOficial = fs.readFileSync(path.join(extractPath, hashCPFile), 'utf8').trim();
    }

    // Verificar archivos de seguridad
    const archivosSeguridad = {
      txt: !!txtFile,
      xml: !!xmlFile,
      hash: !!hashFile,
      hashCP: !!hashCPFile,
      pdf: !!pdfFile,
      hashCoincide: hashTxtOficial ? hashTxtCalculado === hashTxtOficial : null
    };

    // Limpiar directorio temporal
    limpiarDirectorio(extractPath);
    
    // Eliminar archivo ZIP subido
    fs.unlinkSync(zipPath);

    // NUEVO: Detectar modalidad predominante del archivo
    const modalidadPredominante = detectarModalidadPredominante(resultadosTxt.tiposSorteo);
    
    // NUEVO: Validar contra programación
    const validacionProgramacion = await validarContraProgramacion(
      resultadosTxt.numeroSorteo,
      resultadosTxt.provincias,
      modalidadPredominante
    );

    // Preparar respuesta
    const resultado = {
      archivo: req.file.originalname,
      fechaProcesamiento: new Date().toISOString(),
      tipoJuego: 'Quiniela', // Identificar el tipo de juego
      
      // NUEVO: Información del sorteo desde programación
      sorteo: {
        numero: resultadosTxt.numeroSorteo,
        modalidad: validacionProgramacion.modalidad,
        programacion: validacionProgramacion.sorteo
      },
      
      // Datos del TXT procesado
      datosCalculados: {
        numeroSorteo: resultadosTxt.numeroSorteo,
        registros: resultadosTxt.registros,
        registrosAnulados: resultadosTxt.anulados,
        apuestasTotal: resultadosTxt.apuestas,
        recaudacion: resultadosTxt.recaudacion,
        recaudacionAnulada: resultadosTxt.recaudacionAnulada,
        
        // Por provincia
        provincias: resultadosTxt.provincias,
        
        // Por tipo de sorteo (A, M, V, U, N, etc.)
        tiposSorteo: resultadosTxt.tiposSorteo,
        
        // Online
        online: {
          registros: resultadosTxt.onlineRegistros,
          apuestas: resultadosTxt.onlineApuestas,
          recaudacion: resultadosTxt.onlineRecaudacion,
          anulados: resultadosTxt.onlineAnulados
        },
        
        // Estadísticas de agencias amigas
        estadisticasAgenciasAmigas: resultadosTxt.estadisticasAgenciasAmigas
      },
      
      // Datos del XML (UTE)
      datosOficiales: resultadosXml,
      
      // Comparación de datos (TXT vs XML) - similar a Poceada
      comparacion: resultadosXml ? {
        registros: {
          calculado: resultadosTxt.registros,
          oficial: resultadosXml.registrosValidos,
          diferencia: resultadosTxt.registros - resultadosXml.registrosValidos
        },
        anulados: {
          calculado: resultadosTxt.anulados,
          oficial: resultadosXml.registrosAnulados,
          diferencia: resultadosTxt.anulados - resultadosXml.registrosAnulados
        },
        apuestas: {
          calculado: resultadosTxt.apuestas,
          oficial: resultadosXml.apuestasEnSorteo,
          diferencia: resultadosTxt.apuestas - resultadosXml.apuestasEnSorteo
        },
        recaudacion: {
          calculado: resultadosTxt.recaudacion,
          oficial: resultadosXml.recaudacionBruta,
          diferencia: resultadosTxt.recaudacion - resultadosXml.recaudacionBruta
        }
      } : null,
      
      // Verificación de seguridad
      seguridad: {
        archivos: archivosSeguridad,
        hashCalculado: hashTxtCalculado,
        hashOficial: hashTxtOficial,
        verificado: archivosSeguridad.hashCoincide
      },
      
      // NUEVO: Registros parseados del TXT para uso en Control Posterior
      registrosNTF: resultadosTxt.registrosParseados,
      
      // NUEVO: Errores de agencias amigas inválidas
      erroresAgenciasAmigas: resultadosTxt.erroresAgenciasAmigas,
      
      // NUEVO: Estadísticas de agencias amigas
      estadisticasAgenciasAmigas: resultadosTxt.estadisticasAgenciasAmigas,
      
      // NUEVO: Validación contra programación
      validacionProgramacion: validacionProgramacion
    };

    // GUARDAR EN BASE DE DATOS (resguardo)
    try {
      const resguardo = await guardarControlPrevioQuiniela(resultado, req.user, req.file.originalname);
      resultado.resguardo = resguardo;
    } catch (errGuardar) {
      console.error('⚠️ Error guardando resguardo (no crítico):', errGuardar.message);
      resultado.resguardo = { success: false, error: errGuardar.message };
    }

    return successResponse(res, resultado, 'Archivo procesado correctamente');

  } catch (error) {
    console.error('Error procesando ZIP:', error);
    return errorResponse(res, 'Error procesando archivo: ' + error.message, 500);
  }
};

// Extraer campo de una línea NTF
function extraerCampo(line, config) {
  return line.substr(config.start, config.length);
}

// Procesar archivo NTF (TXT) - Formato NTF v2
// Devuelve estadísticas Y los registros parseados para el escrutinio
// Ahora valida agencias amigas para venta web (88880)
async function procesarArchivoNTF(content) {
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  
  let numeroSorteo = null;
  let registros = 0;
  let anulados = 0;
  let apuestas = 0;
  let recaudacion = 0;
  let recaudacionAnulada = 0;
  
  // Array de registros parseados para el Control Posterior
  const registrosParseados = [];
  
  // Errores de agencias amigas inválidas
    const erroresAgenciasAmigas = [];
    let totalAgenciasAmigas = 0; // Total de agencias amigas encontradas
    let agenciasAmigasValidas = 0; // Total de agencias amigas válidas
  
  // Cargar todas las agencias activas en memoria para validación rápida
  const agenciasActivas = new Set();
  try {
    const agencias = await query('SELECT numero FROM agencias WHERE activa = TRUE');
    agencias.forEach(ag => agenciasActivas.add(ag.numero));
  } catch (err) {
    console.warn('No se pudieron cargar agencias para validación:', err.message);
  }
  
  // Contadores por provincia (índice en loterías jugadas)
  // Pos 205-212: cada dígito representa cantidad de apuestas a esa lotería
  // 0=CABA, 1=Buenos Aires, 2=Córdoba, 3=Santa Fe, 4=Montevideo, 5=Mendoza, 6=Entre Ríos
  const provincias = {
    CABA: { apuestas: 0, recaudacion: 0, nombre: 'Ciudad Autónoma', index: 0 },
    PBA: { apuestas: 0, recaudacion: 0, nombre: 'Buenos Aires', index: 1 },
    CBA: { apuestas: 0, recaudacion: 0, nombre: 'Córdoba', index: 2 },
    SFE: { apuestas: 0, recaudacion: 0, nombre: 'Santa Fe', index: 3 },
    URU: { apuestas: 0, recaudacion: 0, nombre: 'Montevideo', index: 4 },
    MZA: { apuestas: 0, recaudacion: 0, nombre: 'Mendoza', index: 5 },
    ENR: { apuestas: 0, recaudacion: 0, nombre: 'Entre Ríos', index: 6 }
  };
  
  // Online (agencia 88880)
  let onlineRegistros = 0;
  let onlineApuestas = 0;
  let onlineRecaudacion = 0;
  let onlineAnulados = 0;

  // Por tipo de sorteo
  const tiposSorteo = {};

  for (const line of lines) {
    // Mínimo 232 caracteres para quiniela (200 genéricos + 32 específicos)
    if (line.length < 232) continue;

    // Extraer número de sorteo de la primera línea válida
    if (!numeroSorteo) {
      numeroSorteo = extraerCampo(line, NTF_GENERIC.NUMERO_SORTEO).trim();
    }

    // Campos genéricos
    const fechaCancelacion = extraerCampo(line, NTF_GENERIC.FECHA_CANCELACION);
    const ordinalApuesta = extraerCampo(line, NTF_GENERIC.ORDINAL_APUESTA);
    const valorApuesta = parseInt(extraerCampo(line, NTF_GENERIC.VALOR_APUESTA)) / 100;
    const agencia = extraerCampo(line, NTF_GENERIC.AGENCIA).trim(); // Limpiar espacios
    const numeroTicket = extraerCampo(line, NTF_GENERIC.NUMERO_TICKET);
    const agenciaAmiga = extraerCampo(line, NTF_GENERIC.AGENCIA_AMIGA).trim(); // Pos 114-121 (8 dígitos)
    
    // Campos específicos de quiniela
    const tipoSorteo = extraerCampo(line, NTF_QUINIELA.TIPO_SORTEO).trim();
    const loteriasJugadas = extraerCampo(line, NTF_QUINIELA.LOTERIAS_JUGADAS);
    const tipoApuesta = extraerCampo(line, NTF_QUINIELA.TIPO_APUESTA); // 0=Simple, 1=Redoblona
    const letras = extraerCampo(line, NTF_QUINIELA.LETRAS);
    const cantidadCifras = parseInt(extraerCampo(line, NTF_QUINIELA.CANTIDAD_CIFRAS)) || 2;
    const numero1 = extraerCampo(line, NTF_QUINIELA.NUMERO_APOSTADO_1);
    const ubicacionDesde1 = parseInt(extraerCampo(line, NTF_QUINIELA.UBICACION_DESDE_1)) || 1;
    const ubicacionHasta1 = parseInt(extraerCampo(line, NTF_QUINIELA.UBICACION_HASTA_1)) || 20;
    const numero2 = extraerCampo(line, NTF_QUINIELA.NUMERO_APOSTADO_2);
    const ubicacionDesde2 = parseInt(extraerCampo(line, NTF_QUINIELA.UBICACION_DESDE_2)) || 1;
    const ubicacionHasta2 = parseInt(extraerCampo(line, NTF_QUINIELA.UBICACION_HASTA_2)) || 20;

    // Detectar si está anulado: fecha de cancelación NO está en blanco
    const estaAnulado = fechaCancelacion.trim() !== '';
    // Detectar online: agencia 88880 (puede tener espacios o ceros a la izquierda)
    const esOnline = agencia === '88880' || agencia.padStart(5, '0') === '88880' || agencia.replace(/\s/g, '') === '88880';
    
    // VALIDACIÓN DE AGENCIA AMIGA: Solo la agencia 88880 (venta web) puede tener agencia amiga
    // Si tiene valor (no espacios, no ceros), debe existir en la tabla de agencias
    if (esOnline && agenciaAmiga && agenciaAmiga !== '' && agenciaAmiga !== '00000000' && agenciaAmiga !== '        ') {
      totalAgenciasAmigas++;
      const agenciaAmigaNum = agenciaAmiga.padStart(8, '0');
      
      // Validar contra el Set de agencias activas (validación rápida en memoria)
      if (agenciasActivas.has(agenciaAmigaNum)) {
        agenciasAmigasValidas++;
      } else {
        // Agencia amiga no encontrada - agregar error
        erroresAgenciasAmigas.push({
          fila: lines.indexOf(line) + 1, // Número de línea (1-based)
          numeroTicket: numeroTicket.trim(),
          agenciaAmiga: agenciaAmigaNum,
          mensaje: `Agencia amiga detectada número incorrecto: ${agenciaAmigaNum}`
        });
      }
    }

    // Contar por tipo de sorteo
    if (!tiposSorteo[tipoSorteo]) {
      tiposSorteo[tipoSorteo] = { apuestas: 0, recaudacion: 0 };
    }

    if (!estaAnulado) {
      // Guardar registro parseado para el escrutinio (solo válidos)
      registrosParseados.push({
        numeroTicket,
        ordinal: ordinalApuesta.trim(),
        valorApuesta,
        agencia,
        tipoSorteo,
        loteriasJugadas,
        letras,
        tipoApuesta,
        cantidadCifras,
        numero1,
        ubicacionDesde1,
        ubicacionHasta1,
        numero2,
        ubicacionDesde2,
        ubicacionHasta2
      });
      
      // Contar apuestas y calcular recaudación por provincia
      // Cada posición es un dígito que indica cantidad de apuestas a esa lotería
      // La recaudación se distribuye proporcionalmente entre las provincias jugadas
      let totalLoteriasJugadas = 0;
      for (let i = 0; i < 7; i++) {
        totalLoteriasJugadas += parseInt(loteriasJugadas.charAt(i)) || 0;
      }
      
      for (const [codigo, prov] of Object.entries(provincias)) {
        const cantidadEnLoteria = parseInt(loteriasJugadas.charAt(prov.index)) || 0;
        if (cantidadEnLoteria > 0) {
          provincias[codigo].apuestas += cantidadEnLoteria;
          // Recaudación proporcional: si apuesta a 5 provincias, cada una recibe 1/5
          if (totalLoteriasJugadas > 0) {
            provincias[codigo].recaudacion += (valorApuesta * cantidadEnLoteria) / totalLoteriasJugadas;
          }
          apuestas += cantidadEnLoteria;
        }
      }

      recaudacion += valorApuesta;
      tiposSorteo[tipoSorteo].apuestas++;
      tiposSorteo[tipoSorteo].recaudacion += valorApuesta;

      if (esOnline) {
        onlineRecaudacion += valorApuesta;
        for (let i = 0; i < 7; i++) {
          onlineApuestas += parseInt(loteriasJugadas.charAt(i)) || 0;
        }
      }
    } else {
      // Registro anulado - también sumar la recaudación anulada
      recaudacionAnulada += valorApuesta;
    }

    // Contar registros (solo ordinal 01 o espacios)
    const ordinal = ordinalApuesta.trim();
    if (ordinal === '01' || ordinal === '' || ordinal === '1') {
      if (estaAnulado) {
        anulados++;
        if (esOnline) onlineAnulados++;
      } else {
        registros++;
        if (esOnline) onlineRegistros++;
      }
    }
  }

  return {
    numeroSorteo,
    registros,
    anulados,
    apuestas,
    recaudacion,
    recaudacionAnulada,
    provincias,
    tiposSorteo,
    onlineRegistros,
    onlineApuestas,
    onlineRecaudacion,
    onlineAnulados,
    // NUEVO: Registros parseados para Control Posterior
    registrosParseados,
    // NUEVO: Errores de agencias amigas inválidas
    erroresAgenciasAmigas: erroresAgenciasAmigas.length > 0 ? erroresAgenciasAmigas : null,
    // NUEVO: Estadísticas de agencias amigas
    estadisticasAgenciasAmigas: {
      total: totalAgenciasAmigas,
      validas: agenciasAmigasValidas,
      invalidas: erroresAgenciasAmigas.length
    }
  };
}

// Procesar archivo XML
async function procesarArchivoXML(content) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(content, { explicitArray: false }, (err, result) => {
      if (err) {
        resolve(null);
        return;
      }

      try {
        let quiniela = null;
        
        if (result.CONTROL_PREVIO && result.CONTROL_PREVIO.QUINIELA_DE_LA_CIUDAD) {
          quiniela = result.CONTROL_PREVIO.QUINIELA_DE_LA_CIUDAD;
        } else if (result.QUINIELA_DE_LA_CIUDAD) {
          quiniela = result.QUINIELA_DE_LA_CIUDAD;
        }

        if (quiniela) {
          resolve({
            codigoJuego: quiniela.CODIGO_JUEGO || '',
            sorteo: quiniela.SORTEO || '',
            fechaSorteo: quiniela.FECHA_SORTEO || '',
            registrosValidos: parseInt(quiniela.REGISTROS_VALIDOS) || 0,
            registrosAnulados: parseInt(quiniela.REGISTROS_ANULADOS) || 0,
            apuestasEnSorteo: parseInt(quiniela.APUESTAS_EN_SORTEO) || 0,
            recaudacionBruta: parseFloat(quiniela.RECAUDACION_BRUTA) || 0,
            recaudacionADistribuir: parseFloat(quiniela.RECAUDACION_A_DISTRIBUIR) || 0
          });
        } else {
          resolve(null);
        }
      } catch (e) {
        resolve(null);
      }
    });
  });
}

// Limpiar directorio temporal
function limpiarDirectorio(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        fs.unlinkSync(path.join(dirPath, file));
      }
      fs.rmdirSync(dirPath);
    }
  } catch (e) {
    console.error('Error limpiando directorio:', e);
  }
}

// Guardar control previo en BD
// NOTA: Esta función es legacy - el guardado real ahora se hace automáticamente 
// en procesarZip() usando las nuevas tablas control_previo_quiniela/poceada
const guardarControlPrevio = async (req, res) => {
  try {
    // El guardado automático ya se realizó en procesarZip()
    // Esta función solo existe para mantener compatibilidad con el frontend
    return successResponse(res, null, 'Control previo guardado correctamente');

  } catch (error) {
    console.error('Error guardando control previo:', error);
    return errorResponse(res, 'Error guardando datos', 500);
  }
};

// Obtener historial de control previo
const getHistorial = async (req, res) => {
  try {
    const { fecha, juego } = req.query;

    let sql = `
      SELECT cp.*, j.nombre as juego_nombre, u.nombre as usuario_nombre
      FROM control_previo cp
      JOIN juegos j ON cp.juego_id = j.id
      JOIN usuarios u ON cp.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (fecha) {
      sql += ' AND cp.fecha = ?';
      params.push(fecha);
    }

    if (juego) {
      sql += ' AND j.codigo = ?';
      params.push(juego);
    }

    sql += ' ORDER BY cp.created_at DESC LIMIT 50';

    const historial = await query(sql, params);

    return successResponse(res, historial);

  } catch (error) {
    console.error('Error obteniendo historial:', error);
    return errorResponse(res, 'Error obteniendo historial', 500);
  }
};

module.exports = {
  procesarZip,
  guardarControlPrevio,
  getHistorial
};
