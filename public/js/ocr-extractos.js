// ============================================
// MÓDULO OCR EXTRACTOS - SIMBA V2
// Extracción de datos de extractos con IA (Groq/Mistral/OpenAI)
// Sistema de fallback automático entre proveedores
// ============================================

const OCRExtractos = {
  STORAGE_KEYS: {
    GROQ: 'groq_api_key',
    OPENAI: 'openai_api_key',
    MISTRAL: 'mistral_api_key'
  },

  // Configuración principal (Groq por defecto, compatible con versión anterior)
  CONFIG: {
    API_URL: 'https://api.groq.com/openai/v1/chat/completions',
    API_KEY: '',
    MODEL: 'meta-llama/llama-4-maverick-17b-128e-instruct'
  },

  // Lista de proveedores para fallback
  PROVIDERS: [],
  CURRENT_PROVIDER: null,

  // Proxy servidor disponible (fallback cuando no hay API keys en browser)
  // null = verificando, true = disponible, false = no disponible
  _servidorOCRDisponible: null,

  // Inicializar con config global o localStorage
  init() {
    // 1. Cargar proveedores desde config.js
    if (window.SIMBA_CONFIG && window.SIMBA_CONFIG.OCR_PROVIDERS) {
      this.PROVIDERS = window.SIMBA_CONFIG.OCR_PROVIDERS
        .filter(p => p.enabled)
        .map(p => ({ ...p, API_KEY: (p.API_KEY || '').trim() }));
    }

    // 2. Fallback a configuración legacy (solo Groq)
    if (this.PROVIDERS.length === 0 && window.SIMBA_CONFIG && window.SIMBA_CONFIG.GROQ) {
      this.CONFIG.API_URL = window.SIMBA_CONFIG.GROQ.API_URL || this.CONFIG.API_URL;
      this.CONFIG.API_KEY = window.SIMBA_CONFIG.GROQ.API_KEY || this.CONFIG.API_KEY;
      this.CONFIG.MODEL = window.SIMBA_CONFIG.GROQ.MODEL || this.CONFIG.MODEL;
      this.PROVIDERS = [{
        name: 'GROQ',
        enabled: true,
        API_KEY: (this.CONFIG.API_KEY || '').trim(),
        API_URL: this.CONFIG.API_URL,
        MODEL: this.CONFIG.MODEL
      }];
    }

    // 3. Sobrescribir con localStorage si existe (preferencia del usuario)
    if (this.PROVIDERS.length > 0) {
      this.PROVIDERS.forEach(provider => {
        const storageKey = this.STORAGE_KEYS[provider.name];
        const savedKey = storageKey ? localStorage.getItem(storageKey) : '';
        if ((!provider.API_KEY || !provider.API_KEY.trim()) && savedKey && savedKey.trim()) {
          provider.API_KEY = savedKey.trim();
        }
      });

      // Compatibilidad legacy: si existe groq_api_key y no hay GROQ cargado, mantener CONFIG.API_KEY
      const savedGroqKey = localStorage.getItem('groq_api_key');
      if (savedGroqKey && savedGroqKey.trim()) {
        const groqProvider = this.PROVIDERS.find(p => p.name === 'GROQ');
        if (groqProvider && (!groqProvider.API_KEY || !groqProvider.API_KEY.trim())) {
          groqProvider.API_KEY = savedGroqKey.trim();
        }
      }
    }

    const savedModel = localStorage.getItem('groq_model');
    if (savedModel) {
      this.CONFIG.MODEL = savedModel;
    }

    const activo = this.getAvailableProviders()[0];
    if (activo) {
      this.CONFIG.API_KEY = activo.API_KEY;
      this.CONFIG.API_URL = activo.API_URL;
      this.CONFIG.MODEL = activo.MODEL;
      this.CURRENT_PROVIDER = activo.name;
    } else {
      this.CURRENT_PROVIDER = null;
    }

    this.emitirCambioProveedor();

    const resumen = this.PROVIDERS
      .map(p => `${p.name}${p.API_KEY ? '✓' : '✗'}`)
      .join(' → ');
    console.log('[OCR] Proveedores habilitados:', resumen || 'ninguno');

    // Si no hay proveedores con key, verificar si el servidor puede hacer OCR
    // (servidor usa GROQ_API_KEY del .env de Hostinger — fix para producción sin config.local.js)
    if (this.getAvailableProviders().length === 0) {
      this._verificarOCRServidor();
    }
  },

  // Verifica si el servidor tiene GROQ_API_KEY configurada (no bloquea init)
  async _verificarOCRServidor() {
    try {
      const token = localStorage.getItem('cl_token');
      if (!token) return;
      const resp = await fetch('/api/ocr/estado', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (resp.ok) {
        const data = await resp.json();
        this._servidorOCRDisponible = data.disponible === true;
        if (this._servidorOCRDisponible) {
          console.log('[OCR] ✓ Servidor con OCR disponible (proxy Groq)');
        } else {
          console.warn('[OCR] ✗ Servidor sin OCR configurado');
        }
      }
    } catch (e) {
      this._servidorOCRDisponible = false;
    }
  },

  // Llamar al OCR via proxy del servidor (usa GROQ_API_KEY del .env)
  async llamarAPIServidor(imageBase64, mimeType, prompt) {
    const token = localStorage.getItem('cl_token');
    if (!token) throw new Error('No hay sesión activa para usar OCR del servidor');

    // Limpiar base64
    let cleanBase64 = imageBase64.replace(/[\r\n\s]/g, '');
    if (cleanBase64.includes(',')) cleanBase64 = cleanBase64.split(',')[1] || cleanBase64;

    const response = await fetch('/api/ocr/procesar-imagen', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ imageBase64: cleanBase64, mimeType, prompt })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Error servidor OCR: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.content) throw new Error(data.error || 'Respuesta vacía del servidor OCR');

    console.log('[OCR] ✓ Servidor respondió correctamente');
    this.CURRENT_PROVIDER = 'SERVIDOR';
    this.emitirCambioProveedor();
    return this.procesarRespuesta(data.content);
  },

  getAvailableProviders() {
    return this.PROVIDERS.filter(p => p.enabled !== false && !!(p.API_KEY && p.API_KEY.trim()));
  },

  getCurrentProviderName() {
    if (this.CURRENT_PROVIDER) return this.CURRENT_PROVIDER;
    const firstAvailable = this.getAvailableProviders()[0];
    return firstAvailable ? firstAvailable.name : null;
  },

  emitirCambioProveedor() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('ocr-provider-changed', {
      detail: { provider: this.getCurrentProviderName() }
    }));
  },

  detectarProveedorPorKey(key) {
    const normalized = (key || '').trim();
    if (normalized.startsWith('gsk_')) return 'GROQ';
    if (normalized.startsWith('sk-')) return 'OPENAI';
    return 'GROQ';
  },

  // Guardar API key (con autodetección de proveedor)
  setApiKey(key, providerName = 'AUTO') {
    const normalizedKey = (key || '').trim();
    if (!normalizedKey) return null;

    const detectedProvider = providerName === 'AUTO'
      ? this.detectarProveedorPorKey(normalizedKey)
      : providerName;

    let provider = this.PROVIDERS.find(p => p.name === detectedProvider);

    if (!provider && detectedProvider === 'GROQ') {
      provider = {
        name: 'GROQ',
        enabled: true,
        API_KEY: '',
        API_URL: this.CONFIG.API_URL,
        MODEL: this.CONFIG.MODEL
      };
      this.PROVIDERS.unshift(provider);
    }

    if (provider) {
      provider.API_KEY = normalizedKey;
      this.CONFIG.API_KEY = normalizedKey;
      this.CONFIG.API_URL = provider.API_URL || this.CONFIG.API_URL;
      this.CONFIG.MODEL = provider.MODEL || this.CONFIG.MODEL;
      this.CURRENT_PROVIDER = provider.name;
      this.emitirCambioProveedor();

      const storageKey = this.STORAGE_KEYS[provider.name] || 'groq_api_key';
      localStorage.setItem(storageKey, normalizedKey);

      if (provider.name === 'GROQ') {
        localStorage.setItem('groq_api_key', normalizedKey);
      }

      return provider.name;
    }

    this.CONFIG.API_KEY = normalizedKey;
    this.CURRENT_PROVIDER = this.detectarProveedorPorKey(normalizedKey);
    this.emitirCambioProveedor();
    localStorage.setItem('groq_api_key', normalizedKey);
    return null;
  },

  // Verificar si hay API key configurada (browser, localStorage O servidor)
  hasApiKey() {
    if (this.getAvailableProviders().length > 0) return true;   // providers con key
    if (this.CONFIG.API_KEY && this.CONFIG.API_KEY.trim()) return true; // legacy key
    if (this._servidorOCRDisponible === true) return true;   // servidor confirmado
    if (this._servidorOCRDisponible === null) return true;   // aún verificando → optimista
    return false;  // servidor confirmó que no hay OCR disponible
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
    const availableProviders = this.getAvailableProviders();

    if (availableProviders.length === 0 && !this.CONFIG.API_KEY) {
      // Sin providers en browser → intentar proxy del servidor directamente
      try {
        console.log('[OCR] Sin providers en browser, intentando proxy servidor...');
        return await this.llamarAPIServidor(imageBase64, mimeType, prompt);
      } catch (serverErr) {
        throw new Error('No hay API keys configuradas y el servidor no tiene OCR. ' + serverErr.message);
      }
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
    const providers = availableProviders.length > 0 ? availableProviders : [{
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
        this.CURRENT_PROVIDER = provider.name;
        this.emitirCambioProveedor();
        console.log(`[OCR] ✓ ${provider.name} respondió correctamente`);
        return result;
      } catch (error) {
        console.warn(`[OCR] ✗ ${provider.name} falló:`, error.message);
        lastError = error;
        // Continuar con el siguiente proveedor
      }
    }

    // Si todos los proveedores del browser fallaron → intentar proxy servidor como último recurso
    try {
      console.log('[OCR] Todos los providers fallaron, intentando proxy servidor...');
      return await this.llamarAPIServidor(imageBase64, mimeType, prompt);
    } catch (serverErr) {
      console.warn('[OCR] Proxy servidor también falló:', serverErr.message);
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
    let jsonStr = this.normalizarTextoJSON(content);

    if (!jsonStr) {
      throw new Error('Respuesta OCR vacía');
    }

    const candidatos = this.generarCandidatosJSON(jsonStr);
    let parsed;

    for (const candidato of candidatos) {
      const valor = this.intentarParseJSON(candidato);
      if (valor !== undefined) {
        parsed = valor;
        break;
      }
    }

    // Algunos proveedores devuelven un JSON serializado como string
    if (typeof parsed === 'string') {
      const reparsed = this.intentarParseJSON(this.normalizarTextoJSON(parsed));
      if (reparsed !== undefined) {
        parsed = reparsed;
      }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('No se pudo parsear la respuesta como JSON');
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

  normalizarTextoJSON(texto) {
    if (texto === null || texto === undefined) return '';

    return String(texto)
      .replace(/^\uFEFF/, '')
      .replace(/```json/gi, '```')
      .replace(/```/g, '')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .trim();
  },

  intentarParseJSON(texto) {
    if (!texto || typeof texto !== 'string') return undefined;

    try {
      return JSON.parse(texto);
    } catch (error) {
      return undefined;
    }
  },

  limpiarComasFinales(texto) {
    return texto.replace(/,\s*([}\]])/g, '$1');
  },

  extraerBloqueJSONBalanceado(texto) {
    const inicio = texto.indexOf('{');
    if (inicio === -1) return null;

    let profundidad = 0;
    let enString = false;
    let escape = false;

    for (let i = inicio; i < texto.length; i++) {
      const char = texto[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (char === '"') {
        enString = !enString;
        continue;
      }

      if (enString) continue;

      if (char === '{') profundidad++;
      if (char === '}') {
        profundidad--;
        if (profundidad === 0) {
          return texto.slice(inicio, i + 1);
        }
      }
    }

    return null;
  },

  generarCandidatosJSON(texto) {
    const candidatos = [];
    const agregar = (valor) => {
      if (!valor || typeof valor !== 'string') return;
      const limpio = valor.trim();
      if (!limpio) return;
      if (!candidatos.includes(limpio)) candidatos.push(limpio);

      const sinComasFinales = this.limpiarComasFinales(limpio);
      if (sinComasFinales !== limpio && !candidatos.includes(sinComasFinales)) {
        candidatos.push(sinComasFinales);
      }
    };

    agregar(texto);

    const bloqueBalanceado = this.extraerBloqueJSONBalanceado(texto);
    if (bloqueBalanceado) {
      agregar(bloqueBalanceado);
    }

    const matchGreedy = texto.match(/\{[\s\S]*\}/);
    if (matchGreedy?.[0]) {
      agregar(matchGreedy[0]);
    }

    // Caso: string JSON envuelto en comillas
    if ((texto.startsWith('"') && texto.endsWith('"')) || (texto.startsWith("'") && texto.endsWith("'"))) {
      const descomillado = texto.slice(1, -1);
      agregar(descomillado);
    }

    return candidatos;
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
   * PROCESAR IMAGEN DE EXTRACTO POCEADA
   * Extrae los datos de un extracto de POCEADA (20 números + 4 letras)
   * Poceada: Los jugadores eligen 8-15 números (0-99), ganan si sus números están entre los 20 sorteados
   */
  async procesarImagenPoceada(imageBase64, mimeType) {
    const prompt = `Actuás como un extractor especializado de resultados de lotería POCEADA de Argentina.

Analizá esta imagen de extracto oficial y devolvé SOLO un objeto JSON válido.

REGLAS DE EXTRACCIÓN CRÍTICAS:

1. POCEADA sortea 20 NÚMEROS del 00 al 99 (dos dígitos cada uno: 00, 01, 02... 99)

2. POCEADA sortea 4 LETRAS válidas (de la A a la P)

3. BUSCAR EN EL EXTRACTO:
   - Los 20 números sorteados (pueden estar en una tabla o lista)
   - Las 4 letras ganadoras (pueden aparecer como "LETRAS", "CLAVE" o similar)
   - Número de sorteo/concurso
   - Fecha del sorteo

4. PREMIOS (si están visibles):
   - 8 ACIERTOS: Primer Premio (62% del pozo)
   - 7 ACIERTOS: Segundo Premio (23.5% del pozo)
   - 6 ACIERTOS: Tercer Premio (10% del pozo)
   - VACANTE: Cuando dice "SIN GANADORES" o muestra 0 ganadores

5. FORMATO DE NÚMEROS:
   - SIEMPRE 2 dígitos: "00", "05", "23", "99"
   - El cero se escribe "00"

6. MONTOS: Convertir de formato argentino "999.999.999,99" a número decimal con punto

7. FORMATO DE SALIDA:
{
  "game": "POCEADA",
  "sorteo_number": "XXXX",
  "date": "YYYY-MM-DD",
  "numeros": ["00","01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19"],
  "letras": ["A","B","C","D"],
  "prizes": {
    "8": { "winners": N, "premio_por_ganador": MONTO, "pozo": MONTO, "vacante": true/false },
    "7": { "winners": N, "premio_por_ganador": MONTO, "pozo": MONTO },
    "6": { "winners": N, "premio_por_ganador": MONTO, "pozo": MONTO }
  },
  "estimulo": { "monto": MONTO, "winners": N }
}

IMPORTANTE: Los 20 números sorteados son los números que salieron en el sorteo. Los jugadores ganan si SUS números elegidos coinciden con estos 20.`;

    return await this.llamarAPI(imageBase64, mimeType, prompt);
  },

  /**
   * PROCESAR IMAGEN DE EXTRACTO TOMBOLINA
   * Extrae los datos de un extracto de TOMBOLINA (20 números + 4 letras, igual que Quiniela pero sorteo propio)
   */
  async procesarImagenTombolina(imageBase64, mimeType) {
    const prompt = `Actuás como un extractor especializado de resultados de lotería TOMBOLINA de Argentina.

Analizá esta imagen de extracto oficial y devolvé SOLO un objeto JSON válido.

REGLAS DE EXTRACCIÓN CRÍTICAS:

1. TOMBOLINA es similar a Quiniela: sortea 20 NÚMEROS en posiciones del 1° al 20°

2. Cada número tiene 2 dígitos (00-99) o 4 dígitos según el extracto

3. También sortea 4 LETRAS válidas (de la A a la P)

4. BUSCAR EN EL EXTRACTO:
   - Los 20 números sorteados en orden de posición (1° al 20°)
   - Las 4 letras ganadoras
   - Número de sorteo
   - Fecha y hora del sorteo
   - Modalidad: MATUTINA, VESPERTINA o NOCTURNA

5. TABLA DE PREMIOS TOMBOLINA (referencia):
   - 3 de 3 números: multiplicador 50x
   - 4 de 4 números: multiplicador 140x
   - 5 de 5 números: multiplicador 700x
   - 6 de 6 números: multiplicador 3500x
   - 7 de 7 números: multiplicador 8000x
   - Letras (4 coinciden): premio fijo $1000

6. FORMATO DE NÚMEROS:
   - Si son 2 dígitos: "00", "05", "23", "99"
   - Si son 4 dígitos: "0000", "0523", "1234", "9999"
   - Extraer en el formato que aparezcan

7. FORMATO DE SALIDA:
{
  "game": "TOMBOLINA",
  "sorteo": "XXXX",
  "fecha": "YYYY-MM-DD",
  "hora": "HH:MM",
  "modalidad": "NOCTURNA",
  "numeros": ["num1","num2",...,"num20"],
  "letras": ["A","B","C","D"],
  "provincia": "51"
}

IMPORTANTE: Detectar si el extracto dice "TOMBOLINA", "TOMBOLA" o similar en el encabezado.`;

    return await this.llamarAPI(imageBase64, mimeType, prompt);
  },

  /**
   * DETECTAR TIPO DE EXTRACTO Y PROCESAR
   * Detecta automáticamente si es BRINCO, QUINI 6, POCEADA, TOMBOLINA o Quiniela y procesa
   */
  async procesarExtractoAuto(imageBase64, mimeType) {
    // Primero detectar el tipo de extracto
    const promptDeteccion = `Analiza esta imagen de lotería argentina y determina qué tipo de juego es.
Responde SOLO con uno de estos valores exactos:
- "BRINCO" si ves textos como "BRINCO EXTRACCIONES", "BRINCO JUNIOR"
- "QUINI_6" si ves textos como "TRADICIONAL PRIMER SORTEO", "REVANCHA", "SIEMPRE SALE"
- "POCEADA" si ves textos como "POCEADA", "LA POCEADA" o menciona 8 aciertos/7 aciertos como premios
- "TOMBOLINA" si ves textos como "TOMBOLINA", "TOMBOLA" o similar
- "QUINIELA" si ves una tabla de 20 números con posiciones del 1 al 20 y menciona CABA/Buenos Aires/etc.

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
      } else if (tipoDetectado.includes('POCEADA')) {
        return await this.procesarImagenPoceada(imageBase64, mimeType);
      } else if (tipoDetectado.includes('TOMBOLINA') || tipoDetectado.includes('TOMBOLA')) {
        return await this.procesarImagenTombolina(imageBase64, mimeType);
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
    } else if (data.game === 'POCEADA' && data.sorteo_number) {
      return `extracto_poceada_${data.sorteo_number}.json`;
    } else if (data.game === 'TOMBOLINA' && data.sorteo) {
      return `extracto_tombolina_${data.sorteo}.json`;
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
