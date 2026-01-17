const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { query } = require('../../config/database');
const { successResponse, errorResponse } = require('../../shared/helpers');

// Cargar Excel y actualizar tabla de agencias
const cargarExcelAgencias = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No se recibió ningún archivo Excel', 400);
    }
    
    // Check si hay que vaciar la tabla
    const reemplazar = req.body.reemplazar === 'true';
    if (reemplazar) {
      try {
        await query('TRUNCATE TABLE agencias');
      } catch (e) {
        await query('DELETE FROM agencias'); 
      }
    }

    const excelPath = req.file.path;
    const workbook = new ExcelJS.Workbook();
    
    await workbook.xlsx.readFile(excelPath);
    
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      fs.unlinkSync(excelPath);
      return errorResponse(res, 'El archivo Excel no contiene hojas', 400);
    }

    const agencias = [];

    // =====================================================
    // MAPEO FIJO DE COLUMNAS SEGÚN EL EXCEL DEL USUARIO:
    // A (1): Nro de Cuenta Corriente (51000111)
    // B (2): Estado habilitación (H = Habilitada)
    // C (3): Nombre
    // D (4): Nombre 2 (Apellido)
    // E (5): Correo electrónico
    // J (10): Calle
    // K (11): Nº (edificio)
    // =====================================================

    worksheet.eachRow((row, rowNumber) => {
      // Saltar fila 1 (encabezados)
      if (rowNumber === 1) return;

      // DEBUG: Mostrar qué lee de la primera fila de datos
      if (rowNumber === 2) {
        console.log('=== DEBUG FILA 2 ===');
        console.log('Col 1 (A):', row.getCell(1).value);
        console.log('Col 2 (B):', row.getCell(2).value);
        console.log('Col 3 (C):', row.getCell(3).value);
        console.log('Col 4 (D):', row.getCell(4).value);
        console.log('Col 5 (E):', row.getCell(5).value);
        console.log('Col 10 (J):', row.getCell(10).value);
        console.log('Col 11 (K):', row.getCell(11).value);
        // Buscar Barrio/Localidad en columnas posteriores
        for (let i = 20; i <= 30; i++) {
          const val = row.getCell(i).value;
          if (val) console.log(`Col ${i}: ${val}`);
        }
        console.log('====================');
      }

      // Columna A (1): Cuenta
      const celdaCuenta = row.getCell(1);
      let cuenta = '';
      if (celdaCuenta.value) {
        cuenta = celdaCuenta.text || celdaCuenta.value.toString().trim();
      }
      if (!cuenta || cuenta.length < 5) return;

      // Columna B (2): Estado
      const celdaEstado = row.getCell(2);
      const estado = celdaEstado.value?.toString().trim().toUpperCase() || '';
      const activa = estado === 'H';

      // Columna C (3): Nombre
      const celdaNombre1 = row.getCell(3);
      const nombre1 = celdaNombre1.value?.toString().trim() || '';
      
      // Columna D (4): Nombre 2 / Apellido
      const celdaNombre2 = row.getCell(4);
      const nombre2 = celdaNombre2.value?.toString().trim() || '';
      
      // Concatenar nombre completo
      const nombreCompleto = `${nombre1} ${nombre2}`.trim();

      // Columna E (5): Email
      const celdaEmail = row.getCell(5);
      let email = '';
      if (celdaEmail.value) {
        // Manejar hipervínculos
        if (celdaEmail.value.hyperlink) {
          email = celdaEmail.value.text || celdaEmail.text || '';
        } else if (celdaEmail.text) {
          email = celdaEmail.text;
        } else {
          email = celdaEmail.value.toString().trim();
        }
      }

      // Columna J (10): Calle
      const celdaCalle = row.getCell(10);
      const calle = celdaCalle.value?.toString().trim() || '';
      
      // Columna K (11): Nº edificio
      const celdaAltura = row.getCell(11);
      const altura = celdaAltura.value?.toString().trim() || '';
      
      const direccion = `${calle} ${altura}`.trim();

      // Columna V (22): Barrio / Localidad
      const celdaLocalidad = row.getCell(23);
      const localidad = celdaLocalidad.value?.toString().trim() || '';

      // Procesar número de cuenta
      const numFinal = cuenta.padStart(8, '0');
      const provFinal = numFinal.substring(0, 2);
      const cuentaFinal = parseInt(numFinal.substring(2, 7));
      const digitoFinal = numFinal.substring(7, 8);

      agencias.push({
        numero: numFinal,
        provincia: provFinal,
        cuenta_corriente: cuentaFinal,
        digito_verificador: digitoFinal,
        nombre: nombreCompleto,
        email: email,
        direccion: direccion,
        localidad: localidad,
        activa: activa
      });
    });

    if (agencias.length === 0) {
      if (fs.existsSync(excelPath)) fs.unlinkSync(excelPath);
      return errorResponse(res, 'No se encontraron agencias válidas en el Excel', 400);
    }

    // Insertar/Actualizar en BD
    let insertadas = 0;
    let actualizadas = 0;
    const erroresBD = [];

    for (const agencia of agencias) {
      try {
        const existe = await query('SELECT id FROM agencias WHERE numero = ?', [agencia.numero]);

        if (existe.length > 0) {
          await query(
            `UPDATE agencias SET 
             provincia = ?, cuenta_corriente = ?, digito_verificador = ?, 
             nombre = ?, email = ?, direccion = ?, localidad = ?, activa = ?, updated_at = NOW() 
             WHERE numero = ?`,
            [
              agencia.provincia, agencia.cuenta_corriente, agencia.digito_verificador,
              agencia.nombre, agencia.email, agencia.direccion, agencia.localidad,
              agencia.activa, agencia.numero
            ]
          );
          actualizadas++;
        } else {
          await query(
            `INSERT INTO agencias 
             (numero, provincia, cuenta_corriente, digito_verificador, nombre, email, direccion, localidad, activa) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              agencia.numero, agencia.provincia, agencia.cuenta_corriente, agencia.digito_verificador,
              agencia.nombre, agencia.email, agencia.direccion, agencia.localidad, agencia.activa
            ]
          );
          insertadas++;
        }
      } catch (err) {
        erroresBD.push({ agencia: agencia.numero, error: err.message });
      }
    }

    fs.unlinkSync(excelPath);

    return successResponse(res, {
      total: agencias.length,
      insertadas,
      actualizadas,
      erroresBD: erroresBD.length > 0 ? erroresBD : null
    }, `Excel procesado: ${insertadas} insertadas, ${actualizadas} actualizadas`);

  } catch (error) {
    console.error('Error procesando Excel de agencias:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return errorResponse(res, 'Error procesando archivo Excel: ' + error.message, 500);
  }
};

// Obtener todas las agencias
const obtenerAgencias = async (req, res) => {
  try {
    const { activas, provincia } = req.query;
    
    let sql = 'SELECT * FROM agencias WHERE 1=1';
    const params = [];

    if (activas === 'true') {
      sql += ' AND activa = TRUE';
    }

    if (provincia) {
      sql += ' AND provincia = ?';
      params.push(provincia);
    }

    sql += ' ORDER BY numero ASC';

    const agencias = await query(sql, params);

    return successResponse(res, agencias);

  } catch (error) {
    console.error('Error obteniendo agencias:', error);
    return errorResponse(res, 'Error obteniendo agencias', 500);
  }
};

// Buscar agencia por número
const buscarAgencia = async (req, res) => {
  try {
    const { numero } = req.params;
    
    if (!numero || numero.length !== 8) {
      return errorResponse(res, 'Número de agencia inválido (debe tener 8 dígitos)', 400);
    }

    const agencias = await query(
      'SELECT * FROM agencias WHERE numero = ? AND activa = TRUE',
      [numero]
    );

    if (agencias.length === 0) {
      return successResponse(res, null, 'Agencia no encontrada');
    }

    return successResponse(res, agencias[0]);

  } catch (error) {
    console.error('Error buscando agencia:', error);
    return errorResponse(res, 'Error buscando agencia', 500);
  }
};

module.exports = {
  cargarExcelAgencias,
  obtenerAgencias,
  buscarAgencia
};
