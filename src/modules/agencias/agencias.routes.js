const express = require('express');
const multer = require('multer');
const router = express.Router();
const {
  cargarExcelAgencias,
  obtenerAgencias,
  buscarAgencia
} = require('./agencias.controller');
const { authenticate, authorize } = require('../../shared/middleware');

// Configurar multer para Excel
const upload = multer({
  dest: 'uploads/temp/',
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Rutas
router.get('/', authenticate, authorize('admin', 'analista', 'auditor', 'operador'), obtenerAgencias);
router.get('/buscar/:numero', authenticate, authorize('admin', 'analista', 'auditor', 'operador'), buscarAgencia);
router.post('/cargar-excel', authenticate, authorize('admin'), upload.single('excel'), cargarExcelAgencias);

module.exports = router;
