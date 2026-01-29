const path = require('path');
const fs = require('fs');

// Cargar .env.local primero si existe (para desarrollo), sino .env
// En producción (Hostinger), las variables vienen del panel, no de archivos
const envLocalPath = path.join(__dirname, '../.env.local');
const envPath = path.join(__dirname, '../.env');

if (process.env.NODE_ENV !== 'production') {
  // Solo cargar dotenv en desarrollo
  if (fs.existsSync(envLocalPath)) {
    require('dotenv').config({ path: envLocalPath });
    console.log('📁 Usando configuración: .env.local (LOCAL)');
  } else if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log('📁 Usando configuración: .env');
  }
} else {
  console.log('📁 Modo PRODUCCIÓN: usando variables de entorno del servidor');
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { testConnection } = require('./config/database');

// Leer versión desde package.json
const packageJson = require('../package.json');
const APP_VERSION = packageJson.version;

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
    time: new Date().toISOString(),
    db_config: {
      host: process.env.DB_HOST || '(vacío)',
      user: process.env.DB_USER || '(vacío)',
      name: process.env.DB_NAME || '(vacío)',
      hasPassword: !!process.env.DB_PASSWORD
    }
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

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check y versión
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    app: 'SIMBA V2',
    version: APP_VERSION
  });
});

app.get('/api/version', (req, res) => {
  res.json({
    version: APP_VERSION,
    app: 'SIMBA V2',
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
