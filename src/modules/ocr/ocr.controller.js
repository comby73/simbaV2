// ============================================
// OCR CONTROLLER - SIMBA V2
// Proxy servidor para llamadas a Groq API (OCR)
// Usa GROQ_API_KEY del servidor (.env) en lugar de exponer la key al browser
// ============================================

const OCR_API_URL = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
const OCR_MODEL   = process.env.GROQ_MODEL   || 'meta-llama/llama-4-maverick-17b-128e-instruct';

/**
 * POST /api/ocr/procesar-imagen
 * Body: { imageBase64: string, mimeType: string, prompt: string }
 * Proxy que llama a Groq API desde el servidor usando la API key del .env
 */
const procesarImagen = async (req, res) => {
  try {
    const { imageBase64, mimeType, prompt } = req.body || {};

    if (!imageBase64 || !prompt) {
      return res.status(400).json({ success: false, error: 'Faltan imageBase64 y/o prompt' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ success: false, error: 'OCR no configurado en servidor (falta GROQ_API_KEY)' });
    }

    const dataUrlPrefix = mimeType === 'image/png'
      ? 'data:image/png;base64,'
      : 'data:image/jpeg;base64,';

    const requestBody = {
      model: OCR_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrlPrefix + imageBase64 } }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 2000,
      stream: false
    };

    console.log(`[OCR Server] Procesando imagen (${mimeType}, ${Math.round(imageBase64.length / 1024)}KB) con modelo ${OCR_MODEL}`);

    const groqResponse = await fetch(OCR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error(`[OCR Server] Error Groq API: ${groqResponse.status} - ${errorText}`);
      if (groqResponse.status === 401) {
        return res.status(502).json({ success: false, error: 'API key de Groq inválida en servidor' });
      }
      return res.status(502).json({ success: false, error: `Error Groq API: ${groqResponse.status}` });
    }

    const data = await groqResponse.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({ success: false, error: 'Respuesta vacía de Groq API' });
    }

    console.log(`[OCR Server] Respuesta OK (${content.length} chars)`);
    return res.json({ success: true, content });

  } catch (error) {
    console.error('[OCR Server] Error procesarImagen:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/ocr/estado
 * Indica si el servidor tiene OCR configurado (sin exponer la key)
 */
const estadoOCR = async (req, res) => {
  const tieneKey = !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());
  return res.json({
    success: true,
    disponible: tieneKey,
    modelo: tieneKey ? OCR_MODEL : null
  });
};

module.exports = { procesarImagen, estadoOCR };
