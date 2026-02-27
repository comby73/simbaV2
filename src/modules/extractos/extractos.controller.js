const { pool } = require('../../config/database');
const { successResponse, errorResponse, PROVINCIAS } = require('../../shared/helpers');

const MODALIDAD_MAP = {
  R: { nombre: 'Previa', codigo: 'PREV' },
  P: { nombre: 'Primera', codigo: 'PRIM' },
  M: { nombre: 'Matutina', codigo: 'MAT' },
  V: { nombre: 'Vespertina', codigo: 'VESP' },
  N: { nombre: 'Nocturna', codigo: 'NOCT' }
};

function normalizarJuegoEntrada(juego) {
  const val = String(juego || 'Quiniela').trim().toLowerCase();
  if (val.includes('quiniela ya') || val.includes('quinielaya')) return 'quiniela ya';
  if (val.includes('quiniela')) return 'quiniela';
  if (val.includes('poceada')) return 'poceada';
  if (val.includes('tombolina')) return 'tombolina';
  if (val.includes('loto 5') || val.includes('loto5')) return 'loto 5';
  if (val.includes('loto')) return 'loto';
  if (val.includes('quini 6') || val.includes('quini6')) return 'quini 6';
  if (val.includes('brinco')) return 'brinco';
  return val;
}

async function resolverJuegoId(conn, juegoEntrada) {
  const juego = normalizarJuegoEntrada(juegoEntrada);

  const candidatos = {
    quiniela: ['%Quiniela%', 'QUINIELA'],
    'quiniela ya': ['%Quiniela Ya%', 'QUINIELAYA'],
    poceada: ['%Poceada%', 'POCEADA'],
    tombolina: ['%Tombolina%', 'TOMBOLINA'],
    loto: ['%Loto%', 'LOTO'],
    'loto 5': ['%Loto 5%', 'LOTO5'],
    'quini 6': ['%Quini 6%', 'QUINI6'],
    brinco: ['%Brinco%', 'BRINCO']
  };

  const [likeNombre, codigo] = candidatos[juego] || ['%Quiniela%', 'QUINIELA'];
  const [rows] = await conn.query(
    'SELECT id, nombre, codigo FROM juegos WHERE nombre LIKE ? OR codigo = ? ORDER BY id LIMIT 1',
    [likeNombre, codigo]
  );

  if (rows.length > 0) return rows[0].id;

  const [fallbackRows] = await conn.query(
    'SELECT id FROM juegos WHERE nombre LIKE ? ORDER BY id LIMIT 1',
    ['%Quiniela%']
  );
  return fallbackRows.length > 0 ? fallbackRows[0].id : 1;
}

async function resolverProvinciaId(conn, provincia) {
  if (!provincia && provincia !== 0) return null;

  const provinciaRaw = String(provincia).trim();
  const provinciaSinCeros = provinciaRaw.replace(/^0+/, '') || '0';
  const provinciaInfo = PROVINCIAS[provinciaRaw] || PROVINCIAS[provinciaSinCeros] || null;
  const provinciaNombre = typeof provinciaInfo === 'object'
    ? (provinciaInfo.nombre || provinciaRaw)
    : (provinciaInfo || provinciaRaw);

  const [rows] = await conn.query(
    `SELECT id
     FROM provincias
     WHERE codigo = ?
        OR codigo_luba = ?
        OR codigo_luba = ?
        OR UPPER(nombre) = UPPER(?)
        OR UPPER(nombre) = UPPER(?)
     ORDER BY id LIMIT 1`,
    [provinciaRaw, provinciaRaw, provinciaSinCeros, provinciaNombre, provinciaRaw]
  );

  return rows.length > 0 ? rows[0].id : null;
}

async function resolverFechaSorteo(conn, { juego, modalidad, sorteo, fecha }) {
  const juegoNorm = normalizarJuegoEntrada(juego);

  if (sorteo) {
    const [rowsBySorteo] = await conn.query(
      `SELECT fecha_sorteo
       FROM programacion_sorteos
       WHERE activo = 1
         AND LOWER(juego) = LOWER(?)
         AND numero_sorteo = ?
       ORDER BY fecha_sorteo DESC
       LIMIT 1`,
      [juegoNorm, String(sorteo)]
    );
    if (rowsBySorteo.length > 0 && rowsBySorteo[0].fecha_sorteo) {
      return rowsBySorteo[0].fecha_sorteo;
    }
  }

  if (fecha && modalidad) {
    const [rowsByFechaMod] = await conn.query(
      `SELECT fecha_sorteo
       FROM programacion_sorteos
       WHERE activo = 1
         AND LOWER(juego) = LOWER(?)
         AND fecha_sorteo = ?
         AND modalidad_codigo = ?
       ORDER BY id DESC
       LIMIT 1`,
      [juegoNorm, fecha, String(modalidad).toUpperCase()]
    );
    if (rowsByFechaMod.length > 0 && rowsByFechaMod[0].fecha_sorteo) {
      return rowsByFechaMod[0].fecha_sorteo;
    }
  }

  return fecha;
}

async function resolverNumeroSorteo(conn, { juego, modalidad, sorteo, fecha }) {
  const juegoNorm = normalizarJuegoEntrada(juego);

  if (sorteo !== undefined && sorteo !== null && String(sorteo).trim() !== '') {
    const num = parseInt(String(sorteo), 10);
    if (!Number.isNaN(num) && num > 0) return num;
  }

  if (fecha) {
    let sql = `
      SELECT numero_sorteo
      FROM programacion_sorteos
      WHERE activo = 1
        AND LOWER(juego) = LOWER(?)
        AND fecha_sorteo = ?
    `;
    const params = [juegoNorm, fecha];

    if (modalidad) {
      sql += ' AND modalidad_codigo = ?';
      params.push(String(modalidad).toUpperCase());
    }

    sql += ' ORDER BY id DESC LIMIT 1';

    const [rows] = await conn.query(sql, params);
    if (rows.length > 0 && rows[0].numero_sorteo) {
      const num = parseInt(String(rows[0].numero_sorteo), 10);
      if (!Number.isNaN(num) && num > 0) return num;
    }
  }

  return null;
}

async function resolverSorteoId(conn, juegoId, modalidad) {
  const modalidadInfo = MODALIDAD_MAP[modalidad] || { nombre: modalidad, codigo: modalidad };
  const [rows] = await conn.query(
    `SELECT id
     FROM sorteos
     WHERE juego_id = ? AND (nombre = ? OR codigo = ?)
     ORDER BY id LIMIT 1`,
    [juegoId, modalidadInfo.nombre, modalidadInfo.codigo]
  );
  if (rows.length > 0) return rows[0].id;

  const [fallback] = await conn.query(
    'SELECT id FROM sorteos WHERE juego_id = ? ORDER BY id LIMIT 1',
    [juegoId]
  );
  return fallback.length > 0 ? fallback[0].id : 1;
}

function normalizarLetras(letras) {
  if (!letras) return null;
  const letrasArr = Array.isArray(letras) ? letras : (typeof letras === 'string' ? letras.split('') : []);
  return letrasArr.length > 0 ? JSON.stringify(letrasArr) : null;
}

/**
 * Guardar un extracto (desde OCR, XML o manual)
 * POST /api/extractos
 */
const guardarExtracto = async (req, res, next) => {
  let conn;
  try {
    const {
      provincia, modalidad, fecha, numeros, letras, sorteo, fuente, juego
    } = req.body;

    if (!modalidad || !fecha || !numeros) {
      return errorResponse(res, 'Faltan datos requeridos', 400);
    }

    conn = await pool.getConnection();

    const juegoId = await resolverJuegoId(conn, juego);
    const provinciaId = await resolverProvinciaId(conn, provincia);
    const fechaSorteo = await resolverFechaSorteo(conn, {
      juego: juego || 'Quiniela', modalidad, sorteo, fecha
    });
    const numeroSorteo = await resolverNumeroSorteo(conn, {
      juego: juego || 'Quiniela', modalidad, sorteo, fecha: fechaSorteo || fecha
    });
    const nroFinal = numeroSorteo || 0; // 0 como fallback si no hay programación cargada
    const sorteoId = await resolverSorteoId(conn, juegoId, modalidad);
    const letrasJson = normalizarLetras(letras);

    if (!fechaSorteo) {
      return errorResponse(res, 'No se pudo determinar la fecha de sorteo', 400);
    }

    if (!nroFinal && nroFinal !== 0) {
      return errorResponse(res, 'No se pudo determinar el número de sorteo', 400);
    }

    if (normalizarJuegoEntrada(juego || 'Quiniela') === 'quiniela' && !provinciaId) {
      return errorResponse(res, 'Para Quiniela debe informar una provincia válida', 400);
    }

    if (!numeroSorteo) {
      console.warn(`[EXTRACTOS] numero_sorteo no resuelto para ${juego} ${modalidad} ${fechaSorteo} — guardando con nro=0`);
    }

    // 5. Guardar/Actualizar
    const [existente] = await conn.query(
      `SELECT id FROM extractos WHERE juego_id = ? AND sorteo_id = ? AND fecha = ? AND numero_sorteo = ? AND (provincia_id = ? OR (provincia_id IS NULL AND ? IS NULL))`,
      [juegoId, sorteoId, fechaSorteo, nroFinal, provinciaId, provinciaId]
    );

    if (existente.length > 0) {
      await conn.query(
        `UPDATE extractos SET numeros = ?, letras = ?, fuente = ?, updated_at = NOW() WHERE id = ?`,
        [JSON.stringify(numeros), letrasJson, fuente || 'OCR', existente[0].id]
      );
      return successResponse(res, { id: existente[0].id, updated: true }, 'Extracto actualizado');
    }

    const [result] = await conn.query(
      `INSERT INTO extractos (juego_id, sorteo_id, numero_sorteo, fecha, provincia_id, numeros, letras, fuente, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [juegoId, sorteoId, nroFinal, fechaSorteo, provinciaId, JSON.stringify(numeros), letrasJson, fuente || 'OCR', req.user.id]
    );

    return successResponse(res, { id: result.insertId, created: true }, 'Extracto guardado');

  } catch (error) {
    console.error('[EXTRACTOS] Error guardando extracto:', error);
    if (typeof next === 'function') return next(error);
    return errorResponse(res, 'Error: ' + error.message, 500);
  } finally {
    if (conn) conn.release();
  }
};

/**
 * Guardar múltiples extractos
 * POST /api/extractos/bulk
 */
const guardarExtractosBulk = async (req, res, next) => {
  let conn;
  try {
    const { extractos } = req.body;

    if (!Array.isArray(extractos) || extractos.length === 0) {
      return errorResponse(res, 'extractos debe ser un array con al menos un elemento', 400);
    }

    console.log(`[EXTRACTOS] Procesando bulk para ${extractos.length} extractos`);
    conn = await pool.getConnection();

    const resultados = [];
    let guardados = 0;
    let errores = 0;

    for (const ext of extractos) {
      try {
        const { provincia, modalidad, fecha, numeros, letras, fuente, sorteo, juego } = ext;

        if (!modalidad || !fecha || !numeros) {
          errores++;
          resultados.push({ error: 'Datos incompletos', extracto: ext });
          continue;
        }

        const juegoId = await resolverJuegoId(conn, juego);
        const provinciaId = await resolverProvinciaId(conn, provincia);
        const fechaSorteo = await resolverFechaSorteo(conn, {
          juego: juego || 'Quiniela', modalidad, sorteo, fecha
        });
        const numeroSorteo = await resolverNumeroSorteo(conn, {
          juego: juego || 'Quiniela', modalidad, sorteo, fecha: fechaSorteo || fecha
        });
        const sorteoId = await resolverSorteoId(conn, juegoId, modalidad);
        const letrasJson = normalizarLetras(letras);

        if (!fechaSorteo) {
          errores++;
          resultados.push({ error: 'No se pudo determinar fecha de sorteo', extracto: ext });
          continue;
        }

        const nroFinal = numeroSorteo || 0;
        if (!numeroSorteo) {
          console.warn(`[EXTRACTOS] bulk: numero_sorteo no resuelto para ${juego} ${modalidad} ${fechaSorteo} — usando nro=0`);
        }

        if (normalizarJuegoEntrada(juego || 'Quiniela') === 'quiniela' && !provinciaId) {
          errores++;
          resultados.push({ error: 'Quiniela requiere provincia válida', extracto: ext });
          continue;
        }

        // 5. Verificar duplicado
        const [existente] = await conn.query(
          `SELECT id FROM extractos WHERE juego_id = ? AND sorteo_id = ? AND fecha = ? AND numero_sorteo = ? AND (provincia_id = ? OR (provincia_id IS NULL AND ? IS NULL))`,
          [juegoId, sorteoId, fechaSorteo, nroFinal, provinciaId, provinciaId]
        );

        if (existente.length > 0) {
          await conn.query(
            `UPDATE extractos SET numeros = ?, letras = ?, fuente = ?, updated_at = NOW() WHERE id = ?`,
            [JSON.stringify(numeros), letrasJson, fuente || 'OCR', existente[0].id]
          );
          guardados++;
          resultados.push({ id: existente[0].id, updated: true, provincia, modalidad, fecha: fechaSorteo, numero_sorteo: nroFinal, juego: juego || 'Quiniela' });
        } else {
          const [result] = await conn.query(
            `INSERT INTO extractos (juego_id, sorteo_id, numero_sorteo, fecha, provincia_id, numeros, letras, fuente, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [juegoId, sorteoId, nroFinal, fechaSorteo, provinciaId, JSON.stringify(numeros), letrasJson, fuente || 'OCR', req.user.id]
          );
          guardados++;
          resultados.push({ id: result.insertId, created: true, provincia, modalidad, fecha: fechaSorteo, numero_sorteo: nroFinal, juego: juego || 'Quiniela' });
        }
      } catch (err) {
        console.error('[EXTRACTOS] Error individual:', err.message);
        errores++;
        resultados.push({ error: err.message, extracto: ext });
      }
    }

    return successResponse(res, { guardados, errores, resultados }, `${guardados} guardados, ${errores} errores`);

  } catch (error) {
    console.error('[EXTRACTOS] Error bulk:', error);
    if (typeof next === 'function') return next(error);
    return errorResponse(res, 'Error crítico: ' + error.message, 500);
  } finally {
    if (conn) conn.release();
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
        e.id, e.fecha, e.numero_sorteo, e.numeros, e.letras, e.fuente, e.validado, e.created_at,
        j.nombre as juego_nombre,
        s.nombre as sorteo_nombre, s.codigo as sorteo_codigo,
        p.nombre as provincia_nombre, p.codigo as provincia_codigo,
        ps.numero_sorteo as numero_sorteo_programado
      FROM extractos e
      JOIN juegos j ON e.juego_id = j.id
      JOIN sorteos s ON e.sorteo_id = s.id
      LEFT JOIN provincias p ON e.provincia_id = p.id
      LEFT JOIN programacion_sorteos ps ON ps.fecha_sorteo = e.fecha
        AND ps.activo = 1
        AND ps.modalidad_codigo = (
          CASE s.codigo
            WHEN 'PREV' THEN 'R'
            WHEN 'PRIM' THEN 'P'
            WHEN 'MAT' THEN 'M'
            WHEN 'VESP' THEN 'V'
            WHEN 'NOCT' THEN 'N'
            ELSE s.codigo
          END
        )
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
      numero_sorteo: row.numero_sorteo || row.numero_sorteo_programado || null,
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
 * Actualizar extracto (edición de números)
 * PUT /api/extractos/:id
 */
const actualizarExtracto = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { numeros, letras } = req.body;

    if (!numeros || !Array.isArray(numeros)) {
      return errorResponse(res, 'Se requiere un array de números', 400);
    }

    // Verificar que existe
    const [existente] = await conn.query('SELECT id FROM extractos WHERE id = ?', [id]);
    if (existente.length === 0) {
      return errorResponse(res, 'Extracto no encontrado', 404);
    }

    // Preparar letras
    let letrasJson = null;
    if (letras) {
      const lArr = Array.isArray(letras) ? letras : (typeof letras === 'string' ? letras.split('') : []);
      letrasJson = lArr.length > 0 ? JSON.stringify(lArr) : null;
    }

    // Actualizar
    await conn.query(
      `UPDATE extractos SET numeros = ?, letras = ?, updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(numeros), letrasJson, id]
    );

    return successResponse(res, { id, updated: true }, 'Extracto actualizado');

  } catch (error) {
    console.error('Error actualizando extracto:', error);
    return errorResponse(res, 'Error actualizando extracto: ' + error.message, 500);
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
  actualizarExtracto,
  eliminarExtracto
};
