const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const quinielaController = require('./quiniela.controller');
const { authenticate, requirePermission } = require('../../shared/middleware');

// Configurar multer para subida de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../../uploads/temp'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || 
        file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos ZIP'), false);
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// Todas las rutas requieren autenticación
router.use(authenticate);

// Quiniela
router.post('/quiniela/procesar', 
  requirePermission('control_previo.ejecutar'),
  upload.single('archivo'),
  quinielaController.procesarZip
);

router.post('/quiniela/guardar',
  requirePermission('control_previo.ejecutar'),
  quinielaController.guardarControlPrevio
);

// Historial
router.get('/historial', 
  requirePermission('control_previo.ver'),
  quinielaController.getHistorial
);

module.exports = router;
