const express = require('express');
const router = express.Router();
const extractosController = require('./extractos.controller');
const { authenticate, requirePermission } = require('../../shared/middleware');

// Todas las rutas requieren autenticación
router.use(authenticate);

// Listar extractos
// GET /api/extractos?fecha=2026-01-23&provincia=51&modalidad=M
router.get('/', extractosController.listarExtractos);

// Obtener un extracto
// GET /api/extractos/:id
router.get('/:id', extractosController.obtenerExtracto);

// Guardar un extracto
// POST /api/extractos
router.post('/', extractosController.guardarExtracto);

// Guardar múltiples extractos
// POST /api/extractos/bulk
router.post('/bulk', extractosController.guardarExtractosBulk);

// Eliminar extracto
// DELETE /api/extractos/:id
router.delete('/:id', extractosController.eliminarExtracto);

module.exports = router;
