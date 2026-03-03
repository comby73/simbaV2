const ExcelJS = require('exceljs');
const workbook = new ExcelJS.Workbook();

function cellVal(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v !== null && 'result' in v) return v.result;
  if (typeof v === 'object' && v !== null && 'formula' in v) return '{formula:' + v.formula.substring(0,30) + '}';
  if (v instanceof Date) return v.toISOString().substring(0,10);
  return v;
}

workbook.xlsx.readFile('H:/facturacion ute 2026/2-2026/01 al 28-02-2026.xlsx').then(() => {

  // === TOTAL GRAL ===
  const s1 = workbook.getWorksheet('total gral.');
  console.log('=== TOTAL GRAL SHEET ===');
  console.log('Dimensions:', s1.dimensions ? s1.dimensions.toString() : 'N/A');
  s1.eachRow((row, rn) => {
    if (rn > 100) return;
    const cols = [];
    row.eachCell({includeEmpty:true}, (cell, cn) => {
      const v = cellVal(cell);
      if (v !== '') cols.push('C' + cn + '=' + JSON.stringify(v));
    });
    if (cols.length > 0) console.log('R' + rn + ': ' + cols.join(' | '));
  });

  // === MENSUAL GRAL ===
  const s2 = workbook.getWorksheet('mensual gral.');
  console.log('\n=== MENSUAL GRAL SHEET (first 10 rows) ===');
  console.log('Dimensions:', s2.dimensions ? s2.dimensions.toString() : 'N/A');
  s2.eachRow((row, rn) => {
    if (rn > 10) return;
    const cols = [];
    row.eachCell({includeEmpty:true}, (cell, cn) => {
      const v = cellVal(cell);
      if (v !== '') cols.push('C' + cn + '=' + JSON.stringify(v));
    });
    if (cols.length > 0) console.log('R' + rn + ': ' + cols.join(' | '));
  });

  // === HES GRAL ===
  const s3 = workbook.getWorksheet('HES GRAL');
  console.log('\n=== HES GRAL SHEET (first 60 rows) ===');
  console.log('Dimensions:', s3.dimensions ? s3.dimensions.toString() : 'N/A');
  s3.eachRow((row, rn) => {
    if (rn > 60) return;
    const cols = [];
    row.eachCell({includeEmpty:true}, (cell, cn) => {
      const v = cellVal(cell);
      if (v !== '') cols.push('C' + cn + '=' + JSON.stringify(v));
    });
    if (cols.length > 0) console.log('R' + rn + ': ' + cols.join(' | '));
  });

}).catch(e => console.error(e));
