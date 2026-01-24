/**
 * Rutas para consultar historial de Control Previo y Escrutinios
 */

const express = require('express');
const router = express.Router();
const historialController = require('./historial.controller');
const { authenticate, requirePermission } = require('../../shared/middleware');

// Todas las rutas requieren autenticación
router.use(authenticate);

// =============================================
// RESUMEN GENERAL (para dashboard)
// =============================================

// GET /api/historial/resumen?desde=2026-01-01&hasta=2026-01-31
router.get('/resumen', 
  requirePermission('control_previo.ver'),
  historialController.obtenerResumen
);

// =============================================
// BÚSQUEDA
// =============================================

// GET /api/historial/buscar?numeroSorteo=51912&fecha=2026-01-20&juego=quiniela
router.get('/buscar',
  requirePermission('control_previo.ver'),
  historialController.buscarSorteo
);

// =============================================
// EXTRACTOS (números ganadores)
// =============================================

// GET /api/historial/extractos?fecha=2026-01-22&juego=quiniela&modalidad=M
router.get('/extractos',
  requirePermission('control_posterior.ver'),
  historialController.listarExtractos
);

// =============================================
// CONTROL PREVIO - ENDPOINTS GENERALES (frontend principal)
// =============================================

// GET /api/historial/control-previo?fechaDesde=2026-01-01&fechaHasta=2026-01-31&juego=quiniela
router.get('/control-previo',
  requirePermission('control_previo.ver'),
  historialController.listarControlPrevioGeneral
);

// GET /api/historial/control-previo/123?juego=quiniela
router.get('/control-previo/:id',
  requirePermission('control_previo.ver'),
  historialController.obtenerDetalleControlPrevio
);

// =============================================
// ESCRUTINIOS - ENDPOINTS GENERALES (frontend principal)
// =============================================

// GET /api/historial/escrutinios?fechaDesde=2026-01-01&fechaHasta=2026-01-31&juego=quiniela
router.get('/escrutinios',
  requirePermission('control_posterior.ver'),
  historialController.listarEscrutiniosGeneral
);

// GET /api/historial/escrutinios/123?juego=quiniela
router.get('/escrutinios/:id',
  requirePermission('control_posterior.ver'),
  historialController.obtenerDetalleEscrutinio
);

// GET /api/historial/escrutinios/123/agencias?juego=quiniela
router.get('/escrutinios/:id/agencias',
  requirePermission('control_posterior.ver'),
  historialController.obtenerAgenciasEscrutinio
);

// =============================================
// CONTROL PREVIO - ENDPOINTS POR JUEGO (API detallada)
// =============================================

// GET /api/historial/control-previo/juego/quiniela?fecha=2026-01-20&limit=50
// GET /api/historial/control-previo/juego/poceada?desde=2026-01-01&hasta=2026-01-31
router.get('/control-previo/juego/:juego',
  requirePermission('control_previo.ver'),
  historialController.listarControlPrevio
);

// =============================================
// ESCRUTINIOS - ENDPOINTS POR JUEGO (API detallada)
// =============================================

// GET /api/historial/escrutinio/juego/quiniela
// GET /api/historial/escrutinio/juego/poceada?numeroSorteo=1234
router.get('/escrutinio/juego/:juego',
  requirePermission('control_posterior.ver'),
  historialController.listarEscrutinios
);

// GET /api/historial/escrutinio/juego/quiniela/123/ganadores?limit=100&offset=0
router.get('/escrutinio/juego/:juego/:id/ganadores',
  requirePermission('control_posterior.ver'),
  historialController.obtenerGanadores
);

// GET /api/historial/escrutinio/juego/quiniela/123/agencias
router.get('/escrutinio/juego/:juego/:id/agencias',
  requirePermission('control_posterior.ver'),
  historialController.obtenerPremiosAgencias
);

// =============================================
// DASHBOARD DE REPORTES
// =============================================

// GET /api/historial/dashboard/datos?fechaDesde=2026-01-01&tipoConsulta=detallado
router.get('/dashboard/datos',
  requirePermission('control_previo.ver'),
  historialController.obtenerDatosDashboard
);

// GET /api/historial/dashboard/stats?fechaDesde=2026-01-01&juego=quiniela
router.get('/dashboard/stats',
  requirePermission('control_previo.ver'),
  historialController.obtenerStatsDashboard
);

// GET /api/historial/dashboard/filtros
router.get('/dashboard/filtros',
  requirePermission('control_previo.ver'),
  historialController.obtenerFiltrosDashboard
);

module.exports = router;
