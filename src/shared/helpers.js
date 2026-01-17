const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'America/Argentina/Buenos_Aires';

// Formateo de fechas
const formatDate = (date, format = 'DD/MM/YYYY') => dayjs(date).tz(TZ).format(format);
const formatDateTime = (date) => dayjs(date).tz(TZ).format('DD/MM/YYYY HH:mm');
const now = () => dayjs().tz(TZ);
const today = () => dayjs().tz(TZ).format('YYYY-MM-DD');

// Respuestas HTTP
const successResponse = (res, data, message = 'Operación exitosa', statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, data });
};

const errorResponse = (res, message = 'Error', statusCode = 400) => {
  return res.status(statusCode).json({ success: false, message });
};

// Generar código único
const generarCodigo = (prefix = 'DOC') => {
  const fecha = dayjs().format('YYYYMMDD');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${fecha}-${random}`;
};

// Validar número de quiniela
const validarNumeroQuiniela = (numero) => {
  const num = parseInt(numero, 10);
  return !isNaN(num) && num >= 0 && num <= 9999;
};

// Formatear número con ceros
const formatearNumero = (numero, digitos = 2) => {
  return numero.toString().padStart(digitos, '0');
};

// Provincias (mapeo)
const PROVINCIAS = {
  '51': { codigo: 'CABA', nombre: 'Ciudad Autónoma' },
  '53': { codigo: 'PBA', nombre: 'Buenos Aires' },
  '55': { codigo: 'CBA', nombre: 'Córdoba' },
  '72': { codigo: 'SFE', nombre: 'Santa Fe' },
  '64': { codigo: 'MZA', nombre: 'Mendoza' },
  '59': { codigo: 'ENR', nombre: 'Entre Ríos' },
  '0': { codigo: 'URU', nombre: 'Uruguay' },
  '63': { codigo: 'SGO', nombre: 'Santiago' }
};

// Multiplicadores de quiniela por posición
const MULTIPLICADORES_QUINIELA = {
  1: 70, 2: 60, 3: 50, 4: 40, 5: 30,
  6: 25, 7: 20, 8: 18, 9: 16, 10: 14,
  11: 12, 12: 10, 13: 9, 14: 8, 15: 7,
  16: 6, 17: 5, 18: 4, 19: 3, 20: 2
};

// Calcular premio por posición
const calcularPremioQuiniela = (monto, posicion, cifras = 2) => {
  const multiplicador = MULTIPLICADORES_QUINIELA[posicion] || 0;
  const factorCifras = cifras === 1 ? 0.1 : cifras === 3 ? 10 : cifras === 4 ? 50 : 1;
  return monto * multiplicador * factorCifras;
};

module.exports = {
  formatDate,
  formatDateTime,
  now,
  today,
  successResponse,
  errorResponse,
  generarCodigo,
  validarNumeroQuiniela,
  formatearNumero,
  PROVINCIAS,
  MULTIPLICADORES_QUINIELA,
  calcularPremioQuiniela,
  TZ
};
