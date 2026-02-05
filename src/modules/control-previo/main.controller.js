const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { errorResponse, successResponse } = require('../../shared/helpers');
const quinielaController = require('./quiniela.controller');
const quini6Controller = require('./quini6.controller');
const brincoController = require('./brinco.controller');

// Mapeo de códigos de juego (NTF Pos 3-4) - Códigos internos LOTBA
const JUEGOS_MAP = {
  '05': { id: 'LOTO5', nombre: 'Loto 5', controller: null },
  '09': { id: 'LOTO', nombre: 'Loto Plus', controller: null },
  '13': { id: 'BRINCO', nombre: 'Brinco', controller: brincoController },
  '69': { id: 'QUINI6', nombre: 'Quini 6', controller: quini6Controller },
  '74': { id: 'TOMBOLINA', nombre: 'Tombolina', controller: null },
  '79': { id: 'QUINIELA_YA', nombre: 'Quiniela YA', controller: null },
  '80': { id: 'QUINIELA', nombre: 'La Quiniela', controller: quinielaController },
  '82': { id: 'POCEADA', nombre: 'Quiniela Poceada', controller: null }
};

const procesarArchivoUniversal = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No se recibió ningún archivo', 400);
    }

    const zipPath = req.file.path;
    const extractPath = path.join(__dirname, '../../../uploads/temp', `detect_${Date.now()}`);
    
    if (!fs.existsSync(extractPath)) fs.mkdirSync(extractPath, { recursive: true });

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractPath, true);

    const files = fs.readdirSync(extractPath);
    // Buscar cualquier TXT que parezca un NTF
    const txtFile = files.find(f => f.toUpperCase().endsWith('.TXT'));

    if (!txtFile) {
      limpiarDirectorio(extractPath);
      return errorResponse(res, 'No se encontró archivo de apuestas (TXT) en el ZIP', 400);
    }

    const txtPath = path.join(extractPath, txtFile);
    const firstLine = fs.readFileSync(txtPath, 'latin1').split('\n')[0];
    
    // Detectar Juego (Pos 3-4 -> index 2, largo 2)
    const codigoJuego = firstLine.substr(2, 2);
    const juegoInfo = JUEGOS_MAP[codigoJuego];

    if (!juegoInfo) {
      limpiarDirectorio(extractPath);
      return errorResponse(res, `Juego no soportado (Código: ${codigoJuego})`, 400);
    }

    if (!juegoInfo.controller) {
      limpiarDirectorio(extractPath);
      return errorResponse(res, `El juego ${juegoInfo.nombre} aún no está implementado en el sistema`, 400);
    }

    // Si es un juego soportado, delegamos al controlador específico
    // Pero primero limpiamos lo que extrajimos para que el controlador específico haga su propio proceso
    // (O podríamos pasarle la ruta ya extraída, pero para mantener compatibilidad con el código actual, 
    // re-procesamos el archivo que ya está en req.file)
    
    limpiarDirectorio(extractPath);
    
    // Llamamos al controlador específico
    // Inyectamos el nombre del juego detectado en el request
    req.juegoDetectado = juegoInfo;
    return juegoInfo.controller.procesarZip(req, res);

  } catch (error) {
    console.error('Error en detección universal:', error);
    return errorResponse(res, 'Error detectando tipo de sorteo: ' + error.message, 500);
  }
};

function limpiarDirectorio(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      for (const file of files) fs.unlinkSync(path.join(dirPath, file));
      fs.rmdirSync(dirPath);
    }
  } catch (e) {}
}

module.exports = {
  procesarArchivoUniversal
};
