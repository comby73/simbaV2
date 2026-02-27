const express = require('express');
const router = express.Router();
const { authenticate } = require('../../shared/middleware');
const ocrController = require('./ocr.controller');

// GET /api/ocr/estado - verificar si OCR está disponible (sin exponer key)
router.get('/estado', authenticate, ocrController.estadoOCR);

// POST /api/ocr/procesar-imagen - proxy OCR desde servidor
router.post('/procesar-imagen', authenticate, ocrController.procesarImagen);

module.exports = router;
