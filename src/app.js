require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { testConnection } = require('./config/database');

// Importar rutas
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const controlPrevioRoutes = require('./modules/control-previo/control-previo.routes');
const controlPosteriorRoutes = require('./modules/control-posterior/control-posterior.routes');
const actasRoutes = require('./modules/actas/actas.routes');
const agenciasRoutes = require('./modules/agencias/agencias.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares de seguridad
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// Parseo de JSON y formularios
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Archivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/control-previo', controlPrevioRoutes);
app.use('/api/control-posterior', controlPosteriorRoutes);
app.use('/api/actas', actasRoutes);
app.use('/api/agencias', agenciasRoutes);

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
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

// Iniciar servidor
async function startServer() {
  const dbConnected = await testConnection();
  
  if (!dbConnected) {
    console.warn('⚠️  Servidor iniciando sin conexión a BD');
  }

  app.listen(PORT, () => {
    console.log('═══════════════════════════════════════════════════');
    console.log(`🎰 ${process.env.APP_NAME || 'Control de Loterías'}`);
    console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
    console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log('═══════════════════════════════════════════════════');
  });
}

startServer();

module.exports = app;
