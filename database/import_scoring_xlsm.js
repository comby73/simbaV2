require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
const path = require('path');
const mysql = require('mysql2/promise');
const ExcelJS = require('exceljs');

const WORKBOOK_PATH = path.resolve(__dirname, '../Modelo_Regenerativo_Scoring_POP_LOTBA_RTM.xlsm');

function getCellValue(cell) {
  if (!cell) {
    return null;
  }

  if (cell.formula) {
    return cell.result ?? null;
  }

  return cell.value ?? cell.text ?? null;
}

function toStringValue(cell) {
  const value = getCellValue(cell);
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object' && value.text) {
    return String(value.text).trim();
  }
  return String(value).trim();
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  const parsed = Number(String(value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function importWorkbook() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'control_loterias'
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK_PATH);

  const params = workbook.getWorksheet('PARAMS_MODELO');
  const asesores = workbook.getWorksheet('ASESORES');
  const compliance = workbook.getWorksheet('COMPLIANCE');
  const digital = workbook.getWorksheet('DIGITAL');
  const cliente = workbook.getWorksheet('CLIENTE');
  const hist = workbook.getWorksheet('HIST_SCORE');

  const refs = [
    'B1', 'B2', 'B3', 'B4', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12',
    'B15', 'B16', 'B17', 'B18', 'B19', 'B20', 'B21', 'B23', 'B25', 'B26',
    'B27', 'B28', 'B29', 'B31', 'B32', 'B33', 'B34', 'B35', 'B44', 'B45',
    'B46', 'B47', 'B48', 'B50', 'B51', 'B52', 'B53'
  ];

  await connection.beginTransaction();

  try {
    await connection.query('DELETE FROM scoring_modelo_parametros');
    await connection.query('DELETE FROM scoring_cliente_coeficientes');
    await connection.query('DELETE FROM scoring_asesores');
    await connection.query('DELETE FROM scoring_compliance');
    await connection.query('DELETE FROM scoring_digital');
    await connection.query('DELETE FROM scoring_cliente');
    await connection.query('DELETE FROM scoring_hist_score');

    for (const ref of refs) {
      const cell = params.getCell(ref);
      const rawValue = getCellValue(cell);
      const textValue = rawValue === null || rawValue === undefined ? null : String(rawValue);
      const numericValue = typeof rawValue === 'number' ? rawValue : null;
      await connection.execute(
        'INSERT INTO scoring_modelo_parametros (clave, valor_texto, valor_numerico) VALUES (?, ?, ?)',
        [ref, textValue, numericValue]
      );
    }

    for (let rowIndex = 36; rowIndex <= 40; rowIndex += 1) {
      const categoria = toStringValue(params.getCell(`A${rowIndex}`));
      const coeficiente = toNumber(getCellValue(params.getCell(`B${rowIndex}`)), 1);
      if (!categoria) {
        continue;
      }
      await connection.execute(
        'INSERT INTO scoring_cliente_coeficientes (categoria, coeficiente) VALUES (?, ?)',
        [categoria, coeficiente]
      );
    }

    for (let rowIndex = 2; rowIndex <= asesores.rowCount; rowIndex += 1) {
      const row = asesores.getRow(rowIndex);
      const ctaCte = toStringValue(row.getCell(1));
      const asesor = toStringValue(row.getCell(2));
      if (!ctaCte) {
        continue;
      }
      await connection.execute(
        'INSERT INTO scoring_asesores (cta_cte, asesor) VALUES (?, ?)',
        [ctaCte, asesor || 'Sin asesor']
      );
    }

    for (let rowIndex = 2; rowIndex <= compliance.rowCount; rowIndex += 1) {
      const row = compliance.getRow(rowIndex);
      const ctaCte = toStringValue(row.getCell(1));
      if (!ctaCte) {
        continue;
      }
      await connection.execute(
        `INSERT INTO scoring_compliance (
          cta_cte, fiscalizacion, analisis_apuestas, sanciones, pago_fuera_termino, puntaje, observacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          ctaCte,
          toNumber(getCellValue(row.getCell(2))),
          toNumber(getCellValue(row.getCell(3))),
          toNumber(getCellValue(row.getCell(4))),
          toNumber(getCellValue(row.getCell(5))),
          toNumber(getCellValue(row.getCell(6))),
          toStringValue(row.getCell(7)) || null
        ]
      );
    }

    for (let rowIndex = 2; rowIndex <= digital.rowCount; rowIndex += 1) {
      const row = digital.getRow(rowIndex);
      const ctaCte = toStringValue(row.getCell(1));
      if (!ctaCte) {
        continue;
      }
      await connection.execute(
        `INSERT INTO scoring_digital (
          cta_cte, activaciones_iniciales, dias_cash_in_cash_out_activos, cash_in_bruto, cash_in_ponderado,
          cash_out, clientes_agencia_amiga_totales, clientes_agencia_amiga_operaron, ratio_clientes_operaron, puntaje
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ctaCte,
          toNumber(getCellValue(row.getCell(2))),
          toNumber(getCellValue(row.getCell(3))),
          toNumber(getCellValue(row.getCell(4))),
          toNumber(getCellValue(row.getCell(5))),
          toNumber(getCellValue(row.getCell(6))),
          toNumber(getCellValue(row.getCell(7))),
          toNumber(getCellValue(row.getCell(8))),
          toNumber(getCellValue(row.getCell(9))),
          toNumber(getCellValue(row.getCell(10)))
        ]
      );
    }

    for (let rowIndex = 2; rowIndex <= cliente.rowCount; rowIndex += 1) {
      const row = cliente.getRow(rowIndex);
      const ctaCte = toStringValue(row.getCell(1));
      if (!ctaCte) {
        continue;
      }
      await connection.execute(
        `INSERT INTO scoring_cliente (
          cta_cte, qr_tot_estrellas, qr_cant_op, qr_op_prom, qr_pts, cant_quejas,
          tasa_cero_quejas_pts, evaluacion_cliente_incognito, ponderacion_cliente_incognito,
          resenias_google, resenias_google_pts, puntaje, categoria, coeficiente
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ctaCte,
          toNumber(getCellValue(row.getCell(2))),
          toNumber(getCellValue(row.getCell(3))),
          toNumber(getCellValue(row.getCell(4))),
          toNumber(getCellValue(row.getCell(5))),
          toNumber(getCellValue(row.getCell(6))),
          toNumber(getCellValue(row.getCell(7))),
          toNumber(getCellValue(row.getCell(8))),
          toNumber(getCellValue(row.getCell(9))),
          toNumber(getCellValue(row.getCell(10))),
          toNumber(getCellValue(row.getCell(11))),
          toNumber(getCellValue(row.getCell(12))),
          toStringValue(row.getCell(13)) || 'Regular',
          toNumber(getCellValue(row.getCell(14)), 1)
        ]
      );
    }

    for (let rowIndex = 2; rowIndex <= hist.rowCount; rowIndex += 1) {
      const row = hist.getRow(rowIndex);
      const periodoKey = toStringValue(row.getCell(2));
      const ctaCte = toStringValue(row.getCell(3));
      if (!periodoKey || !ctaCte) {
        continue;
      }
      const fechaTexto = toStringValue(row.getCell(7));
      const fechaCarga = fechaTexto ? new Date(fechaTexto) : null;
      await connection.execute(
        `INSERT INTO scoring_hist_score (
          periodo_key, cta_cte, puntaje_final, categoria, ranking_puntaje, fecha_carga
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          periodoKey,
          ctaCte,
          toNumber(getCellValue(row.getCell(4))),
          toStringValue(row.getCell(5)) || 'CERRADO',
          toNumber(getCellValue(row.getCell(6)), null),
          fechaCarga instanceof Date && !Number.isNaN(fechaCarga.getTime()) ? fechaCarga : null
        ]
      );
    }

    await connection.commit();
    console.log('Importacion de scoring desde XLSM completada');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

importWorkbook().catch(error => {
  console.error('Error importando scoring desde XLSM:', error);
  process.exit(1);
});