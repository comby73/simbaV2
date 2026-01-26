// ============================================
// CONFIGURACIÓN GLOBAL - SIMBA V2
// ============================================

const CONFIG = {
    // Groq API (OCR)
    GROQ: {
        API_KEY: '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',
        API_URL: 'https://api.groq.com/openai/v1/chat/completions',
        MODEL: 'meta-llama/llama-4-maverick-17b-128e-instruct'
    }
};

// Exportar para uso global si no se usa módulos
window.SIMBA_CONFIG = CONFIG;
