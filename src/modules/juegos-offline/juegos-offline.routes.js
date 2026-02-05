/**
 * Rutas para Juegos Offline
 * Hipicas, Telekino, Money Las Vegas
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const hipicasController = require('./hipicas.controller');
const { authenticate } = require('../../shared/middleware');

// Multer config para archivos TXT
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos TXT'), false);
    }
  }
});

// Todas las rutas requieren autenticación
router.use(authenticate);

// ===== HIPICAS =====
router.post('/hipicas/procesar-txt', upload.single('archivo'), hipicasController.procesarTXT);
router.get('/hipicas/facturacion', hipicasController.obtenerFacturacion);
router.get('/hipicas/ventas', hipicasController.obtenerVentas);
router.delete('/hipicas/facturacion/:id', hipicasController.eliminarFacturacion);

// ===== TELEKINO (futuro) =====
// router.post('/telekino/procesar-txt', upload.single('archivo'), telekinoController.procesarTXT);

// ===== MONEY LAS VEGAS (futuro) =====
// router.post('/money/procesar-txt', upload.single('archivo'), moneyController.procesarTXT);

module.exports = router;
