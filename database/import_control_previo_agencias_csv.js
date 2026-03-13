// Importa CSV operativo (tipo quClaudio) a control_previo_agencias
// para que Scoring Agencias calcule el periodo actual desde ventas reales.
//
// Uso:
//   node database/import_control_previo_agencias_csv.js --file "quClaudio(1).csv" --dry-run
//   node database/import_control_previo_agencias_csv.js --file "quClaudio(1).csv"
//
// Opcionales:
//   --encoding latin1   (default: latin1)
//   --delimiter ";"    (default: ;)
//   --controlPrevioId 0 (default: 0)

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');

const envLocal = path.join(__dirname, '../.env.local');
const envDefault = path.join(__dirname, '../.env');
require('dotenv').config({ path: fs.existsSync(envLocal) ? envLocal : envDefault });

const BATCH_SIZE = 1000;

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const k = argv[i];
    const n = argv[i + 1];
    if (!k.startsWith('--')) continue;
    if (!n || n.startsWith('--')) {
      args[k.slice(2)] = true;
    } else {
      args[k.slice(2)] = n;
      i += 1;
    }
  }
  return args;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
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
  return out.map(v => String(v || '').trim());
}

function toNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDateDdMmYyyy(value) {
  const s = String(value || '').trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function normalizeAgency(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  // En CSV suele venir con 8 digitos (incluye verificador); scoring usa LEFT(...,7)
  // pero guardamos completo para trazabilidad.
  if (digits.length >= 8) return digits.slice(0, 8);
  return digits.padStart(7, '0');
}

function normalizeGame(value) {
  const raw = String(value || '').trim();
  const norm = normalizeText(raw);

  // Mapeo para scoring mix LOTO (consulta LOWER(juego) IN ...)
  if (norm.includes('la grande')) return 'la grande';
  if (norm.includes('loto 5') || norm.includes('loto5')) return 'loto5';
  if (norm.includes('loto')) return 'loto';

  // Mantiene otros juegos en minuscula simple
  return norm || 'desconocido';
}

function inferProvinceCode(codigoAgencia) {
  const digits = String(codigoAgencia || '').replace(/\D/g, '');
  if (digits.length >= 2) return digits.slice(0, 2);
  return '51';
}

function findIndex(headers, aliases) {
  for (let i = 0; i < headers.length; i += 1) {
    const h = normalizeText(headers[i]);
    if (aliases.some(a => h.includes(a))) return i;
  }
  return -1;
}

async function flushBatch(conn, rows, dryRun) {
  if (!rows.length) return 0;
  if (dryRun) return rows.length;

  const sql = `
    INSERT INTO control_previo_agencias
      (control_previo_id, juego, fecha, numero_sorteo, modalidad, codigo_agencia, codigo_provincia,
       total_tickets, total_apuestas, total_anulados, total_recaudacion)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      total_tickets = VALUES(total_tickets),
      total_apuestas = VALUES(total_apuestas),
      total_anulados = VALUES(total_anulados),
      total_recaudacion = VALUES(total_recaudacion),
      codigo_provincia = VALUES(codigo_provincia)
  `;

  await conn.query(sql, [rows]);
  return rows.length;
}

async function main() {
  const args = parseArgs(process.argv);
  const filePath = args.file ? path.resolve(args.file) : '';
  const delimiter = args.delimiter || ';';
  const encoding = args.encoding || 'latin1';
  const controlPrevioId = Number.parseInt(args.controlPrevioId || '0', 10) || 0;
  const dryRun = !!args['dry-run'];

  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Uso: node database/import_control_previo_agencias_csv.js --file <csv> [--dry-run] [--encoding latin1] [--delimiter ;]');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'control_loterias',
    multipleStatements: false
  });

  const stream = fs.createReadStream(filePath, { encoding });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let lineNo = 0;
  let headers = [];
  let idx = {};
  let batch = [];
  let inserted = 0;
  let skipped = 0;

  try {
    if (!dryRun) {
      await conn.beginTransaction();
    }

    for await (const line of rl) {
      if (!line || !line.trim()) continue;
      lineNo += 1;

      if (lineNo === 1) {
        headers = parseCsvLine(line, delimiter);

        idx = {
          cta: findIndex(headers, ['cta. cte', 'cta cte', 'agencia']),
          juego: findIndex(headers, ['juego']),
          sorteo: findIndex(headers, ['sorteo']),
          fecha: findIndex(headers, ['fecha sorteo', 'fecha']),
          modalidad: findIndex(headers, ['modalidad']),
          apuestas: findIndex(headers, ['apuestas']),
          tickets: findIndex(headers, ['tickets']),
          recaudacion: findIndex(headers, ['recaudacion'])
        };

        if (idx.cta < 0 || idx.juego < 0 || idx.sorteo < 0 || idx.fecha < 0 || idx.modalidad < 0 || idx.recaudacion < 0) {
          throw new Error(`Header invalido. Se requiere Cta.Cte, Juego, Sorteo, Fecha Sorteo, Modalidad, Recaudacion. Header: ${headers.join(' | ')}`);
        }

        continue;
      }

      const cols = parseCsvLine(line, delimiter);
      const codigoAgencia = normalizeAgency(cols[idx.cta]);
      const juego = normalizeGame(cols[idx.juego]);
      const numeroSorteo = Math.trunc(toNumber(cols[idx.sorteo]));
      const fecha = parseDateDdMmYyyy(cols[idx.fecha]);
      const modalidad = String(cols[idx.modalidad] || 'N').trim().slice(0, 10) || 'N';
      const totalApuestas = Math.trunc(toNumber(cols[idx.apuestas]));
      const totalTickets = Math.trunc(toNumber(cols[idx.tickets]));
      const totalRecaudacion = toNumber(cols[idx.recaudacion]);

      if (!codigoAgencia || !juego || !numeroSorteo || !fecha) {
        skipped += 1;
        continue;
      }

      const codigoProvincia = inferProvinceCode(codigoAgencia);

      batch.push([
        controlPrevioId,
        juego,
        fecha,
        numeroSorteo,
        modalidad,
        codigoAgencia,
        codigoProvincia,
        totalTickets,
        totalApuestas,
        0,
        totalRecaudacion
      ]);

      if (batch.length >= BATCH_SIZE) {
        inserted += await flushBatch(conn, batch, dryRun);
        batch = [];
      }
    }

    if (batch.length) {
      inserted += await flushBatch(conn, batch, dryRun);
    }

    if (!dryRun) {
      await conn.commit();
    }

    console.log(`Archivo: ${filePath}`);
    console.log(`Filas procesadas: ${lineNo > 0 ? lineNo - 1 : 0}`);
    console.log(`Filas insertadas/actualizadas: ${inserted}`);
    console.log(`Filas omitidas: ${skipped}`);
    console.log(`Modo: ${dryRun ? 'DRY-RUN' : 'WRITE'}`);
  } catch (err) {
    if (!dryRun) {
      try { await conn.rollback(); } catch {}
    }
    console.error('Error importando CSV operativo:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
