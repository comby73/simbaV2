// Importa historico de scoring desde CSV (2024/2025, etc.) a scoring_hist_score.
// Uso:
//   node database/import_scoring_hist_csv.js --file "C:\ruta\hist_2025_q3.csv" --period 2025-Q3
// Opcionales:
//   --delimiter ";"    (si no se pasa, se auto-detecta)
//   --encoding latin1   (default: utf8)
//   --dry-run           (solo muestra resumen, no inserta)
//
// CSV esperado: debe incluir al menos Cta.Cte + Puntaje.
// Categoria y ranking son opcionales: si faltan, se calculan con logica Excel.

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const envLocal = path.join(__dirname, '../.env.local');
const envDefault = path.join(__dirname, '../.env');
require('dotenv').config({ path: fs.existsSync(envLocal) ? envLocal : envDefault });

const CATEGORY_ORDER = ['DIAMANTE', 'PLATINO', 'ORO', 'PLATA', 'BRONCE', 'CERRADO'];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key.startsWith('--')) {
      if (!next || next.startsWith('--')) {
        args[key.slice(2)] = true;
      } else {
        args[key.slice(2)] = next;
        i += 1;
      }
    }
  }
  return args;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCsvLine(line, delimiter) {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      out.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out.map(cell => String(cell || '').trim());
}

function detectDelimiter(headerLine) {
  const semis = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semis >= commas ? ';' : ',';
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;

  // Soporta formatos: 12.345,67 / 12345.67 / 12345
  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeCtaCte(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length >= 8) return digits.slice(0, 7); // descarta verificador
  if (digits.length === 7) return digits;
  return digits.padStart(7, '0');
}

function percentileInc(values, percentile) {
  const sorted = values.filter(v => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];

  const p = Math.max(0, Math.min(1, percentile));
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + ((sorted[hi] - sorted[lo]) * (idx - lo));
}

function buildCategory(score, thresholds) {
  if (score >= thresholds.diamante) return 'DIAMANTE';
  if (score >= thresholds.platino) return 'PLATINO';
  if (score >= thresholds.oro) return 'ORO';
  if (score >= thresholds.plata) return 'PLATA';
  if (score >= 1) return 'BRONCE';
  return 'CERRADO';
}

function rankEq(valuesDesc) {
  let lastScore = null;
  let lastRank = 0;
  return valuesDesc.map((score, idx) => {
    const tie = lastScore !== null && score === lastScore;
    const rank = tie ? lastRank : idx + 1;
    lastScore = score;
    lastRank = rank;
    return rank;
  });
}

async function loadParams(connection) {
  const [rows] = await connection.query(
    'SELECT clave, valor_numerico FROM scoring_modelo_parametros WHERE clave IN ("B45","B46","B47","B48","B50","B51","B52","B53")'
  );
  const map = rows.reduce((acc, row) => {
    acc[row.clave] = Number(row.valor_numerico);
    return acc;
  }, {});

  return {
    B45: Number.isFinite(map.B45) ? map.B45 : 80,
    B46: Number.isFinite(map.B46) ? map.B46 : 65,
    B47: Number.isFinite(map.B47) ? map.B47 : 45,
    B48: Number.isFinite(map.B48) ? map.B48 : 25,
    B50: Number.isFinite(map.B50) ? map.B50 : 0.95,
    B51: Number.isFinite(map.B51) ? map.B51 : 0.8,
    B52: Number.isFinite(map.B52) ? map.B52 : 0.5,
    B53: Number.isFinite(map.B53) ? map.B53 : 0.2
  };
}

function findColumn(headers, aliases) {
  for (let i = 0; i < headers.length; i += 1) {
    const h = normalizeText(headers[i]);
    if (aliases.some(alias => h.includes(alias))) return i;
  }
  return -1;
}

async function main() {
  const args = parseArgs(process.argv);
  const filePath = args.file ? path.resolve(args.file) : '';
  const periodKey = String(args.period || '').trim().toUpperCase();
  const encoding = args.encoding || 'utf8';
  const dryRun = !!args['dry-run'];

  if (!filePath || !periodKey) {
    console.error('Uso: node database/import_scoring_hist_csv.js --file <csv> --period <YYYY-QN> [--delimiter ;] [--encoding utf8|latin1] [--dry-run]');
    process.exit(1);
  }

  if (!/^\d{4}-Q[1-4]$/.test(periodKey)) {
    console.error(`Periodo invalido: ${periodKey}. Formato esperado: YYYY-QN (ej. 2025-Q3)`);
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`No existe el archivo: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, { encoding });
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    console.error('CSV sin datos suficientes.');
    process.exit(1);
  }

  const delimiter = args.delimiter || detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter);

  const idxCta = findColumn(headers, ['cta cte', 'cta.cte', 'cta cte', 'agencia', 'cta']);
  const idxScore = findColumn(headers, ['puntaje final', 'puntaje', 'score final', 'score']);
  const idxCat = findColumn(headers, ['categoria']);
  const idxRank = findColumn(headers, ['ranking', 'rank']);

  if (idxCta < 0 || idxScore < 0) {
    console.error('No se detectaron columnas obligatorias. Se requiere Cta.Cte (o Agencia) y Puntaje.');
    console.error(`Headers detectados: ${headers.join(' | ')}`);
    process.exit(1);
  }

  const rawRows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i], delimiter);
    const cta = normalizeCtaCte(cols[idxCta]);
    const score = toNumber(cols[idxScore], NaN);
    if (!cta || !Number.isFinite(score)) continue;

    rawRows.push({
      ctaCte: cta,
      scoreFinal: score,
      categoria: idxCat >= 0 ? String(cols[idxCat] || '').trim().toUpperCase() : '',
      ranking: idxRank >= 0 ? toNumber(cols[idxRank], NaN) : NaN
    });
  }

  if (!rawRows.length) {
    console.error('No hubo filas validas para importar.');
    process.exit(1);
  }

  // Quita duplicados por agencia, prioriza el score mayor por seguridad.
  const uniqueMap = new Map();
  for (const row of rawRows) {
    const current = uniqueMap.get(row.ctaCte);
    if (!current || row.scoreFinal > current.scoreFinal) {
      uniqueMap.set(row.ctaCte, row);
    }
  }

  const rows = Array.from(uniqueMap.values())
    .sort((a, b) => b.scoreFinal - a.scoreFinal || a.ctaCte.localeCompare(b.ctaCte));

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'control_loterias'
  });

  try {
    const params = await loadParams(connection);
    const scores = rows.map(r => r.scoreFinal);

    const thresholds = {
      diamante: Math.max(percentileInc(scores, params.B50), params.B45),
      platino: Math.max(percentileInc(scores, params.B51), params.B46),
      oro: Math.max(percentileInc(scores, params.B52), params.B47),
      plata: Math.max(percentileInc(scores, params.B53), params.B48)
    };

    const ranks = rankEq(rows.map(r => r.scoreFinal));

    const finalRows = rows.map((row, idx) => ({
      ...row,
      categoria: CATEGORY_ORDER.includes(row.categoria)
        ? row.categoria
        : buildCategory(row.scoreFinal, thresholds),
      ranking: Number.isFinite(row.ranking) ? Math.trunc(row.ranking) : ranks[idx]
    }));

    console.log(`Archivo: ${filePath}`);
    console.log(`Periodo: ${periodKey}`);
    console.log(`Filas CSV: ${rawRows.length}`);
    console.log(`Agencias unicas: ${finalRows.length}`);
    console.log(`Thresholds calculados:`, thresholds);

    if (dryRun) {
      console.log('Dry-run activo: no se insertaron registros.');
      await connection.end();
      return;
    }

    await connection.beginTransaction();

    await connection.execute('DELETE FROM scoring_hist_score WHERE periodo_key = ?', [periodKey]);

    for (const row of finalRows) {
      await connection.execute(
        `INSERT INTO scoring_hist_score (periodo_key, cta_cte, puntaje_final, categoria, ranking_puntaje, fecha_carga)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [periodKey, row.ctaCte, row.scoreFinal, row.categoria, row.ranking]
      );
    }

    await connection.commit();
    console.log(`Importacion completada para ${periodKey}: ${finalRows.length} filas.`);
  } catch (error) {
    try { await connection.rollback(); } catch {}
    console.error('Error importando historico CSV:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
