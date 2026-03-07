const express = require('express');
const router = express.Router();
const scoringController = require('./scoring.controller');
const { authenticate, requirePermission, allowScoringUsers, isAdmin } = require('../../shared/middleware');

router.use(authenticate);
router.use(requirePermission('control_previo.ver'));
router.use(allowScoringUsers);

router.get('/resumen', scoringController.obtenerResumen);
router.get('/ranking', scoringController.obtenerRanking);
router.get('/agencia/:ctaCte', scoringController.obtenerAgencia);
router.get('/configuracion', scoringController.obtenerConfiguracionResumen);
router.get('/configuracion/:dataset', scoringController.listarConfiguracionDataset);
router.post('/configuracion/:dataset', isAdmin, scoringController.guardarConfiguracionDataset);
router.delete('/configuracion/:dataset', isAdmin, scoringController.eliminarConfiguracionDataset);
router.post('/snapshot', isAdmin, scoringController.generarSnapshotHistorico);

module.exports = router;