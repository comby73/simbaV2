const bcrypt = require('bcryptjs');
const { query } = require('../../config/database');
const { successResponse, errorResponse } = require('../../shared/helpers');
const { registrarAuditoria } = require('../../shared/middleware');

// Listar usuarios
const getAll = async (req, res) => {
  try {
    const { rol, activo } = req.query;
    
    let sql = `
      SELECT u.id, u.username, u.nombre, u.email, u.activo, u.ultimo_login, u.created_at,
             r.codigo as rol, r.nombre as rol_nombre
      FROM usuarios u
      JOIN roles r ON u.rol_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (rol) {
      sql += ' AND r.codigo = ?';
      params.push(rol);
    }
    if (activo !== undefined) {
      sql += ' AND u.activo = ?';
      params.push(activo === 'true' ? 1 : 0);
    }

    sql += ' ORDER BY u.nombre ASC';

    const users = await query(sql, params);
    return successResponse(res, users);

  } catch (error) {
    console.error('Error listando usuarios:', error);
    return errorResponse(res, 'Error obteniendo usuarios', 500);
  }
};

// Obtener usuario por ID
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const users = await query(
      `SELECT u.id, u.username, u.nombre, u.email, u.activo, u.ultimo_login, u.created_at,
              r.id as rol_id, r.codigo as rol, r.nombre as rol_nombre
       FROM usuarios u
       JOIN roles r ON u.rol_id = r.id
       WHERE u.id = ?`,
      [id]
    );

    if (users.length === 0) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }

    return successResponse(res, users[0]);

  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    return errorResponse(res, 'Error obteniendo usuario', 500);
  }
};

// Crear usuario
const create = async (req, res) => {
  try {
    const { username, password, nombre, email, rol_id } = req.body;

    if (!username || !password || !nombre || !rol_id) {
      return errorResponse(res, 'Username, password, nombre y rol son requeridos', 400);
    }

    if (password.length < 6) {
      return errorResponse(res, 'La contraseña debe tener al menos 6 caracteres', 400);
    }

    const existing = await query('SELECT id FROM usuarios WHERE username = ?', [username]);
    if (existing.length > 0) {
      return errorResponse(res, 'El nombre de usuario ya existe', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO usuarios (username, password, nombre, email, rol_id)
       VALUES (?, ?, ?, ?, ?)`,
      [username, hashedPassword, nombre, email || null, rol_id]
    );

    await registrarAuditoria(req.user.id, 'CREAR_USUARIO', 'usuarios', 'usuarios', result.insertId, 
      null, { username, nombre, rol_id }, req.ip);

    return successResponse(res, { id: result.insertId }, 'Usuario creado correctamente', 201);

  } catch (error) {
    console.error('Error creando usuario:', error);
    return errorResponse(res, 'Error creando usuario', 500);
  }
};

// Actualizar usuario
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email, rol_id, activo } = req.body;

    const existing = await query('SELECT * FROM usuarios WHERE id = ?', [id]);
    if (existing.length === 0) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }

    await query(
      `UPDATE usuarios SET nombre = ?, email = ?, rol_id = ?, activo = ? WHERE id = ?`,
      [nombre, email || null, rol_id, activo !== undefined ? activo : true, id]
    );

    await registrarAuditoria(req.user.id, 'ACTUALIZAR_USUARIO', 'usuarios', 'usuarios', id,
      existing[0], { nombre, email, rol_id, activo }, req.ip);

    return successResponse(res, null, 'Usuario actualizado correctamente');

  } catch (error) {
    console.error('Error actualizando usuario:', error);
    return errorResponse(res, 'Error actualizando usuario', 500);
  }
};

// Resetear contraseña
const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return errorResponse(res, 'La nueva contraseña debe tener al menos 6 caracteres', 400);
    }

    const existing = await query('SELECT id FROM usuarios WHERE id = ?', [id]);
    if (existing.length === 0) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await query('UPDATE usuarios SET password = ? WHERE id = ?', [hashedPassword, id]);

    await registrarAuditoria(req.user.id, 'RESET_PASSWORD', 'usuarios', 'usuarios', id, null, null, req.ip);

    return successResponse(res, null, 'Contraseña reseteada correctamente');

  } catch (error) {
    console.error('Error reseteando contraseña:', error);
    return errorResponse(res, 'Error reseteando contraseña', 500);
  }
};

// Listar roles
const getRoles = async (req, res) => {
  try {
    const roles = await query('SELECT id, codigo, nombre, descripcion FROM roles ORDER BY id');
    return successResponse(res, roles);
  } catch (error) {
    console.error('Error listando roles:', error);
    return errorResponse(res, 'Error obteniendo roles', 500);
  }
};

module.exports = { getAll, getById, create, update, resetPassword, getRoles };
