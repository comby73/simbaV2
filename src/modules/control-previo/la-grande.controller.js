'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const { query } = require('../../config/database');
const { successResponse, errorResponse, PROVINCIAS } = require('../../shared/helpers');
const { buscarFechaProgramacion } = require('../../shared/control-previo.helper');
const { decodificarNumerosQuini6 } = require('./quini6.controller');

const NTF_GENERIC = {
  JUEGO: { start: 2, length: 2 },
  NUMERO_SORTEO: { start: 4, length: 6 },
  PROVINCIA: { start: 13, length: 2 },
  AGENCIA: { start: 15, length: 5 },
  FECHA_CANCELACION: { start: 70, length: 8 },
  NUMERO_TICKET: { start: 86, length: 12 },
  ORDINAL_APUESTA: { start: 98, length: 2 },
  VALOR_REAL_APUESTA: { start: 131, length: 10 }
};

const NTF_ESPECIFICA = {
  INSTANCIAS: { start: 202, length: 1 },
  CANTIDAD_NUMEROS: { start: 210, length: 2 },
  SECUENCIA_NUMEROS: { start: 212, length: 25 }
};

const PREMIOS_XML_MAP = {
  PRIMER_PREMIO: { orden: 1, nombre: '1er Premio' },
  SEGUNDO_PREMIO: { orden: 2, nombre: '2do Premio' },
  TERCERO_PREMIO: { orden: 3, nombre: '3er Premio' },
  CUARTO_PREMIO: { orden: 4, nombre: '4to Premio' },
  QUINTO_PREMIO: { orden: 5, nombre: '5to Premio' },
  SEXTO_PREMIO: { orden: 6, nombre: '6to Premio' },
  SEPTIMO_PREMIO: { orden: 7, nombre: '7mo Premio' },
  OCTAVO_PREMIO: { orden: 8, nombre: '8vo Premio' },
  NOVENO_PREMIO: { orden: 9, nombre: '9no Premio' },
  DECIMO_PREMIO: { orden: 10, nombre: '10mo Premio' },
  DECIMOPRIMERO_PREMIO: { orden: 11, nombre: '11vo Premio' },
  DECIMOSEGUNDO_PREMIO: { orden: 12, nombre: '12vo Premio' },
  DECIMOTERCERO_PREMIO: { orden: 13, nombre: '13vo Premio' },
  DECIMOCUARTO_PREMIO: { orden: 14, nombre: '14vo Premio' },
  DECIMOQUINTO_PREMIO: { orden: 15, nombre: '15vo Premio' },
  DECIMOSEXTO_PREMIO: { orden: 16, nombre: '16vo Premio' },
  DECIMOSEPTIMO_PREMIO: { orden: 17, nombre: '17mo Premio' },
  DECIMOOCTAVO_PREMIO: { orden: 18, nombre: '18vo Premio' },
  DECIMONOVENO_PREMIO: { orden: 19, nombre: '19no Premio' },
  VIGESIMO_PREMIO: { orden: 20, nombre: '20mo Premio' },
  DOSCIFRAS_PREMIO: { orden: 21, nombre: '2 Cifras' },
  UNACIFRA_PREMIO: { orden: 22, nombre: '1 Cifra' }
};

function extraerCampo(linea, cfg) {
  return (linea.substr(cfg.start, cfg.length) || '').trim();
}

function parsearMoneda(valor) {
  const limpio = String(valor || '').replace(/\D/g, '');
  return (parseInt(limpio, 10) || 0) / 100;
}

function normalizarFecha(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split('/');
    const iso = `${yyyy}-${mm}-${dd}`;
    if (!Number.isNaN(new Date(iso).getTime())) return iso;
  }

  if (/^\d{8}$/.test(raw)) {
    const iso = `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
    if (!Number.isNaN(new Date(iso).getTime())) return iso;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function limpiarDirectorio(dirPath) {
  try {
    if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (err) {
    console.warn('[LA_GRANDE] No se pudo limpiar directorio temporal:', err.message);
  }
}

function leerHashArchivo(hashPath) {
  try {
    if (!hashPath || !fs.existsSync(hashPath)) return null;
    const raw = fs.readFileSync(hashPath, 'utf8');
    const match = String(raw).match(/[a-fA-F0-9]{32,128}/);
    return match ? match[0].toLowerCase() : String(raw).trim().toLowerCase();
  } catch {
    return null;
  }
}

function detectarAlgoritmoHash(hashHex) {
  const len = String(hashHex || '').trim().length;
  if (len === 32) return 'md5';
  if (len === 40) return 'sha1';
  if (len === 64) return 'sha256';
  if (len === 128) return 'sha512';
  return 'sha256';
}

function calcularHashArchivo(filePath, algorithm = 'sha256') {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash(algorithm).update(buffer).digest('hex').toLowerCase();
  } catch {
    return null;
  }
}

function listarArchivosRecursivo(baseDir) {
  const out = [];

  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        out.push(fullPath);
      }
    }
  };

  walk(baseDir);
  return out;
}

async function procesarArchivoXML(contenido) {
  try {
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true, trim: true });
    const data = await parser.parseStringPromise(contenido);
    const cp = data?.CONTROL_PREVIO;
    if (!cp) return null;

    let root = cp.LA_GRANDE_DE_LA_CIUDAD || cp.LA_GRANDE_DE_LA_NACIONAL || cp.LA_GRANDE || null;

    if (!root) {
      const posibles = Object.values(cp).filter((v) => v && typeof v === 'object');
      root = posibles.find((v) => v.SORTEO || v.FECHA_SORTEO || v.CODIGO_JUEGO) || null;
    }

    if (!root) return null;

    const premios = [];
    for (const [clave, cfg] of Object.entries(PREMIOS_XML_MAP)) {
      const monto = Number(root?.[clave]?.MONTO || 0) || 0;
      if (monto > 0) {
        premios.push({
          clave,
          orden: cfg.orden,
          nombre: cfg.nombre,
          monto
        });
      }
    }
    premios.sort((a, b) => a.orden - b.orden);

    const terminaciones = [];
    for (let i = 0; i <= 9; i++) {
      const key = `TERMINACION_${i}`;
      const cantidad = parseInt(String(root?.[key] || '').trim(), 10) || 0;
      terminaciones.push({ terminacion: i, cantidad });
    }

    return {
      codigoJuego: String(root.CODIGO_JUEGO || '').trim() || null,
      sorteo: parseInt(String(root.SORTEO || '').trim(), 10) || null,
      fechaSorteo: normalizarFecha(root.FECHA_SORTEO),
      recaudacionBruta: Number(root.RECAUDACION_BRUTA || 0) || 0,
      registrosValidos: parseInt(String(root.REGISTROS_VALIDOS || '').trim(), 10) || 0,
      registrosAnulados: parseInt(String(root.REGISTROS_ANULADOS || '').trim(), 10) || 0,
      apuestasEnSorteo: parseInt(String(root.APUESTAS_EN_SORTEO || '').trim(), 10) || 0,
      importeTotalPremios: Number(root.IMPORTE_TOTAL_PREMIOS_A_DISTRIBUIR || 0) || 0,
      premios,
      terminaciones
    };
  } catch (error) {
    console.warn('[LA_GRANDE] No se pudo parsear XML de control previo:', error.message);
    return null;
  }
}

async function procesarArchivoNTF(contenido) {
  const lineas = contenido.split('\n');

  let totalRegistros = 0;
  let registrosValidos = 0;
  let registrosCancelados = 0;
  let recaudacionValida = 0;
  let recaudacionCancelada = 0;
  let apuestasTotal = 0;
  let numeroSorteo = null;
  let codigoJuego = null;

  const porProvincia = {};
  const porAgenciaMap = {};
  const registros = [];

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (!linea || linea.length < 141) continue;

    totalRegistros++;

    const juego = extraerCampo(linea, NTF_GENERIC.JUEGO);
    if (!codigoJuego && juego) codigoJuego = juego;

    const sorteo = extraerCampo(linea, NTF_GENERIC.NUMERO_SORTEO);
    if (!numeroSorteo && sorteo) numeroSorteo = parseInt(sorteo, 10) || sorteo;

    const provincia = extraerCampo(linea, NTF_GENERIC.PROVINCIA).padStart(2, '0');
    const agencia = extraerCampo(linea, NTF_GENERIC.AGENCIA).padStart(5, '0');
    const ctaCte = `${provincia}${agencia}`;

    const fechaCancel = extraerCampo(linea, NTF_GENERIC.FECHA_CANCELACION);
    const cancelado = Boolean(fechaCancel && fechaCancel.replace(/\s/g, ''));

    const valorRealApuesta = parsearMoneda(extraerCampo(linea, NTF_GENERIC.VALOR_REAL_APUESTA));
    const cantidadNumeros = parseInt(extraerCampo(linea, NTF_ESPECIFICA.CANTIDAD_NUMEROS), 10) || 6;
    const secuencia = extraerCampo(linea, NTF_ESPECIFICA.SECUENCIA_NUMEROS);
    const numerosJugados = decodificarNumerosQuini6(secuencia);

    const reg = {
      linea: i + 1,
      juego,
      sorteo,
      provincia,
      provinciaNombre: PROVINCIAS[provincia] || provincia,
      agencia,
      ctaCte,
      ticket: extraerCampo(linea, NTF_GENERIC.NUMERO_TICKET),
      ordinalApuesta: extraerCampo(linea, NTF_GENERIC.ORDINAL_APUESTA),
      cancelado,
      valorRealApuesta,
      cantidadNumeros,
      numerosJugados
    };

    registros.push(reg);

    if (!porProvincia[provincia]) {
      porProvincia[provincia] = {
        provincia,
        nombre: PROVINCIAS[provincia] || provincia,
        registros: 0,
        anulados: 0,
        apuestas: 0,
        recaudacion: 0
      };
    }

    if (!porAgenciaMap[ctaCte]) {
      porAgenciaMap[ctaCte] = {
        ctaCte,
        provincia,
        agencia,
        registros: 0,
        cancelados: 0,
        apuestasSimples: 0,
        recaudacion: 0
      };
    }

    if (cancelado) {
      registrosCancelados++;
      recaudacionCancelada += valorRealApuesta;
      porProvincia[provincia].anulados++;
      porAgenciaMap[ctaCte].cancelados++;
      continue;
    }

    registrosValidos++;
    apuestasTotal++;
    recaudacionValida += valorRealApuesta;

    porProvincia[provincia].registros++;
    porProvincia[provincia].apuestas++;
    porProvincia[provincia].recaudacion += valorRealApuesta;

    porAgenciaMap[ctaCte].registros++;
    porAgenciaMap[ctaCte].apuestasSimples++;
    porAgenciaMap[ctaCte].recaudacion += valorRealApuesta;
  }

  return {
    sorteo: numeroSorteo,
    codigoJuego: codigoJuego || null,
    totalRegistros,
    registrosValidos,
    registrosCancelados,
    recaudacionValida,
    recaudacionCancelada,
    apuestasTotal,
    porProvincia,
    porAgencia: Object.values(porAgenciaMap),
    registros
  };
}

async function guardarControlPrevioLaGrandeDB(resultadoNTF, metadataXML = null, user, nombreArchivo) {
  try {
    const sorteo = parseInt(metadataXML?.sorteo || resultadoNTF.sorteo, 10) || 0;
    if (!sorteo) {
      throw new Error('No se pudo determinar número de sorteo para La Grande');
    }

    let fecha = normalizarFecha(metadataXML?.fechaSorteo);
    if (!fecha) {
      fecha = await buscarFechaProgramacion('la_grande', sorteo);
    }
    if (!fecha && resultadoNTF?.registros?.length > 0) {
      fecha = normalizarFecha(resultadoNTF.registros[0]?.fechaVenta);
    }
    if (!fecha) {
      throw new Error(`No se pudo determinar fecha de sorteo para La Grande (${sorteo})`);
    }

    let controlPrevioId = 0;

    const result = await query(`
      INSERT INTO control_previo_la_grande
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
      sorteo,
      fecha,
      nombreArchivo,
      resultadoNTF.registrosValidos || 0,
      resultadoNTF.registrosCancelados || 0,
      resultadoNTF.apuestasTotal || 0,
      resultadoNTF.recaudacionValida || 0,
      JSON.stringify({
        codigoJuego: metadataXML?.codigoJuego || resultadoNTF.codigoJuego || null,
        fuenteFecha: metadataXML?.fechaSorteo ? 'xml' : 'programacion',
        fechaSorteoXML: metadataXML?.fechaSorteo || null,
        recaudacionBrutaXML: metadataXML?.recaudacionBruta || null
      }),
      user?.id || null
    ]);

    controlPrevioId = result.insertId || 0;
    if (!controlPrevioId) {
      const [row] = await query(
        'SELECT id FROM control_previo_la_grande WHERE numero_sorteo = ? ORDER BY id DESC LIMIT 1',
        [sorteo]
      );
      controlPrevioId = row?.id || 0;
    }

    await query(
      'DELETE FROM control_previo_agencias WHERE juego = ? AND numero_sorteo = ?',
      ['la_grande', sorteo]
    );

    const porAgencia = resultadoNTF.porAgencia || [];
    const placeholders = [];
    const values = [];

    for (const ag of porAgencia) {
      const agenciaNormalizada = String(ag.agencia || '').padStart(5, '0');
      const codigoProvincia = String(ag.provincia || '51').padStart(2, '0');
      const esVentaWeb = agenciaNormalizada === '88880' || `${codigoProvincia}${agenciaNormalizada}` === '5188880';
      const codigoAgencia = esVentaWeb ? '5188880' : `${codigoProvincia}${agenciaNormalizada}`;

      placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      values.push(
        controlPrevioId || 0,
        'la_grande',
        fecha,
        sorteo,
        'U',
        codigoAgencia,
        codigoProvincia,
        ag.registros || 0,
        ag.apuestasSimples || 0,
        ag.cancelados || 0,
        ag.recaudacion || 0
      );
    }

    if (placeholders.length > 0) {
      await query(`
        INSERT INTO control_previo_agencias
          (control_previo_id, juego, fecha, numero_sorteo, modalidad, codigo_agencia,
           codigo_provincia, total_tickets, total_apuestas, total_anulados, total_recaudacion)
        VALUES ${placeholders.join(', ')}
      `, values);
    }

    return { success: true, id: controlPrevioId, fecha };
  } catch (error) {
    console.error('❌ Error guardando Control Previo La Grande:', error);
    return { success: false, error: error.message };
  }
}

async function procesarZip(req, res) {
  let extractPath = null;

  try {
    if (!req.file) return errorResponse(res, 'No se recibió ningún archivo', 400);

    const zipPath = req.file.path;
    extractPath = path.join(__dirname, '../../../uploads/temp', `la_grande_${Date.now()}`);
    if (!fs.existsSync(extractPath)) fs.mkdirSync(extractPath, { recursive: true });

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractPath, true);

    const files = listarArchivosRecursivo(extractPath);
    const txtPath = files.find((f) => f.toUpperCase().endsWith('.TXT'));
    const xmlPath = files.find((f) => f.toUpperCase().endsWith('.XML'));
    const pdfPath = files.find((f) => f.toUpperCase().endsWith('.PDF'));
    const hashFiles = files.filter((f) => f.toUpperCase().endsWith('.HASH'));
    const hashTxtPath = hashFiles.find((f) => !path.basename(f).toUpperCase().includes('CP')) || null;
    const hashXmlPath = hashFiles.find((f) => path.basename(f).toUpperCase().includes('CP')) || null;

    if (!txtPath) {
      return errorResponse(res, 'No se encontró archivo TXT de apuestas en el ZIP', 400);
    }

    const contenido = fs.readFileSync(txtPath, 'latin1');
    const resultadoNTF = await procesarArchivoNTF(contenido);

    const hashOficial = leerHashArchivo(hashTxtPath);
    const hashXmlOficial = leerHashArchivo(hashXmlPath);
    const algoritmoTxt = detectarAlgoritmoHash(hashOficial);
    const algoritmoXml = detectarAlgoritmoHash(hashXmlOficial);
    const hashCalculado = calcularHashArchivo(txtPath, algoritmoTxt);
    const hashXmlCalculado = xmlPath ? calcularHashArchivo(xmlPath, algoritmoXml) : null;

    const seguridad = {
      archivos: {
        txt: Boolean(txtPath),
        xml: Boolean(xmlPath),
        hash: Boolean(hashTxtPath),
        hashCP: Boolean(hashXmlPath),
        pdf: Boolean(pdfPath)
      },
      hashCalculado,
      hashOficial,
      hashXmlCalculado,
      hashXmlOficial,
      algoritmoTxt,
      algoritmoXml,
      verificado: hashCalculado && hashOficial ? hashCalculado === hashOficial : undefined,
      verificadoXml: hashXmlCalculado && hashXmlOficial ? hashXmlCalculado === hashXmlOficial : undefined
    };

    let metadataXML = null;
    if (xmlPath) {
      const contenidoXML = fs.readFileSync(xmlPath, 'utf8');
      metadataXML = await procesarArchivoXML(contenidoXML);

      if (metadataXML?.sorteo && !resultadoNTF.sorteo) {
        resultadoNTF.sorteo = metadataXML.sorteo;
      }
      if (metadataXML?.codigoJuego && !resultadoNTF.codigoJuego) {
        resultadoNTF.codigoJuego = metadataXML.codigoJuego;
      }

      if ((metadataXML?.registrosValidos || 0) > 0) {
        resultadoNTF.registrosValidos = metadataXML.registrosValidos;
      }
      if ((metadataXML?.registrosAnulados || 0) >= 0) {
        resultadoNTF.registrosCancelados = metadataXML.registrosAnulados;
      }
      if ((metadataXML?.apuestasEnSorteo || 0) > 0) {
        resultadoNTF.apuestasTotal = metadataXML.apuestasEnSorteo;
      }
      if ((metadataXML?.recaudacionBruta || 0) > 0) {
        resultadoNTF.recaudacionValida = metadataXML.recaudacionBruta;
      }
      resultadoNTF.totalRegistros = (resultadoNTF.registrosValidos || 0) + (resultadoNTF.registrosCancelados || 0);
    }

    const guardado = await guardarControlPrevioLaGrandeDB(resultadoNTF, metadataXML, req.user, req.file.originalname);

    if (!guardado.success) {
      return errorResponse(res, `Error guardando Control Previo La Grande: ${guardado.error}`, 500);
    }

    return successResponse(res, {
      archivo: req.file.originalname,
      tipoJuego: 'La Grande',
      juego: 'la_grande',
      sorteo: metadataXML?.sorteo || resultadoNTF.sorteo,
      codigoJuego: resultadoNTF.codigoJuego,
      fechaSorteo: metadataXML?.fechaSorteo || guardado?.fecha || null,
      resumen: {
        registros: resultadoNTF.registrosValidos,
        anulados: resultadoNTF.registrosCancelados,
        apuestasTotal: resultadoNTF.apuestasTotal,
        recaudacion: resultadoNTF.recaudacionValida,
        recaudacionAnulada: resultadoNTF.recaudacionCancelada,
        totalPremios: metadataXML?.importeTotalPremios || 0
      },
      datosOficiales: metadataXML ? {
        codigoJuego: metadataXML.codigoJuego,
        sorteo: metadataXML.sorteo,
        fechaSorteo: metadataXML.fechaSorteo,
        registrosValidos: metadataXML.registrosValidos,
        registrosAnulados: metadataXML.registrosAnulados,
        apuestasEnSorteo: metadataXML.apuestasEnSorteo,
        recaudacionBruta: metadataXML.recaudacionBruta,
        importeTotalPremios: metadataXML.importeTotalPremios,
        premios: metadataXML.premios || [],
        terminaciones: metadataXML.terminaciones || []
      } : null,
      comparacion: metadataXML ? {
        registros: {
          calculado: resultadoNTF.registrosValidos,
          oficial: metadataXML.registrosValidos,
          diferencia: (resultadoNTF.registrosValidos || 0) - (metadataXML.registrosValidos || 0)
        },
        anulados: {
          calculado: resultadoNTF.registrosCancelados,
          oficial: metadataXML.registrosAnulados,
          diferencia: (resultadoNTF.registrosCancelados || 0) - (metadataXML.registrosAnulados || 0)
        },
        apuestas: {
          calculado: resultadoNTF.apuestasTotal,
          oficial: metadataXML.apuestasEnSorteo,
          diferencia: (resultadoNTF.apuestasTotal || 0) - (metadataXML.apuestasEnSorteo || 0)
        },
        recaudacion: {
          calculado: resultadoNTF.recaudacionValida,
          oficial: metadataXML.recaudacionBruta,
          diferencia: (resultadoNTF.recaudacionValida || 0) - (metadataXML.recaudacionBruta || 0)
        },
        premios: {
          calculado: metadataXML.importeTotalPremios || 0,
          oficial: metadataXML.importeTotalPremios || 0,
          diferencia: 0
        }
      } : null,
      porProvincia: resultadoNTF.porProvincia,
      provincias: Object.values(resultadoNTF.porProvincia || {}),
      porAgencia: resultadoNTF.porAgencia,
      agencias: resultadoNTF.porAgencia,
      registrosNTF: resultadoNTF.registros,
      seguridad,
      resguardo: { success: true, id: guardado.id }
    }, 'Control Previo La Grande procesado correctamente');
  } catch (error) {
    console.error('❌ Error procesando ZIP La Grande:', error);
    return errorResponse(res, `Error procesando La Grande: ${error.message}`, 500);
  } finally {
    if (extractPath) limpiarDirectorio(extractPath);
  }
}

module.exports = {
  procesarZip,
  procesarArchivoNTF
};
