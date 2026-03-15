// ============================================
// OCR CONTROLLER - SIMBA V2
// Proxy servidor para llamadas a OpenAI API (OCR)
// Usa OPENAI_API_KEY del servidor (.env) en lugar de exponer la key al browser
// ============================================

const OCR_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
const OCR_MODEL   = process.env.OPENAI_MODEL   || 'gpt-4o-mini';

/**
 * POST /api/ocr/procesar-imagen
 * Body: { imageBase64: string, mimeType: string, prompt: string }
 * Proxy que llama a OpenAI API desde el servidor usando la API key del .env
 */
const procesarImagen = async (req, res) => {
  try {
    const { imageBase64, mimeType, prompt } = req.body || {};

    if (!imageBase64 || !prompt) {
      return res.status(400).json({ success: false, error: 'Faltan imageBase64 y/o prompt' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ success: false, error: 'OCR no configurado en servidor (falta OPENAI_API_KEY)' });
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

    const openaiResponse = await fetch(OCR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error(`[OCR Server] Error OpenAI API: ${openaiResponse.status} - ${errorText}`);
      if (openaiResponse.status === 401) {
        return res.status(502).json({ success: false, error: 'API key de OpenAI inválida en servidor' });
      }
      return res.status(502).json({ success: false, error: `Error OpenAI API: ${openaiResponse.status}` });
    }

    const data = await openaiResponse.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({ success: false, error: 'Respuesta vacía de OpenAI API' });
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
  const tieneKey = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
  return res.json({
    success: true,
    disponible: tieneKey,
    modelo: tieneKey ? OCR_MODEL : null
  });
};

module.exports = { procesarImagen, estadoOCR };
