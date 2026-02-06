// ============================================
// CONFIGURACIÓN GLOBAL - SIMBA V2
// Las API keys se configuran en config.local.js (no se sube a git)
// ============================================

const CONFIG = {
    // Proveedores de OCR (en orden de prioridad para fallback)
    // Las API keys se cargan desde config.local.js
    OCR_PROVIDERS: [
        {
            name: 'GROQ',
            enabled: true,
            API_KEY: '', // Se carga desde config.local.js
            API_URL: 'https://api.groq.com/openai/v1/chat/completions',
            MODEL: 'meta-llama/llama-4-scout-17b-16e-instruct'
        },
        {
            name: 'MISTRAL',
            enabled: false,  // Deshabilitado - rate limits muy bajos
            API_KEY: '',
            API_URL: 'https://api.mistral.ai/v1/chat/completions',
            MODEL: 'mistral-small-2506'
        },
        {
            name: 'OPENAI',
            enabled: true,
            API_KEY: '', // Se carga desde config.local.js
            API_URL: 'https://api.openai.com/v1/chat/completions',
            MODEL: 'gpt-4o'
        }
    ],
    // Mantener GROQ para compatibilidad hacia atrás
    GROQ: {
        API_KEY: '',
        API_URL: 'https://api.groq.com/openai/v1/chat/completions',
        MODEL: 'meta-llama/llama-4-scout-17b-16e-instruct'
    }
};

// Merge con config local si existe (config.local.js carga antes)
if (window.SIMBA_CONFIG_LOCAL && window.SIMBA_CONFIG_LOCAL.OCR_PROVIDERS) {
    CONFIG.OCR_PROVIDERS.forEach((provider, index) => {
        const localProvider = window.SIMBA_CONFIG_LOCAL.OCR_PROVIDERS.find(p => p.name === provider.name);
        if (localProvider && localProvider.API_KEY) {
            CONFIG.OCR_PROVIDERS[index].API_KEY = localProvider.API_KEY;
            if (provider.name === 'GROQ') {
                CONFIG.GROQ.API_KEY = localProvider.API_KEY;
            }
        }
    });
}

// Exportar para uso global si no se usa módulos
window.SIMBA_CONFIG = CONFIG;
