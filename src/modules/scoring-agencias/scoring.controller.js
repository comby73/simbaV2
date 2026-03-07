const { query, transaction } = require('../../config/database');
const { successResponse, errorResponse } = require('../../shared/helpers');

const LOTO_GAMES = ['loto', 'loto5', 'loto 5', 'la grande'];
const CATEGORY_ORDER = ['DIAMANTE', 'PLATINO', 'ORO', 'PLATA', 'BRONCE', 'CERRADO'];
const DATASET_DEFINITIONS = {
  parametros: {
    id: 'parametros',
    label: 'Parametros del modelo',
    table: 'scoring_modelo_parametros',
    keyFields: ['clave'],
    orderBy: 'clave ASC',
    columns: [
      { name: 'clave', label: 'Clave', type: 'string', required: true },
      { name: 'valor_numerico', label: 'Valor numerico', type: 'number' },
      { name: 'valor_texto', label: 'Valor texto', type: 'string' },
      { name: 'descripcion', label: 'Descripcion', type: 'string' }
    ]
  },
  coeficientes: {
    id: 'coeficientes',
    label: 'Coeficientes de cliente',
    table: 'scoring_cliente_coeficientes',
    keyFields: ['categoria'],
    orderBy: 'categoria ASC',
    columns: [
      { name: 'categoria', label: 'Categoria', type: 'string', required: true },
      { name: 'coeficiente', label: 'Coeficiente', type: 'number', required: true }
    ]
  },
  asesores: {
    id: 'asesores',
    label: 'Asignacion de asesores',
    table: 'scoring_asesores',
    keyFields: ['cta_cte'],
    orderBy: 'cta_cte ASC',
    columns: [
      { name: 'cta_cte', label: 'Cuenta corriente', type: 'string', required: true },
      { name: 'asesor', label: 'Asesor', type: 'string', required: true }
    ]
  },
  compliance: {
    id: 'compliance',
    label: 'Compliance',
    table: 'scoring_compliance',
    keyFields: ['cta_cte'],
    orderBy: 'cta_cte ASC',
    columns: [
      { name: 'cta_cte', label: 'Cuenta corriente', type: 'string', required: true },
      { name: 'fiscalizacion', label: 'Fiscalizacion', type: 'number' },
      { name: 'analisis_apuestas', label: 'Analisis apuestas', type: 'number' },
      { name: 'sanciones', label: 'Sanciones', type: 'number' },
      { name: 'pago_fuera_termino', label: 'Pago fuera de termino', type: 'number' },
      { name: 'puntaje', label: 'Puntaje', type: 'number' },
      { name: 'observacion', label: 'Observacion', type: 'string' }
    ]
  },
  digital: {
    id: 'digital',
    label: 'Canal digital',
    table: 'scoring_digital',
    keyFields: ['cta_cte'],
    orderBy: 'cta_cte ASC',
    columns: [
      { name: 'cta_cte', label: 'Cuenta corriente', type: 'string', required: true },
      { name: 'activaciones_iniciales', label: 'Activaciones iniciales', type: 'integer' },
      { name: 'dias_cash_in_cash_out_activos', label: 'Dias cash in/out activos', type: 'integer' },
      { name: 'cash_in_bruto', label: 'Cash in bruto', type: 'number' },
      { name: 'cash_in_ponderado', label: 'Cash in ponderado', type: 'number' },
      { name: 'cash_out', label: 'Cash out', type: 'number' },
      { name: 'clientes_agencia_amiga_totales', label: 'Clientes agencia amiga totales', type: 'integer' },
      { name: 'clientes_agencia_amiga_operaron', label: 'Clientes que operaron', type: 'integer' },
      { name: 'ratio_clientes_operaron', label: 'Ratio clientes operaron', type: 'number' },
      { name: 'puntaje', label: 'Puntaje', type: 'number' }
    ]
  },
  cliente: {
    id: 'cliente',
    label: 'Experiencia de cliente',
    table: 'scoring_cliente',
    keyFields: ['cta_cte'],
    orderBy: 'cta_cte ASC',
    columns: [
      { name: 'cta_cte', label: 'Cuenta corriente', type: 'string', required: true },
      { name: 'qr_tot_estrellas', label: 'QR total estrellas', type: 'number' },
      { name: 'qr_cant_op', label: 'QR cantidad operaciones', type: 'integer' },
      { name: 'qr_op_prom', label: 'QR promedio', type: 'number' },
      { name: 'qr_pts', label: 'QR puntos', type: 'number' },
      { name: 'cant_quejas', label: 'Cantidad quejas', type: 'integer' },
      { name: 'tasa_cero_quejas_pts', label: 'Tasa cero quejas puntos', type: 'number' },
      { name: 'evaluacion_cliente_incognito', label: 'Cliente incognito', type: 'number' },
      { name: 'ponderacion_cliente_incognito', label: 'Ponderacion incognito', type: 'number' },
      { name: 'resenias_google', label: 'Resenias Google', type: 'number' },
      { name: 'resenias_google_pts', label: 'Resenias Google puntos', type: 'number' },
      { name: 'puntaje', label: 'Puntaje', type: 'number' },
      { name: 'categoria', label: 'Categoria', type: 'string' },
      { name: 'coeficiente', label: 'Coeficiente', type: 'number' }
    ]
  },
  historial: {
    id: 'historial',
    label: 'Historico de score',
    table: 'scoring_hist_score',
    keyFields: ['periodo_key', 'cta_cte'],
    orderBy: 'periodo_key DESC, ranking_puntaje ASC, cta_cte ASC',
    columns: [
      { name: 'periodo_key', label: 'Periodo', type: 'string', required: true },
      { name: 'cta_cte', label: 'Cuenta corriente', type: 'string', required: true },
      { name: 'puntaje_final', label: 'Puntaje final', type: 'number', required: true },
      { name: 'categoria', label: 'Categoria', type: 'string', required: true },
      { name: 'ranking_puntaje', label: 'Ranking', type: 'integer' },
      { name: 'fecha_carga', label: 'Fecha carga', type: 'datetime' }
    ]
  }
};

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parsePeriodKey(periodKey) {
  if (!periodKey || typeof periodKey !== 'string') {
    return null;
  }

  const match = /^([0-9]{4})-Q([1-4])$/i.exec(periodKey.trim());
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    quarter: Number(match[2]),
    key: `${match[1]}-Q${match[2]}`
  };
}

function previousPeriodKey(periodKey) {
  const parsed = parsePeriodKey(periodKey);
  if (!parsed) {
    return null;
  }

  if (parsed.quarter === 1) {
    return `${parsed.year - 1}-Q4`;
  }

  return `${parsed.year}-Q${parsed.quarter - 1}`;
}

function buildPeriodRange(periodKey) {
  const parsed = parsePeriodKey(periodKey);
  if (!parsed) {
    throw new Error(`Periodo invalido: ${periodKey}`);
  }

  const monthStart = (parsed.quarter - 1) * 3;
  return {
    key: periodKey,
    start: new Date(Date.UTC(parsed.year, monthStart, 1)),
    end: new Date(Date.UTC(parsed.year, monthStart + 3, 0)),
    previousKey: previousPeriodKey(periodKey)
  };
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeCtaCte(value) {
  // Elimina dígito verificador: si el código es numérico y tiene más de 7 dígitos
  // (las tablas de scoring usan 8 dígitos, las de control_previo usan 7)
  const normalized = String(value || '').trim();
  if (/^\d{8,}$/.test(normalized)) {
    return normalized.slice(0, 7);
  }
  return normalized;
}

function normalizeDatasetId(value) {
  return String(value || '').trim().toLowerCase();
}

function getDatasetDefinition(datasetId) {
  return DATASET_DEFINITIONS[normalizeDatasetId(datasetId)] || null;
}

function pickDatasetColumns(dataset) {
  return dataset.columns.map(column => column.name);
}

function normalizeDateTime(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function coerceFieldValue(field, rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return field.required ? (field.type === 'string' ? '' : null) : null;
  }

  if (field.name === 'cta_cte') {
    return normalizeCtaCte(rawValue);
  }

  if (field.type === 'integer') {
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (field.type === 'number') {
    return toNumber(rawValue, 0);
  }

  if (field.type === 'datetime') {
    return normalizeDateTime(rawValue);
  }

  return String(rawValue).trim();
}

function sanitizeDatasetRecord(dataset, source = {}) {
  return dataset.columns.reduce((acc, field) => {
    acc[field.name] = coerceFieldValue(field, source[field.name]);
    return acc;
  }, {});
}

function extractDatasetKeys(dataset, source = {}) {
  return dataset.keyFields.reduce((acc, key) => {
    const value = key === 'cta_cte' ? normalizeCtaCte(source[key]) : source[key];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Falta la clave ${key}`);
    }
    acc[key] = value;
    return acc;
  }, {});
}

function serializeDatasetKey(dataset, row) {
  return dataset.keyFields.map(key => `${key}:${row[key] ?? ''}`).join('|');
}

function buildDatasetWhereClause(dataset, keys) {
  const clauses = dataset.keyFields.map(key => `${key} = ?`);
  const params = dataset.keyFields.map(key => keys[key]);
  return {
    sql: clauses.join(' AND '),
    params
  };
}

async function fetchDatasetRows(datasetId, options = {}) {
  const dataset = getDatasetDefinition(datasetId);
  if (!dataset) {
    throw new Error('Dataset de scoring no reconocido');
  }

  const limit = Math.max(1, Math.min(1000, Number.parseInt(options.limit, 10) || (dataset.id === 'historial' ? 200 : 500)));
  const columns = pickDatasetColumns(dataset).join(', ');
  const rows = await query(`SELECT ${columns} FROM ${dataset.table} ORDER BY ${dataset.orderBy} LIMIT ?`, [limit]);

  return rows.map(row => ({
    ...row,
    __rowKey: serializeDatasetKey(dataset, row)
  }));
}

async function buildConfigSummary(req) {
  const datasetIds = Object.keys(DATASET_DEFINITIONS);
  const counts = await Promise.all(datasetIds.map(async datasetId => {
    const dataset = DATASET_DEFINITIONS[datasetId];
    const rows = await query(`SELECT COUNT(*) AS total FROM ${dataset.table}`);
    return {
      id: dataset.id,
      label: dataset.label,
      total: Number(rows[0]?.total || 0),
      keyFields: dataset.keyFields,
      columns: dataset.columns
    };
  }));

  const periodosHistorial = await query(
    `SELECT periodo_key, COUNT(*) AS total
     FROM scoring_hist_score
     GROUP BY periodo_key
     ORDER BY periodo_key DESC
     LIMIT 12`
  );

  return {
    puedeEditar: req.user?.rol === 'admin',
    periodoActual: await getLatestAvailablePeriodKey(),
    periodosHistorial: periodosHistorial.map(row => ({
      periodo: row.periodo_key,
      total: Number(row.total || 0)
    })),
    datasets: counts
  };
}

function percentileInc(values, percentile) {
  if (!values.length) {
    return 0;
  }

  if (values.length === 1) {
    return values[0];
  }

  const sorted = values.slice().sort((left, right) => left - right);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (index - lower));
}

function comparePeriodKeys(left, right) {
  const a = parsePeriodKey(left);
  const b = parsePeriodKey(right);
  if (!a || !b) {
    return String(left).localeCompare(String(right));
  }
  if (a.year !== b.year) {
    return a.year - b.year;
  }
  return a.quarter - b.quarter;
}

function movementFromCategories(currentCategory, previousCategory) {
  const currentIndex = CATEGORY_ORDER.indexOf(currentCategory);
  const previousIndex = CATEGORY_ORDER.indexOf(previousCategory);
  if (currentIndex === -1 || previousIndex === -1) {
    return 'Estable';
  }
  if (currentIndex < previousIndex) {
    return 'Mejora';
  }
  if (currentIndex > previousIndex) {
    return 'Baja';
  }
  return 'Estable';
}

function movementDelta(currentCategory, previousCategory) {
  const currentIndex = CATEGORY_ORDER.indexOf(currentCategory);
  const previousIndex = CATEGORY_ORDER.indexOf(previousCategory);
  if (currentIndex === -1 || previousIndex === -1) {
    return 0;
  }
  if (currentIndex < previousIndex) {
    return 0.08;
  }
  if (currentIndex > previousIndex) {
    return -0.08;
  }
  return 0;
}

function getPriorityLabel(priorityIndex) {
  if (priorityIndex >= 0.7) {
    return 'PRIORIDAD ALTA - requiere intervencion inmediata';
  }
  if (priorityIndex >= 0.4) {
    return 'PRIORIDAD MEDIA - seguimiento del asesor';
  }
  return 'PRIORIDAD BAJA - control normal';
}

function buildCategory(score, thresholds) {
  if (score >= thresholds.diamante) {
    return 'DIAMANTE';
  }
  if (score >= thresholds.platino) {
    return 'PLATINO';
  }
  if (score >= thresholds.oro) {
    return 'ORO';
  }
  if (score >= thresholds.plata) {
    return 'PLATA';
  }
  if (score >= 1) {
    return 'BRONCE';
  }
  return 'CERRADO';
}

function buildCutsForCategory(category, thresholds) {
  if (category === 'CERRADO') {
    return { nextCut: 1, floorCut: 0 };
  }
  if (category === 'BRONCE') {
    return { nextCut: thresholds.plata, floorCut: 1 };
  }
  if (category === 'PLATA') {
    return { nextCut: thresholds.oro, floorCut: thresholds.plata };
  }
  if (category === 'ORO') {
    return { nextCut: thresholds.platino, floorCut: thresholds.oro };
  }
  if (category === 'PLATINO') {
    return { nextCut: thresholds.diamante, floorCut: thresholds.platino };
  }
  return { nextCut: 999, floorCut: thresholds.diamante };
}

function buildRecommendation(axis, deltaR, ventasPoints) {
  const minVentas = Math.min(ventasPoints.f, ventasPoints.h, ventasPoints.j);
  const subAxis = minVentas === ventasPoints.f
    ? 'CRECIMIENTO PERSONAL (F)'
    : minVentas === ventasPoints.h
      ? 'IMPACTO ABSOLUTO (H)'
      : 'DIFERENCIAL vs LOTBA (J)';

  if (axis === 'DIAMANTE' || axis === 'SOSTENER') {
    return 'Mantener desempeno y monitorear variaciones para sostener categoria.';
  }
  if (axis === 'CERRADO') {
    return 'Sin accion comercial. Solo seguimiento administrativo y territorial.';
  }
  if (axis === 'CLIENTE') {
    return `Para subir de categoria, el eje con mayor impacto probable es CLIENTE. Accion: reducir quejas, mejorar incognito y empujar resenas. DeltaR aprox: ${round(deltaR, 1)}`;
  }
  if (axis === 'VENTAS') {
    return `Para subir de categoria, eje VENTAS / ${subAxis}. Accion: metas semanales, activacion comercial y seguimiento del asesor. DeltaR aprox: ${round(deltaR, 1)}`;
  }
  if (axis === 'LOTO') {
    return `Para subir de categoria, eje LOTO. Accion: guion de venta, exhibicion y seguimiento semanal de conversion. DeltaR aprox: ${round(deltaR, 1)}`;
  }
  if (axis === 'COMPLIANCE') {
    return `Para subir de categoria, eje COMPLIANCE. Accion: checklist semanal, correccion de hallazgos criticos y validacion. DeltaR aprox: ${round(deltaR, 1)}`;
  }
  return `Para subir de categoria, eje DIGITAL. Accion: aumentar adopcion digital en mostrador y seguimiento semanal. DeltaR aprox: ${round(deltaR, 1)}`;
}

function buildDiagnostic(category, deltaScore) {
  if (category === 'CERRADO') {
    return 'Agencia sin actividad o cerrada';
  }
  if (category === 'BRONCE' && deltaScore === null) {
    return 'Primer corte: cargar historico para medir movilidad';
  }
  if (category === 'BRONCE' && deltaScore < 0) {
    return 'Plan de recuperacion: foco crecimiento + mix';
  }
  if (category === 'ORO' && deltaScore < 0) {
    return 'Sostener base y reforzar mix';
  }
  return '';
}

function getClientImpact(baseScore, clientCoefficient) {
  return Math.max(0, baseScore * (1 - clientCoefficient));
}

function topAdvisor(ranking) {
  const stats = ranking.reduce((acc, item) => {
    const advisor = item.asesor || 'Sin asesor';
    if (!acc[advisor]) {
      acc[advisor] = { total: 0, count: 0 };
    }
    acc[advisor].total += item.scoreFinal;
    acc[advisor].count += 1;
    return acc;
  }, {});

  return Object.entries(stats)
    .map(([advisor, value]) => ({ advisor, average: value.total / value.count, count: value.count }))
    .sort((left, right) => {
      if (right.average !== left.average) {
        return right.average - left.average;
      }
      return right.count - left.count;
    })[0]?.advisor || 'Sin asesor';
}

let _seedDone = false;
async function ensureDefaultScoringData() {
  if (_seedDone) return;
  _seedDone = true;
  const [paramCount] = await query('SELECT COUNT(*) AS cnt FROM scoring_modelo_parametros');
  if (paramCount.cnt === 0) {
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    const prevQ = quarter === 1 ? 4 : quarter - 1;
    const prevY = quarter === 1 ? year - 1 : year;
    const defaults = [
      ['B1', year, null, 'Año seleccionado'],
      ['B2', null, `Q${quarter}`, 'Quarter seleccionado'],
      ['B3', null, `${year}-Q${quarter}`, 'Periodo actual'],
      ['B4', null, `${prevY}-Q${prevQ}`, 'Periodo anterior'],
      ['B7', 0.35, null, 'Peso: Crecimiento personal'],
      ['B8', 0.15, null, 'Peso: Impacto absoluto'],
      ['B9', 0.15, null, 'Peso: Diferencial vs red'],
      ['B10', 0.15, null, 'Peso: Mix LOTO'],
      ['B11', 0.10, null, 'Peso: Compliance'],
      ['B12', 0.10, null, 'Peso: Digital'],
      ['B15', 0, null, 'Piso: Crecimiento personal'],
      ['B16', 0.10, null, 'Objetivo: Crecimiento personal'],
      ['B17', 0.30, null, 'Cap: Crecimiento personal'],
      ['B18', -0.05, null, 'Piso: Diferencial vs red'],
      ['B19', 0.05, null, 'Cap: Diferencial vs red'],
      ['B20', 0.70, null, 'Factor porcentual impacto absoluto'],
      ['B21', 0.30, null, 'Factor logaritmico impacto absoluto'],
      ['B23', 0.05, null, 'Target mix LOTO (5%)'],
      ['B32', 0.25, null, 'Ponderacion QR'],
      ['B33', 0.25, null, 'Base tasa cero quejas'],
      ['B34', 0.25, null, 'Ponderacion cliente incognito'],
      ['B35', 0.25, null, 'Ponderacion resenias Google'],
      ['B44', 4, null, 'N periodos historicos para promediar'],
      ['B45', 80, null, 'Piso historico: DIAMANTE'],
      ['B46', 65, null, 'Piso historico: PLATINO'],
      ['B47', 45, null, 'Piso historico: ORO'],
      ['B48', 25, null, 'Piso historico: PLATA'],
      ['B50', 0.95, null, 'Percentil P95 (DIAMANTE)'],
      ['B51', 0.80, null, 'Percentil P80 (PLATINO)'],
      ['B52', 0.50, null, 'Percentil P50 (ORO)'],
      ['B53', 0.20, null, 'Percentil P20 (PLATA)']
    ];
    const sql = 'INSERT INTO scoring_modelo_parametros (clave, valor_numerico, valor_texto, descripcion) VALUES ?';
    await query(sql, [defaults]);
    console.log('[Scoring] Auto-seed: 31 parametros por defecto insertados');
  }

  const [coefCount] = await query('SELECT COUNT(*) AS cnt FROM scoring_cliente_coeficientes');
  if (coefCount.cnt === 0) {
    const coefs = [
      ['DIAMANTE', 1.0],
      ['PLATINO', 1.0],
      ['ORO', 1.0],
      ['PLATA', 0.98],
      ['BRONCE', 0.95],
      ['CERRADO', 0.90]
    ];
    const sql = 'INSERT INTO scoring_cliente_coeficientes (categoria, coeficiente) VALUES ?';
    await query(sql, [coefs]);
    console.log('[Scoring] Auto-seed: 6 coeficientes por defecto insertados');
  }
}

async function loadParameterMap() {
  await ensureDefaultScoringData();
  const rows = await query('SELECT clave, valor_texto, valor_numerico FROM scoring_modelo_parametros');
  return rows.reduce((acc, row) => {
    acc[row.clave] = row.valor_numerico !== null && row.valor_numerico !== undefined
      ? Number(row.valor_numerico)
      : row.valor_texto;
    return acc;
  }, {});
}

async function loadSupportMaps() {
  const [coeffRows, advisorRows, complianceRows, digitalRows, clientRows] = await Promise.all([
    query('SELECT categoria, coeficiente FROM scoring_cliente_coeficientes'),
    query('SELECT cta_cte, asesor FROM scoring_asesores'),
    query('SELECT * FROM scoring_compliance'),
    query('SELECT * FROM scoring_digital'),
    query('SELECT * FROM scoring_cliente')
  ]);

  return {
    coefficients: coeffRows.reduce((acc, row) => {
      acc[row.categoria] = Number(row.coeficiente);
      return acc;
    }, {}),
    advisors: advisorRows.reduce((acc, row) => {
      acc[normalizeCtaCte(row.cta_cte)] = row.asesor;
      return acc;
    }, {}),
    compliance: complianceRows.reduce((acc, row) => {
      acc[normalizeCtaCte(row.cta_cte)] = row;
      return acc;
    }, {}),
    digital: digitalRows.reduce((acc, row) => {
      acc[normalizeCtaCte(row.cta_cte)] = row;
      return acc;
    }, {}),
    client: clientRows.reduce((acc, row) => {
      acc[normalizeCtaCte(row.cta_cte)] = row;
      return acc;
    }, {})
  };
}

async function loadHistoryMaps(currentKey, previousKey, periodsToAverage) {
  const rows = await query(
    'SELECT periodo_key, cta_cte, puntaje_final, categoria, ranking_puntaje FROM scoring_hist_score ORDER BY periodo_key ASC'
  );

  const historyByPeriod = rows.reduce((acc, row) => {
    if (!acc[row.periodo_key]) {
      acc[row.periodo_key] = [];
    }
    acc[row.periodo_key].push(row);
    return acc;
  }, {});

  const previousMap = (historyByPeriod[previousKey] || []).reduce((acc, row) => {
    acc[normalizeCtaCte(row.cta_cte)] = row;
    return acc;
  }, {});

  const priorPeriods = Object.keys(historyByPeriod)
    .filter(period => comparePeriodKeys(period, currentKey) < 0)
    .sort(comparePeriodKeys)
    .slice(-Math.max(1, periodsToAverage));

  const thresholdBuckets = priorPeriods.map(period => {
    const scores = historyByPeriod[period].map(row => Number(row.puntaje_final)).filter(score => Number.isFinite(score));
    return {
      diamante: percentileInc(scores, 0.95),
      platino: percentileInc(scores, 0.8),
      oro: percentileInc(scores, 0.5),
      plata: percentileInc(scores, 0.2)
    };
  });

  const averages = thresholdBuckets.length
    ? {
      diamante: thresholdBuckets.reduce((acc, item) => acc + item.diamante, 0) / thresholdBuckets.length,
      platino: thresholdBuckets.reduce((acc, item) => acc + item.platino, 0) / thresholdBuckets.length,
      oro: thresholdBuckets.reduce((acc, item) => acc + item.oro, 0) / thresholdBuckets.length,
      plata: thresholdBuckets.reduce((acc, item) => acc + item.plata, 0) / thresholdBuckets.length
    }
    : { diamante: 0, platino: 0, oro: 0, plata: 0 };

  return { previousMap, historicalThresholds: averages };
}

let _cachedFechaColCPA = null;
async function getFechaColCPA() {
  if (_cachedFechaColCPA) return _cachedFechaColCPA;
  for (const col of ['fecha', 'fecha_sorteo']) {
    try {
      await query(`SELECT \`${col}\` FROM \`control_previo_agencias\` LIMIT 0`);
      _cachedFechaColCPA = col;
      return col;
    } catch { /* probar siguiente */ }
  }
  _cachedFechaColCPA = 'fecha';
  return 'fecha';
}

async function loadAgencySales(period) {
  const col = await getFechaColCPA();
  const lotoPlaceholders = LOTO_GAMES.map(() => '?').join(', ');
  const previousRange = buildPeriodRange(period.previousKey);

  // Tres queries simples sin JOINs con funciones sobre índices.
  // El filtro por asesor se aplica en JavaScript en getScoringSnapshot,
  // evitando full scans por LEFT(x,7) que causaban timeout.
  const [currentRows, previousRows, agenciaRows] = await Promise.all([
    query(
      `SELECT LEFT(codigo_agencia, 7) AS ctaCte,
              ROUND(SUM(total_recaudacion), 2) AS totalActual,
              ROUND(SUM(CASE WHEN LOWER(juego) IN (${lotoPlaceholders}) THEN total_recaudacion ELSE 0 END), 2) AS totalLoto
       FROM control_previo_agencias
       WHERE \`${col}\` BETWEEN ? AND ?
       GROUP BY LEFT(codigo_agencia, 7)`,
      [...LOTO_GAMES, formatDate(period.start), formatDate(period.end)]
    ),
    query(
      `SELECT LEFT(codigo_agencia, 7) AS ctaCte,
              ROUND(SUM(total_recaudacion), 2) AS totalAnterior
       FROM control_previo_agencias
       WHERE \`${col}\` BETWEEN ? AND ?
       GROUP BY LEFT(codigo_agencia, 7)`,
      [formatDate(previousRange.start), formatDate(previousRange.end)]
    ),
    query('SELECT LEFT(numero, 7) AS ctaCte, nombre FROM agencias')
  ]);

  const prevMap = previousRows.reduce((acc, r) => { acc[r.ctaCte] = r.totalAnterior; return acc; }, {});
  const nameMap = agenciaRows.reduce((acc, r) => { if (!acc[r.ctaCte]) acc[r.ctaCte] = r.nombre; return acc; }, {});

  return currentRows.map(r => ({
    ctaCte: r.ctaCte,
    agenciaNombre: nameMap[r.ctaCte] || `Agencia ${r.ctaCte}`,
    totalActual: r.totalActual,
    totalLoto: r.totalLoto,
    totalAnterior: prevMap[r.ctaCte] || 0
  }));
}

async function getLatestAvailablePeriodKey() {
  const col = await getFechaColCPA();
  const rows = await query(`SELECT MAX(\`${col}\`) AS maxFecha FROM control_previo_agencias`);
  const maxFecha = rows[0]?.maxFecha;

  if (!maxFecha) {
    return null;
  }

  const date = new Date(maxFecha);
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

async function getScoringSnapshot(periodKey) {
  const params = await loadParameterMap();
  const currentKey = periodKey || await getLatestAvailablePeriodKey() || params.B3;
  const period = buildPeriodRange(currentKey);
  const previousKey = params.B4 && currentKey === params.B3 ? params.B4 : period.previousKey;

  const [support, allSalesRows, history] = await Promise.all([
    loadSupportMaps(),
    loadAgencySales(period),
    loadHistoryMaps(currentKey, previousKey, toNumber(params.B44, 4))
  ]);

  // Filtra solo agencias que tienen asesor asignado (JOIN lógico en JS, sin función SQL)
  const hasAdvisors = Object.keys(support.advisors).length > 0;
  const salesRows = hasAdvisors
    ? allSalesRows.filter(r => support.advisors[normalizeCtaCte(r.ctaCte)])
    : allSalesRows;

  const totalActualRed = salesRows.reduce((acc, row) => acc + toNumber(row.totalActual), 0);
  const totalAnteriorRed = salesRows.reduce((acc, row) => acc + toNumber(row.totalAnterior), 0);
  const crecimientoRedCalculado = totalAnteriorRed > 0 ? (totalActualRed / totalAnteriorRed) - 1 : 0;
  // Excel usa PARAMS_MODELO!B5 (crecimiento de red). Si no esta disponible,
  // usar crecimiento operativo calculado desde control_previo_agencias.
  const crecimientoRed = toNumber(params.B5, crecimientoRedCalculado);
  const maxIncremento = Math.max(0, ...salesRows.map(row => Math.max(0, toNumber(row.totalActual) - toNumber(row.totalAnterior))));

  const baseRows = salesRows.map(row => {
    const ctaCte = normalizeCtaCte(row.ctaCte);
    const totalActual = toNumber(row.totalActual);
    const totalAnterior = toNumber(row.totalAnterior);
    const totalLoto = toNumber(row.totalLoto);
    const crecimiento = totalAnterior > 0 ? (totalActual / totalAnterior) - 1 : 0;
    const incrementoAbsoluto = Math.max(0, totalActual - totalAnterior);
    const crecimientoPts = (
      crecimiento <= toNumber(params.B15, 0)
        ? 0
        : crecimiento >= toNumber(params.B17, 0.3)
          ? 100
          : 100 * Math.min(1, (crecimiento - toNumber(params.B15, 0)) / (toNumber(params.B16, 0.1) - toNumber(params.B15, 0)))
    ) * toNumber(params.B7, 0.35);
    const impactoAbsolutoPts = (
      (toNumber(params.B20, 0.7) * (Math.max(0, Math.min(3, crecimiento)) / 3)) +
      (toNumber(params.B21, 0.3) * (maxIncremento > 0 ? Math.log(1 + incrementoAbsoluto) / Math.log(1 + maxIncremento) : 0))
    ) * 100 * toNumber(params.B8, 0.15);
    const diferencialVsRed = crecimiento - crecimientoRed;
    const diferencialPts = (
      diferencialVsRed <= toNumber(params.B18, -0.05)
        ? 0
        : diferencialVsRed >= toNumber(params.B19, 0.05)
          ? 100
          : 100 * ((diferencialVsRed - toNumber(params.B18, -0.05)) / (toNumber(params.B19, 0.05) - toNumber(params.B18, -0.05)))
    ) * toNumber(params.B9, 0.15);
    const mixLoto = totalActual > 0 ? totalLoto / totalActual : 0;
    const lotoPts = Math.min(100, toNumber(params.B23, 0.05) === 0 ? 0 : (100 * mixLoto) / toNumber(params.B23, 0.05)) * toNumber(params.B10, 0.15);
    const complianceScore = toNumber(support.compliance[ctaCte]?.puntaje, 100);
    const compliancePts = complianceScore * toNumber(params.B11, 0.1);
    const digitalScore = toNumber(support.digital[ctaCte]?.puntaje, 100);
    const digitalPts = digitalScore * toNumber(params.B12, 0.1);
    const clienteRow = support.client[ctaCte] || {};
    const categoriaCliente = clienteRow.categoria || 'Regular';
    const coefCliente = toNumber(clienteRow.coeficiente, support.coefficients[categoriaCliente] || 1);
    // Score cliente calculado desde componentes (B32-B35) como fallback si puntaje=0
    const clienteScoreCalculado =
      (toNumber(clienteRow.qr_pts) * toNumber(params.B32, 0.25)) +
      (toNumber(clienteRow.tasa_cero_quejas_pts) * toNumber(params.B33, 0.25)) +
      (toNumber(clienteRow.ponderacion_cliente_incognito) * toNumber(params.B34, 0.25)) +
      (toNumber(clienteRow.resenias_google_pts) * toNumber(params.B35, 0.25));
    const clienteScore = toNumber(clienteRow.puntaje) || clienteScoreCalculado;
    const scoreBase = clamp(crecimientoPts + impactoAbsolutoPts + diferencialPts + lotoPts + compliancePts + digitalPts, 0, 100);
    const scoreFinal = clamp(scoreBase * coefCliente, 0, 100);
    const previousData = history.previousMap[ctaCte] || null;

    const scoreAnterior = previousData ? toNumber(previousData.puntaje_final, scoreFinal) : scoreFinal;
    const categoriaAnterior = previousData?.categoria || 'No encontrado';
    return {
      ctaCte,
      agenciaNombre: row.agenciaNombre,
      asesor: support.advisors[ctaCte] || 'Sin asesor',
      totalActual,
      totalAnterior,
      totalLoto,
      crecimiento,
      incrementoAbsoluto,
      crecimientoPts,
      impactoAbsolutoPts,
      diferencialPts,
      mixLoto,
      lotoPts,
      complianceScore,
      compliancePts,
      digitalScore,
      digitalPts,
      clienteScore,
      scoreBase,
      scoreFinal,
      categoriaCliente,
      coefCliente,
      scoreAnterior,
      categoriaAnterior,
      previousRanking: previousData?.ranking_puntaje || null,
      deltaScore: categoriaAnterior === 'No encontrado' ? null : scoreFinal - scoreAnterior
    };
  });

  const currentScores = baseRows.map(row => row.scoreFinal);
  const currentThresholds = {
    diamante: percentileInc(currentScores, toNumber(params.B50, 0.95)),
    platino: percentileInc(currentScores, toNumber(params.B51, 0.8)),
    oro: percentileInc(currentScores, toNumber(params.B52, 0.5)),
    plata: percentileInc(currentScores, toNumber(params.B53, 0.2))
  };

  // En Excel: corte efectivo = MAX(percentil actual, piso historico B45..B48).
  const thresholds = {
    diamante: Math.max(currentThresholds.diamante, toNumber(params.B45, history.historicalThresholds.diamante)),
    platino: Math.max(currentThresholds.platino, toNumber(params.B46, history.historicalThresholds.platino)),
    oro: Math.max(currentThresholds.oro, toNumber(params.B47, history.historicalThresholds.oro)),
    plata: Math.max(currentThresholds.plata, toNumber(params.B48, history.historicalThresholds.plata))
  };

  const maxVentasPot = Math.max(0, ...baseRows.map(row => row.crecimientoPts))
    + Math.max(0, ...baseRows.map(row => row.impactoAbsolutoPts))
    + Math.max(0, ...baseRows.map(row => row.diferencialPts));
  const maxLotoPts = Math.max(0, ...baseRows.map(row => row.lotoPts));
  const maxCompliancePts = Math.max(0, ...baseRows.map(row => row.compliancePts));
  const maxDigitalPts = Math.max(0, ...baseRows.map(row => row.digitalPts));

  const rankingUnsorted = baseRows.map(row => {
    const categoria = buildCategory(row.scoreFinal, thresholds);
    const cuts = buildCutsForCategory(categoria, thresholds);
    const distAscenso = ['DIAMANTE', 'CERRADO'].includes(categoria)
      ? 0
      : Math.max(0, (cuts.nextCut / Math.max(0.01, row.coefCliente)) - row.scoreBase);
    const distDescenso = ['BRONCE', 'CERRADO'].includes(categoria)
      ? 0
      : Math.max(0, row.scoreFinal - cuts.floorCut);
    const movilidad = movementFromCategories(categoria, row.categoriaAnterior);
    const ventasHeadroom = Math.max(0, maxVentasPot - (row.crecimientoPts + row.impactoAbsolutoPts + row.diferencialPts));
    const lotoHeadroom = Math.max(0, maxLotoPts - row.lotoPts);
    const complianceHeadroom = Math.max(0, maxCompliancePts - row.compliancePts);
    const digitalHeadroom = Math.max(0, maxDigitalPts - row.digitalPts);
    const axisCandidates = {
      VENTAS: Math.min(distAscenso, Math.max(0, ventasHeadroom)),
      LOTO: Math.min(distAscenso, Math.max(0, lotoHeadroom)),
      COMPLIANCE: Math.min(distAscenso, Math.max(0, complianceHeadroom)),
      DIGITAL: Math.min(distAscenso, Math.max(0, digitalHeadroom)),
      CLIENTE: row.coefCliente < 0.95 ? Math.min(distAscenso, row.scoreBase * ((1 / row.coefCliente) - 1)) : 0
    };
    let ejeMayorImpacto = 'SOSTENER';
    if (categoria === 'CERRADO') {
      ejeMayorImpacto = 'CERRADO';
    } else if (categoria !== 'DIAMANTE') {
      ejeMayorImpacto = Object.entries(axisCandidates).sort((left, right) => right[1] - left[1])[0]?.[0] || 'SOSTENER';
    }
    const progress = cuts.nextCut <= cuts.floorCut
      ? 0
      : clamp((row.scoreFinal - cuts.floorCut) / (cuts.nextCut - cuts.floorCut), 0, 1);
    const probability = ['DIAMANTE', 'CERRADO'].includes(categoria)
      ? 0
      : clamp(progress + movementDelta(categoria, row.categoriaAnterior) + (row.coefCliente < 0.95 ? -0.06 : 0), 0, 1);
    const priorityIndex = round(((1 - probability) * 0.4) + (Math.min(1, distAscenso / 10) * 0.4) + (row.coefCliente < 0.95 ? 0.2 : 0), 2);
    const impactEntries = [
      ['VENTAS', Math.max(0, ventasHeadroom * row.coefCliente)],
      ['LOTO', Math.max(0, lotoHeadroom * row.coefCliente)],
      ['COMPLIANCE', Math.max(0, complianceHeadroom * row.coefCliente)],
      ['DIGITAL', Math.max(0, digitalHeadroom * row.coefCliente)],
      ['CLIENTE', getClientImpact(row.scoreBase, row.coefCliente)]
    ].sort((left, right) => right[1] - left[1]);

    return {
      ctaCte: row.ctaCte,
      agenciaNombre: row.agenciaNombre,
      asesor: row.asesor,
      categoria,
      scoreAnterior: round(row.scoreAnterior, 1),
      scoreBase: round(row.scoreBase, 1),
      scoreFinal: round(row.scoreFinal, 1),
      deltaPuntaje: row.deltaScore !== null ? round(row.deltaScore, 1) : null,
      movilidad,
      probabilidadAscenso: round(probability, 2),
      prioridad: getPriorityLabel(priorityIndex),
      ejeMayorImpacto,
      categoriaCliente: row.categoriaCliente,
      coefCliente: round(row.coefCliente, 2),
      clienteScore: round(row.clienteScore, 1),
      distAscenso: round(distAscenso, 1),
      distDescenso: round(distDescenso, 1),
      impactoPotencial: categoria === 'CERRADO'
        ? 'Sin impacto comercial estimable por estado CERRADO.'
        : `Mayor retorno probable: ${impactEntries[0][0]} (+${round(impactEntries[0][1], 1)} puntos finales potenciales).`,
      recomendacion: buildRecommendation(ejeMayorImpacto, distAscenso, {
        f: row.crecimientoPts,
        h: row.impactoAbsolutoPts,
        j: row.diferencialPts
      }),
      diagnostico: buildDiagnostic(categoria, row.deltaScore),
      metadata: {
        totalActual: round(row.totalActual, 2),
        totalAnterior: round(row.totalAnterior, 2),
        totalLoto: round(row.totalLoto, 2),
        crecimientoPct: round(row.crecimiento * 100, 1),
        mixLotoPct: round(row.mixLoto * 100, 1),
        compliance: round(row.complianceScore, 1),
        digital: round(row.digitalScore, 1),
        cliente: round(row.clienteScore, 1),
        categoriaAnterior: row.categoriaAnterior,
        previousRanking: row.previousRanking
      },
      factores: [
        { label: 'Ventas', value: round(row.crecimientoPts + row.impactoAbsolutoPts + row.diferencialPts, 1) },
        { label: 'LOTO', value: round(row.lotoPts, 1) },
        { label: 'Compliance', value: round(row.compliancePts, 1) },
        { label: 'Digital', value: round(row.digitalPts, 1) },
        { label: 'Cliente', value: round(row.coefCliente * 100, 1) }
      ],
      _previousRankingRaw: row.previousRanking
    };
  }).sort((left, right) => {
    if (right.scoreFinal !== left.scoreFinal) {
      return right.scoreFinal - left.scoreFinal;
    }
    return left.ctaCte.localeCompare(right.ctaCte);
  });

  // Segundo pass: ranking estilo RANK.EQ (empates comparten posicion y saltean).
  let lastScore = null;
  let lastRank = 0;
  const ranking = rankingUnsorted.map((item, index) => {
    const isTie = lastScore !== null && item.scoreFinal === lastScore;
    const rankingActual = isTie ? lastRank : index + 1;
    lastScore = item.scoreFinal;
    lastRank = rankingActual;
    const movilidadRanking = item._previousRankingRaw !== null
      ? item._previousRankingRaw - rankingActual
      : null;
    const { _previousRankingRaw, ...rest } = item;
    return { ...rest, rankingActual, movilidadRanking };
  });

  const averageScore = ranking.length
    ? ranking.reduce((acc, item) => acc + item.scoreFinal, 0) / ranking.length
    : 0;
  const averagePrevious = ranking.length
    ? ranking.reduce((acc, item) => acc + item.scoreAnterior, 0) / ranking.length
    : 0;
  const coefClientePromedio = ranking.length
    ? round(ranking.reduce((acc, item) => acc + item.coefCliente, 0) / ranking.length, 4)
    : 0;
  const promedioIncVentas = ranking.length
    ? round(ranking.reduce((acc, item) => acc + item.metadata.crecimientoPct, 0) / ranking.length, 1)
    : 0;

  // Distribución eje de impacto
  const ejeImpactoDistribucion = ranking.reduce((acc, item) => {
    const eje = item.ejeMayorImpacto || 'SOSTENER';
    acc[eje] = (acc[eje] || 0) + 1;
    return acc;
  }, {});

  // Riesgo: Ascenso/Descenso/Neutro por movilidad
  const riesgoDistribucion = {
    ascenso: ranking.filter(item => item.movilidad === 'Mejora').length,
    descenso: ranking.filter(item => item.movilidad === 'Baja').length,
    neutro: ranking.filter(item => item.movilidad === 'Estable').length
  };

  // Top 20 Alta Prioridad
  const top20AltaPrioridad = ranking
    .filter(item => item.prioridad.toUpperCase().includes('ALTA'))
    .slice(0, 20)
    .map(item => ({
      ctaCte: item.ctaCte,
      agenciaNombre: item.agenciaNombre,
      categoria: item.categoria,
      recomendacion: item.recomendacion,
      prioridad: item.prioridad,
      distAscenso: item.distAscenso
    }));

  // Top 20 por Movilidad (mayor Δ puntaje)
  const top20PorMovilidad = ranking
    .filter(item => item.deltaPuntaje !== null)
    .slice()
    .sort((a, b) => (b.deltaPuntaje || 0) - (a.deltaPuntaje || 0))
    .slice(0, 20)
    .map(item => ({
      ctaCte: item.ctaCte,
      agenciaNombre: item.agenciaNombre,
      deltaPuntaje: item.deltaPuntaje,
      categoria: item.categoria,
      movilidad: item.movilidad
    }));

  // Top 20 por Puntaje Final
  const top20PorPuntaje = ranking
    .slice(0, 20)
    .map(item => ({
      ctaCte: item.ctaCte,
      agenciaNombre: item.agenciaNombre,
      scoreFinal: item.scoreFinal,
      categoria: item.categoria
    }));

  // Concentración de crecimiento (Top 10/20/50/100/200)
  const totalVentasRed = ranking.reduce((acc, item) => acc + item.metadata.totalActual, 0);
  const concentracionCrecimiento = {};
  for (const n of [10, 20, 50, 100, 200]) {
    const topN = ranking.slice(0, Math.min(n, ranking.length))
      .reduce((acc, item) => acc + item.metadata.totalActual, 0);
    concentracionCrecimiento[`top${n}`] = totalVentasRed > 0 ? round(topN / totalVentasRed, 4) : 0;
  }

  return {
    periodo: {
      clave: currentKey,
      anterior: previousKey,
      desde: formatDate(period.start),
      hasta: formatDate(period.end)
    },
    kpis: {
      scorePromedio: round(averageScore, 1),
      variacion: round(averageScore - averagePrevious, 1),
      agenciasEvaluadas: ranking.length,
      coefClientePromedio,
      promedioIncVentasPct: promedioIncVentas,
      prioridadAlta: ranking.filter(item => item.prioridad.toUpperCase().includes('ALTA')).length,
      candidatasSubida: ranking.filter(item => item.distAscenso > 0 && item.distAscenso <= 5).length,
      asesorTop: topAdvisor(ranking)
    },
    distribucionCategorias: CATEGORY_ORDER.map(categoria => ({
      categoria,
      cantidad: ranking.filter(item => item.categoria === categoria).length
    })),
    ejeImpactoDistribucion,
    riesgoDistribucion,
    concentracionCrecimiento,
    top20AltaPrioridad,
    top20PorMovilidad,
    top20PorPuntaje,
    ranking
  };
}

const obtenerResumen = async (req, res) => {
  try {
    const payload = await getScoringSnapshot(req.query.periodo);
    return successResponse(res, payload, 'Resumen de scoring obtenido');
  } catch (error) {
    console.error('Error obteniendo resumen de scoring:', error);
    return errorResponse(res, 'Error obteniendo resumen de scoring', 500);
  }
};

const obtenerRanking = async (req, res) => {
  try {
    const payload = await getScoringSnapshot(req.query.periodo);
    let ranking = payload.ranking.slice();

    if (req.query.categoria) {
      ranking = ranking.filter(item => item.categoria === req.query.categoria);
    }

    if (req.query.asesor) {
      const asesorBuscar = String(req.query.asesor).trim().toLowerCase();
      ranking = ranking.filter(item => String(item.asesor || '').toLowerCase().includes(asesorBuscar));
    }

    return successResponse(res, {
      periodo: payload.periodo,
      kpis: payload.kpis,
      ranking
    }, 'Ranking de scoring obtenido');
  } catch (error) {
    console.error('Error obteniendo ranking de scoring:', error);
    return errorResponse(res, 'Error obteniendo ranking de scoring', 500);
  }
};

const obtenerAgencia = async (req, res) => {
  try {
    const payload = await getScoringSnapshot(req.query.periodo);
    const ctaCte = normalizeCtaCte(req.params.ctaCte);
    const agencia = payload.ranking.find(item => item.ctaCte === ctaCte);

    if (!agencia) {
      return errorResponse(res, 'Agencia no encontrada para el periodo solicitado', 404);
    }

    // Historial completo de la agencia para el gráfico de evolución
    const histRows = await query(
      `SELECT periodo_key, puntaje_final, categoria, ranking_puntaje
       FROM scoring_hist_score
       WHERE cta_cte = ?
       ORDER BY periodo_key ASC
       LIMIT 24`,
      [ctaCte]
    );

    return successResponse(res, {
      periodo: payload.periodo,
      agencia,
      historial: histRows.map(row => ({
        periodo: row.periodo_key,
        puntaje: Number(row.puntaje_final),
        categoria: row.categoria,
        ranking: Number(row.ranking_puntaje)
      }))
    }, 'Ficha de agencia obtenida');
  } catch (error) {
    console.error('Error obteniendo agencia de scoring:', error);
    return errorResponse(res, 'Error obteniendo ficha de scoring', 500);
  }
};

const exportarRanking = async (req, res) => {
  try {
    const payload = await getScoringSnapshot(req.query.periodo);

    const headers = [
      'Ranking', 'CTA CTE', 'Agencia', 'Asesor', 'Categoria',
      'Score Final', 'Score Base', 'Delta Puntaje', 'Movilidad Ranking',
      'Movilidad', 'Prob. Ascenso', 'Prioridad', 'Eje Mayor Impacto',
      'Dist. Ascenso', 'Dist. Descenso', 'Coef. Cliente', 'Cat. Cliente',
      'Score Cliente', 'Ventas Actual', 'Ventas Anterior', 'Inc. Ventas %',
      'Mix LOTO %', 'Compliance', 'Digital', 'Recomendacion'
    ];

    const rows = payload.ranking.map(item => [
      item.rankingActual,
      item.ctaCte,
      item.agenciaNombre,
      item.asesor,
      item.categoria,
      item.scoreFinal,
      item.scoreBase,
      item.deltaPuntaje ?? '',
      item.movilidadRanking ?? '',
      item.movilidad,
      item.probabilidadAscenso,
      item.prioridad,
      item.ejeMayorImpacto,
      item.distAscenso,
      item.distDescenso,
      item.coefCliente,
      item.categoriaCliente,
      item.clienteScore,
      item.metadata.totalActual,
      item.metadata.totalAnterior,
      item.metadata.crecimientoPct,
      item.metadata.mixLotoPct,
      item.metadata.compliance,
      item.metadata.digital,
      item.recomendacion
    ]);

    const csvLines = [headers, ...rows].map(row =>
      row.map(cell => {
        const str = String(cell ?? '').replace(/"/g, '""');
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
      }).join(',')
    );

    const periodo = payload.periodo.clave || 'ranking';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="scoring_${periodo}.csv"`);
    res.send('\uFEFF' + csvLines.join('\r\n'));
  } catch (error) {
    console.error('Error exportando ranking de scoring:', error);
    return errorResponse(res, `Error exportando ranking: ${error.message}`, 500);
  }
};

const obtenerConfiguracionResumen = async (req, res) => {
  try {
    const payload = await buildConfigSummary(req);
    return successResponse(res, payload, 'Configuracion de scoring obtenida');
  } catch (error) {
    console.error('Error obteniendo configuracion de scoring:', error);
    return errorResponse(res, 'Error obteniendo configuracion de scoring', 500);
  }
};

const listarConfiguracionDataset = async (req, res) => {
  try {
    const dataset = getDatasetDefinition(req.params.dataset);
    if (!dataset) {
      return errorResponse(res, 'Dataset de scoring no reconocido', 400);
    }

    const rows = await fetchDatasetRows(dataset.id, { limit: req.query.limit });
    return successResponse(res, {
      dataset: dataset.id,
      label: dataset.label,
      keyFields: dataset.keyFields,
      columns: dataset.columns,
      rows,
      total: rows.length
    }, 'Dataset de scoring obtenido');
  } catch (error) {
    console.error('Error listando dataset de scoring:', error);
    return errorResponse(res, 'Error listando dataset de scoring', 500);
  }
};

const guardarConfiguracionDataset = async (req, res) => {
  try {
    const dataset = getDatasetDefinition(req.params.dataset);
    if (!dataset) {
      return errorResponse(res, 'Dataset de scoring no reconocido', 400);
    }

    const record = sanitizeDatasetRecord(dataset, req.body?.record || req.body || {});
    const missingKeys = dataset.keyFields.filter(key => record[key] === null || record[key] === undefined || record[key] === '');
    if (missingKeys.length) {
      return errorResponse(res, `Faltan claves requeridas: ${missingKeys.join(', ')}`, 400);
    }

    const columns = pickDatasetColumns(dataset);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map(column => record[column]);
    const updateColumns = columns.filter(column => !dataset.keyFields.includes(column));
    const updateClause = updateColumns.length
      ? updateColumns.map(column => `${column} = VALUES(${column})`).join(', ')
      : dataset.keyFields.map(key => `${key} = VALUES(${key})`).join(', ');

    await query(
      `INSERT INTO ${dataset.table} (${columns.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`,
      values
    );

    return successResponse(res, {
      dataset: dataset.id,
      record
    }, 'Registro de scoring guardado');
  } catch (error) {
    console.error('Error guardando dataset de scoring:', error);
    return errorResponse(res, `Error guardando dataset de scoring: ${error.message}`, 500);
  }
};

const eliminarConfiguracionDataset = async (req, res) => {
  try {
    const dataset = getDatasetDefinition(req.params.dataset);
    if (!dataset) {
      return errorResponse(res, 'Dataset de scoring no reconocido', 400);
    }

    const keys = extractDatasetKeys(dataset, req.body?.keys || req.body || {});
    const where = buildDatasetWhereClause(dataset, keys);
    const result = await query(`DELETE FROM ${dataset.table} WHERE ${where.sql}`, where.params);

    if (!result.affectedRows) {
      return errorResponse(res, 'Registro no encontrado para eliminar', 404);
    }

    return successResponse(res, {
      dataset: dataset.id,
      keys
    }, 'Registro de scoring eliminado');
  } catch (error) {
    console.error('Error eliminando dataset de scoring:', error);
    return errorResponse(res, `Error eliminando dataset de scoring: ${error.message}`, 500);
  }
};

const generarSnapshotHistorico = async (req, res) => {
  try {
    const payload = await getScoringSnapshot(req.body?.periodo || req.query?.periodo);
    await transaction(async connection => {
      for (const item of payload.ranking) {
        await connection.execute(
          `INSERT INTO scoring_hist_score (periodo_key, cta_cte, puntaje_final, categoria, ranking_puntaje, fecha_carga)
           VALUES (?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             puntaje_final = VALUES(puntaje_final),
             categoria = VALUES(categoria),
             ranking_puntaje = VALUES(ranking_puntaje),
             fecha_carga = VALUES(fecha_carga)`,
          [payload.periodo.clave, item.ctaCte, item.scoreFinal, item.categoria, item.rankingActual || null]
        );
      }
    });

    return successResponse(res, {
      periodo: payload.periodo,
      agencias: payload.ranking.length
    }, 'Snapshot historico generado');
  } catch (error) {
    console.error('Error generando snapshot de scoring:', error);
    return errorResponse(res, `Error generando snapshot de scoring: ${error.message}`, 500);
  }
};

module.exports = {
  obtenerResumen,
  obtenerRanking,
  obtenerAgencia,
  exportarRanking,
  obtenerConfiguracionResumen,
  listarConfiguracionDataset,
  guardarConfiguracionDataset,
  eliminarConfiguracionDataset,
  generarSnapshotHistorico
};