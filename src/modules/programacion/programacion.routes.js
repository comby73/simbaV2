/**
 * Rutas de Programación de Sorteos
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate, requirePermission } = require('../../shared/middleware');

const {
  cargarExcelQuiniela,
  cargarExcelGenerico,
  getSorteosPorFecha,
  getSorteoPorNumero,
  listarProgramacion,
  validarProvincias,
  getHistorialCargas,
  borrarProgramacion,
  getSorteosDelDia,
  verificarSorteo,
  JUEGOS_CONFIG
} = require('./programacion.controller');

// Configuración de multer para upload de Excel
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../../uploads/temp'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'programacion-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/octet-stream' // some browsers
    ];
    const allowedExtensions = ['.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();


    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  }
});

// Middleware de autenticación para todas las rutas
router.use(authenticate);

// === RUTAS DE CARGA ===

// Cargar Excel de programación Quiniela (legacy)
router.post('/cargar/quiniela',
  requirePermission('programacion.cargar'),
  upload.single('archivo'),
  cargarExcelQuiniela
);

// Cargar Excel genérico con DETECCIÓN AUTOMÁTICA del juego
// Este endpoint detecta automáticamente el tipo de juego desde la columna "Juego" del Excel
router.post('/cargar/generico',
  requirePermission('programacion.cargar'),
  upload.single('archivo'),
  cargarExcelGenerico
);

// Obtener lista de juegos soportados
router.get('/juegos',
  requirePermission('programacion.ver'),
  (req, res) => {
    const juegos = Object.entries(JUEGOS_CONFIG).map(([codigo, config]) => ({
      codigo,
      ...config
    }));
    res.json({ success: true, data: juegos });
  }
);


// === RUTAS DE CONSULTA ===

// Listar programación con filtros
router.get('/',
  requirePermission('programacion.ver'),
  listarProgramacion
);

// Obtener sorteos por fecha
router.get('/fecha',
  requirePermission('programacion.ver'),
  getSorteosPorFecha
);

// Obtener sorteo por número
router.get('/sorteo/:numero',
  requirePermission('programacion.ver'),
  getSorteoPorNumero
);

// Historial de cargas
router.get('/historial',
  requirePermission('programacion.ver'),
  getHistorialCargas
);

// Sorteos del día (para Dashboard)
router.get('/dia',
  requirePermission('programacion.ver'),
  getSorteosDelDia
);

// === RUTAS DE VALIDACIÓN ===

// Verificar si existe sorteo por fecha y modalidad
router.get('/verificar',
  requirePermission('programacion.ver'),
  verificarSorteo
);

// Validar provincias de un sorteo vs datos NTF
router.post('/validar-provincias',
  requirePermission('control-previo.ver'),
  validarProvincias
);

// === RUTAS DE ADMINISTRACIÓN ===

// Borrar toda la programación de un juego
router.delete('/borrar',
  requirePermission('programacion.cargar'),
  borrarProgramacion
);

module.exports = router;
