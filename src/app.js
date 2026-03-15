const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Carga de entorno (prioridad): .env.local > .env > config.env > config.env.txt
// En producción se prioriza el entorno del hosting, pero si faltan variables críticas
// se permite fallback a archivo para evitar arranques sin configuración.
const envCandidates = [
  { file: '.env.local', label: '.env.local (LOCAL)' },
  { file: '.env', label: '.env' },
  { file: 'config.env', label: 'config.env' },
  { file: 'config.env.txt', label: 'config.env.txt' }
].map(e => ({ ...e, path: path.join(__dirname, '..', e.file) }));

const missingCriticalEnv = () => {
  const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET', 'OPENAI_API_KEY'];
  return required.some(k => !process.env[k] || !String(process.env[k]).trim());
};

const shouldLoadFromFile =
  process.env.NODE_ENV !== 'production' ||
  missingCriticalEnv();

if (shouldLoadFromFile) {
  const existentes = envCandidates.filter(e => fs.existsSync(e.path));
  if (existentes.length > 0) {
    existentes.forEach((item, idx) => {
      dotenv.config({ path: item.path, override: false });
      const esPrimario = idx === 0;
      const prefijo = esPrimario ? '📁 Usando configuración' : '📁 Cargando configuración complementaria';
      const suffix = process.env.NODE_ENV === 'production' && esPrimario
        ? ' (fallback por variables faltantes)'
        : '';
      console.log(`${prefijo}: ${item.label}${suffix}`);
    });
  } else {
    console.log('⚠️ No se encontró archivo de entorno (.env.local/.env/config.env/config.env.txt)');
  }
} else {
  console.log('📁 Modo PRODUCCIÓN: usando variables de entorno del servidor');
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { testConnection } = require('./config/database');

// v2.1.0 - Sistema actualizado con fix de letras en escrutinio

// Importar rutas
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const controlPrevioRoutes = require('./modules/control-previo/control-previo.routes');
const controlPosteriorRoutes = require('./modules/control-posterior/control-posterior.routes');
const actasRoutes = require('./modules/actas/actas.routes');
const agenciasRoutes = require('./modules/agencias/agencias.routes');
const programacionRoutes = require('./modules/programacion/programacion.routes');
const historialRoutes = require('./modules/historial/historial.routes');
const extractosRoutes = require('./modules/extractos/extractos.routes');
const juegosOfflineRoutes = require('./modules/juegos-offline/juegos-offline.routes');
const ocrRoutes = require('./modules/ocr/ocr.routes');
const facturacionJuegosRoutes = require('./modules/facturacion/facturacion-juegos.routes');
const scoringAgenciasRoutes = require('./modules/scoring-agencias/scoring.routes');

// Redirigir consola a un archivo solo en Hostinger (producción)
if (process.env.NODE_ENV === 'production') {
  const logFile = fs.createWriteStream(path.join(__dirname, '../debug.log'), { flags: 'a' });
  process.stdout.write = process.stderr.write = logFile.write.bind(logFile);
}

console.log('--- INICIO DE APLICACIÓN ' + new Date().toISOString() + ' ---');

const app = express();
const PORT = process.env.PORT || 3000;

// Ruta de diagnóstico para Hostinger
app.get('/health', async (req, res) => {
  const { testConnection } = require('./config/database');
  const dbStatus = await testConnection();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    database: dbStatus ? 'connected' : 'error',
    env: process.env.NODE_ENV,
    time: new Date().toISOString()
  });
});

// Middlewares de seguridad
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Parseo de JSON y formularios - límite alto para escrutinios masivos
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Archivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/control-previo', controlPrevioRoutes);
app.use('/api/control-posterior', controlPosteriorRoutes);
app.use('/api/actas', actasRoutes);
app.use('/api/agencias', agenciasRoutes);
app.use('/api/programacion', programacionRoutes);
app.use('/api/historial', historialRoutes);
app.use('/api/extractos', extractosRoutes);
app.use('/api/juegos-offline', juegosOfflineRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/facturacion', facturacionJuegosRoutes);
app.use('/api/scoring-agencias', scoringAgenciasRoutes);

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    app: process.env.APP_NAME,
    version: process.env.APP_VERSION
  });
});

// Versión de la app (usado por frontend)
app.get('/api/version', (req, res) => {
  res.json({
    version: process.env.APP_VERSION || 'dev',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor'
  });
});

// 404
app.use((req, res) => {
  console.log('❌ 404 - Ruta no encontrada:', req.method, req.path);
  res.status(404).json({ success: false, message: 'Ruta no encontrada', path: req.path, method: req.method });
});

// Iniciar servidor
console.log('Iniciando servidor Node...');

app.listen(PORT, () => {
  console.log('Servidor iniciado en puerto ' + PORT);
  console.log('═══════════════════════════════════════════════════');
  console.log(`🎰 ${process.env.APP_NAME || 'Control de Loterías'}`);
  console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'production'}`);
  console.log('═══════════════════════════════════════════════════');
  
  // Probamos la conexión en segundo plano para no bloquear el inicio
  testConnection().then(connected => {
    if (!connected) {
      console.error('🚨 ADVERTENCIA: No se pudo conectar a la base de datos.');
    }
  });
});

// Prevenir que el servidor se caiga por errores no capturados
process.on('uncaughtException', (err) => {
  console.error('❌ CRITICAL ERROR (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ CRITICAL ERROR (Unhandled Rejection):', reason);
});

module.exports = app;
