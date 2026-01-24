const { pool } = require('../../config/database');
const { successResponse, errorResponse, PROVINCIAS } = require('../../shared/helpers');

/**
 * Guardar un extracto (desde OCR, XML o manual)
 * POST /api/extractos
 */
const guardarExtracto = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { 
      provincia, // código: '51', '53', etc.
      modalidad, // 'M', 'V', 'N', 'R', 'P'
      fecha,     // YYYY-MM-DD
      numeros,   // array de 20 strings
      letras,    // string de letras o array
      sorteo,    // número de sorteo (opcional)
      fuente     // 'XML', 'OCR', 'MANUAL'
    } = req.body;

    // Validaciones
    if (!provincia || !modalidad || !fecha || !numeros) {
      return errorResponse(res, 'Faltan datos requeridos: provincia, modalidad, fecha, numeros', 400);
    }

    if (!Array.isArray(numeros) || numeros.length !== 20) {
      return errorResponse(res, 'numeros debe ser un array de 20 elementos', 400);
    }

    // Obtener provincia_id
    const [provRows] = await conn.query(
      'SELECT id FROM provincias WHERE codigo = ?',
      [provincia]
    );

    let provinciaId = null;
    if (provRows.length > 0) {
      provinciaId = provRows[0].id;
    }

    // Obtener juego_id (Quiniela = 1)
    const [juegoRows] = await conn.query(
      'SELECT id FROM juegos WHERE nombre LIKE ?',
      ['%Quiniela%']
    );
    const juegoId = juegoRows.length > 0 ? juegoRows[0].id : 1;

    // Obtener sorteo_id según modalidad
    const modalidadNombre = {
      'R': 'Previa', 'P': 'Primera', 'M': 'Matutina', 
      'V': 'Vespertina', 'N': 'Nocturna'
    }[modalidad] || modalidad;

    const [sorteoRows] = await conn.query(
      `SELECT id FROM sorteos WHERE juego_id = ? AND nombre LIKE ?`,
      [juegoId, `%${modalidadNombre}%`]
    );
    const sorteoId = sorteoRows.length > 0 ? sorteoRows[0].id : 1;

    // Preparar letras
    let letrasJson = null;
    if (letras) {
      if (Array.isArray(letras)) {
        letrasJson = JSON.stringify(letras);
      } else if (typeof letras === 'string') {
        letrasJson = JSON.stringify(letras.split(''));
      }
    }

    // Verificar si ya existe
    const [existente] = await conn.query(
      `SELECT id FROM extractos 
       WHERE juego_id = ? AND sorteo_id = ? AND fecha = ? AND provincia_id = ?`,
      [juegoId, sorteoId, fecha, provinciaId]
    );

    if (existente.length > 0) {
      // Actualizar existente
      await conn.query(
        `UPDATE extractos SET 
         numeros = ?, letras = ?, fuente = ?, updated_at = NOW()
         WHERE id = ?`,
        [JSON.stringify(numeros), letrasJson, fuente || 'OCR', existente[0].id]
      );

      return successResponse(res, { id: existente[0].id, updated: true }, 'Extracto actualizado');
    }

    // Insertar nuevo
    const [result] = await conn.query(
      `INSERT INTO extractos (juego_id, sorteo_id, fecha, provincia_id, numeros, letras, fuente, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [juegoId, sorteoId, fecha, provinciaId, JSON.stringify(numeros), letrasJson, fuente || 'OCR', req.user.id]
    );

    return successResponse(res, { id: result.insertId, created: true }, 'Extracto guardado correctamente');

  } catch (error) {
    console.error('Error guardando extracto:', error);
    return errorResponse(res, 'Error guardando extracto: ' + error.message, 500);
  } finally {
    conn.release();
  }
};

/**
 * Guardar múltiples extractos
 * POST /api/extractos/bulk
 */
const guardarExtractosBulk = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { extractos } = req.body;

    if (!Array.isArray(extractos) || extractos.length === 0) {
      return errorResponse(res, 'extractos debe ser un array con al menos un elemento', 400);
    }

    const resultados = [];
    let guardados = 0;
    let errores = 0;

    for (const ext of extractos) {
      try {
        const { provincia, modalidad, fecha, numeros, letras, fuente } = ext;

        if (!provincia || !modalidad || !fecha || !numeros) {
          errores++;
          resultados.push({ error: 'Datos incompletos', extracto: ext });
          continue;
        }

        // Obtener IDs
        const [provRows] = await conn.query('SELECT id FROM provincias WHERE codigo = ?', [provincia]);
        const provinciaId = provRows.length > 0 ? provRows[0].id : null;

        const [juegoRows] = await conn.query('SELECT id FROM juegos WHERE nombre LIKE ?', ['%Quiniela%']);
        const juegoId = juegoRows.length > 0 ? juegoRows[0].id : 1;

        const modalidadNombre = {
          'R': 'Previa', 'P': 'Primera', 'M': 'Matutina', 
          'V': 'Vespertina', 'N': 'Nocturna'
        }[modalidad] || modalidad;

        const [sorteoRows] = await conn.query(
          `SELECT id FROM sorteos WHERE juego_id = ? AND nombre LIKE ?`,
          [juegoId, `%${modalidadNombre}%`]
        );
        const sorteoId = sorteoRows.length > 0 ? sorteoRows[0].id : 1;

        // Preparar letras
        let letrasJson = null;
        if (letras) {
          if (Array.isArray(letras)) {
            letrasJson = JSON.stringify(letras);
          } else if (typeof letras === 'string') {
            letrasJson = JSON.stringify(letras.split(''));
          }
        }

        // Verificar existente
        const [existente] = await conn.query(
          `SELECT id FROM extractos WHERE juego_id = ? AND sorteo_id = ? AND fecha = ? AND provincia_id = ?`,
          [juegoId, sorteoId, fecha, provinciaId]
        );

        if (existente.length > 0) {
          await conn.query(
            `UPDATE extractos SET numeros = ?, letras = ?, fuente = ?, updated_at = NOW() WHERE id = ?`,
            [JSON.stringify(numeros), letrasJson, fuente || 'OCR', existente[0].id]
          );
          guardados++;
          resultados.push({ id: existente[0].id, updated: true, provincia, modalidad, fecha });
        } else {
          const [result] = await conn.query(
            `INSERT INTO extractos (juego_id, sorteo_id, fecha, provincia_id, numeros, letras, fuente, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [juegoId, sorteoId, fecha, provinciaId, JSON.stringify(numeros), letrasJson, fuente || 'OCR', req.user.id]
          );
          guardados++;
          resultados.push({ id: result.insertId, created: true, provincia, modalidad, fecha });
        }
      } catch (err) {
        errores++;
        resultados.push({ error: err.message, extracto: ext });
      }
    }

    return successResponse(res, { 
      guardados, 
      errores, 
      resultados 
    }, `${guardados} extracto(s) guardado(s), ${errores} error(es)`);

  } catch (error) {
    console.error('Error guardando extractos:', error);
    return errorResponse(res, 'Error guardando extractos: ' + error.message, 500);
  } finally {
    conn.release();
  }
};

/**
 * Listar extractos con filtros
 * GET /api/extractos?fecha=YYYY-MM-DD&provincia=51&modalidad=M
 */
const listarExtractos = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { fecha, provincia, modalidad, juego } = req.query;

    let sql = `
      SELECT 
        e.id, e.fecha, e.numeros, e.letras, e.fuente, e.validado, e.created_at,
        j.nombre as juego_nombre,
        s.nombre as sorteo_nombre, s.codigo as sorteo_codigo,
        p.nombre as provincia_nombre, p.codigo as provincia_codigo
      FROM extractos e
      JOIN juegos j ON e.juego_id = j.id
      JOIN sorteos s ON e.sorteo_id = s.id
      LEFT JOIN provincias p ON e.provincia_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (fecha) {
      sql += ' AND e.fecha = ?';
      params.push(fecha);
    }

    if (provincia) {
      sql += ' AND p.codigo = ?';
      params.push(provincia);
    }

    if (modalidad) {
      const modalidadNombre = {
        'R': 'Previa', 'P': 'Primera', 'M': 'Matutina', 
        'V': 'Vespertina', 'N': 'Nocturna'
      }[modalidad] || modalidad;
      sql += ' AND s.nombre LIKE ?';
      params.push(`%${modalidadNombre}%`);
    }

    if (juego) {
      sql += ' AND j.nombre LIKE ?';
      params.push(`%${juego}%`);
    }

    sql += ' ORDER BY e.fecha DESC, s.nombre';

    const [rows] = await conn.query(sql, params);

    // Parsear JSON
    const extractos = rows.map(row => ({
      ...row,
      numeros: typeof row.numeros === 'string' ? JSON.parse(row.numeros) : row.numeros,
      letras: row.letras ? (typeof row.letras === 'string' ? JSON.parse(row.letras) : row.letras) : null
    }));

    return successResponse(res, extractos);

  } catch (error) {
    console.error('Error listando extractos:', error);
    return errorResponse(res, 'Error listando extractos: ' + error.message, 500);
  } finally {
    conn.release();
  }
};

/**
 * Obtener un extracto por ID
 * GET /api/extractos/:id
 */
const obtenerExtracto = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;

    const [rows] = await conn.query(`
      SELECT 
        e.*, j.nombre as juego_nombre, s.nombre as sorteo_nombre,
        p.nombre as provincia_nombre, p.codigo as provincia_codigo
      FROM extractos e
      JOIN juegos j ON e.juego_id = j.id
      JOIN sorteos s ON e.sorteo_id = s.id
      LEFT JOIN provincias p ON e.provincia_id = p.id
      WHERE e.id = ?
    `, [id]);

    if (rows.length === 0) {
      return errorResponse(res, 'Extracto no encontrado', 404);
    }

    const extracto = rows[0];
    extracto.numeros = typeof extracto.numeros === 'string' ? JSON.parse(extracto.numeros) : extracto.numeros;
    extracto.letras = extracto.letras ? (typeof extracto.letras === 'string' ? JSON.parse(extracto.letras) : extracto.letras) : null;

    return successResponse(res, extracto);

  } catch (error) {
    console.error('Error obteniendo extracto:', error);
    return errorResponse(res, 'Error obteniendo extracto: ' + error.message, 500);
  } finally {
    conn.release();
  }
};

/**
 * Eliminar extracto
 * DELETE /api/extractos/:id
 */
const eliminarExtracto = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;

    const [result] = await conn.query('DELETE FROM extractos WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return errorResponse(res, 'Extracto no encontrado', 404);
    }

    return successResponse(res, null, 'Extracto eliminado');

  } catch (error) {
    console.error('Error eliminando extracto:', error);
    return errorResponse(res, 'Error eliminando extracto: ' + error.message, 500);
  } finally {
    conn.release();
  }
};

module.exports = {
  guardarExtracto,
  guardarExtractosBulk,
  listarExtractos,
  obtenerExtracto,
  eliminarExtracto
};
