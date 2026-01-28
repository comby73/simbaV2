// ============================================
// MÓDULO OCR EXTRACTOS - SIMBA V2
// Extracción de datos de extractos con IA (Groq API)
// ============================================

const OCRExtractos = {
  // Configuración
  CONFIG: {
    API_URL: 'https://api.groq.com/openai/v1/chat/completions',
    API_KEY: '', // Se configura desde config.js o UI
    MODEL: 'meta-llama/llama-4-maverick-17b-128e-instruct'
  },

  // Inicializar con config global o localStorage
  init() {
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
  },

  // Guardar API key
  setApiKey(key) {
    this.CONFIG.API_KEY = key;
    localStorage.setItem('groq_api_key', key);
  },

  // Verificar si hay API key configurada
  hasApiKey() {
    return !!this.CONFIG.API_KEY;
  },

  /**
   * PROCESAR IMAGEN DE QUINIELA (TODAS LAS PROVINCIAS)
   */
  async procesarImagenQuiniela(imageBase64, mimeType, provinciaHint = '') {
    const prompt = `Analiza esta imagen de resultados de lotería y devuelve SOLO un objeto JSON válido.

REGLAS CRÍTICAS DE EXTRACCIÓN:
1. IDENTIFICACIÓN DE PROVINCIA (MUY IMPORTANTE): Lee el encabezado de la imagen para determinar la LOTERÍA/PROVINCIA.
   - Si dice "CIUDAD", "CABA" o "LOTBA" -> provincia: "51" (4 DÍGITOS por número)
   - Si dice "PROVINCIA", "BUENOS AIRES" -> provincia: "53" (4 DÍGITOS)
   - Si dice "CORDOBA" -> provincia: "55" (4 DÍGITOS)
   - Si dice "SANTA FE" -> provincia: "72" (4 DÍGITOS)
   - Si dice "ENTRE RIOS" -> provincia: "59" (4 DÍGITOS)
   - Si dice "MENDOZA" -> provincia: "64" (4 DÍGITOS)
   - Si dice "MONTEVIDEO", "URUGUAY", "15:00 hs" o "21:00 hs" -> provincia: "00" (3 DÍGITOS por número - ÚNICO CASO DE 3 CIFRAS)

2. CIFRAS POR NÚMERO:
   - MONTEVIDEO (00): Cada número DEBE tener EXACTAMENTE 3 DÍGITOS.
   - RESTO DE ARGENTINA (CABA, PBA, etc.): Cada número DEBE tener EXACTAMENTE 4 DÍGITOS.

3. EXTRACCIÓN DE TABLA: Busca las 20 posiciones (puestos 1 al 20) y extrae el número ganador asociado.

4. MODALIDAD: Detecta si es LA PREVIA, LA PRIMERA, MATUTINA, VESPERTINA o NOCTURNA.

5. FECHA Y HORA: Busca la fecha (DD/MM/YY) y la hora del sorteo.

6. LETRAS (MUY IMPORTANTE): Busca la sección "CLAVE DE LETRAS" o "LETRAS" en la imagen.
   - Generalmente aparece con 4 letras ganadoras (ej: "A", "B", "C", "D")
   - Las letras válidas son de la A a la P
   - Si no hay letras visibles, devolver array vacío []
   - IMPORTANTE: Extraer las 4 letras en orden (1ra, 2da, 3ra, 4ta)

HINT (Referencia): El usuario cree que es la provincia "${provinciaHint}", pero PRIORIZA LO QUE DIGA EL TEXTO DE LA IMAGEN.

Responde SOLO con este JSON (INCLUIR SIEMPRE EL CAMPO "letras"):
{"sorteo":"NUMERO","fecha":"DD/MM/YY","hora":"HH:MM","provincia":"CODIGO","modalidad":"NOMBRE","numeros":["num1",...20 números],"letras":["A","B","C","D"]}`;

    return await this.llamarAPI(imageBase64, mimeType, prompt);
  },

  // Llamar a la API de Groq
  async llamarAPI(imageBase64, mimeType, prompt) {
    if (!this.CONFIG.API_KEY) {
      throw new Error('No hay API key de Groq configurada. Configurá tu clave en el panel.');
    }

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
      console.error('Error en OCR:', error);
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
      // ÚNICO CASO DE 3 CIFRAS: Montevideo (00, 151 o 211). Todo lo demás es 4.
      const digitos = (parsed.provincia === '00' || parsed.provincia === '151' || parsed.provincia === '211') ? 3 : 4;
      parsed.numeros = this.limpiarNumeros(parsed.numeros, digitos);
    }

    // Normalizar letras extraídas
    if (parsed.letras && Array.isArray(parsed.letras)) {
      parsed.letras = this.limpiarLetras(parsed.letras);
    } else {
      parsed.letras = []; // Asegurar que siempre exista el campo
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

    console.log('[OCR] Datos extraídos:', {
      provincia: parsed.provincia,
      modalidad: parsed.modalidad,
      numerosCount: parsed.numeros?.length,
      letras: parsed.letras
    });

    return {
      success: true,
      data: parsed
    };
  },

  // Limpiar y validar letras
  limpiarLetras(letras) {
    const letrasValidas = 'ABCDEFGHIJKLMNOP';
    const resultado = [];

    for (let i = 0; i < Math.min(letras.length, 4); i++) {
      let letra = (letras[i] || '').toString().toUpperCase().trim();
      // Tomar solo el primer caracter si hay más
      letra = letra.charAt(0);
      // Validar que sea una letra válida (A-P)
      if (letra && letrasValidas.includes(letra)) {
        resultado.push(letra);
      }
    }

    return resultado;
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
      if (error.name === 'NotAllowedError') {
        throw new Error('Permiso denegado. Debés permitir el acceso a la pantalla para capturar el extracto.');
      }
      console.error('Error en captura de pantalla:', error);
      throw error;
    }
  }
};

// Inicializar al cargar
OCRExtractos.init();

// Disponible globalmente
window.OCRExtractos = OCRExtractos;
