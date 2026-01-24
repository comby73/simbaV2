/**
 * Helper para guardar datos del Control Previo en las tablas de resguardo
 * 
 * Usado por quiniela.controller.js y poceada.controller.js
 */

const { query } = require('../config/database');
const { PROVINCIAS } = require('./helpers');

/**
 * Agrupa registros NTF por agencia y calcula totales
 * Soporta tanto Quiniela como Poceada con sus diferentes estructuras
 * @param {Array} registrosNTF - Array de registros parseados del NTF
 * @param {string} tipoJuego - 'quiniela' o 'poceada'
 * @returns {Map} - Mapa con código de agencia como key y totales como value
 */
function agruparPorAgencia(registrosNTF, tipoJuego = 'quiniela') {
  const agencias = new Map();
  
  if (!registrosNTF || !Array.isArray(registrosNTF)) {
    return agencias;
  }
  
  for (const registro of registrosNTF) {
    // Obtener código de agencia según tipo de juego
    let codigoAgencia;
    let codigoProvincia = '51'; // Por defecto CABA
    
    if (tipoJuego === 'poceada') {
      // Poceada tiene agenciaCompleta (provincia + agencia) o agencia sola
      if (registro.agenciaCompleta) {
        codigoProvincia = registro.agenciaCompleta.substring(0, 2);
        codigoAgencia = registro.agenciaCompleta.substring(2).padStart(5, '0');
      } else {
        codigoAgencia = registro.agencia?.trim().padStart(5, '0') || '00000';
      }
    } else {
      // Quiniela solo tiene agencia (5 dígitos)
      codigoAgencia = registro.agencia?.trim().padStart(5, '0') || '00000';
      // Para venta web (88880), la provincia es 51
      if (codigoAgencia === '88880') {
        codigoProvincia = '51';
      }
    }
    
    // Clave única: provincia + agencia
    const claveAgencia = codigoProvincia + codigoAgencia;
    
    if (!agencias.has(claveAgencia)) {
      agencias.set(claveAgencia, {
        codigoAgencia: claveAgencia, // Código completo (7 dígitos: prov + agencia)
        codigoProvincia,
        totalTickets: 0,
        totalApuestas: 0,
        totalAnulados: 0,
        totalRecaudacion: 0,
        ticketsSet: new Set() // Para contar tickets únicos
      });
    }
    
    const ag = agencias.get(claveAgencia);
    
    // Contar como ticket único según ordinal o por ticket number
    if (tipoJuego === 'poceada') {
      // En Poceada usamos el ticket como identificador único
      ag.ticketsSet.add(registro.ticket);
      // Cada registro es una apuesta (puede tener combinaciones)
      ag.totalApuestas++;
      ag.totalRecaudacion += registro.importe || 0;
    } else {
      // Quiniela
      const ordinal = registro.ordinal?.trim() || '';
      if (ordinal === '01' || ordinal === '' || ordinal === '1') {
        ag.ticketsSet.add(registro.numeroTicket);
      }
      // Cada registro es una apuesta (ordinal)
      ag.totalApuestas++;
      ag.totalRecaudacion += registro.valorApuesta || 0;
    }
  }
  
  // Convertir ticketsSet a count y eliminar el Set
  for (const [, ag] of agencias) {
    ag.totalTickets = ag.ticketsSet.size;
    delete ag.ticketsSet;
  }
  
  return agencias;
}

/**
 * Guarda datos por agencia en la tabla control_previo_agencias
 * @param {number} controlPrevioId - ID del registro en control_previo_quiniela o control_previo_poceada
 * @param {string} juego - 'quiniela' o 'poceada'
 * @param {string} fecha - Fecha del sorteo
 * @param {number} numeroSorteo - Número de sorteo
 * @param {string} modalidad - Modalidad del sorteo (M, V, N, etc.)
 * @param {Array} registrosNTF - Registros parseados del NTF
 * @param {Map} registrosAnuladosPorAgencia - Opcional: map de anulados por agencia
 * @param {string} tipoJuego - 'quiniela' o 'poceada' para parsing correcto
 */
async function guardarAgenciasControlPrevio(controlPrevioId, juego, fecha, numeroSorteo, modalidad, registrosNTF, registrosAnuladosPorAgencia = null, tipoJuego = 'quiniela') {
  try {
    // Primero eliminar registros existentes para este sorteo
    await query(
      'DELETE FROM control_previo_agencias WHERE control_previo_id = ? AND juego = ?',
      [controlPrevioId, juego]
    );
    
    // Agrupar por agencia según tipo de juego
    const agencias = agruparPorAgencia(registrosNTF, tipoJuego);
    
    if (agencias.size === 0) {
      console.log(`⚠️ No hay datos de agencias para guardar (${juego})`);
      return { success: true, agenciasGuardadas: 0 };
    }
    
    // Preparar inserts en batch
    const valores = [];
    const placeholders = [];
    
    for (const [codigoAgencia, datos] of agencias) {
      // Obtener anulados de ese agencia si está disponible
      const anulados = registrosAnuladosPorAgencia?.get(codigoAgencia) || 0;
      
      placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      valores.push(
        controlPrevioId,
        juego,
        fecha,
        numeroSorteo,
        modalidad || 'M',
        codigoAgencia,
        datos.codigoProvincia,
        datos.totalTickets,
        datos.totalApuestas,
        anulados,
        datos.totalRecaudacion
      );
    }
    
    // Insert en batch
    const sql = `
      INSERT INTO control_previo_agencias 
        (control_previo_id, juego, fecha, numero_sorteo, modalidad, codigo_agencia, 
         codigo_provincia, total_tickets, total_apuestas, total_anulados, total_recaudacion)
      VALUES ${placeholders.join(', ')}
    `;
    
    await query(sql, valores);
    
    console.log(`✅ Guardadas ${agencias.size} agencias para Control Previo ${juego} (ID: ${controlPrevioId})`);
    return { success: true, agenciasGuardadas: agencias.size };
    
  } catch (error) {
    console.error(`❌ Error guardando agencias Control Previo ${juego}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Guarda el resultado del Control Previo de Quiniela en la base de datos
 * Si ya existe un registro para ese sorteo, lo reemplaza
 * 
 * @param {Object} resultado - Resultado del procesamiento del ZIP
 * @param {Object} usuario - Usuario que realizó la carga (req.user)
 * @param {string} nombreArchivo - Nombre del archivo ZIP procesado
 * @returns {Object} - { success, id, mensaje }
 */
async function guardarControlPrevioQuiniela(resultado, usuario, nombreArchivo) {
  try {
    const {
      sorteo,
      datosCalculados,
      comparacion,
      seguridad
    } = resultado;

    // Extraer datos
    const fecha = sorteo?.programacion?.fecha_sorteo || new Date().toISOString().split('T')[0];
    const numeroSorteo = parseInt(sorteo?.numero || datosCalculados?.numeroSorteo || 0);
    const modalidad = sorteo?.modalidad?.codigo || 'M'; // Default Matutina

    // Verificar si ya existe (para reemplazar)
    const existe = await query(
      'SELECT id FROM control_previo_quiniela WHERE fecha = ? AND numero_sorteo = ? AND modalidad = ?',
      [fecha, numeroSorteo, modalidad]
    );

    const datosGuardar = {
      fecha,
      numero_sorteo: numeroSorteo,
      modalidad,
      total_registros: datosCalculados?.registros || 0,
      total_tickets: datosCalculados?.registros || 0, // En Quiniela, registros ≈ tickets
      total_apuestas: datosCalculados?.apuestasTotal || 0,
      total_anulados: datosCalculados?.registrosAnulados || 0,
      total_recaudacion: datosCalculados?.recaudacion || 0,
      nombre_archivo_zip: nombreArchivo,
      hash_archivo: seguridad?.hashCalculado || null,
      hash_verificado: seguridad?.verificado || false,
      comparacion_xml: comparacion ? JSON.stringify(comparacion) : null,
      datos_adicionales: JSON.stringify({
        provincias: datosCalculados?.provincias,
        tiposSorteo: datosCalculados?.tiposSorteo,
        online: datosCalculados?.online,
        estadisticasAgenciasAmigas: datosCalculados?.estadisticasAgenciasAmigas
      }),
      usuario_id: usuario?.id || null,
      usuario_nombre: usuario?.nombre || 'Sistema'
    };

    let id;

    if (existe.length > 0) {
      // Actualizar registro existente
      await query(
        `UPDATE control_previo_quiniela SET 
          total_registros = ?, total_tickets = ?, total_apuestas = ?, total_anulados = ?,
          total_recaudacion = ?, nombre_archivo_zip = ?, hash_archivo = ?, hash_verificado = ?,
          comparacion_xml = ?, datos_adicionales = ?, usuario_id = ?, usuario_nombre = ?,
          updated_at = NOW()
         WHERE id = ?`,
        [
          datosGuardar.total_registros, datosGuardar.total_tickets, datosGuardar.total_apuestas,
          datosGuardar.total_anulados, datosGuardar.total_recaudacion, datosGuardar.nombre_archivo_zip,
          datosGuardar.hash_archivo, datosGuardar.hash_verificado, datosGuardar.comparacion_xml,
          datosGuardar.datos_adicionales, datosGuardar.usuario_id, datosGuardar.usuario_nombre,
          existe[0].id
        ]
      );
      id = existe[0].id;
      console.log(`✅ Control Previo Quiniela actualizado (ID: ${id})`);
    } else {
      // Insertar nuevo registro
      const result = await query(
        `INSERT INTO control_previo_quiniela 
         (fecha, numero_sorteo, modalidad, total_registros, total_tickets, total_apuestas,
          total_anulados, total_recaudacion, nombre_archivo_zip, hash_archivo, hash_verificado,
          comparacion_xml, datos_adicionales, usuario_id, usuario_nombre)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          datosGuardar.fecha, datosGuardar.numero_sorteo, datosGuardar.modalidad,
          datosGuardar.total_registros, datosGuardar.total_tickets, datosGuardar.total_apuestas,
          datosGuardar.total_anulados, datosGuardar.total_recaudacion, datosGuardar.nombre_archivo_zip,
          datosGuardar.hash_archivo, datosGuardar.hash_verificado, datosGuardar.comparacion_xml,
          datosGuardar.datos_adicionales, datosGuardar.usuario_id, datosGuardar.usuario_nombre
        ]
      );
      id = result.insertId;
      console.log(`✅ Control Previo Quiniela guardado (ID: ${id})`);
    }

    // NUEVO: Guardar datos por agencia si hay registros NTF
    if (resultado.registrosNTF && resultado.registrosNTF.length > 0) {
      const resAgencias = await guardarAgenciasControlPrevio(
        id, 
        'quiniela', 
        fecha, 
        numeroSorteo, 
        modalidad, 
        resultado.registrosNTF,
        null, // No tenemos map de anulados por agencia aún
        'quiniela' // Tipo de juego para parsing correcto
      );
      console.log(`   └─ Agencias: ${resAgencias.agenciasGuardadas || 0}`);
    }

    return { success: true, id, mensaje: 'Control Previo guardado correctamente' };

  } catch (error) {
    console.error('❌ Error guardando Control Previo Quiniela:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Guarda el resultado del Control Previo de Poceada en la base de datos
 * Si ya existe un registro para ese sorteo, lo reemplaza
 * 
 * @param {Object} resultado - Resultado del procesamiento del ZIP
 * @param {Object} usuario - Usuario que realizó la carga (req.user)
 * @param {string} nombreArchivo - Nombre del archivo ZIP procesado
 * @returns {Object} - { success, id, mensaje }
 */
async function guardarControlPrevioPoceada(resultado, usuario, nombreArchivo) {
  try {
    const {
      sorteo,
      fechaSorteo,
      resumen,
      comparacion,
      distribucionPremios,
      pozoArrastre,
      seguridad
    } = resultado;

    // Extraer datos
    const fecha = fechaSorteo || new Date().toISOString().split('T')[0];
    const numeroSorteo = parseInt(sorteo || 0);

    // Verificar si ya existe (para reemplazar)
    const existe = await query(
      'SELECT id FROM control_previo_poceada WHERE fecha = ? AND numero_sorteo = ?',
      [fecha, numeroSorteo]
    );

    const datosGuardar = {
      fecha,
      numero_sorteo: numeroSorteo,
      total_registros: resumen?.registros || 0,
      total_tickets: resumen?.registros || 0,
      total_apuestas: resumen?.apuestasTotal || 0,
      total_anulados: resumen?.anulados || 0,
      total_recaudacion: resumen?.recaudacion || 0,
      nombre_archivo_zip: nombreArchivo,
      hash_archivo: seguridad?.hashCalculado || null,
      hash_verificado: seguridad?.verificado || false,
      comparacion_xml: comparacion ? JSON.stringify(comparacion) : null,
      distribucion_premios: distribucionPremios ? JSON.stringify(distribucionPremios) : null,
      pozos_arrastre: pozoArrastre ? JSON.stringify(pozoArrastre) : null,
      datos_adicionales: JSON.stringify({
        provincias: resultado.provincias,
        ventaWeb: resumen?.ventaWeb || 0
      }),
      usuario_id: usuario?.id || null,
      usuario_nombre: usuario?.nombre || 'Sistema'
    };

    let id;

    if (existe.length > 0) {
      // Actualizar registro existente
      await query(
        `UPDATE control_previo_poceada SET 
          total_registros = ?, total_tickets = ?, total_apuestas = ?, total_anulados = ?,
          total_recaudacion = ?, nombre_archivo_zip = ?, hash_archivo = ?, hash_verificado = ?,
          comparacion_xml = ?, distribucion_premios = ?, pozos_arrastre = ?, datos_adicionales = ?,
          usuario_id = ?, usuario_nombre = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          datosGuardar.total_registros, datosGuardar.total_tickets, datosGuardar.total_apuestas,
          datosGuardar.total_anulados, datosGuardar.total_recaudacion, datosGuardar.nombre_archivo_zip,
          datosGuardar.hash_archivo, datosGuardar.hash_verificado, datosGuardar.comparacion_xml,
          datosGuardar.distribucion_premios, datosGuardar.pozos_arrastre, datosGuardar.datos_adicionales,
          datosGuardar.usuario_id, datosGuardar.usuario_nombre, existe[0].id
        ]
      );
      id = existe[0].id;
      console.log(`✅ Control Previo Poceada actualizado (ID: ${id})`);
    } else {
      // Insertar nuevo registro
      const result = await query(
        `INSERT INTO control_previo_poceada 
         (fecha, numero_sorteo, total_registros, total_tickets, total_apuestas,
          total_anulados, total_recaudacion, nombre_archivo_zip, hash_archivo, hash_verificado,
          comparacion_xml, distribucion_premios, pozos_arrastre, datos_adicionales,
          usuario_id, usuario_nombre)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          datosGuardar.fecha, datosGuardar.numero_sorteo, datosGuardar.total_registros,
          datosGuardar.total_tickets, datosGuardar.total_apuestas, datosGuardar.total_anulados,
          datosGuardar.total_recaudacion, datosGuardar.nombre_archivo_zip, datosGuardar.hash_archivo,
          datosGuardar.hash_verificado, datosGuardar.comparacion_xml, datosGuardar.distribucion_premios,
          datosGuardar.pozos_arrastre, datosGuardar.datos_adicionales, datosGuardar.usuario_id,
          datosGuardar.usuario_nombre
        ]
      );
      id = result.insertId;
      console.log(`✅ Control Previo Poceada guardado (ID: ${id})`);
    }

    // NUEVO: Guardar datos por agencia si hay registros NTF
    if (resultado.registrosNTF && resultado.registrosNTF.length > 0) {
      const resAgencias = await guardarAgenciasControlPrevio(
        id, 
        'poceada', 
        fecha, 
        numeroSorteo, 
        'U', // Poceada no tiene modalidad, usar 'U' (único)
        resultado.registrosNTF,
        null, // No tenemos map de anulados por agencia
        'poceada' // Tipo de juego para parsing correcto
      );
      console.log(`   └─ Agencias: ${resAgencias.agenciasGuardadas || 0}`);
    }

    return { success: true, id, mensaje: 'Control Previo guardado correctamente' };

  } catch (error) {
    console.error('❌ Error guardando Control Previo Poceada:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene el historial de Control Previo
 * @param {string} juego - 'quiniela' o 'poceada'
 * @param {Object} filtros - { fecha, desde, hasta, limit }
 */
async function obtenerHistorialControlPrevio(juego, filtros = {}) {
  try {
    const tabla = juego === 'quiniela' ? 'control_previo_quiniela' : 'control_previo_poceada';
    let sql = `SELECT * FROM ${tabla} WHERE 1=1`;
    const params = [];

    if (filtros.fecha) {
      sql += ' AND fecha = ?';
      params.push(filtros.fecha);
    }

    if (filtros.desde) {
      sql += ' AND fecha >= ?';
      params.push(filtros.desde);
    }

    if (filtros.hasta) {
      sql += ' AND fecha <= ?';
      params.push(filtros.hasta);
    }

    if (filtros.numeroSorteo) {
      sql += ' AND numero_sorteo = ?';
      params.push(filtros.numeroSorteo);
    }

    sql += ' ORDER BY fecha DESC, numero_sorteo DESC';
    sql += ` LIMIT ${filtros.limit || 50}`;

    const resultados = await query(sql, params);
    return resultados;

  } catch (error) {
    console.error('Error obteniendo historial:', error);
    throw error;
  }
}

module.exports = {
  guardarControlPrevioQuiniela,
  guardarControlPrevioPoceada,
  obtenerHistorialControlPrevio
};
