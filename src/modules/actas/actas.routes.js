const express = require('express');
const router = express.Router();
const actasController = require('./actas.controller');
const { authenticate } = require('../../shared/middleware');

// Todas las rutas requieren autenticación
router.use(authenticate);

// Generar Acta de Control Previo (PDF)
router.post('/control-previo/generar', actasController.generarActaControlPrevio);

// Generar Acta Notarial de Sorteo (PDF)
router.post('/notarial/generar', actasController.generarActaNotarial);

module.exports = router;
