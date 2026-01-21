const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'control_loterias_secret_key_2024_muy_segura_HARDCODED_BACKUP';

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
      // Usamos el mismo secreto hardcodeado que en el login
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
