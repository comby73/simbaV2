'use strict';

const express = require('express');
const router  = express.Router();
const { authenticate } = require('../../shared/middleware');
const ctrl = require('./facturacion-juegos.controller');

// GET /api/facturacion/juegos-ute?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD[&tope=105000000]
router.get('/juegos-ute', authenticate, ctrl.getFacturacionJuegosUTE);

module.exports = router;
