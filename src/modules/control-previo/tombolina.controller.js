const AdmZip = require('adm-zip');
const crypto = require('crypto');
const { successResponse, errorResponse } = require('../../shared/helpers');
const { guardarControlPrevioTombolina } = require('../../shared/control-previo.helper');
const db = require('../../config/database');

// ==============================================================================
// NTF Tombolina - Diseño de Registro
// Parte Genérica (200 caracteres): Idéntica a Poceada/Quiniela
// Parte Específica Tombolina (a partir de pos 201)
// ==============================================================================

const NTF_GENERIC = {
  VERSION_GENERICA: { start: 0, length: 2 },
  JUEGO: { start: 2, length: 2 },
  NUMERO_SORTEO: { start: 4, length: 6 },
  CANTIDAD_SORTEOS: { start: 10, length: 2 },
  PROVEEDOR: { start: 12, length: 1 },
  PROVINCIA: { start: 13, length: 2 },
  AGENCIA: { start: 15, length: 5 },
  DIGITO_VERIF: { start: 20, length: 1 },
  ID_TERMINAL_VENTA: { start: 21, length: 8 },
  ID_USUARIO_VENTA: { start: 29, length: 8 },
  MODO_VENTA: { start: 37, length: 2 },
  FECHA_VENTA: { start: 39, length: 8 },
  HORA_VENTA: { start: 47, length: 6 },
  ID_TERMINAL_CANCEL: { start: 53, length: 8 },
  ID_USUARIO_CANCEL: { start: 61, length: 8 },
  MODO_CANCELACION: { start: 69, length: 1 },
  FECHA_CANCELACION: { start: 70, length: 8 },
  HORA_CANCELACION: { start: 78, length: 6 },
  CANTIDAD_PARTES: { start: 84, length: 2 },
  NUMERO_TICKET: { start: 86, length: 12 },
  ORDINAL_APUESTA: { start: 98, length: 2 },
  TIPO_DOCUMENTO: { start: 100, length: 1 },
  NUMERO_DOCUMENTO: { start: 101, length: 12 },
  AGENCIA_AMIGA: { start: 113, length: 8 },
  VALOR_APUESTA: { start: 121, length: 10 },
  VALOR_REAL_APUESTA: { start: 131, length: 10 },
  CODIGO_PROMOCION: { start: 141, length: 10 },
  ID_SESION: { start: 151, length: 12 },
  ID_EXTERNO_TICKET: { start: 163, length: 30 }
};

const NTF_TOMBOLINA = {
  VERSION_ESPECIFICA: { start: 200, length: 2 },
  LETRAS: { start: 202, length: 4 },
  CANTIDAD_NUMEROS: { start: 214, length: 2 },
  SECUENCIA_NUMEROS: { start: 216, length: 25 } // Python script says 216-241
};

const BINARY_CODE = {
  'A': '0000', 'B': '0001', 'C': '0010', 'D': '0011',
  'E': '0100', 'F': '0101', 'G': '0110', 'H': '0111',
  'I': '1000', 'J': '1001', 'K': '1010', 'L': '1011',
  'M': '1100', 'N': '1101', 'O': '1110', 'P': '1111'
};

function decodificarNumerosTombolina(secuencia25) {
  let numeros = [];
  for (let i = 0; i < Math.min(25, secuencia25.length); i++) {
    const letra = secuencia25[i].toUpperCase();
    const binario = BINARY_CODE[letra] || '0000';
    for (let j = 0; j < 4; j++) {
      if (binario[j] === '1') {
        const numero = i * 4 + j;
        if (numero <= 99) {
          numeros.push(String(numero).padStart(2, '0'));
        }
      }
    }
  }
  return numeros.sort();
}

function extraerCampo(line, fieldDef) {
  return line.substr(fieldDef.start, fieldDef.length).trim();
}

function calcularHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function procesarZipTombolina(req, res) {
  try {
    if (!req.file) return errorResponse(res, 'No se recibió archivo ZIP', 400);
    const zipPath = req.file.path;
    const zipBuffer = fs.readFileSync(zipPath);
    const zip = new AdmZip(zipBuffer);
    const files = zip.getEntries().map(e => e.entryName);

    const txtFile = files.find(f => {
      const base = path.basename(f).toUpperCase();
      return base.includes('TMB') && base.endsWith('.TXT');
    });

    if (!txtFile) return errorResponse(res, 'No se encontró archivo TXT de Tombolina (TMB*.TXT)', 400);

    const txtEntry = zip.getEntry(txtFile);
    const txtContent = txtEntry.getData().toString('latin1');
    const lines = txtContent.split(/\r?\n/).filter(Boolean);

    let totalRegistros = 0, totalApuestas = 0, totalAnulados = 0;
    let totalRecaudacion = 0;
    let totalRecaudacionAnulada = 0;
    let recaudacionCaba = 0;
    let recaudacionProvincias = 0;
    let recaudacionWeb = 0;
    let numeroSorteo = '';
    let registrosNTF = [];

    for (const line of lines) {
      if (line.length < 241) continue;

      const gameCode = extraerCampo(line, NTF_GENERIC.JUEGO);
      if (gameCode !== '74') continue;

      totalRegistros++;

      const ticket = extraerCampo(line, NTF_GENERIC.NUMERO_TICKET);
      if (!numeroSorteo) numeroSorteo = extraerCampo(line, NTF_GENERIC.NUMERO_SORTEO);

      const cancelDate = extraerCampo(line, NTF_GENERIC.FECHA_CANCELACION);
      const isCanceled = cancelDate !== '';
      const valor = parseInt(extraerCampo(line, NTF_GENERIC.VALOR_APUESTA)) / 100;
      const codProvincia = extraerCampo(line, NTF_GENERIC.PROVINCIA);

      const letters = extraerCampo(line, NTF_TOMBOLINA.LETRAS);
      const cantNumeros = parseInt(extraerCampo(line, NTF_TOMBOLINA.CANTIDAD_NUMEROS)) || 0;
      const sequence = line.substr(NTF_TOMBOLINA.SECUENCIA_NUMEROS.start, NTF_TOMBOLINA.SECUENCIA_NUMEROS.length);
      const numeros = decodificarNumerosTombolina(sequence);

      if (isCanceled) {
        totalAnulados++;
        totalRecaudacionAnulada += valor;
      } else {
        totalApuestas++;
        totalRecaudacion += valor;

        // Separación triple: Web (88880), CABA (51), Provincias
        const agencia = extraerCampo(line, NTF_GENERIC.AGENCIA).trim();
        if (agencia === '88880') {
          recaudacionWeb += valor;
        } else if (codProvincia === '51') {
          recaudacionCaba += valor;
        } else {
          recaudacionProvincias += valor;
        }

        registrosNTF.push({
          numeroTicket: ticket,
          valorApuesta: valor,
          agencia: codProvincia + agencia,
          cantidadNumeros: cantNumeros || numeros.length,
          numeros: numeros,
          letras: letters,
          secuenciaOriginal: sequence
        });
      }
    }

    const hashTxtCalculado = crypto.createHash('sha256').update(txtContent).digest('hex');

    const resultadosCalculados = {
      totalRegistros,
      totalApuestas,
      totalAnulados,
      totalRecaudacion,
      totalRecaudacionAnulada,
      recaudacionCaba,
      recaudacionProvincias,
      recaudacionWeb,
      // Campos normalizados para app.js
      registros: totalApuestas,
      recaudacion: totalRecaudacion,
      anulados: totalAnulados,
      registrosAnulados: totalAnulados,
      recaudacionAnulada: totalRecaudacionAnulada
    };

    const respuestaJSON = {
      archivo: req.file.originalname,
      registrosNTF,
      sorteo: String(numeroSorteo).padStart(6, '0'),
      tipoJuego: 'Tombolina',
      datosCalculados: resultadosCalculados,
      resumen: resultadosCalculados,
      seguridad: { hashCalculado: hashTxtCalculado }
    };

    // GUARDAR EN BASE DE DATOS (resguardo)
    try {
      const resguardo = await guardarControlPrevioTombolina(respuestaJSON, req.user, req.file.originalname);
      respuestaJSON.resguardo = resguardo;
    } catch (errGuardar) {
      console.error('⚠️ Error guardando CP Tombolina:', errGuardar.message);
    }

    return successResponse(res, respuestaJSON, 'Control previo Tombolina procesado correctamente');

  } catch (err) {
    console.error('Error:', err);
    return errorResponse(res, err.message, 500);
  }
}

module.exports = {
  procesarZipTombolina
};
