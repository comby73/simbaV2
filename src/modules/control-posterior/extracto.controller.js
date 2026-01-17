const xml2js = require('xml2js');
const { successResponse, errorResponse } = require('../../shared/helpers');

// Procesar PDF de extracto (delegado al frontend con OCR)
const procesarPDF = async (req, res) => {
  try {
    // El procesamiento de PDF se hace en el frontend con OCR (Tesseract.js)
    // Este endpoint solo devuelve un mensaje indicando que use OCR
    return errorResponse(res, 'Use OCR en el navegador para procesar PDFs', 400);
  } catch (error) {
    console.error('Error procesando PDF:', error);
    return errorResponse(res, 'Error procesando PDF: ' + error.message, 500);
  }
};

// Procesar XML de extracto
const procesarXML = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No se recibió archivo XML', 400);
    }

    const xmlString = req.file.buffer.toString('utf-8');
    const parser = new xml2js.Parser({ explicitArray: false });
    
    const result = await parser.parseStringPromise(xmlString);
    
    // Extraer números según diferentes formatos de XML
    const numeros = extraerNumerosDeXML(result);
    const letras = extraerLetrasDeXML(result);
    
    if (numeros.length === 0) {
      return errorResponse(res, 'No se encontraron números en el XML', 400);
    }
    
    return successResponse(res, {
      numeros,
      letras
    }, 'XML procesado correctamente');
    
  } catch (error) {
    console.error('Error procesando XML:', error);
    return errorResponse(res, 'Error procesando XML: ' + error.message, 500);
  }
};

// Extraer números del XML parseado
function extraerNumerosDeXML(obj) {
  const numeros = new Array(20).fill('0000');
  
  // Buscar recursivamente en el objeto
  function buscar(o, path = '') {
    if (!o || typeof o !== 'object') return;
    
    for (const key of Object.keys(o)) {
      const valor = o[key];
      const keyLower = key.toLowerCase();
      
      // Buscar arrays de números
      if (keyLower.includes('numero') || keyLower.includes('number') || keyLower === 'numeros' || keyLower === 'numbers') {
        if (Array.isArray(valor)) {
          for (let i = 0; i < Math.min(20, valor.length); i++) {
            const num = typeof valor[i] === 'object' ? 
              (valor[i]._ || valor[i].valor || valor[i].value || Object.values(valor[i])[0]) : 
              valor[i];
            if (num) numeros[i] = String(num).padStart(4, '0');
          }
        } else if (typeof valor === 'string' || typeof valor === 'number') {
          // Posición desde el nombre de la key
          const posMatch = keyLower.match(/(\d+)/);
          if (posMatch) {
            const pos = parseInt(posMatch[1]) - 1;
            if (pos >= 0 && pos < 20) {
              numeros[pos] = String(valor).padStart(4, '0');
            }
          }
        }
      }
      
      // Buscar posiciones individuales
      const posMatch = keyLower.match(/^(pos|posicion|position|n|numero)(\d+)$/);
      if (posMatch) {
        const pos = parseInt(posMatch[2]) - 1;
        if (pos >= 0 && pos < 20) {
          const num = typeof valor === 'object' ? (valor._ || valor.valor || Object.values(valor)[0]) : valor;
          if (num) numeros[pos] = String(num).padStart(4, '0');
        }
      }
      
      // Recursión
      if (typeof valor === 'object') {
        buscar(valor, `${path}.${key}`);
      }
    }
  }
  
  buscar(obj);
  return numeros;
}

// Extraer letras del XML parseado
function extraerLetrasDeXML(obj) {
  const letras = [];
  
  function buscar(o) {
    if (!o || typeof o !== 'object') return;
    
    for (const key of Object.keys(o)) {
      const valor = o[key];
      const keyLower = key.toLowerCase();
      
      if (keyLower.includes('letra') || keyLower === 'letters') {
        if (Array.isArray(valor)) {
          for (let i = 0; i < Math.min(4, valor.length); i++) {
            const l = typeof valor[i] === 'object' ? (valor[i]._ || Object.values(valor[i])[0]) : valor[i];
            if (l) letras[i] = String(l).toUpperCase().charAt(0);
          }
        } else if (typeof valor === 'string') {
          const chars = valor.replace(/[^A-Za-z]/g, '').toUpperCase().split('');
          for (let i = 0; i < Math.min(4, chars.length); i++) {
            letras[i] = chars[i];
          }
        }
      }
      
      // Letras individuales
      const letraMatch = keyLower.match(/^(letra|l)(\d+)$/);
      if (letraMatch) {
        const pos = parseInt(letraMatch[2]) - 1;
        if (pos >= 0 && pos < 4) {
          const l = typeof valor === 'object' ? (valor._ || Object.values(valor)[0]) : valor;
          if (l) letras[pos] = String(l).toUpperCase().charAt(0);
        }
      }
      
      if (typeof valor === 'object') {
        buscar(valor);
      }
    }
  }
  
  buscar(obj);
  return letras;
}

module.exports = {
  procesarPDF,
  procesarXML
};
