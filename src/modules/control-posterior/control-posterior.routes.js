const express = require('express');
const router = express.Router();
const multer = require('multer');
const quinielaController = require('./quiniela-escrutinio.controller');
const poceadaController = require('./poceada-escrutinio.controller');
const tombolinaController = require('./tombolina-escrutinio.controller');
const lotoController = require('./loto-escrutinio.controller');
const loto5Controller = require('./loto5-escrutinio.controller');
const extractoController = require('./extracto.controller');
const { authenticate } = require('../../shared/middleware');

// Configurar multer para uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Todas las rutas requieren autenticación
router.use(authenticate);

// Ejecutar escrutinio
router.post('/quiniela/escrutinio', quinielaController.ejecutarControlPosterior);
router.post('/poceada/escrutinio', poceadaController.ejecutar);
router.post('/tombolina-escrutinio', tombolinaController.ejecutarEscrutinioTombolina);
router.post('/loto/escrutinio', lotoController.ejecutar);
router.post('/loto5/escrutinio', loto5Controller.ejecutar);

// Generar Excel
router.post('/quiniela/excel', quinielaController.generarExcel);

// Generar PDF Reporte
router.post('/quiniela/pdf', quinielaController.generarPDFReporte);

// Procesar PDF de extracto
router.post('/quiniela/procesar-pdf', upload.single('archivo'), extractoController.procesarPDF);

// Procesar XML de extracto
router.post('/quiniela/procesar-xml', upload.single('archivo'), extractoController.procesarXML);

module.exports = router;
