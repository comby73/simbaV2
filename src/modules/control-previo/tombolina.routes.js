const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer();
const { procesarZipTombolina } = require('./tombolina.controller');
const { authenticate, requirePermission } = require('../../shared/middleware');

// POST /api/control-previo/tombolina/zip
router.post('/zip', authenticate, requirePermission('control-previo.tombolina'), upload.single('zip'), procesarZipTombolina);

module.exports = router;
