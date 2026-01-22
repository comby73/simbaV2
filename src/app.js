const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { testConnection } = require('./config/database');

// Importar rutas
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const controlPrevioRoutes = require('./modules/control-previo/control-previo.routes');
const controlPosteriorRoutes = require('./modules/control-posterior/control-posterior.routes');
const actasRoutes = require('./modules/actas/actas.routes');
const agenciasRoutes = require('./modules/agencias/agencias.routes');
const programacionRoutes = require('./modules/programacion/programacion.routes');

const fs = require('fs');

// Redirigir consola a un archivo para Hostinger
const logFile = fs.createWriteStream(path.join(__dirname, '../debug.log'), { flags: 'a' });
process.stdout.write = process.stderr.write = logFile.write.bind(logFile);

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
