const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// JWT_SECRET: valor fijo simple
const JWT_SECRET = 'e7396868f04f94d713e9e64acd1ee1758704350dbd4da311fcbfd8d01ec28658d2a62b5da2f40db9c381401bfe330a8098b98d19948cfbf175146e54f1dbfac7';

// Middleware de autenticación JWT
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token de autenticación no proporcionado'
      });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      const users = await query(
        `SELECT u.id, u.username, u.nombre, u.rol_id, u.activo, r.codigo as rol
         FROM usuarios u
         JOIN roles r ON u.rol_id = r.id
         WHERE u.id = ?`,
        [decoded.userId]
      );

      if (users.length === 0 || !users[0].activo) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no encontrado o desactivado'
        });
      }

      // Cargar permisos del usuario
      const permisos = await query(
        `SELECT p.codigo FROM permisos p
         JOIN rol_permisos rp ON p.id = rp.permiso_id
         WHERE rp.rol_id = ?`,
        [users[0].rol_id]
      );

      req.user = {
        id: users[0].id,
        username: users[0].username,
        nombre: users[0].nombre,
        rol: users[0].rol,
        rolId: users[0].rol_id,
        permisos: permisos.map(p => p.codigo)
      };

      next();
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido o expirado'
      });
    }
  } catch (error) {
    console.error('Error en autenticación:', error);
    return res.status(500).json({
      success: false,
      message: 'Error en autenticación'
    });
  }
};

// Middleware para verificar roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para realizar esta acción'
      });
    }

    next();
  };
};

// Middleware para verificar permisos específicos
const requirePermission = (...permisos) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    const tienePermiso = permisos.some(p => req.user.permisos.includes(p));
    
    if (!tienePermiso) {
      return res.status(403).json({
        success: false,
        message: 'No tienes el permiso necesario para esta acción'
      });
    }

    next();
  };
};

// Middleware para verificar si es admin
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.rol !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Se requieren permisos de administrador'
    });
  }
  next();
};

// Registrar acción en auditoría
const registrarAuditoria = async (userId, accion, modulo, tabla, registroId, datosAnteriores, datosNuevos, ip) => {
  try {
    await query(
      `INSERT INTO auditoria (usuario_id, accion, modulo, tabla_afectada, registro_id, datos_anteriores, datos_nuevos, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, accion, modulo, tabla, registroId, 
       datosAnteriores ? JSON.stringify(datosAnteriores) : null,
       datosNuevos ? JSON.stringify(datosNuevos) : null,
       ip]
    );
  } catch (error) {
    console.error('Error registrando auditoría:', error);
  }
};

module.exports = {
  authenticate,
  authorize,
  requirePermission,
  isAdmin,
  registrarAuditoria
};
