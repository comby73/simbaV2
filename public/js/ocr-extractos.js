// ============================================
// MÓDULO OCR EXTRACTOS - SIMBA V2
// Extracción de datos de extractos con IA (Groq/Mistral/OpenAI)
// Sistema de fallback automático entre proveedores
// ============================================

const OCRExtractos = {
  // Configuración principal (Groq por defecto, compatible con versión anterior)
  CONFIG: {
    API_URL: 'https://api.groq.com/openai/v1/chat/completions',
    API_KEY: '',
    MODEL: 'meta-llama/llama-4-maverick-17b-128e-instruct'
  },

  // Lista de proveedores para fallback
  PROVIDERS: [],

  // Inicializar con config global o localStorage
  init() {
    // 1. Cargar proveedores desde config.js
    if (window.SIMBA_CONFIG && window.SIMBA_CONFIG.OCR_PROVIDERS) {
      this.PROVIDERS = window.SIMBA_CONFIG.OCR_PROVIDERS.filter(p => p.enabled && p.API_KEY);
      console.log('[OCR] Proveedores configurados:', this.PROVIDERS.map(p => p.name).join(' → '));
    }

    // 2. Fallback a configuración legacy (solo Groq)
    if (this.PROVIDERS.length === 0 && window.SIMBA_CONFIG && window.SIMBA_CONFIG.GROQ) {
      this.CONFIG.API_URL = window.SIMBA_CONFIG.GROQ.API_URL || this.CONFIG.API_URL;
      this.CONFIG.API_KEY = window.SIMBA_CONFIG.GROQ.API_KEY || this.CONFIG.API_KEY;
      this.CONFIG.MODEL = window.SIMBA_CONFIG.GROQ.MODEL || this.CONFIG.MODEL;
      this.PROVIDERS = [{
        name: 'GROQ',
        enabled: true,
        API_KEY: this.CONFIG.API_KEY,
        API_URL: this.CONFIG.API_URL,
        MODEL: this.CONFIG.MODEL
      }];
    }

    // 3. Sobrescribir con localStorage si existe (preferencia del usuario)
    const savedKey = localStorage.getItem('groq_api_key');
    if (savedKey && this.PROVIDERS.length > 0) {
      // Actualizar la key de Groq si existe en providers
      const groqProvider = this.PROVIDERS.find(p => p.name === 'GROQ');
      if (groqProvider) {
        groqProvider.API_KEY = savedKey;
      }
      this.CONFIG.API_KEY = savedKey;
    }

    const savedModel = localStorage.getItem('groq_model');
    if (savedModel) {
      this.CONFIG.MODEL = savedModel;
    }
  },

  // Guardar API key (legacy)
  setApiKey(key) {
    this.CONFIG.API_KEY = key;
    localStorage.setItem('groq_api_key', key);
  },

  // Verificar si hay API key configurada
  hasApiKey() {
    return this.PROVIDERS.length > 0 || !!this.CONFIG.API_KEY;
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

  // Llamar a la API con sistema de fallback (Groq → Mistral → OpenAI)
  async llamarAPI(imageBase64, mimeType, prompt) {
    if (this.PROVIDERS.length === 0 && !this.CONFIG.API_KEY) {
      throw new Error('No hay API keys configuradas. Configurá al menos una clave en config.js');
    }

    // Limpiar base64 (remover saltos de línea, espacios, y prefijo si ya existe)
    let cleanBase64 = imageBase64.replace(/[\r\n\s]/g, '');
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1] || cleanBase64;
    }

    // Asegurar mimeType válido
    let validMimeType = mimeType;
    if (!mimeType || (!mimeType.includes('png') && !mimeType.includes('jpeg') && !mimeType.includes('jpg') && !mimeType.includes('webp') && !mimeType.includes('gif'))) {
      validMimeType = 'image/jpeg';
    }

    const dataUrl = `data:${validMimeType};base64,${cleanBase64}`;
    
    console.log('[OCR] MimeType:', validMimeType);
    console.log('[OCR] Base64 length:', cleanBase64.length);

    // Intentar con cada proveedor en orden
    const providers = this.PROVIDERS.length > 0 ? this.PROVIDERS : [{
      name: 'GROQ',
      API_KEY: this.CONFIG.API_KEY,
      API_URL: this.CONFIG.API_URL,
      MODEL: this.CONFIG.MODEL
    }];

    let lastError = null;

    for (const provider of providers) {
      try {
        console.log(`[OCR] Intentando con ${provider.name}...`);
        const result = await this.llamarProviderAPI(provider, dataUrl, prompt);
        console.log(`[OCR] ✓ ${provider.name} respondió correctamente`);
        return result;
      } catch (error) {
        console.warn(`[OCR] ✗ ${provider.name} falló:`, error.message);
        lastError = error;
        // Continuar con el siguiente proveedor
      }
    }

    // Si todos los proveedores fallaron
    throw new Error(`Todos los proveedores OCR fallaron. Último error: ${lastError?.message || 'desconocido'}`);
  },

  // Llamar a un proveedor específico
  async llamarProviderAPI(provider, dataUrl, prompt) {
    const requestBody = {
      model: provider.MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: dataUrl }
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 2000,
      stream: false
    };

    const response = await fetch(provider.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + provider.API_KEY
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        throw new Error(`API key inválida para ${provider.name}`);
      }
      if (response.status === 429) {
        throw new Error(`Límite de rate excedido en ${provider.name}`);
      }
      throw new Error(`${provider.name} error HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (data.choices && data.choices[0] && data.choices[0].message) {
      const content = data.choices[0].message.content;
      return this.procesarRespuesta(content);
    } else {
      throw new Error(`Respuesta inesperada de ${provider.name}`);
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

  /**
   * PROCESAR IMAGEN DE EXTRACTO BRINCO
   * Extrae los datos de un extracto de BRINCO (Tradicional + Junior)
   */
  async procesarImagenBrinco(imageBase64, mimeType) {
    const prompt = `Actuás como un extractor especializado de resultados de lotería para Argentina.

Analizá esta imagen de extracto de BRINCO y devolvé SOLO un objeto JSON válido.

REGLAS DE EXTRACCIÓN BRINCO:

1. BRINCO tiene dos modalidades:
   - BRINCO Tradicional: 6 números del 00 al 40 (rango 0-40)
   - BRINCO Junior Siempre Sale: 6 números del 00 al 40

2. Para cada modalidad extraer:
   - Los 6 números sorteados (formato "XX" con dos dígitos, ej: "00", "05", "28", "36")
   - IMPORTANTE: El número cero se escribe "00"
   - Cantidad de ganadores por categoría
   - Premio por ganador (monto en pesos)

3. BRINCO TRADICIONAL tiene 4 niveles de premios:
   - 6 aciertos (Primer Premio) - nivel "1"
   - 5 aciertos (Segundo Premio) - nivel "2"
   - 4 aciertos (Tercer Premio) - nivel "3"
   - 3 aciertos (Cuarto Premio) - nivel "4"
   - Estímulo agenciero (para agencia que vendió primer premio)

4. BRINCO JUNIOR (Siempre Sale) tiene:
   - Premio por 5 o 6 aciertos (normalmente 5, usar el que aparece)
   - Siempre hay ganadores
   - Estímulo agenciero

5. MONTOS: Convertí de formato argentino "999.999.999,99" a número decimal con punto (ej: 150000000.00)

6. NÚMERO DE SORTEO: Extraer el número de sorteo del encabezado

7. FECHA: Extraer la fecha del sorteo en formato "YYYY-MM-DD"

8. VACANTE: Si dice "VACANTE" o "SIN GANADOR", el premio está vacante (winners: 0)

Responde ÚNICAMENTE con este JSON:
{
  "game": "BRINCO",
  "sorteo_number": "XXXX",
  "date": "YYYY-MM-DD",
  "currency": "ARS",
  "brinco": {
    "numbers": ["XX", "XX", "XX", "XX", "XX", "XX"],
    "prizes": {
      "1": { "winners": N, "premio_por_ganador": MONTO, "vacante": false },
      "2": { "winners": N, "premio_por_ganador": MONTO },
      "3": { "winners": N, "premio_por_ganador": MONTO },
      "4": { "winners": N, "premio_por_ganador": MONTO }
    },
    "estimulo": { "monto": MONTO, "vacante": false }
  },
  "brinco_junior": {
    "numbers": ["XX", "XX", "XX", "XX", "XX", "XX"],
    "aciertos_requeridos": 5,
    "prizes": {
      "1": { "winners": N, "premio_por_ganador": MONTO, "pozo_total": MONTO }
    },
    "estimulo": { "monto": MONTO, "winners": N, "pagado_total": MONTO }
  }
}`;

    return await this.llamarAPI(imageBase64, mimeType, prompt);
  },

  /**
   * PROCESAR IMAGEN DE EXTRACTO QUINI 6
   * Extrae los datos de un extracto de QUINI 6
   */
  async procesarImagenQuini6(imageBase64, mimeType) {
    const prompt = `Actuás como un extractor especializado de resultados de lotería QUINI 6 de Argentina.

Analizá esta imagen de extracto oficial y devolvé SOLO un objeto JSON válido.

REGLAS DE EXTRACCIÓN CRÍTICAS:

1. NÚMEROS SORTEADOS: Extraer los 6 números grandes de cada modalidad (formato "XX" con 2 dígitos)

2. PREMIOS - LEER MUY CUIDADOSAMENTE:
   Para cada nivel de premio buscar estos datos en el extracto:
   - POZO $: Es el monto acumulado del pozo
   - APUESTAS GANADORAS: Cantidad de ganadores (puede decir "VACANTE" = 0 ganadores)
   - PREMIO POR APUESTA $: Lo que cobra CADA ganador individual

3. TRADICIONAL PRIMER SORTEO y SEGUNDA:
   - 1° Premio = 6 aciertos
   - 2° Premio = 5 aciertos  
   - 3° Premio = 4 aciertos
   - Estímulo = premio al agenciero si hay ganador de 6 aciertos en su agencia

4. SIEMPRE SALE - MUY IMPORTANTE:
   - Buscar "ACIERTOS" = número de aciertos requeridos (puede ser 5 o 6)
   - Este número indica con cuántos aciertos se gana (winning_hits)
   - APUESTAS GANADORAS = cantidad de ganadores
   - PREMIO POR APUESTA = lo que cobra cada ganador

5. PREMIO EXTRA:
   - Leer TODOS los números de 2 dígitos (pueden repetirse)
   - winners = cantidad de ganadores
   - premio_por_ganador = lo que cobra cada uno

6. MONTOS: Convertir "999.999.999,99" argentino a número decimal (ej: 9418648.85)

7. NÚMERO DE SORTEO: Buscar "CONCURSO N°" o "SORTEO" en el encabezado

JSON de respuesta:
{
  "game": "QUINI_6",
  "drawNumber": "XXXX",
  "date": "YYYY-MM-DD",
  "tradicional": {
    "primer": {
      "numbers": ["XX","XX","XX","XX","XX","XX"],
      "prizes": { 
        "1": { "pot": MONTO_POZO, "winners": CANTIDAD, "premio_por_ganador": MONTO_POR_APUESTA, "vacante": true/false },
        "2": { "pot": MONTO_POZO, "winners": CANTIDAD, "premio_por_ganador": MONTO_POR_APUESTA },
        "3": { "pot": MONTO_POZO, "winners": CANTIDAD, "premio_por_ganador": MONTO_POR_APUESTA },
        "estimulo": { "monto": MONTO, "winners": CANTIDAD }
      }
    },
    "segunda": {
      "numbers": ["XX","XX","XX","XX","XX","XX"],
      "prizes": {
        "1": { "pot": MONTO, "winners": CANTIDAD, "premio_por_ganador": MONTO },
        "2": { "pot": MONTO, "winners": CANTIDAD, "premio_por_ganador": MONTO },
        "3": { "pot": MONTO, "winners": CANTIDAD, "premio_por_ganador": MONTO },
        "estimulo": { "monto": MONTO, "winners": CANTIDAD }
      }
    }
  },
  "revancha": {
    "numbers": ["XX","XX","XX","XX","XX","XX"],
    "prizes": {
      "1": { "pot": MONTO, "winners": CANTIDAD, "premio_por_ganador": MONTO, "vacante": true/false },
      "estimulo": { "monto": MONTO }
    }
  },
  "siempre_sale": {
    "numbers": ["XX","XX","XX","XX","XX","XX"],
    "winning_hits": 5,
    "prizes": {
      "1": { "pot": MONTO, "winners": 39, "premio_por_ganador": 9418648.85 },
      "estimulo": { "monto": MONTO, "winners": CANTIDAD }
    }
  },
  "premio_extra": {
    "numbers": ["07","08","08","09","10","14","14","15","16","30","32","33","38","41","41","44","45","45"],
    "pot": 155000000,
    "winners": 175,
    "premio_por_ganador": 885714.29
  }
}`;

    return await this.llamarAPI(imageBase64, mimeType, prompt);
  },

  /**
   * DETECTAR TIPO DE EXTRACTO Y PROCESAR
   * Detecta automáticamente si es BRINCO, QUINI 6 o Quiniela y procesa
   */
  async procesarExtractoAuto(imageBase64, mimeType) {
    // Primero detectar el tipo de extracto
    const promptDeteccion = `Analiza esta imagen de lotería argentina y determina qué tipo de juego es.
Responde SOLO con uno de estos valores exactos:
- "BRINCO" si ves textos como "BRINCO EXTRACCIONES", "BRINCO JUNIOR"
- "QUINI_6" si ves textos como "TRADICIONAL PRIMER SORTEO", "REVANCHA", "SIEMPRE SALE"
- "QUINIELA" si ves una tabla de 20 números con posiciones del 1 al 20

Responde SOLO con la palabra del tipo de juego, sin explicaciones.`;

    try {
      const resultado = await this.llamarAPI(imageBase64, mimeType, promptDeteccion);
      
      if (!resultado.success) {
        throw new Error('No se pudo detectar el tipo de extracto');
      }

      let tipoDetectado = '';
      if (typeof resultado.data === 'string') {
        tipoDetectado = resultado.data.trim().toUpperCase();
      } else if (resultado.data.tipo) {
        tipoDetectado = resultado.data.tipo.toUpperCase();
      }

      console.log('[OCR] Tipo de extracto detectado:', tipoDetectado);

      // Procesar según el tipo detectado
      if (tipoDetectado.includes('BRINCO')) {
        return await this.procesarImagenBrinco(imageBase64, mimeType);
      } else if (tipoDetectado.includes('QUINI') || tipoDetectado.includes('Q6')) {
        return await this.procesarImagenQuini6(imageBase64, mimeType);
      } else {
        // Por defecto, procesar como Quiniela
        return await this.procesarImagenQuiniela(imageBase64, mimeType);
      }
    } catch (error) {
      console.error('Error en detección automática:', error);
      // Si falla la detección, intentar como Quiniela por defecto
      return await this.procesarImagenQuiniela(imageBase64, mimeType);
    }
  },

  /**
   * GENERAR NOMBRE DE ARCHIVO PARA JSON
   */
  generarNombreArchivo(data) {
    if (!data) return null;

    if (data.game === 'BRINCO' && data.sorteo_number) {
      return `extracto_brinco_${data.sorteo_number}.json`;
    } else if (data.game === 'QUINI_6' && data.drawNumber) {
      return `extracto_quini6_${data.drawNumber}.json`;
    } else if (data.sorteo) {
      return `extracto_quiniela_${data.sorteo}.json`;
    }

    return `extracto_${Date.now()}.json`;
  },

  /**
   * DESCARGAR JSON DEL EXTRACTO
   */
  descargarJSON(data, filename = null) {
    const nombreArchivo = filename || this.generarNombreArchivo(data);
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return nombreArchivo;
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
