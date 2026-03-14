// ============================================
// CONFIGURACIÓN LOCAL - SIMBA V2 (EJEMPLO)
// Copiar como: public/js/config.local.js
// Este archivo NO debe subirse a git
// ============================================

const CONFIG_LOCAL = {
    OCR_PROVIDERS: [
        {
            name: 'GEMINI',
            enabled: true,
            API_KEY: 'PEGAR_AQUI_GEMINI_API_KEY',
            API_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
            MODEL: 'gemini-2.0-flash'
        },
        {
            name: 'GROQ',
            enabled: true,
            API_KEY: 'PEGAR_AQUI_GROQ_API_KEY',
            API_URL: 'https://api.groq.com/openai/v1/chat/completions',
            MODEL: 'meta-llama/llama-4-scout-17b-16e-instruct'
        },
        {
            name: 'MISTRAL',
            enabled: false,
            API_KEY: '',
            API_URL: 'https://api.mistral.ai/v1/chat/completions',
            MODEL: 'mistral-small-2506'
        },
        {
            name: 'OPENAI',
            enabled: true,
            API_KEY: 'PEGAR_AQUI_OPENAI_API_KEY',
            API_URL: 'https://api.openai.com/v1/chat/completions',
            MODEL: 'gpt-4o'
        }
    ]
};

window.SIMBA_CONFIG_LOCAL = CONFIG_LOCAL;
