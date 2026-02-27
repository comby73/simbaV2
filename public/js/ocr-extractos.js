// ============================================
// MÓDULO OCR EXTRACTOS - SIMBA V2
// Extracción de datos de extractos con IA (Groq API)
// Soporta: API key en browser (config.js/localStorage) O proxy servidor
// ============================================

const OCRExtractos = {
  // Configuración
  CONFIG: {
    API_URL: 'https://api.groq.com/openai/v1/chat/completions',
    API_KEY: '', // Se configura desde config.js o UI
    MODEL: 'meta-llama/llama-4-maverick-17b-128e-instruct'
  },

  // Si el servidor tiene OCR disponible (se consulta una vez al init)
  _servidorOCRDisponible: null,

  // Inicializar con config global o localStorage
  async init() {
    // 1. Intentar desde config.js (SIMBA_CONFIG)
    if (window.SIMBA_CONFIG && window.SIMBA_CONFIG.GROQ) {
      this.CONFIG.API_URL = window.SIMBA_CONFIG.GROQ.API_URL || this.CONFIG.API_URL;
      this.CONFIG.API_KEY = window.SIMBA_CONFIG.GROQ.API_KEY || this.CONFIG.API_KEY;
      this.CONFIG.MODEL = window.SIMBA_CONFIG.GROQ.MODEL || this.CONFIG.MODEL;
    }

    // 2. Sobrescribir con localStorage si existe (preferencia del usuario)
    const savedKey = localStorage.getItem('groq_api_key');
    if (savedKey) {
      this.CONFIG.API_KEY = savedKey;
    }

    const savedModel = localStorage.getItem('groq_model');
    if (savedModel) {
      this.CONFIG.MODEL = savedModel;
    }

    // 3. Verificar si el servidor tiene OCR disponible (para usarlo como fallback)
    if (!this.CONFIG.API_KEY) {
      this._verificarOCRServidor();
    }
  },

  // Verificar disponibilidad de OCR en servidor (no bloquea el init)
  async _verificarOCRServidor() {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const resp = await fetch('/api/ocr/estado', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (resp.ok) {
        const data = await resp.json();
        this._servidorOCRDisponible = data.disponible === true;
        if (this._servidorOCRDisponible) {
          console.log('[OCR] Servidor con OCR disponible (usando proxy servidor)');
        }
      }
    } catch (e) {
      this._servidorOCRDisponible = false;
    }
  },

  // Guardar API key
  setApiKey(key) {
    this.CONFIG.API_KEY = key;
    localStorage.setItem('groq_api_key', key);
  },

  // Verificar si hay API key configurada (browser o servidor)
  hasApiKey() {
    return !!(this.CONFIG.API_KEY || this._servidorOCRDisponible);
  },

  /**
   * PROMPT PARA PROVINCIAS Y MONTEVIDEO (GENERAL)
   */
  async procesarImagenProvincia(imageBase64, mimeType, provinciaHint = '') {
    const prompt = `Analiza esta imagen de resultados de lotería y devuelve SOLO un objeto JSON válido.
        
REGLAS CRÍTICAS DE EXTRACCIÓN:
1. Busca la columna 'Ubicación' o 'Puesto' del 1 al 20.
2. Para cada posición, extrae el número asociado.
3. Si la provincia es Montevideo (Uruguay), los números son de 3 DÍGITOS. Para el resto son de 4 DÍGITOS.
4. NORMALIZACIÓN DE MODALIDAD: Si la imagen dice "VESPERTINA" pero la hora es 15:00 o la entidad es Montevideo 15hs, usa "Matutina".
DATOS A EXTRAER:
- sorteo: número de sorteo
- fecha: formato DD/MM/YY
- hora: formato HH:MM
- provincia: código numérico (USA EL HINT SI ES COHERENTE: ${provinciaHint}):
  - 51: Ciudad / CABA
  - 53: Buenos Aires (Provincia)
  - 55: Córdoba
  - 72: Santa Fe
  - 59: Entre Ríos
  - 64: Mendoza
  - 151: Montevideo (15:00 hs / Vespertina Uruguay)
  - 211: Montevideo (21:00 hs / Nocturna Uruguay)
- modalidad: (Vespertina, Matutina, Nocturna, La Primera, La Previa)
- numeros: array de 20 strings (3 o 4 dígitos según corresponda)
Responde SOLO con este JSON:
{"sorteo":"NUMERO","fecha":"DD/MM/YY","hora":"HH:MM","provincia":"XX","modalidad":"NOMBRE","numeros":["num1",...20 números]}`;

    return await this.llamarAPI(imageBase64, mimeType, prompt);
  },

  /**
   * PROMPT PARA CABA (ESPECÍFICO)
   */
  async procesarImagenCABA(imageBase64, mimeType) {
    const prompt = `Analiza esta imagen de resultados de lotería y extrae EXACTAMENTE:
1. La fecha en formato DD/MM/YY que aparece en la parte superior
2. La hora en formato HH:MM que aparece junto a la fecha
3. La modalidad (NOCTURNA, MATUTINA, VESPERTINA, LA PREVIA, LA PRIMERA)
4. Los 20 números de la tabla de lotería, cada uno debe tener exactamente 3 dígitos
La tabla tiene 2 columnas:
- Columna izquierda: números 1-10 (fondo azul)
- Columna derecha: números 11-20 (fondo blanco)
IMPORTANTE: Lee los números REALES de la imagen, no inventes números.
Responde SOLO con este JSON (sin markdown ni explicaciones):
{"fecha":"DD/MM/YY","hora":"HH:MM","modalidad":"NOMBRE_MODALIDAD","numeros":["num1","num2",...20 números de 3 dígitos]}`;

    return await this.llamarAPI(imageBase64, mimeType, prompt);
  },

  // Función genérica que decide qué prompt usar
  async procesarImagenQuiniela(imageBase64, mimeType, provinciaId = '51') {
    if (provinciaId === '51') {
      return await this.procesarImagenCABA(imageBase64, mimeType);
    } else {
      return await this.procesarImagenProvincia(imageBase64, mimeType, provinciaId);
    }
  },

  // Llamar al servidor como proxy OCR (usa GROQ_API_KEY del .env del servidor)
  async llamarAPIServidor(imageBase64, mimeType, prompt) {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No hay sesión activa para usar OCR del servidor');
    }

    const response = await fetch('/api/ocr/procesar-imagen', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ imageBase64, mimeType, prompt })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Error servidor OCR: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.content) {
      throw new Error(data.error || 'Respuesta vacía del servidor OCR');
    }

    return this.procesarRespuesta(data.content);
  },

  // Llamar a la API de Groq (browser directo o proxy servidor como fallback)
  async llamarAPI(imageBase64, mimeType, prompt) {
    // Opción 1: API key en el browser → llamada directa
    if (this.CONFIG.API_KEY) {
      return await this._llamarAPIDirecto(imageBase64, mimeType, prompt);
    }

    // Opción 2: Sin API key en browser → intentar proxy del servidor
    // (el servidor usa GROQ_API_KEY del .env de Hostinger)
    try {
      // Si no verificamos el servidor aún, intentamos de todas formas
      return await this.llamarAPIServidor(imageBase64, mimeType, prompt);
    } catch (serverError) {
      console.warn('[OCR] Proxy servidor falló:', serverError.message);
      throw new Error('No hay API key de Groq configurada y el servidor no tiene OCR disponible. Configurá tu clave en el panel o contactá al administrador.');
    }
  },

  // Llamada directa a Groq API con API key del browser
  async _llamarAPIDirecto(imageBase64, mimeType, prompt) {
    const dataUrlPrefix = mimeType === 'image/png'
      ? 'data:image/png;base64,'
      : 'data:image/jpeg;base64,';

    const requestBody = {
      model: this.CONFIG.MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: dataUrlPrefix + imageBase64 }
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 2000,
      stream: false
    };

    try {
      const response = await fetch(this.CONFIG.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.CONFIG.API_KEY
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) {
          throw new Error('API key inválida. Verificá tu clave de Groq.');
        }
        throw new Error(`Error HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (data.choices && data.choices[0] && data.choices[0].message) {
        const content = data.choices[0].message.content;
        return this.procesarRespuesta(content);
      } else {
        throw new Error('Respuesta inesperada de la API');
      }
    } catch (error) {
      console.error('Error en OCR directo:', error);
      throw error;
    }
  },

  // Procesar respuesta de la API
  procesarRespuesta(content) {
    let jsonStr = content.trim();

    // Eliminar bloques de código markdown
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      // Intentar extraer JSON de texto mixto
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No se pudo parsear la respuesta como JSON');
      }
    }

    // Normalizar datos extraídos
    if (parsed.numeros && Array.isArray(parsed.numeros)) {
      // Si es CABA o Montevideo, son 3 dígitos. Si no, 4.
      const digitos = (parsed.provincia === '51' || parsed.provincia === '151' || parsed.provincia === '211') ? 3 : 4;
      parsed.numeros = this.limpiarNumeros(parsed.numeros, digitos);
    }

    // Convertir fechas DD/MM/YY a YYYY-MM-DD
    if (parsed.fecha && parsed.fecha.includes('/')) {
      const parts = parsed.fecha.split('/');
      if (parts.length === 3) {
        let [day, month, year] = parts;
        if (year.length === 2) year = '20' + year;
        parsed.fecha = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }

    return {
      success: true,
      data: parsed
    };
  },

  // Limpiar y validar números
  limpiarNumeros(numeros, digitos = 4) {
    const resultado = [];

    for (let i = 0; i < 20; i++) {
      let numero = numeros[i] || '';
      numero = numero.toString().replace(/[^0-9]/g, '');

      if (numero.length > digitos) {
        numero = numero.slice(-digitos);
      } else if (numero.length < digitos) {
        numero = numero.padStart(digitos, '0');
      }

      resultado.push(numero);
    }

    return resultado;
  },

  // Convertir imagen a Base64
  async imageToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.split(',')[1];
        const mimeType = result.split(';')[0].split(':')[1];
        resolve({ base64, mimeType });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // Convertir PDF a imagen (primera página)
  async pdfToImage(file) {
    if (!window.pdfjsLib) {
      await this.cargarPdfJs();
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const scale = 2;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    const dataUrl = canvas.toDataURL('image/png', 1.0);
    const base64 = dataUrl.split(',')[1];

    return { base64, mimeType: 'image/png' };
  },

  // Cargar PDF.js dinámicamente
  async cargarPdfJs() {
    return new Promise((resolve, reject) => {
      if (window.pdfjsLib) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  },

  // Capturar pantalla
  async capturarPantalla() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Tu navegador no soporta captura de pantalla');
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 2560 }, height: { ideal: 1440 } },
        audio: false
      });

      return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;

        video.onloadedmetadata = async () => {
          await video.play();

          setTimeout(() => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);

            stream.getTracks().forEach(track => track.stop());

            const dataUrl = canvas.toDataURL('image/png', 1.0);
            const base64 = dataUrl.split(',')[1];

            resolve({
              base64,
              mimeType: 'image/png',
              dataUrl
            });
          }, 500);
        };

        video.onerror = reject;
      });
    } catch (error) {
      console.error('Error en captura de pantalla:', error);
      throw error;
    }
  }
};

// Inicializar al cargar (async - no bloquea el resto de la app)
OCRExtractos.init().catch(e => console.warn('[OCR] Init error:', e));

// Disponible globalmente
window.OCRExtractos = OCRExtractos;
