/**
 * Controlador de Programación de Sorteos
 * Maneja la carga de Excel de programación y consultas
 */

const { query } = require('../../config/database');
const { successResponse, errorResponse } = require('../../shared/helpers');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// Mapeo de modalidades
const MODALIDADES = {
  'LA PREVIA': { codigo: 'R', nombre: 'LA PREVIA' },
  'PREVIA': { codigo: 'R', nombre: 'LA PREVIA' },
  'LA PRIMERA': { codigo: 'P', nombre: 'LA PRIMERA' },
  'PRIMERA': { codigo: 'P', nombre: 'PRIMERA' },
  'MATUTINA': { codigo: 'M', nombre: 'MATUTINA' },
  'MATUTINO': { codigo: 'M', nombre: 'MATUTINA' },
  'VESPERTINA': { codigo: 'V', nombre: 'VESPERTINA' },
  'VESPERTINO': { codigo: 'V', nombre: 'VESPERTINA' },
  'NOCTURNA': { codigo: 'N', nombre: 'NOCTURNA' },
  'NOCTURNO': { codigo: 'N', nombre: 'NOCTURNA' }
};

// Mapeo de códigos de juegos del Excel a nombres internos
// El Excel muestra una columna "Juego" con formato "CODIGO NOMBRE" (ej: "0069 QUINI 6")
const JUEGOS_CONFIG = {
  '0080': { nombre: 'Quiniela', nombreCorto: 'QNL', tipo: 'quiniela' },
  '0069': { nombre: 'Quini 6', nombreCorto: 'Q6', tipo: 'loto' },
  '0013': { nombre: 'Brinco', nombreCorto: 'BRC', tipo: 'loto' },
  '0005': { nombre: 'Loto 5 Plus', nombreCorto: 'L5P', tipo: 'loto' },
  '0009': { nombre: 'Loto Plus Tradicional', nombreCorto: 'LPT', tipo: 'loto' },
  '0082': { nombre: 'Quiniela Poceada', nombreCorto: 'PCD', tipo: 'poceada' },
  '0023': { nombre: 'Tombolina', nombreCorto: 'TMB', tipo: 'tombolina' }
};

/**
 * Detectar el tipo de juego desde el valor de la columna "Juego"
 * @param {string} valorJuego - Valor de la celda (ej: "0069 QUINI 6")
 * @returns {Object} - Configuración del juego detectado
 */
function detectarJuego(valorJuego) {
  if (!valorJuego) return null;

  const valor = String(valorJuego).trim().toUpperCase();

  // Intentar extraer código del inicio (primeros 4 dígitos)
  const match = valor.match(/^(\d{4})\s*/);
  if (match) {
    const codigo = match[1];
    if (JUEGOS_CONFIG[codigo]) {
      return { ...JUEGOS_CONFIG[codigo], codigo };
    }
  }

  // Fallback: buscar por nombre
  if (valor.includes('QUINI 6') || valor.includes('QUINI6')) {
    return { ...JUEGOS_CONFIG['0069'], codigo: '0069' };
  }
  if (valor.includes('BRINCO')) {
    return { ...JUEGOS_CONFIG['0013'], codigo: '0013' };
  }
  if (valor.includes('LOTO 5 PLUS') || valor.includes('LOTO5PLUS')) {
    return { ...JUEGOS_CONFIG['0005'], codigo: '0005' };
  }
  if (valor.includes('LOTO PLUS TRADICIONAL')) {
    return { ...JUEGOS_CONFIG['0009'], codigo: '0009' };
  }
  if (valor.includes('POCEADA')) {
    return { ...JUEGOS_CONFIG['0082'], codigo: '0082' };
  }
  if (valor.includes('TOMBOLINA')) {
    return { ...JUEGOS_CONFIG['0023'], codigo: '0023' };
  }
  if (valor.includes('QUINIELA') && !valor.includes('POCEADA')) {
    return { ...JUEGOS_CONFIG['0080'], codigo: '0080' };
  }

  return null;
}

// Mapeo de columnas del Excel de Quiniela a campos de BD
// Incluye variantes con/sin puntos, espacios, etc.
const COLUMNAS_QUINIELA = {
  // Columnas principales
  'SORTEO': 'numero_sorteo',
  'JUEGO': 'juego',
  'FECHA': 'fecha_sorteo',
  'HORA': 'hora_sorteo',

  // CABA
  'CDAD': 'prov_caba',
  'CDAD.': 'prov_caba',
  'CABA': 'prov_caba',

  // Buenos Aires - todas las variantes
  'BS.AS': 'prov_bsas',
  'BS. AS': 'prov_bsas',
  'BS AS': 'prov_bsas',
  'BS.AS.': 'prov_bsas',
  'BS. AS.': 'prov_bsas',
  'BSAS': 'prov_bsas',

  // Córdoba
  'CBA': 'prov_cordoba',
  'CBA.': 'prov_cordoba',
  'CORDOBA': 'prov_cordoba',

  // Santa Fe
  'STA.FE': 'prov_santafe',
  'STA. FE': 'prov_santafe',
  'STA FE': 'prov_santafe',
  'STA.FE.': 'prov_santafe',
  'STA. FE.': 'prov_santafe',
  'SANTAFE': 'prov_santafe',
  'SANTA FE': 'prov_santafe',

  // Uruguay/Montevideo
  'URU': 'prov_montevideo',
  'URU.': 'prov_montevideo',
  'URUGUAY': 'prov_montevideo',
  'MONTEVIDEO': 'prov_montevideo',

  // Santiago del Estero
  'STGO': 'prov_santiago',
  'STGO.': 'prov_santiago',
  'SANTIAGO': 'prov_santiago',

  // Mendoza
  'MZA': 'prov_mendoza',
  'MZA.': 'prov_mendoza',
  'MENDOZA': 'prov_mendoza',

  // Entre Ríos - todas las variantes
  'E.RS': 'prov_entrerios',
  'E. RS': 'prov_entrerios',
  'E RS': 'prov_entrerios',
  'ERS': 'prov_entrerios',
  'ETRS': 'prov_entrerios',
  'ETRS.': 'prov_entrerios',
  'E.ROS': 'prov_entrerios',
  'ENTRERIOS': 'prov_entrerios',
  'ENTRE RIOS': 'prov_entrerios',

  // Tipo/Modalidad
  'TIPO': 'modalidad_nombre',

  // Fechas de pago
  'INICIO PAGO PREMIOS': 'fecha_inicio_pago',
  'INICIO PAGO UTE SISTEMA': 'inicio_pago_ute',
  'PRESCRIPCION': 'fecha_prescripcion',
  'PRESCRIPCIÓN': 'fecha_prescripcion',

  // Apertura ventas
  'FECHA APE. VTAS.': 'fecha_apertura_vtas',
  'FECHA APE.VTAS.': 'fecha_apertura_vtas',
  'FECHA APE VTAS': 'fecha_apertura_vtas',
  'HORA APE.': 'hora_apertura_vtas',
  'HORA APE. VTAS.': 'hora_apertura_vtas',
  'HORA APE.VTAS.': 'hora_apertura_vtas',
  'HORA APE VTAS': 'hora_apertura_vtas',

  // Cierre ventas
  'FECHA CIE. VTAS.': 'fecha_cierre_vtas',
  'FECHA CIE.VTAS.': 'fecha_cierre_vtas',
  'FECHA CIE VTAS': 'fecha_cierre_vtas',
  'HORA CIE.': 'hora_cierre_vtas',
  'HORA CIE. VTAS.': 'hora_cierre_vtas',
  'HORA CIE.VTAS.': 'hora_cierre_vtas',
  'HORA CIE VTAS': 'hora_cierre_vtas',

  // Días
  'DIAS': 'dias_vta'
};

/**
 * Cargar Excel de programación de Quiniela
 */
const cargarExcelQuiniela = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No se proporcionó archivo Excel', 400);
    }

    const filePath = req.file.path;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      fs.unlinkSync(filePath);
      return errorResponse(res, 'El archivo Excel está vacío', 400);
    }

    // Buscar la fila de headers (buscar en las primeras 10 filas)
    let headerRowNum = 1;
    let headers = [];
    let columnMap = {};

    for (let rowNum = 1; rowNum <= 10; rowNum++) {
      const row = worksheet.getRow(rowNum);
      const tempHeaders = [];
      const tempColumnMap = {};

      row.eachCell((cell, colNumber) => {
        let value = '';
        if (cell.value) {
          // Manejar celdas con texto enriquecido
          if (typeof cell.value === 'object' && cell.value.richText) {
            value = cell.value.richText.map(rt => rt.text).join('');
          } else {
            value = String(cell.value);
          }
        }
        value = value.toUpperCase().trim();
        tempHeaders[colNumber] = value;

        const campo = COLUMNAS_QUINIELA[value];
        if (campo) {
          tempColumnMap[campo] = colNumber;
        }
      });

      // Si encontramos SORTEO y FECHA, esta es la fila de headers
      if (tempColumnMap['numero_sorteo'] && tempColumnMap['fecha_sorteo']) {
        headerRowNum = rowNum;
        headers = tempHeaders;
        columnMap = tempColumnMap;
        console.log(`Headers encontrados en fila ${rowNum}:`, Object.keys(tempColumnMap));
        break;
      }
    }

    // Verificar columnas obligatorias
    if (!columnMap['numero_sorteo'] || !columnMap['fecha_sorteo']) {
      fs.unlinkSync(filePath);
      // Mostrar qué headers se encontraron para debug
      const headersEncontrados = headers.filter(h => h).join(', ');
      return errorResponse(res, `El Excel no tiene las columnas obligatorias (SORTEO, FECHA). Headers encontrados: ${headersEncontrados}`, 400);
    }

    // Procesar filas (empezando después de los headers)
    const registros = [];
    const mesSet = new Set();

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNum) return; // Skip header y filas anteriores

      const registro = {
        juego: 'Quiniela',
        numero_sorteo: null,
        fecha_sorteo: null,
        hora_sorteo: null,
        modalidad_codigo: null,
        modalidad_nombre: null,
        prov_caba: 0,
        prov_bsas: 0,
        prov_cordoba: 0,
        prov_santafe: 0,
        prov_montevideo: 0,
        prov_santiago: 0,
        prov_mendoza: 0,
        prov_entrerios: 0,
        fecha_inicio_pago: null,
        inicio_pago_ute: null,
        fecha_prescripcion: null,
        fecha_apertura_vtas: null,
        hora_apertura_vtas: null,
        fecha_cierre_vtas: null,
        hora_cierre_vtas: null,
        dias_vta: null
      };

      // Extraer valores
      for (const [campo, colIndex] of Object.entries(columnMap)) {
        const cell = row.getCell(colIndex);
        let value = cell.value;

        // Manejar fechas
        if (value instanceof Date) {
          if (campo.includes('fecha')) {
            value = value.toISOString().split('T')[0];
          } else if (campo.includes('hora')) {
            value = value.toTimeString().split(' ')[0];
          }
        }

        // Manejar valores numéricos para provincias
        // Si hay CUALQUIER número (1,2,3,4,5,6,7) significa que juega esa provincia
        // Si está vacío o null, no juega
        if (campo.startsWith('prov_')) {
          // Considerar habilitado si tiene cualquier valor numérico > 0
          const numValue = parseInt(value, 10);
          value = (!isNaN(numValue) && numValue > 0) ? 1 : 0;
        }

        // Manejar modalidad
        if (campo === 'modalidad_nombre' && value) {
          const modalidad = MODALIDADES[String(value).toUpperCase().trim()];
          if (modalidad) {
            registro.modalidad_codigo = modalidad.codigo;
            registro.modalidad_nombre = modalidad.nombre;
          } else {
            registro.modalidad_nombre = String(value).toUpperCase().trim();
          }
        } else if (campo === 'juego') {
          // Ignorar el valor del Excel, siempre usar 'Quiniela' para esta carga
          // El valor viene como "0080 QUINIELA" del Excel
        } else {
          registro[campo] = value;
        }
      }

      // Forzar juego = Quiniela (ya que esta función es cargarExcelQuiniela)
      registro.juego = 'Quiniela';

      // Validar registro mínimo
      if (registro.numero_sorteo && registro.fecha_sorteo) {
        registros.push(registro);

        // Extraer mes
        if (registro.fecha_sorteo) {
          const fecha = new Date(registro.fecha_sorteo);
          mesSet.add(`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`);
        }
      }
    });

    // Limpiar archivo temporal
    fs.unlinkSync(filePath);

    if (registros.length === 0) {
      return errorResponse(res, 'No se encontraron registros válidos en el Excel', 400);
    }

    // Determinar mes de carga
    const meses = Array.from(mesSet).sort();
    const mesCarga = meses[0] || new Date().toISOString().slice(0, 7);

    // Insertar/actualizar en BD
    let insertados = 0;
    let actualizados = 0;

    for (const reg of registros) {
      try {
        // Intentar insertar
        await query(`
          INSERT INTO programacion_sorteos (
            juego, numero_sorteo, fecha_sorteo, hora_sorteo,
            modalidad_codigo, modalidad_nombre,
            prov_caba, prov_bsas, prov_cordoba, prov_santafe,
            prov_montevideo, prov_santiago, prov_mendoza, prov_entrerios,
            fecha_inicio_pago, inicio_pago_ute, fecha_prescripcion,
            fecha_apertura_vtas, hora_apertura_vtas, fecha_cierre_vtas, hora_cierre_vtas,
            dias_vta, mes_carga, archivo_origen
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            fecha_sorteo = VALUES(fecha_sorteo),
            hora_sorteo = VALUES(hora_sorteo),
            modalidad_codigo = VALUES(modalidad_codigo),
            modalidad_nombre = VALUES(modalidad_nombre),
            prov_caba = VALUES(prov_caba),
            prov_bsas = VALUES(prov_bsas),
            prov_cordoba = VALUES(prov_cordoba),
            prov_santafe = VALUES(prov_santafe),
            prov_montevideo = VALUES(prov_montevideo),
            prov_santiago = VALUES(prov_santiago),
            prov_mendoza = VALUES(prov_mendoza),
            prov_entrerios = VALUES(prov_entrerios),
            fecha_inicio_pago = VALUES(fecha_inicio_pago),
            inicio_pago_ute = VALUES(inicio_pago_ute),
            fecha_prescripcion = VALUES(fecha_prescripcion),
            fecha_apertura_vtas = VALUES(fecha_apertura_vtas),
            hora_apertura_vtas = VALUES(hora_apertura_vtas),
            fecha_cierre_vtas = VALUES(fecha_cierre_vtas),
            hora_cierre_vtas = VALUES(hora_cierre_vtas),
            dias_vta = VALUES(dias_vta),
            mes_carga = VALUES(mes_carga),
            archivo_origen = VALUES(archivo_origen),
            updated_at = CURRENT_TIMESTAMP
        `, [
          reg.juego, reg.numero_sorteo, reg.fecha_sorteo, reg.hora_sorteo,
          reg.modalidad_codigo, reg.modalidad_nombre,
          reg.prov_caba, reg.prov_bsas, reg.prov_cordoba, reg.prov_santafe,
          reg.prov_montevideo, reg.prov_santiago, reg.prov_mendoza, reg.prov_entrerios,
          reg.fecha_inicio_pago, reg.inicio_pago_ute, reg.fecha_prescripcion,
          reg.fecha_apertura_vtas, reg.hora_apertura_vtas, reg.fecha_cierre_vtas, reg.hora_cierre_vtas,
          reg.dias_vta, mesCarga, req.file.originalname
        ]);
        insertados++;
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          actualizados++;
        } else {
          console.error('Error insertando registro:', err.message);
        }
      }
    }

    // Registrar carga
    await query(`
      INSERT INTO programacion_cargas (juego, mes_carga, archivo_nombre, registros_cargados, registros_actualizados, usuario_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, ['Quiniela', mesCarga, req.file.originalname, insertados, actualizados, req.user?.id || null]);

    return successResponse(res, {
      registrosProcesados: registros.length,
      insertados,
      actualizados,
      mesCarga,
      archivo: req.file.originalname
    }, `Programación cargada: ${insertados} nuevos, ${actualizados} actualizados`);

  } catch (error) {
    console.error('Error cargando Excel:', error);
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { }
    }
    return errorResponse(res, 'Error procesando archivo: ' + error.message, 500);
  }
};

/**
 * Cargar Excel de programación con DETECCIÓN AUTOMÁTICA del juego
 * Lee la columna "Juego" del Excel para identificar el tipo de juego
 * Soporta: Quiniela, Quini 6, Brinco, Loto 5 Plus, Loto Plus Tradicional, Poceada, Tombolina
 */
const cargarExcelGenerico = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No se proporcionó archivo Excel', 400);
    }

    const filePath = req.file.path;
    const extension = path.extname(req.file.originalname).toLowerCase();

    // ExcelJS solo soporta .xlsx (formato ZIP)
    if (extension === '.xls') {
      fs.unlinkSync(filePath);
      return errorResponse(res, 'El formato .xls (Excel 97-2003) no es compatible. Por favor, abra el archivo y guárdelo como "Libro de Excel (.xlsx)" antes de volver a cargarlo.', 400);
    }

    const workbook = new ExcelJS.Workbook();

    try {
      await workbook.xlsx.readFile(filePath);
    } catch (zipError) {
      fs.unlinkSync(filePath);
      if (zipError.message.includes('end of central directory')) {
        return errorResponse(res, 'El archivo no es un Excel válido (.xlsx). Si es un archivo .xls antiguo, debe convertirlo a .xlsx.', 400);
      }
      throw zipError;
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      fs.unlinkSync(filePath);
      return errorResponse(res, 'El archivo Excel está vacío', 400);
    }


    // Buscar la fila de headers (buscar en las primeras 10 filas)
    let headerRowNum = 1;
    let headers = [];
    let columnMap = {};

    for (let rowNum = 1; rowNum <= 10; rowNum++) {
      const row = worksheet.getRow(rowNum);
      const tempHeaders = [];
      const tempColumnMap = {};

      row.eachCell((cell, colNumber) => {
        let value = '';
        if (cell.value) {
          if (typeof cell.value === 'object' && cell.value.richText) {
            value = cell.value.richText.map(rt => rt.text).join('');
          } else {
            value = String(cell.value);
          }
        }
        value = value.toUpperCase().trim();
        tempHeaders[colNumber] = value;

        const campo = COLUMNAS_QUINIELA[value];
        if (campo) {
          tempColumnMap[campo] = colNumber;
        }
      });

      // Si encontramos SORTEO y FECHA, esta es la fila de headers
      if (tempColumnMap['numero_sorteo'] && tempColumnMap['fecha_sorteo']) {
        headerRowNum = rowNum;
        headers = tempHeaders;
        columnMap = tempColumnMap;
        console.log(`Headers encontrados en fila ${rowNum}:`, Object.keys(tempColumnMap));
        break;
      }
    }

    // Verificar columnas obligatorias
    if (!columnMap['numero_sorteo'] || !columnMap['fecha_sorteo']) {
      fs.unlinkSync(filePath);
      const headersEncontrados = headers.filter(h => h).join(', ');
      return errorResponse(res, `El Excel no tiene las columnas obligatorias (SORTEO, FECHA). Headers encontrados: ${headersEncontrados}`, 400);
    }

    // Procesar filas (empezando después de los headers)
    const registrosPorJuego = {}; // Agrupar por juego detectado
    const mesSet = new Set();
    let juegosDetectados = new Set();

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNum) return; // Skip header y filas anteriores

      // Detectar el juego desde la columna JUEGO
      let juegoDetectado = null;
      if (columnMap['juego']) {
        const cellJuego = row.getCell(columnMap['juego']);
        let valorJuego = cellJuego.value;
        if (typeof valorJuego === 'object' && valorJuego.richText) {
          valorJuego = valorJuego.richText.map(rt => rt.text).join('');
        }
        juegoDetectado = detectarJuego(valorJuego);
      }

      // Si no se detectó juego, usar "Desconocido"
      const nombreJuego = juegoDetectado ? juegoDetectado.nombre : 'Desconocido';
      juegosDetectados.add(nombreJuego);

      const registro = {
        juego: nombreJuego,
        codigo_juego: juegoDetectado?.codigo || null,
        tipo_juego: juegoDetectado?.tipo || null,
        numero_sorteo: null,
        fecha_sorteo: null,
        hora_sorteo: null,
        modalidad_codigo: null,
        modalidad_nombre: null,
        prov_caba: 0,
        prov_bsas: 0,
        prov_cordoba: 0,
        prov_santafe: 0,
        prov_montevideo: 0,
        prov_santiago: 0,
        prov_mendoza: 0,
        prov_entrerios: 0,
        fecha_inicio_pago: null,
        inicio_pago_ute: null,
        fecha_prescripcion: null,
        fecha_apertura_vtas: null,
        hora_apertura_vtas: null,
        fecha_cierre_vtas: null,
        hora_cierre_vtas: null,
        dias_vta: null
      };

      // Extraer valores
      for (const [campo, colIndex] of Object.entries(columnMap)) {
        const cell = row.getCell(colIndex);
        let value = cell.value;

        // Manejar fechas
        if (value instanceof Date) {
          if (campo.includes('fecha')) {
            value = value.toISOString().split('T')[0];
          } else if (campo.includes('hora')) {
            value = value.toTimeString().split(' ')[0];
          }
        }

        // Manejar valores numéricos para provincias
        if (campo.startsWith('prov_')) {
          const numValue = parseInt(value, 10);
          value = (!isNaN(numValue) && numValue > 0) ? 1 : 0;
        }

        // Manejar modalidad
        if (campo === 'modalidad_nombre' && value) {
          const modalidad = MODALIDADES[String(value).toUpperCase().trim()];
          if (modalidad) {
            registro.modalidad_codigo = modalidad.codigo;
            registro.modalidad_nombre = modalidad.nombre;
          } else {
            registro.modalidad_nombre = String(value).toUpperCase().trim();
          }
        } else if (campo !== 'juego') {
          // No sobrescribir el juego detectado
          registro[campo] = value;
        }
      }

      // Validar registro mínimo
      if (registro.numero_sorteo && registro.fecha_sorteo) {
        if (!registrosPorJuego[nombreJuego]) {
          registrosPorJuego[nombreJuego] = [];
        }
        registrosPorJuego[nombreJuego].push(registro);

        // Extraer mes
        if (registro.fecha_sorteo) {
          const fecha = new Date(registro.fecha_sorteo);
          mesSet.add(`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`);
        }
      }
    });

    // Limpiar archivo temporal
    fs.unlinkSync(filePath);

    const totalRegistros = Object.values(registrosPorJuego).reduce((sum, arr) => sum + arr.length, 0);

    if (totalRegistros === 0) {
      return errorResponse(res, 'No se encontraron registros válidos en el Excel', 400);
    }

    // Determinar mes de carga
    const meses = Array.from(mesSet).sort();
    const mesCarga = meses[0] || new Date().toISOString().slice(0, 7);

    // Insertar/actualizar en BD
    let insertados = 0;
    let actualizados = 0;
    const resumenJuegos = {};

    for (const [juego, registros] of Object.entries(registrosPorJuego)) {
      resumenJuegos[juego] = { total: registros.length, insertados: 0, actualizados: 0 };

      for (const reg of registros) {
        try {
          await query(`
            INSERT INTO programacion_sorteos (
              juego, codigo_juego, tipo_juego, numero_sorteo, fecha_sorteo, hora_sorteo,
              modalidad_codigo, modalidad_nombre,
              prov_caba, prov_bsas, prov_cordoba, prov_santafe,
              prov_montevideo, prov_santiago, prov_mendoza, prov_entrerios,
              fecha_inicio_pago, inicio_pago_ute, fecha_prescripcion,
              fecha_apertura_vtas, hora_apertura_vtas, fecha_cierre_vtas, hora_cierre_vtas,
              dias_vta, mes_carga, archivo_origen
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              fecha_sorteo = VALUES(fecha_sorteo),
              hora_sorteo = VALUES(hora_sorteo),
              modalidad_codigo = VALUES(modalidad_codigo),
              modalidad_nombre = VALUES(modalidad_nombre),
              prov_caba = VALUES(prov_caba),
              prov_bsas = VALUES(prov_bsas),
              prov_cordoba = VALUES(prov_cordoba),
              prov_santafe = VALUES(prov_santafe),
              prov_montevideo = VALUES(prov_montevideo),
              prov_santiago = VALUES(prov_santiago),
              prov_mendoza = VALUES(prov_mendoza),
              prov_entrerios = VALUES(prov_entrerios),
              fecha_inicio_pago = VALUES(fecha_inicio_pago),
              inicio_pago_ute = VALUES(inicio_pago_ute),
              fecha_prescripcion = VALUES(fecha_prescripcion),
              fecha_apertura_vtas = VALUES(fecha_apertura_vtas),
              hora_apertura_vtas = VALUES(hora_apertura_vtas),
              fecha_cierre_vtas = VALUES(fecha_cierre_vtas),
              hora_cierre_vtas = VALUES(hora_cierre_vtas),
              dias_vta = VALUES(dias_vta),
              mes_carga = VALUES(mes_carga),
              archivo_origen = VALUES(archivo_origen),
              updated_at = CURRENT_TIMESTAMP
          `, [
            reg.juego, reg.codigo_juego, reg.tipo_juego, reg.numero_sorteo, reg.fecha_sorteo, reg.hora_sorteo,
            reg.modalidad_codigo, reg.modalidad_nombre,
            reg.prov_caba, reg.prov_bsas, reg.prov_cordoba, reg.prov_santafe,
            reg.prov_montevideo, reg.prov_santiago, reg.prov_mendoza, reg.prov_entrerios,
            reg.fecha_inicio_pago, reg.inicio_pago_ute, reg.fecha_prescripcion,
            reg.fecha_apertura_vtas, reg.hora_apertura_vtas, reg.fecha_cierre_vtas, reg.hora_cierre_vtas,
            reg.dias_vta, mesCarga, req.file.originalname
          ]);
          insertados++;
          resumenJuegos[juego].insertados++;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            actualizados++;
            resumenJuegos[juego].actualizados++;
          } else {
            console.error('Error insertando registro:', err.message);
          }
        }
      }

      // Registrar carga por juego
      await query(`
        INSERT INTO programacion_cargas (juego, mes_carga, archivo_nombre, registros_cargados, registros_actualizados, usuario_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [juego, mesCarga, req.file.originalname, resumenJuegos[juego].insertados, resumenJuegos[juego].actualizados, req.user?.id || null]);
    }

    const juegosLista = Array.from(juegosDetectados).join(', ');

    return successResponse(res, {
      registrosProcesados: totalRegistros,
      insertados,
      actualizados,
      mesCarga,
      archivo: req.file.originalname,
      juegosDetectados: Array.from(juegosDetectados),
      resumenPorJuego: resumenJuegos
    }, `Programación cargada: ${insertados} nuevos, ${actualizados} actualizados. Juegos: ${juegosLista}`);

  } catch (error) {
    console.error('Error cargando Excel:', error);
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { }
    }
    return errorResponse(res, 'Error procesando archivo: ' + error.message, 500);
  }
};

/**
 * Obtener sorteos por fecha
 */
const getSorteosPorFecha = async (req, res) => {
  try {
    const { fecha, juego } = req.query;

    if (!fecha) {
      return errorResponse(res, 'Fecha requerida', 400);
    }

    let sql = `
      SELECT * FROM programacion_sorteos 
      WHERE fecha_sorteo = ? AND activo = 1
    `;
    const params = [fecha];

    if (juego) {
      sql += ' AND juego = ?';
      params.push(juego);
    }

    sql += ' ORDER BY hora_sorteo ASC';

    const sorteos = await query(sql, params);

    return successResponse(res, sorteos, `${sorteos.length} sorteos encontrados`);
  } catch (error) {
    console.error('Error obteniendo sorteos:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * Obtener sorteo por número
 */
const getSorteoPorNumero = async (req, res) => {
  try {
    const { numero } = req.params;
    const { juego } = req.query;

    let sql = 'SELECT * FROM programacion_sorteos WHERE numero_sorteo = ?';
    const params = [numero];

    if (juego) {
      sql += ' AND juego = ?';
      params.push(juego);
    }

    const sorteos = await query(sql, params);

    if (sorteos.length === 0) {
      return errorResponse(res, 'Sorteo no encontrado en programación', 404);
    }

    return successResponse(res, sorteos[0]);
  } catch (error) {
    console.error('Error obteniendo sorteo:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * Listar programación con filtros
 */
const listarProgramacion = async (req, res) => {
  try {
    const { juego, mes, modalidad, limit = 100, offset = 0 } = req.query;

    let sql = 'SELECT * FROM programacion_sorteos WHERE activo = 1';
    const params = [];

    if (juego) {
      sql += ' AND juego = ?';
      params.push(juego);
    }

    if (mes) {
      sql += ' AND mes_carga = ?';
      params.push(mes);
    }

    if (modalidad) {
      sql += ' AND modalidad_codigo = ?';
      params.push(modalidad);
    }

    sql += ' ORDER BY fecha_sorteo DESC, hora_sorteo ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const sorteos = await query(sql, params);

    // Contar total
    let countSql = 'SELECT COUNT(*) as total FROM programacion_sorteos WHERE activo = 1';
    const countParams = [];
    if (juego) { countSql += ' AND juego = ?'; countParams.push(juego); }
    if (mes) { countSql += ' AND mes_carga = ?'; countParams.push(mes); }
    if (modalidad) { countSql += ' AND modalidad_codigo = ?'; countParams.push(modalidad); }

    const [{ total }] = await query(countSql, countParams);

    return successResponse(res, { sorteos, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (error) {
    console.error('Error listando programación:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * Validar provincias de un sorteo vs datos NTF
 * Recibe número de sorteo y provincias encontradas en el NTF
 * Devuelve validación de cuáles están habilitadas y cuáles no
 */
const validarProvincias = async (req, res) => {
  try {
    const { numeroSorteo, provinciasNTF } = req.body;

    if (!numeroSorteo) {
      return errorResponse(res, 'Número de sorteo requerido', 400);
    }

    // Buscar sorteo en programación
    const sorteos = await query(
      'SELECT * FROM programacion_sorteos WHERE numero_sorteo = ? AND juego = ?',
      [numeroSorteo, 'Quiniela']
    );

    if (sorteos.length === 0) {
      return successResponse(res, {
        encontrado: false,
        mensaje: 'Sorteo no encontrado en programación',
        validacion: null
      });
    }

    const sorteo = sorteos[0];

    // Mapeo de índice NTF a campo de BD
    const mapeoProvincias = {
      0: { campo: 'prov_caba', nombre: 'CABA', codigo: '51' },
      1: { campo: 'prov_bsas', nombre: 'Buenos Aires', codigo: '53' },
      2: { campo: 'prov_cordoba', nombre: 'Córdoba', codigo: '55' },
      3: { campo: 'prov_santafe', nombre: 'Santa Fe', codigo: '72' },
      4: { campo: 'prov_montevideo', nombre: 'Montevideo', codigo: '00' },
      5: { campo: 'prov_mendoza', nombre: 'Mendoza', codigo: '64' },
      6: { campo: 'prov_entrerios', nombre: 'Entre Ríos', codigo: '59' }
      // Santiago (STGO) no tiene posición en el NTF estándar
    };

    const validacion = {
      sorteo: {
        numero: sorteo.numero_sorteo,
        fecha: sorteo.fecha_sorteo,
        hora: sorteo.hora_sorteo,
        modalidad: sorteo.modalidad_nombre,
        modalidad_codigo: sorteo.modalidad_codigo,
        // Incluir datos de provincias para el acta
        prov_caba: sorteo.prov_caba,
        prov_bsas: sorteo.prov_bsas,
        prov_cordoba: sorteo.prov_cordoba,
        prov_santafe: sorteo.prov_santafe,
        prov_montevideo: sorteo.prov_montevideo,
        prov_mendoza: sorteo.prov_mendoza,
        prov_entrerios: sorteo.prov_entrerios
      },
      provincias: [],
      errores: [],
      warnings: []
    };

    // Validar cada provincia
    for (const [index, prov] of Object.entries(mapeoProvincias)) {
      const habilitada = sorteo[prov.campo] === 1;
      const tieneApuestas = provinciasNTF && provinciasNTF[index] && provinciasNTF[index].registros > 0;

      const estado = {
        indice: parseInt(index),
        nombre: prov.nombre,
        codigo: prov.codigo,
        habilitada,
        tieneApuestas,
        registros: provinciasNTF?.[index]?.registros || 0,
        recaudacion: provinciasNTF?.[index]?.recaudacion || 0
      };

      if (!habilitada && tieneApuestas) {
        estado.error = true;
        validacion.errores.push({
          provincia: prov.nombre,
          mensaje: `Provincia ${prov.nombre} NO está habilitada pero tiene ${estado.registros} apuestas`,
          registros: estado.registros,
          recaudacion: estado.recaudacion
        });
      } else if (habilitada && !tieneApuestas) {
        estado.warning = true;
        validacion.warnings.push({
          provincia: prov.nombre,
          mensaje: `Provincia ${prov.nombre} está habilitada pero no tiene apuestas`
        });
      }

      validacion.provincias.push(estado);
    }

    return successResponse(res, {
      encontrado: true,
      validacion
    });

  } catch (error) {
    console.error('Error validando provincias:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * Obtener historial de cargas
 */
const getHistorialCargas = async (req, res) => {
  try {
    const { juego, limit = 20 } = req.query;

    let sql = `
      SELECT pc.*, u.nombre as usuario_nombre
      FROM programacion_cargas pc
      LEFT JOIN usuarios u ON pc.usuario_id = u.id
    `;
    const params = [];

    if (juego) {
      sql += ' WHERE pc.juego = ?';
      params.push(juego);
    }

    sql += ' ORDER BY pc.created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const cargas = await query(sql, params);

    return successResponse(res, cargas);
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * Borrar toda la programación de un juego
 */
const borrarProgramacion = async (req, res) => {
  try {
    const { juego } = req.body;

    if (!juego) {
      return errorResponse(res, 'Debe especificar el juego', 400);
    }

    // Borrar sorteos
    const resultSorteos = await query(
      'DELETE FROM programacion_sorteos WHERE juego = ?',
      [juego]
    );

    // Borrar historial de cargas
    const resultCargas = await query(
      'DELETE FROM programacion_cargas WHERE juego = ?',
      [juego]
    );

    return successResponse(res, {
      sorteosEliminados: resultSorteos.affectedRows,
      cargasEliminadas: resultCargas.affectedRows
    }, `Programación de ${juego} eliminada correctamente`);

  } catch (error) {
    console.error('Error borrando programación:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * Obtener sorteos del día para el Dashboard
 * Incluye estado de procesamiento (pendiente, control previo, escrutado)
 */
const getSorteosDelDia = async (req, res) => {
  try {
    const { fecha } = req.query;

    // Usar fecha actual si no se especifica
    const fechaConsulta = fecha || new Date().toISOString().split('T')[0];

    // Obtener sorteos programados para la fecha
    const sorteos = await query(`
      SELECT * FROM programacion_sorteos 
      WHERE fecha_sorteo = ? AND activo = 1
      ORDER BY hora_sorteo ASC, juego ASC
    `, [fechaConsulta]);

    // Buscar datos de Control Previo y Escrutinio para cada sorteo
    const controlPrevioData = await query(`
      SELECT numero_sorteo, modalidad, total_recaudacion, total_tickets, total_apuestas, total_anulados
      FROM control_previo_quiniela
      WHERE fecha = ? ORDER BY id DESC
    `, [fechaConsulta]).catch(() => []);

    const escrutinioData = await query(`
      SELECT numero_sorteo, modalidad, total_premios, total_ganadores
      FROM escrutinio_quiniela
      WHERE fecha = ? ORDER BY id DESC
    `, [fechaConsulta]).catch(() => []);

    // Indexar por número de sorteo
    const cpMap = {};
    controlPrevioData.forEach(cp => { if (!cpMap[cp.numero_sorteo]) cpMap[cp.numero_sorteo] = cp; });
    const escMap = {};
    escrutinioData.forEach(esc => { if (!escMap[esc.numero_sorteo]) escMap[esc.numero_sorteo] = esc; });

    const sorteosConEstado = sorteos.map(s => {
      const cp = cpMap[s.numero_sorteo] || null;
      const esc = escMap[s.numero_sorteo] || null;

      let estado = 'pendiente';
      let estadoColor = 'secondary';
      let estadoIcono = 'clock';

      if (esc) {
        estado = 'escrutado';
        estadoColor = 'success';
        estadoIcono = 'check-circle';
      } else if (cp) {
        estado = 'control_previo';
        estadoColor = 'primary';
        estadoIcono = 'clipboard-check';
      }

      return {
        id: s.id,
        numero_sorteo: s.numero_sorteo,
        juego: s.juego,
        fecha_sorteo: s.fecha_sorteo,
        hora_sorteo: s.hora_sorteo,
        modalidad_codigo: s.modalidad_codigo,
        modalidad_nombre: s.modalidad_nombre,
        provincias: {
          caba: s.prov_caba,
          bsas: s.prov_bsas,
          cordoba: s.prov_cordoba,
          santafe: s.prov_santafe,
          montevideo: s.prov_montevideo,
          mendoza: s.prov_mendoza,
          entrerios: s.prov_entrerios
        },
        estado,
        estadoColor,
        estadoIcono,
        controlPrevio: cp ? {
          recaudacion: parseFloat(cp.total_recaudacion) || 0,
          tickets: cp.total_tickets || 0,
          apuestas: cp.total_apuestas || 0,
          anulados: cp.total_anulados || 0
        } : null,
        controlPosterior: esc ? {
          premiosPagados: parseFloat(esc.total_premios) || 0,
          ganadores: esc.total_ganadores || 0
        } : null
      };
    });

    // Estadísticas
    const estadisticas = {
      total: sorteosConEstado.length,
      pendientes: sorteosConEstado.filter(s => s.estado === 'pendiente').length,
      controlPrevio: sorteosConEstado.filter(s => s.estado === 'control_previo').length,
      escrutados: sorteosConEstado.filter(s => s.estado === 'escrutado').length,
      recaudacionTotal: sorteosConEstado.reduce((sum, s) => sum + (s.controlPrevio?.recaudacion || 0), 0),
      premiosTotales: sorteosConEstado.reduce((sum, s) => sum + (s.controlPosterior?.premiosPagados || 0), 0)
    };

    return successResponse(res, {
      fecha: fechaConsulta,
      sorteos: sorteosConEstado,
      estadisticas
    });

  } catch (error) {
    console.error('Error obteniendo sorteos del día:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

/**
 * Verificar sorteo por fecha y modalidad
 * GET /api/programacion/verificar?fecha=YYYY-MM-DD&modalidad=R&juego=Quiniela
 * Devuelve el sorteo programado si existe, o error si no
 */
const verificarSorteo = async (req, res) => {
  try {
    const { fecha, modalidad, juego = 'Quiniela' } = req.query;

    if (!fecha || !modalidad) {
      return errorResponse(res, 'Fecha y modalidad son requeridos', 400);
    }

    // Buscar sorteo en programación por fecha y modalidad
    const sorteos = await query(`
      SELECT * FROM programacion_sorteos
      WHERE fecha_sorteo = ?
        AND modalidad_codigo = ?
        AND juego = ?
        AND activo = 1
    `, [fecha, modalidad, juego]);

    if (sorteos.length === 0) {
      // No encontrado - buscar qué modalidades SÍ hay para esa fecha
      const disponibles = await query(`
        SELECT modalidad_codigo, modalidad_nombre, numero_sorteo
        FROM programacion_sorteos
        WHERE fecha_sorteo = ? AND juego = ? AND activo = 1
        ORDER BY hora_sorteo
      `, [fecha, juego]);

      const modalidadNombre = {
        'R': 'LA PREVIA', 'P': 'LA PRIMERA', 'M': 'MATUTINA',
        'V': 'VESPERTINA', 'N': 'NOCTURNA'
      }[modalidad] || modalidad;

      return successResponse(res, {
        encontrado: false,
        mensaje: `No hay sorteo de ${modalidadNombre} programado para ${fecha}`,
        modalidadesProgramadas: disponibles.map(d => ({
          codigo: d.modalidad_codigo,
          nombre: d.modalidad_nombre,
          numeroSorteo: d.numero_sorteo
        }))
      });
    }

    const sorteo = sorteos[0];

    return successResponse(res, {
      encontrado: true,
      sorteo: {
        id: sorteo.id,
        numeroSorteo: sorteo.numero_sorteo,
        fecha: sorteo.fecha_sorteo,
        hora: sorteo.hora_sorteo,
        modalidad_codigo: sorteo.modalidad_codigo,
        modalidad_nombre: sorteo.modalidad_nombre,
        provincias: {
          caba: sorteo.prov_caba,
          bsas: sorteo.prov_bsas,
          cordoba: sorteo.prov_cordoba,
          santafe: sorteo.prov_santafe,
          montevideo: sorteo.prov_montevideo,
          mendoza: sorteo.prov_mendoza,
          entrerios: sorteo.prov_entrerios
        }
      }
    });

  } catch (error) {
    console.error('Error verificando sorteo:', error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  }
};

module.exports = {
  cargarExcelQuiniela,
  cargarExcelGenerico,
  getSorteosPorFecha,
  getSorteoPorNumero,
  listarProgramacion,
  validarProvincias,
  getHistorialCargas,
  borrarProgramacion,
  getSorteosDelDia,
  verificarSorteo,
  JUEGOS_CONFIG
};
