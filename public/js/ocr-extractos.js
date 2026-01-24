// ============================================
// MÓDULO OCR EXTRACTOS - SIMBA V2
// Extracción de datos de extractos con IA (Groq API)
// ============================================

const OCRExtractos = {
  // Configuración
  CONFIG: {
    API_URL: 'https://api.groq.com/openai/v1/chat/completions',
    API_KEY: '', // Se configura desde la UI
    MODEL: 'llama-3.2-90b-vision-preview'
  },

  // Inicializar con API key desde localStorage
  init() {
    const savedKey = localStorage.getItem('groq_api_key');
    if (savedKey) {
      this.CONFIG.API_KEY = savedKey;
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

  // Procesar imagen de extracto de Quiniela
  async procesarImagenQuiniela(imageBase64, mimeType, provinciaHint = '') {
    const prompt = `Analiza esta imagen de resultados de lotería/quiniela y extrae los datos.

DATOS A EXTRAER:
1. sorteo: número de sorteo (si aparece)
2. fecha: formato YYYY-MM-DD
3. hora: formato HH:MM (si aparece)
4. provincia: código numérico según esta lista (usa el hint si es coherente: ${provinciaHint}):
   - 51: CABA / Ciudad de Buenos Aires
   - 53: Buenos Aires (Provincia)
   - 55: Córdoba
   - 72: Santa Fe
   - 59: Entre Ríos
   - 64: Mendoza
   - 00: Montevideo (Uruguay)
5. modalidad: R=La Previa, P=La Primera, M=Matutina, V=Vespertina, N=Nocturna
6. numeros: array de 20 números (cada uno de 4 dígitos, con ceros a la izquierda si es necesario)
7. letras: string con las 5 letras (solo para CABA, dejar vacío para otras provincias)

IMPORTANTE: 
- Los números deben ser de 4 dígitos (ej: "0123", "4567")
- Lee los números REALES de la imagen, no inventes
- Las letras son 5 caracteres (A-Z) que aparecen generalmente al final

Responde SOLO con este JSON (sin markdown ni explicaciones):
{
  "sorteo": "NUMERO",
  "fecha": "YYYY-MM-DD",
  "hora": "HH:MM",
  "provincia": "XX",
  "modalidad": "X",
  "numeros": ["0000","0001",...20 números],
  "letras": "ABCDE"
}`;

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

    // Validar y limpiar números
    if (parsed.numeros && Array.isArray(parsed.numeros)) {
      parsed.numeros = this.limpiarNumeros(parsed.numeros, 4);
    }

    // Limpiar letras
    if (parsed.letras) {
      parsed.letras = parsed.letras.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 5);
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
    // Cargar PDF.js si no está cargado
    if (!window.pdfjsLib) {
      await this.cargarPdfJs();
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const scale = 2; // Mayor calidad
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

// Inicializar al cargar
OCRExtractos.init();

// Disponible globalmente
window.OCRExtractos = OCRExtractos;
