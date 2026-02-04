const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const quinielaController = require('./quiniela.controller');
const poceadaController = require('./poceada.controller');
const lotoController = require('./loto.controller');
const loto5Controller = require('./loto5.controller');
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

// Poceada
router.post('/poceada/procesar', 
  requirePermission('control_previo.ejecutar'),
  upload.single('archivo'),
  poceadaController.procesarZip
);

// Tombolina
const tombolinaController = require('./tombolina.controller');
router.post('/tombolina/procesar',
  requirePermission('control_previo.ejecutar'),
  upload.single('archivo'),
  tombolinaController.procesarZipTombolina
);

// Ruta alternativa (legacy)
router.post('/poceada/procesar-zip', 
  upload.single('archivo'),
  poceadaController.procesarZip
);

router.get('/poceada/buscar-pozo/:sorteo',
  requirePermission('control_previo.ver'),
  poceadaController.buscarPozo
);

router.post('/poceada/guardar-resultado',
  requirePermission('control_previo.ejecutar'),
  poceadaController.guardarResultado
);

router.post('/poceada/guardar-arrastres',
  requirePermission('control_previo.ejecutar'),
  poceadaController.guardarArrastres
);

// Loto
router.post('/loto/procesar',
  requirePermission('control_previo.ejecutar'),
  upload.single('archivo'),
  lotoController.procesarZip
);

router.post('/loto/procesar-zip',
  upload.single('archivo'),
  lotoController.procesarZip
);

// Loto 5
router.post('/loto5/procesar',
  requirePermission('control_previo.ejecutar'),
  upload.single('archivo'),
  loto5Controller.procesarZip
);

router.post('/loto5/procesar-zip',
  upload.single('archivo'),
  loto5Controller.procesarZip
);

// Configuración de juegos
router.get('/config/distribucion',
  requirePermission('control_previo.ver'),
  poceadaController.obtenerConfiguracion
);

router.post('/config/recargar',
  requirePermission('control_previo.ejecutar'),
  poceadaController.recargarConfiguracion
);

// Historial
router.get('/historial', 
  requirePermission('control_previo.ver'),
  quinielaController.getHistorial
);

module.exports = router;
