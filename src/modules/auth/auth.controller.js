const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../../config/database');
const { successResponse, errorResponse } = require('../../shared/helpers');
const { registrarAuditoria } = require('../../shared/middleware');

// CRÍTICO: JWT_SECRET debe estar definido en variables de entorno
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET no está definido en las variables de entorno');
  console.error('   Por favor configurá JWT_SECRET en el archivo .env');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Login
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return errorResponse(res, 'Usuario y contraseña son requeridos', 400);
    }

    let users;
    try {
      users = await query(
        `SELECT u.*, r.codigo as rol, r.nombre as rol_nombre
         FROM usuarios u 
         LEFT JOIN roles r ON u.rol_id = r.id
         WHERE u.username = ?`,
        [username]
      );
    } catch (dbError) {
      console.error('❌ Error en consulta SQL:', dbError);
      console.error('SQL Error Code:', dbError.code);
      console.error('SQL Error Message:', dbError.message);
      
      // Mensajes más descriptivos según el tipo de error
      let errorMessage = 'Error de base de datos';
      if (dbError.code === 'ECONNREFUSED') {
        errorMessage = 'MySQL no está corriendo. Por favor, iniciá MySQL desde el Panel de Control de XAMPP.';
      } else if (dbError.code === 'ER_BAD_DB_ERROR') {
        errorMessage = 'La base de datos no existe. Ejecutá: npm run db:init';
      } else if (dbError.code === 'ER_NO_SUCH_TABLE') {
        errorMessage = 'Las tablas no existen. Ejecutá: npm run db:init';
      } else {
        errorMessage = `Error de base de datos: ${dbError.message}`;
      }
      
      return errorResponse(res, errorMessage, 500);
    }

    if (users.length === 0) {
      return errorResponse(res, 'Credenciales inválidas', 401);
    }

    const user = users[0];

    if (!user.activo) {
      return errorResponse(res, 'Usuario desactivado', 401);
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return errorResponse(res, 'Credenciales inválidas', 401);
    }

    // Actualizar último login
    await query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?', [user.id]);

    // Cargar permisos
    const permisos = await query(
      `SELECT p.codigo FROM permisos p
       JOIN rol_permisos rp ON p.id = rp.permiso_id
       WHERE rp.rol_id = ?`,
      [user.rol_id]
    );

    // Generar token
    const token = jwt.sign(
      { userId: user.id, username: user.username, rol: user.rol },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Auditoría
    await registrarAuditoria(user.id, 'LOGIN', 'auth', 'usuarios', user.id, null, null, req.ip);

    return successResponse(res, {
      token,
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        rolNombre: user.rol_nombre,
        permisos: permisos.map(p => p.codigo)
      }
    }, 'Login exitoso');

  } catch (error) {
    console.error('❌ Error en login:', error);
    console.error('Stack trace:', error.stack);
    return errorResponse(res, `Error en el servidor: ${error.message}`, 500);
  }
};

// Obtener perfil
const getProfile = async (req, res) => {
  try {
    const users = await query(
      `SELECT u.id, u.username, u.nombre, u.email, u.ultimo_login, u.created_at,
              r.codigo as rol, r.nombre as rol_nombre
       FROM usuarios u 
       JOIN roles r ON u.rol_id = r.id
       WHERE u.id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }

    return successResponse(res, {
      ...users[0],
      permisos: req.user.permisos
    });

  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    return errorResponse(res, 'Error en el servidor', 500);
  }
};

// Cambiar contraseña
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return errorResponse(res, 'Contraseña actual y nueva son requeridas', 400);
    }

    if (newPassword.length < 6) {
      return errorResponse(res, 'La nueva contraseña debe tener al menos 6 caracteres', 400);
    }

    const users = await query('SELECT password FROM usuarios WHERE id = ?', [req.user.id]);
    
    const isValidPassword = await bcrypt.compare(currentPassword, users[0].password);
    if (!isValidPassword) {
      return errorResponse(res, 'Contraseña actual incorrecta', 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await query('UPDATE usuarios SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);

    await registrarAuditoria(req.user.id, 'CAMBIO_PASSWORD', 'auth', 'usuarios', req.user.id, null, null, req.ip);

    return successResponse(res, null, 'Contraseña actualizada correctamente');

  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    return errorResponse(res, 'Error en el servidor', 500);
  }
};

// Verificar token
const verifyToken = async (req, res) => {
  return successResponse(res, { 
    valid: true,
    user: req.user 
  }, 'Token válido');
};

module.exports = { login, getProfile, changePassword, verifyToken };
