'use strict';

const { query } = require('../../config/database');

// ============================================================
// CONSTANTES DE FACTURACIÓN UTE - JUEGOS NACIONALES
// ============================================================

const TOPE_DEFAULT = 105_000_000; // Tope estipulado por contrato

// Factor de descuento combinado: (1-16%) × (1-5%) = 0.84 × 0.95 = 0.798
const FACTOR_DESCUENTO = (1 - 0.16) * (1 - 0.05); // = 0.798

// Tasas nominales (SAP HES = nominal × FACTOR_DESCUENTO)
const TASAS = {
  CABA_COMPLETO:  0.06,   // 6%    → aplica al monto dentro del tope
  CABA_REDUCIDO:  0.045,  // 4.5%  → aplica al monto sobre el tope
  PROV_COMPLETO:  0.03,   // 3%    → aplica al monto dentro del tope
  PROV_REDUCIDO:  0.0225, // 2.25% → aplica al monto sobre el tope
  INTERNET_FLAT:  0.11    // 11%   → tasa plana, sin diferencial de tope
};

// IVA (se muestra por separado)
const IVA = 0.21;

// Desglose proporcional para replicar el modelo de Excel (total gral.)
// Se usa para separar juegos que en Control Previo vienen agregados.
const DESGLOSE_PORCENTUAL = {
  loto: [
    { key: 'loto_desquite', nombre: 'LOTO PLUS DESQUITE', porcentaje: 0.20 },
    { key: 'loto_sos', nombre: 'LOTO PLUS SOS', porcentaje: 0.10 },
    { key: 'loto_tradicional', nombre: 'LOTO PLUS TRADICIONAL', porcentaje: 0.22 },
    { key: 'loto_match', nombre: 'LOTO MATCH', porcentaje: 0.22 },
    { key: 'loto_numero_plus', nombre: 'LOTO NUMERO PLUS', porcentaje: 0.26 }
  ],
  quini6: [
    { key: 'quini6_revancha', nombre: 'QUINI 6 REVANCHA', porcentaje: 0.25 },
    { key: 'quini6_siempre_sale', nombre: 'QUINI 6 SIEMPRE SALE', porcentaje: 0.25 },
    { key: 'quini6_tradicional', nombre: 'QUINI 6 TRADICIONAL', porcentaje: 0.50 }
  ]
};

function obtenerDesgloseJuego(juegoKey) {
  return DESGLOSE_PORCENTUAL[juegoKey] || null;
}

function parseJSONSafe(value) {
  try {
    if (!value) return null;
    if (typeof value === 'object') return value;
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizarDesglose(rows, itemsBase) {
  const total = rows.reduce((s, i) => s + (i.recaudacion || 0), 0);
  if (!total) return null;
  return rows.map((i) => ({
    key: i.key,
    nombre: i.nombre,
    porcentaje: (i.recaudacion || 0) / total
  }));
}

async function obtenerDesgloseLotoDinamico(fecha_inicio, fecha_fin) {
  const colFecha = await resolverColumnaFecha('control_previo_loto');
  if (!colFecha) return null;

  let rows;
  try {
    rows = await query(`
      SELECT datos_json
      FROM control_previo_loto
      WHERE ${colFecha} >= ? AND ${colFecha} <= ?
    `, [fecha_inicio, fecha_fin]);
  } catch {
    return null;
  }

  if (!rows?.length) return null;

  const acc = {
    loto_desquite: 0,
    loto_sos: 0,
    loto_tradicional: 0,
    loto_match: 0,
    loto_numero_plus: 0
  };

  for (const r of rows) {
    const data = parseJSONSafe(r.datos_json);
    const mod = data?.datosOficiales?.modalidades;
    if (!mod) continue;

    acc.loto_tradicional += Number(mod?.Tradicional?.recaudacionBruta || 0);
    acc.loto_match += Number(mod?.Match?.recaudacionBruta || 0);
    acc.loto_desquite += Number(mod?.Desquite?.recaudacionBruta || 0);
    acc.loto_sos += Number(mod?.['Sale o Sale']?.recaudacionBruta || 0);
    acc.loto_numero_plus += Number(mod?.Multiplicador?.recaudacionBruta || 0);
  }

  return normalizarDesglose([
    { key: 'loto_desquite', nombre: 'LOTO PLUS DESQUITE', recaudacion: acc.loto_desquite },
    { key: 'loto_sos', nombre: 'LOTO PLUS SOS', recaudacion: acc.loto_sos },
    { key: 'loto_tradicional', nombre: 'LOTO PLUS TRADICIONAL', recaudacion: acc.loto_tradicional },
    { key: 'loto_match', nombre: 'LOTO MATCH', recaudacion: acc.loto_match },
    { key: 'loto_numero_plus', nombre: 'LOTO NUMERO PLUS', recaudacion: acc.loto_numero_plus }
  ]);
}

async function obtenerDesgloseQuini6Dinamico(fecha_inicio, fecha_fin) {
  const colFecha = await resolverColumnaFecha('control_previo_quini6');
  if (!colFecha) return null;

  let rows;
  try {
    rows = await query(`
      SELECT datos_json
      FROM control_previo_quini6
      WHERE ${colFecha} >= ? AND ${colFecha} <= ?
    `, [fecha_inicio, fecha_fin]);
  } catch {
    return null;
  }

  if (!rows?.length) return null;

  const acc = {
    quini6_tradicional: 0,
    quini6_revancha: 0,
    quini6_siempre_sale: 0
  };

  for (const r of rows) {
    const data = parseJSONSafe(r.datos_json);
    const mod = data?.porModalidad;
    if (!mod) continue;

    acc.quini6_tradicional += Number(mod?.tradicional?.recaudacion || 0);
    acc.quini6_revancha += Number(mod?.revancha?.recaudacion || 0);
    acc.quini6_siempre_sale += Number(mod?.siempreSale?.recaudacion || 0);
  }

  return normalizarDesglose([
    { key: 'quini6_revancha', nombre: 'QUINI 6 REVANCHA', recaudacion: acc.quini6_revancha },
    { key: 'quini6_siempre_sale', nombre: 'QUINI 6 SIEMPRE SALE', recaudacion: acc.quini6_siempre_sale },
    { key: 'quini6_tradicional', nombre: 'QUINI 6 TRADICIONAL', recaudacion: acc.quini6_tradicional }
  ]);
}

async function resolverColumnaFecha(tableName) {
  for (const col of ['fecha', 'fecha_sorteo']) {
    try {
      await query(`SELECT \`${col}\` FROM \`${tableName}\` LIMIT 0`);
      return col;
    } catch {
      // columna no existe, probar la siguiente
    }
  }
  return null;
}

async function resolverColumnaFechaControlPrevioAgencias() {
  return resolverColumnaFecha('control_previo_agencias');
}

// ============================================================
// CONFIGURACIÓN SAP POR JUEGO
// caba:  [material_completo, material_reducido]
// prov:  [material_completo, material_reducido]  (solo juegos con facturación provincial)
// int:   [material_completo, material_reducido]  (agencia 88880)
// ============================================================
const SAP_JUEGOS = {
  brinco: {
    nombre: 'BRINCO',
    caba:  ['3000000378', '3000000377'], centro: 'LCBAJTA012',
    tiene_provincias: false, tiene_internet: false
  },
  quiniela: {
    nombre: 'LA QUINIELA CONJUNTA',
    caba:  ['3000000380', '3000000379'], centro: 'LCBAJPA007',
    int:   ['3000000424', '3000000423'], centroInt: 'LCBAJOL007',
    tiene_provincias: false, tiene_internet: true
  },
  poceada: {
    nombre: 'LA QUINIELA POCEADA',
    caba:  ['3000000382', '3000000381'], centro: 'LCBAJPA008',
    prov:  ['3000000384', '3000000383'],
    tiene_provincias: true, tiene_internet: false
  },
  tombolina: {
    nombre: 'LA QUINIELA TOMBOLINA',
    caba:  ['3000000386', '3000000385'], centro: 'LCBAJPA009',
    tiene_provincias: false, tiene_internet: false
  },
  quinielaya: {
    nombre: 'QUINIELA YA',
    caba:  ['3000000562', '3000000563'], centro: 'LCBAJPA011',
    int:   ['3000000564', '3000000565'], centroInt: 'LCBAJOL014',
    tiene_provincias: false, tiene_internet: true
  },
  quiniela_ya: { // alias por si se guarda con guión bajo
    nombre: 'QUINIELA YA',
    caba:  ['3000000562', '3000000563'], centro: 'LCBAJPA011',
    int:   ['3000000564', '3000000565'], centroInt: 'LCBAJOL014',
    tiene_provincias: false, tiene_internet: true
  },
  loto5: {
    nombre: 'LOTO 5 PLUS',
    caba:  ['3000000388', '3000000387'], centro: 'LCBAJPA006',
    prov:  ['3000000390', '3000000389'],
    tiene_provincias: true, tiene_internet: false
  },
  // LOTO PLUS: todas las modalidades combinadas (Tradicional, Match, Desquite, SOS, Multiplicador)
  // En control_previo_agencias se guarda con juego='loto' y modalidad='U' sin desglose por modalidad
  loto: {
    nombre: 'LOTO PLUS (TOTAL)',
    caba:  ['3000000400', '3000000399'], centro: 'LCBAJPA004',  // Usando códigos Tradicional
    prov:  ['3000000402', '3000000401'],
    int:   ['3000000574', '3000000575'], centroInt: 'LCBAJOL009',
    tiene_provincias: true, tiene_internet: true,
    nota: 'Combinado todas las modalidades. Para SAP exacto desglosar por: Tradicional, Match, Desquite, SOS, Multiplicador'
  },
  quini6: {
    nombre: 'QUINI 6',
    caba:  ['3000000408', '3000000407'], centro: 'LCBAJTA002',
    tiene_provincias: false, tiene_internet: false,
    nota: 'Incluye todas las modalidades (Tradicional, Revancha, Siempre Sale)'
  },
  la_grande: {
    nombre: 'LA GRANDE DE LA NACIONAL',
    caba:  ['3000000410', '3000000409'], centro: 'LCBAJPA010',
    tiene_provincias: false, tiene_internet: false,
    es_externa: true,
    nota: 'Fuente externa - datos deben ingresarse manualmente'
  }
};

// ============================================================
// FUNCIÓN DE CÁLCULO POR CANAL
// ============================================================
function calcularBillingCanal(recaudacion, canal, topeRatio) {
  const dentroTope = recaudacion * topeRatio;
  const sobreTope  = recaudacion - dentroTope;

  let importe_completo, importe_reducido;

  if (canal === 'internet') {
    // Tasa plana 11%, sin diferencial de tope (ambas líneas SAP al mismo rate)
    importe_completo = dentroTope * TASAS.INTERNET_FLAT;
    importe_reducido = sobreTope  * TASAS.INTERNET_FLAT;
  } else if (canal === 'caba') {
    importe_completo = dentroTope * TASAS.CABA_COMPLETO * FACTOR_DESCUENTO;
    importe_reducido = sobreTope  * TASAS.CABA_REDUCIDO * FACTOR_DESCUENTO;
  } else { // provincias
    importe_completo = dentroTope * TASAS.PROV_COMPLETO * FACTOR_DESCUENTO;
    importe_reducido = sobreTope  * TASAS.PROV_REDUCIDO * FACTOR_DESCUENTO;
  }

  const total_neto = importe_completo + importe_reducido;

  return {
    recaudacion,
    dentroTope,
    sobreTope,
    importe_completo,
    importe_reducido,
    total_neto
  };
}

// ============================================================
// ENDPOINT: GET /api/facturacion/juegos-ute
// Query params: fecha_inicio, fecha_fin (YYYY-MM-DD), tope (opcional)
// ============================================================
const getFacturacionJuegosUTE = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query;
    const tope = parseFloat(req.query.tope) || TOPE_DEFAULT;

    if (!fecha_inicio || !fecha_fin) {
      return res.status(400).json({
        success: false,
        message: 'Requerido: fecha_inicio y fecha_fin (formato YYYY-MM-DD)'
      });
    }

    const colFechaCPA = await resolverColumnaFechaControlPrevioAgencias();
    if (!colFechaCPA) {
      return res.status(500).json({
        success: false,
        message: "No se encontró columna de fecha en control_previo_agencias (esperada: 'fecha' o 'fecha_sorteo')"
      });
    }

    // --- Consulta: recaudación agrupada por juego y canal ---
    const sql = `
      SELECT
        LOWER(TRIM(cpa.juego)) AS juego,
        SUM(CASE
          WHEN cpa.codigo_agencia IN ('88880','5188880')
          THEN cpa.total_recaudacion ELSE 0
        END) AS rec_internet,
        SUM(CASE
          WHEN LOWER(TRIM(cpa.juego)) IN ('quini6','brinco')
           AND cpa.codigo_agencia NOT IN ('88880','5188880')
          THEN cpa.total_recaudacion
          WHEN cpa.codigo_provincia = '51'
           AND cpa.codigo_agencia NOT IN ('88880','5188880')
          THEN cpa.total_recaudacion ELSE 0
        END) AS rec_caba,
        SUM(CASE
          WHEN LOWER(TRIM(cpa.juego)) IN ('quini6','brinco')
          THEN 0
          WHEN cpa.codigo_provincia != '51'
          THEN cpa.total_recaudacion ELSE 0
        END) AS rec_provincias,
        SUM(cpa.total_recaudacion) AS rec_total,
        COUNT(DISTINCT cpa.numero_sorteo) AS cant_sorteos
      FROM control_previo_agencias cpa
      WHERE cpa.${colFechaCPA} >= ? AND cpa.${colFechaCPA} <= ?
      GROUP BY LOWER(TRIM(cpa.juego))
      ORDER BY LOWER(TRIM(cpa.juego))
    `;

    const rows = await query(sql, [fecha_inicio, fecha_fin]);

    const desgloseDinamicoLoto = await obtenerDesgloseLotoDinamico(fecha_inicio, fecha_fin);
    const desgloseDinamicoQuini6 = await obtenerDesgloseQuini6Dinamico(fecha_inicio, fecha_fin);
    const desglosePorJuego = {
      loto: desgloseDinamicoLoto || DESGLOSE_PORCENTUAL.loto,
      quini6: desgloseDinamicoQuini6 || DESGLOSE_PORCENTUAL.quini6
    };

    if (!rows || rows.length === 0) {
      return res.json({
        success: true,
        data: {
          periodo: { inicio: fecha_inicio, fin: fecha_fin },
          origenDatos: {
            fuente: 'control_previo_agencias',
            descripcion: 'Recaudación agrupada por juego/canal desde Control Previo',
            clasificacionCanales: {
              internet: "codigo_agencia IN ('88880','5188880')",
              caba: "codigo_provincia='51' y codigo_agencia NOT IN ('88880','5188880') (quini6/brinco siempre CABA salvo web)",
              provincias: "codigo_provincia != '51' (quini6/brinco excluidos)"
            },
            columnaFechaControlPrevioAgencias: colFechaCPA,
            mapeoExcel: {
              hoja1: 'mensual gral. / Hoja1: detalle por juego y canal (recaudación + billing neto)',
              totalGral: 'Tarjeta de totales y subtotal HES',
              hesGral: 'Detalle de líneas SAP exportables'
            }
          },
          flujoTotalGral: {
            onLineCapitalFederal: { recaudacion: 0, participacion: 0 },
            internetCapitalFederal: { recaudacion: 0, participacion: 0 },
            consolidacionProvincias: { recaudacion: 0, participacion: 0 }
          },
          cuadroTotalGral: {
            filas: [],
            totales: {
              recaudacion: 0,
              participacion: 0,
              dentroTope: 0,
              sobreTope: 0,
              importeDentroTope: 0,
              importeSobreTope: 0,
              totalNeto: 0
            }
          },
          tope,
          totalRecaudacion: 0,
          totalBillingNeto: 0,
          ivaTotal: 0,
          totalConIVA: 0,
          juegos: [],
          lineasSAP: [],
          mensaje: 'No hay datos de Control Previo para el período indicado'
        }
      });
    }

    // --- Calcular total recaudación para proporcionar tope ---
    const totalRecaudacion = rows.reduce((acc, r) => acc + (parseFloat(r.rec_total) || 0), 0);
    const topeRatio = totalRecaudacion > 0 ? tope / totalRecaudacion : 0;

    // --- Flujo tipo "Total Gral." del Excel por canal ---
    const totalRecCABA = rows.reduce((acc, r) => acc + (parseFloat(r.rec_caba) || 0), 0);
    const totalRecInternet = rows.reduce((acc, r) => acc + (parseFloat(r.rec_internet) || 0), 0);
    const totalRecProvincias = rows.reduce((acc, r) => acc + (parseFloat(r.rec_provincias) || 0), 0);

    const flujoTotalGral = {
      onLineCapitalFederal: {
        recaudacion: totalRecCABA,
        participacion: totalRecaudacion > 0 ? totalRecCABA / totalRecaudacion : 0
      },
      internetCapitalFederal: {
        recaudacion: totalRecInternet,
        participacion: totalRecaudacion > 0 ? totalRecInternet / totalRecaudacion : 0
      },
      consolidacionProvincias: {
        recaudacion: totalRecProvincias,
        participacion: totalRecaudacion > 0 ? totalRecProvincias / totalRecaudacion : 0
      }
    };

    const billingCanales = {
      caba: calcularBillingCanal(totalRecCABA, 'caba', topeRatio),
      internet: calcularBillingCanal(totalRecInternet, 'internet', topeRatio),
      provincias: calcularBillingCanal(totalRecProvincias, 'provincias', topeRatio)
    };

    const cuadroTotalGralFilas = [
      {
        canal: 'FACTURACION ON LINE - CAPITAL FEDERAL',
        recaudacion: totalRecCABA,
        participacion: flujoTotalGral.onLineCapitalFederal.participacion,
        dentroTope: billingCanales.caba.dentroTope,
        sobreTope: billingCanales.caba.sobreTope,
        importeDentroTope: billingCanales.caba.importe_completo,
        importeSobreTope: billingCanales.caba.importe_reducido,
        totalNeto: billingCanales.caba.total_neto
      },
      {
        canal: 'FACTURACION INTERNET - CAPITAL FEDERAL',
        recaudacion: totalRecInternet,
        participacion: flujoTotalGral.internetCapitalFederal.participacion,
        dentroTope: billingCanales.internet.dentroTope,
        sobreTope: billingCanales.internet.sobreTope,
        importeDentroTope: billingCanales.internet.importe_completo,
        importeSobreTope: billingCanales.internet.importe_reducido,
        totalNeto: billingCanales.internet.total_neto
      },
      {
        canal: 'FACTURACION CONSOLIDACION PROVINCIAS',
        recaudacion: totalRecProvincias,
        participacion: flujoTotalGral.consolidacionProvincias.participacion,
        dentroTope: billingCanales.provincias.dentroTope,
        sobreTope: billingCanales.provincias.sobreTope,
        importeDentroTope: billingCanales.provincias.importe_completo,
        importeSobreTope: billingCanales.provincias.importe_reducido,
        totalNeto: billingCanales.provincias.total_neto
      }
    ];

    const cuadroTotalGralTotales = cuadroTotalGralFilas.reduce((acc, f) => {
      acc.recaudacion += f.recaudacion || 0;
      acc.participacion += f.participacion || 0;
      acc.dentroTope += f.dentroTope || 0;
      acc.sobreTope += f.sobreTope || 0;
      acc.importeDentroTope += f.importeDentroTope || 0;
      acc.importeSobreTope += f.importeSobreTope || 0;
      acc.totalNeto += f.totalNeto || 0;
      return acc;
    }, {
      recaudacion: 0,
      participacion: 0,
      dentroTope: 0,
      sobreTope: 0,
      importeDentroTope: 0,
      importeSobreTope: 0,
      totalNeto: 0
    });

    // --- Procesar cada juego ---
    const juegos = [];
    const lineasSAP = [];
    let totalBillingNeto = 0;

    for (const row of rows) {
      const juegoKey = (row.juego || '').toLowerCase().trim();
      const cfg = SAP_JUEGOS[juegoKey] || {
        nombre: juegoKey.toUpperCase(),
        caba: [], tiene_provincias: false, tiene_internet: false
      };

      if (cfg.es_externa) continue; // La Grande es externa, se omite

      const recCABA  = parseFloat(row.rec_caba)       || 0;
      const recProv  = parseFloat(row.rec_provincias)  || 0;
      const recInt   = parseFloat(row.rec_internet)    || 0;
      const recTotal = parseFloat(row.rec_total)       || 0;
      const cantSorteos = parseInt(row.cant_sorteos)   || 0;

      const desglose = desglosePorJuego[juegoKey] || obtenerDesgloseJuego(juegoKey);

      const componentes = desglose && desglose.length
        ? desglose.map((item, idx) => {
            const recCompCaba = recCABA * item.porcentaje;
            const recCompProv = recProv * item.porcentaje;
            const recCompInt = recInt * item.porcentaje;
            return {
              ...item,
              idx,
              recCABA: recCompCaba,
              recProv: recCompProv,
              recInt: recCompInt,
              recTotal: recCompCaba + recCompProv + recCompInt
            };
          })
        : [{
            key: juegoKey,
            nombre: cfg.nombre,
            porcentaje: 1,
            idx: 0,
            recCABA,
            recProv,
            recInt,
            recTotal
          }];

      for (const comp of componentes) {
        const billingJuego = {
          caba:       null,
          provincias: null,
          internet:   null,
          total_neto: 0
        };
        const lineasJuego = [];

        const nombreComponente = comp.nombre || cfg.nombre;

        // -- CABA 3.1.1 --
        if (comp.recCABA > 0 && cfg.caba?.length >= 2) {
          const b = calcularBillingCanal(comp.recCABA, 'caba', topeRatio);
          billingJuego.caba = b;
          billingJuego.total_neto += b.total_neto;
          lineasJuego.push(
            {
              material: cfg.caba[0],
              descripcion: `${nombreComponente} 3.1.1 completo 6%`,
              cantidad: 1, unidad: 'C/U',
              importe: b.importe_completo,
              redondeado: Math.round(b.importe_completo * 1000) / 1000,
              centro: cfg.centro
            },
            {
              material: cfg.caba[1],
              descripcion: `${nombreComponente} 3.1.1 reducido 4,5%`,
              cantidad: 1, unidad: 'C/U',
              importe: b.importe_reducido,
              redondeado: Math.round(b.importe_reducido * 1000) / 1000,
              centro: cfg.centro
            }
          );
        }

        // -- Provincias 3.1.2 --
        if (comp.recProv > 0 && cfg.prov?.length >= 2) {
          const b = calcularBillingCanal(comp.recProv, 'provincias', topeRatio);
          billingJuego.provincias = b;
          billingJuego.total_neto += b.total_neto;
          lineasJuego.push(
            {
              material: cfg.prov[0],
              descripcion: `${nombreComponente} 3.1.2 completo 3%`,
              cantidad: 1, unidad: 'C/U',
              importe: b.importe_completo,
              redondeado: Math.round(b.importe_completo * 1000) / 1000,
              centro: cfg.centro
            },
            {
              material: cfg.prov[1],
              descripcion: `${nombreComponente} 3.1.2 reducido 2,25%`,
              cantidad: 1, unidad: 'C/U',
              importe: b.importe_reducido,
              redondeado: Math.round(b.importe_reducido * 1000) / 1000,
              centro: cfg.centro
            }
          );
        }

        // -- Internet (LCBAJOL) --
        if (comp.recInt > 0 && cfg.int?.length >= 2) {
          const b = calcularBillingCanal(comp.recInt, 'internet', topeRatio);
          billingJuego.internet = b;
          billingJuego.total_neto += b.total_neto;
          const centroInt = cfg.centroInt || cfg.centro;
          lineasJuego.push(
            {
              material: cfg.int[0],
              descripcion: `INTERNET - ${nombreComponente} completo 14,65%`,
              cantidad: 1, unidad: 'C/U',
              importe: b.importe_completo,
              redondeado: Math.round(b.importe_completo * 1000) / 1000,
              centro: centroInt
            },
            {
              material: cfg.int[1],
              descripcion: `INTERNET - ${nombreComponente} reducido 11%`,
              cantidad: 1, unidad: 'C/U',
              importe: b.importe_reducido,
              redondeado: Math.round(b.importe_reducido * 1000) / 1000,
              centro: centroInt
            }
          );
        }

        totalBillingNeto += billingJuego.total_neto;

        juegos.push({
          juego: comp.key,
          juego_padre: juegoKey,
          nombre: nombreComponente,
          cant_sorteos: cantSorteos,
          recaudacion: {
            caba:       comp.recCABA,
            provincias: comp.recProv,
            internet:   comp.recInt,
            total:      comp.recTotal
          },
          billing: billingJuego,
          lineasSAP: lineasJuego,
          porcentaje_modelo: comp.porcentaje,
          nota: null
        });

        lineasSAP.push(...lineasJuego);
      }
    }

    // --- Totales con IVA ---
    const ivaTotal    = totalBillingNeto * IVA;
    const totalConIVA = totalBillingNeto + ivaTotal;

    // --- Subtotal HES (suma de todos los redondeados) ---
    const subtotalHES = lineasSAP.reduce((s, l) => s + (l.redondeado || 0), 0);

    return res.json({
      success: true,
      data: {
        periodo:            { inicio: fecha_inicio, fin: fecha_fin },
        origenDatos: {
          fuente: 'control_previo_agencias',
          descripcion: 'Recaudación agrupada por juego/canal desde Control Previo',
          clasificacionCanales: {
            internet: "codigo_agencia IN ('88880','5188880')",
            caba: "codigo_provincia='51' y codigo_agencia NOT IN ('88880','5188880')",
            provincias: "codigo_provincia != '51'"
          },
          columnaFechaControlPrevioAgencias: colFechaCPA,
          mapeoExcel: {
            hoja1: 'mensual gral. / Hoja1: detalle por juego y canal (recaudación + billing neto)',
            totalGral: 'Tarjeta de totales y subtotal HES',
            hesGral: 'Detalle de líneas SAP exportables'
          },
          desglosePorcentualAplicado: {
            loto: desglosePorJuego.loto,
            quini6: desglosePorJuego.quini6
          },
          fuenteDesglose: {
            loto: desgloseDinamicoLoto ? 'control_previo_loto.datos_json' : 'fallback fijo',
            quini6: desgloseDinamicoQuini6 ? 'control_previo_quini6.datos_json' : 'fallback fijo'
          }
        },
        flujoTotalGral,
        cuadroTotalGral: {
          filas: cuadroTotalGralFilas,
          totales: cuadroTotalGralTotales
        },
        tope,
        topeRatio:          parseFloat(topeRatio.toFixed(8)),
        totalRecaudacion,
        excedenteSobreTope: Math.max(totalRecaudacion - tope, 0),
        totalBillingNeto,
        subtotalHES,
        ivaTotal,
        totalConIVA,
        juegos,
        lineasSAP,
        constantes: {
          tope,
          factor_descuento:   FACTOR_DESCUENTO,
          tasas: TASAS,
          iva:   IVA
        }
      }
    });

  } catch (err) {
    console.error('[Facturacion Juegos] Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getFacturacionJuegosUTE };
