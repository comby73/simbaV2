const AdmZip = require('adm-zip');
const { query, transaction } = require('../../config/database');
const { successResponse, errorResponse } = require('../../shared/helpers');

const CODIGOS_PROVINCIA = {
  '51': 'CABA',
  '53': 'Buenos Aires',
  '54': 'Catamarca',
  '55': 'Cordoba',
  '56': 'Corrientes',
  '57': 'Chaco',
  '58': 'Chubut',
  '59': 'Entre Rios',
  '60': 'Formosa',
  '61': 'Jujuy',
  '62': 'La Pampa',
  '63': 'La Rioja',
  '64': 'Mendoza',
  '65': 'Misiones',
  '66': 'Neuquen',
  '67': 'Rio Negro',
  '68': 'Salta',
  '69': 'San Juan',
  '70': 'San Luis',
  '71': 'Santa Cruz',
  '72': 'Santa Fe',
  '73': 'Santiago del Estero',
  '74': 'Tucuman',
  '75': 'Tierra del Fuego'
};

function parseField(line, start, end) {
  if (end <= line.length) return line.slice(start - 1, end).trim();
  return '';
}

function safeInt(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = parseInt(String(value).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function safeFloat(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function parseDateYyyyMmDd(raw) {
  if (!raw) return null;
  const v = String(raw).replace(/[^\d]/g, '');
  if (v.length !== 8) return null;
  const year = parseInt(v.slice(0, 4), 10);
  const month = parseInt(v.slice(4, 6), 10);
  const day = parseInt(v.slice(6, 8), 10);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeAgency(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  return s;
}

function normalizeToCtaCte(provincia, agency) {
  if (provincia !== '51') return String(provincia);
  const ag = String(agency || '').replace(/[^\d]/g, '');
  return `51${ag.padStart(5, '0')}`;
}

function parseTxtQuinielaYa(content, archivoOrigen) {
  const lines = content.split(/\r?\n/);
  const records = [];
  const sorteos = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.length < 315) continue;

    const gameCode = line.slice(2, 4);
    if (gameCode !== '79') continue;

    const provinceCode = parseField(line, 14, 15);
    const agencyRaw = parseField(line, 16, 20);
    const drawNumber = safeInt(parseField(line, 5, 10));
    const saleDateRaw = parseField(line, 40, 47);
    const cancelDateRaw = parseField(line, 71, 78);
    const betValue = safeFloat(parseField(line, 122, 131)) / 100;
    const premio = safeFloat(parseField(line, 302, 315)) / 100;

    if (!drawNumber) continue;
    const fecha = parseDateYyyyMmDd(saleDateRaw);
    if (!fecha) continue;

    sorteos.add(drawNumber);

    let agency = normalizeAgency(agencyRaw);
    if (provinceCode !== '51') {
      agency = CODIGOS_PROVINCIA[provinceCode] || `PROV_${provinceCode}`;
    }
    if (!agency) continue;

    records.push({
      lineNumber: i + 1,
      sorteo: drawNumber,
      fechaSorteo: fecha,
      provincia: provinceCode || '51',
      agency,
      cancelado: Boolean(cancelDateRaw),
      importeApuesta: betValue,
      premioObtenido: premio,
      archivoOrigen
    });
  }

  return { records, sorteos };
}

function aggregateByAgency(records) {
  if (!records.length) return null;
  const first = records[0];
  const byAgency = new Map();

  let totalRegistros = 0;
  let totalAnulados = 0;
  let totalApuestas = 0;
  let totalRecaudacion = 0;
  let totalPremios = 0;
  let totalGanadores = 0;

  for (const r of records) {
    totalRegistros += 1;
    if (r.cancelado) totalAnulados += 1;
    if (!r.cancelado) {
      totalApuestas += 1;
      totalRecaudacion += r.importeApuesta;
    }
    totalPremios += r.premioObtenido;
    if (!r.cancelado && r.premioObtenido > 0) totalGanadores += 1;

    const key = `${r.provincia}|${r.agency}`;
    if (!byAgency.has(key)) {
      byAgency.set(key, {
        provincia: r.provincia,
        agency: r.agency,
        cantidad_cancelaciones: 0,
        importe_cancelaciones: 0,
        recaudacion_total: 0,
        registros_validados: 0,
        total_apuestas: 0,
        total_premios: 0,
        total_ganadores: 0
      });
    }

    const ag = byAgency.get(key);
    if (r.cancelado) {
      ag.cantidad_cancelaciones += 1;
      ag.importe_cancelaciones += r.importeApuesta;
    } else {
      ag.registros_validados += 1;
      ag.recaudacion_total += r.importeApuesta;
      ag.total_apuestas += 1;
    }
    ag.total_premios += r.premioObtenido;
    if (!r.cancelado && r.premioObtenido > 0) ag.total_ganadores += 1;
  }

  const agencias = Array.from(byAgency.values()).map((a) => ({
    ...a,
    importe_cancelaciones: Number(a.importe_cancelaciones.toFixed(2)),
    recaudacion_total: Number(a.recaudacion_total.toFixed(2)),
    total_premios: Number(a.total_premios.toFixed(2))
  }));

  return {
    sorteo: first.sorteo,
    fechaSorteo: first.fechaSorteo,
    archivoOrigen: first.archivoOrigen,
    totalRegistros,
    totalAnulados,
    totalApuestas,
    totalRecaudacion: Number(totalRecaudacion.toFixed(2)),
    totalPremios: Number(totalPremios.toFixed(2)),
    totalGanadores,
    agencias
  };
}

async function saveQuinielaYaSummary(summary, user, overwrite) {
  const existingRows = await query(
    'SELECT id FROM escrutinio_quiniela_ya WHERE numero_sorteo = ? LIMIT 1',
    [summary.sorteo]
  );
  const existing = existingRows[0];

  if (existing && !overwrite) {
    return {
      requiresConfirmation: true,
      sorteo: summary.sorteo,
      totalAgencias: summary.agencias.length,
      fechaSorteo: summary.fechaSorteo
    };
  }

  const result = await transaction(async (conn) => {
    if (existing) {
      await conn.execute(
        'DELETE FROM escrutinio_premios_agencia WHERE juego = ? AND escrutinio_id = ?',
        ['quinielaya', existing.id]
      );
      await conn.execute(
        'DELETE FROM escrutinio_ganadores WHERE juego = ? AND escrutinio_id = ?',
        ['quinielaya', existing.id]
      );
      await conn.execute(
        'DELETE FROM control_previo_agencias WHERE juego = ? AND numero_sorteo = ?',
        ['quinielaya', summary.sorteo]
      );
      await conn.execute(
        'DELETE FROM escrutinio_quiniela_ya WHERE id = ?',
        [existing.id]
      );
    }

    const [ins] = await conn.execute(
      `INSERT INTO escrutinio_quiniela_ya
      (fecha, numero_sorteo, total_registros, total_tickets, total_apuestas, total_anulados,
       total_recaudacion, total_premios, total_ganadores, archivo_origen, usuario_id, usuario_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        summary.fechaSorteo,
        summary.sorteo,
        summary.totalRegistros,
        summary.totalRegistros,
        summary.totalApuestas,
        summary.totalAnulados,
        summary.totalRecaudacion,
        summary.totalPremios,
        summary.totalGanadores,
        summary.archivoOrigen,
        user?.id || null,
        user?.nombre || user?.username || null
      ]
    );
    const escrutinioId = ins.insertId;

    for (const ag of summary.agencias) {
      const tipoAgrupacion = ag.provincia === '51' ? 'agencia' : 'provincia';
      const codigoAgencia = ag.provincia === '51'
        ? String(ag.agency).replace(/[^\d]/g, '').padStart(5, '0')
        : null;
      const ctaCte = normalizeToCtaCte(ag.provincia, ag.agency);
      const nombreDisplay = ag.provincia === '51'
        ? ctaCte
        : (CODIGOS_PROVINCIA[ag.provincia] || `PROV_${ag.provincia}`);

      await conn.execute(
        `INSERT INTO escrutinio_premios_agencia
        (escrutinio_id, juego, tipo_agrupacion, codigo_provincia, codigo_agencia, cta_cte, nombre_display, total_ganadores, total_premios)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          escrutinioId,
          'quinielaya',
          tipoAgrupacion,
          ag.provincia,
          codigoAgencia,
          ctaCte,
          nombreDisplay,
          ag.total_ganadores,
          ag.total_premios
        ]
      );

      await conn.execute(
        `INSERT INTO control_previo_agencias
        (control_previo_id, juego, fecha, numero_sorteo, modalidad, codigo_agencia, codigo_provincia, total_tickets, total_apuestas, total_anulados, total_recaudacion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          escrutinioId,
          'quinielaya',
          summary.fechaSorteo,
          summary.sorteo,
          'Y',
          ctaCte,
          ag.provincia,
          ag.registros_validados + ag.cantidad_cancelaciones,
          ag.total_apuestas,
          ag.cantidad_cancelaciones,
          ag.recaudacion_total
        ]
      );
    }

    return { escrutinioId };
  });

  return {
    saved: true,
    overwritten: Boolean(existing),
    escrutinioId: result.escrutinioId
  };
}

const ejecutar = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'Debe adjuntar un ZIP de Quiniela Ya', 400);
    }

    const overwrite = String(req.body?.overwrite || '').toLowerCase() === 'true';
    const zip = new AdmZip(req.file.buffer);
    const txtEntry = zip.getEntries().find((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.txt'));
    if (!txtEntry) {
      return errorResponse(res, 'El ZIP no contiene archivo TXT', 400);
    }

    const rawBuffer = txtEntry.getData();
    const content = rawBuffer.toString('latin1');
    const parsed = parseTxtQuinielaYa(content, req.file.originalname);

    if (!parsed.records.length) {
      return errorResponse(res, 'No se encontraron registros válidos de Quiniela Ya (código 79)', 400);
    }
    if (parsed.sorteos.size !== 1) {
      return errorResponse(res, 'El archivo contiene más de un sorteo. Use un ZIP por sorteo.', 400);
    }

    const summary = aggregateByAgency(parsed.records);
    const saveResult = await saveQuinielaYaSummary(summary, req.user, overwrite);

    if (saveResult.requiresConfirmation) {
      return res.status(409).json({
        success: false,
        code: 'OVERWRITE_REQUIRED',
        message: `Ya existen datos para el sorteo ${saveResult.sorteo}. Confirme sobrescritura.`,
        data: saveResult
      });
    }

    return successResponse(res, {
      juego: 'quinielaya',
      fecha: summary.fechaSorteo,
      numeroSorteo: summary.sorteo,
      totalRegistros: summary.totalRegistros,
      totalApuestas: summary.totalApuestas,
      totalAnulados: summary.totalAnulados,
      totalRecaudacion: summary.totalRecaudacion,
      totalPremios: summary.totalPremios,
      totalGanadores: summary.totalGanadores,
      agencias: summary.agencias,
      resguardo: saveResult
    }, 'Escrutinio Quiniela Ya procesado correctamente');
  } catch (error) {
    console.error('Error en escrutinio Quiniela Ya:', error);
    return errorResponse(res, `Error procesando Quiniela Ya: ${error.message}`, 500);
  }
};

module.exports = {
  ejecutar
};

