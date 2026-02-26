require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'control_loterias';

const schema = `
-- ============================================
-- SISTEMA DE CONTROL Y ANÁLISIS DE LOTERÍAS
-- ============================================

-- Tabla de Roles
CREATE TABLE IF NOT EXISTS roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(50) NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Permisos
CREATE TABLE IF NOT EXISTS permisos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  codigo VARCHAR(50) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  modulo VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Rol-Permisos
CREATE TABLE IF NOT EXISTS rol_permisos (
  rol_id INT NOT NULL,
  permiso_id INT NOT NULL,
  PRIMARY KEY (rol_id, permiso_id),
  FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permiso_id) REFERENCES permisos(id) ON DELETE CASCADE
);

-- Tabla de Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(100),
  rol_id INT NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  ultimo_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (rol_id) REFERENCES roles(id)
);

-- Tabla de Juegos (configuración)
CREATE TABLE IF NOT EXISTS juegos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(50) NOT NULL,
  descripcion TEXT,
  cantidad_numeros INT DEFAULT 20,
  tiene_letras BOOLEAN DEFAULT FALSE,
  activo BOOLEAN DEFAULT TRUE,
  config JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Sorteos (horarios por juego)
CREATE TABLE IF NOT EXISTS sorteos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  juego_id INT NOT NULL,
  codigo VARCHAR(10) NOT NULL,
  nombre VARCHAR(50) NOT NULL,
  hora_sorteo TIME NOT NULL,
  hora_cierre TIME NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (juego_id) REFERENCES juegos(id),
  UNIQUE KEY unique_sorteo (juego_id, codigo)
);

-- Tabla de Provincias
CREATE TABLE IF NOT EXISTS provincias (
  id INT PRIMARY KEY AUTO_INCREMENT,
  codigo VARCHAR(10) NOT NULL UNIQUE,
  nombre VARCHAR(50) NOT NULL,
  codigo_luba VARCHAR(10),
  activa BOOLEAN DEFAULT TRUE
);

-- Tabla de Archivos Cargados (NTF, ZIP, XML, JSON)
CREATE TABLE IF NOT EXISTS archivos_cargados (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tipo ENUM('NTF', 'ZIP', 'XML', 'JSON', 'PDF', 'IMAGEN') NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,
  nombre_guardado VARCHAR(255) NOT NULL,
  ruta VARCHAR(500) NOT NULL,
  tamanio INT,
  juego_id INT,
  sorteo_id INT,
  fecha_sorteo DATE,
  provincia_id INT,
  estado ENUM('pendiente', 'procesado', 'error') DEFAULT 'pendiente',
  mensaje_error TEXT,
  usuario_id INT NOT NULL,
  procesado_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (juego_id) REFERENCES juegos(id),
  FOREIGN KEY (sorteo_id) REFERENCES sorteos(id),
  FOREIGN KEY (provincia_id) REFERENCES provincias(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Tabla de Extractos (resultados oficiales)
CREATE TABLE IF NOT EXISTS extractos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  juego_id INT NOT NULL,
  sorteo_id INT NOT NULL,
  numero_sorteo INT NOT NULL,
  fecha DATE NOT NULL,
  provincia_id INT,
  numeros JSON NOT NULL,
  letras JSON,
  fuente ENUM('XML', 'JSON', 'MANUAL', 'OCR') DEFAULT 'MANUAL',
  archivo_id INT,
  validado BOOLEAN DEFAULT FALSE,
  usuario_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (juego_id) REFERENCES juegos(id),
  FOREIGN KEY (sorteo_id) REFERENCES sorteos(id),
  FOREIGN KEY (provincia_id) REFERENCES provincias(id),
  FOREIGN KEY (archivo_id) REFERENCES archivos_cargados(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  UNIQUE KEY unique_extracto (juego_id, sorteo_id, fecha, provincia_id, numero_sorteo)
);

-- Tabla de Control Previo
CREATE TABLE IF NOT EXISTS control_previo (
  id INT PRIMARY KEY AUTO_INCREMENT,
  juego_id INT NOT NULL,
  sorteo_id INT NOT NULL,
  fecha DATE NOT NULL,
  provincia_id INT,
  archivo_id INT,
  total_registros INT DEFAULT 0,
  total_apostado DECIMAL(15,2) DEFAULT 0,
  registros_validos INT DEFAULT 0,
  registros_anulados INT DEFAULT 0,
  observaciones TEXT,
  datos JSON,
  estado ENUM('pendiente', 'procesado', 'con_errores') DEFAULT 'pendiente',
  usuario_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (juego_id) REFERENCES juegos(id),
  FOREIGN KEY (sorteo_id) REFERENCES sorteos(id),
  FOREIGN KEY (provincia_id) REFERENCES provincias(id),
  FOREIGN KEY (archivo_id) REFERENCES archivos_cargados(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Tabla de Control Posterior (análisis de ganadores)
CREATE TABLE IF NOT EXISTS control_posterior (
  id INT PRIMARY KEY AUTO_INCREMENT,
  juego_id INT NOT NULL,
  sorteo_id INT NOT NULL,
  fecha DATE NOT NULL,
  provincia_id INT,
  extracto_id INT,
  control_previo_id INT,
  total_ganadores INT DEFAULT 0,
  total_premios DECIMAL(15,2) DEFAULT 0,
  resumen JSON,
  detalle_ganadores JSON,
  estado ENUM('pendiente', 'procesado', 'con_errores') DEFAULT 'pendiente',
  usuario_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (juego_id) REFERENCES juegos(id),
  FOREIGN KEY (sorteo_id) REFERENCES sorteos(id),
  FOREIGN KEY (provincia_id) REFERENCES provincias(id),
  FOREIGN KEY (extracto_id) REFERENCES extractos(id),
  FOREIGN KEY (control_previo_id) REFERENCES control_previo(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Tabla de Actas
CREATE TABLE IF NOT EXISTS actas (
  id INT PRIMARY KEY AUTO_INCREMENT,
  juego_id INT NOT NULL,
  sorteo_id INT NOT NULL,
  fecha DATE NOT NULL,
  provincia_id INT,
  tipo ENUM('previo', 'posterior', 'general') NOT NULL,
  numero_acta VARCHAR(50),
  contenido JSON,
  archivo_pdf VARCHAR(255),
  estado ENUM('borrador', 'generada', 'firmada') DEFAULT 'borrador',
  usuario_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (juego_id) REFERENCES juegos(id),
  FOREIGN KEY (sorteo_id) REFERENCES sorteos(id),
  FOREIGN KEY (provincia_id) REFERENCES provincias(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Tabla de Agencias (Cuentas Corrientes)
CREATE TABLE IF NOT EXISTS agencias (
  id INT PRIMARY KEY AUTO_INCREMENT,
  numero VARCHAR(8) NOT NULL UNIQUE COMMENT 'Número de cuenta corriente (formato: provincia + cuenta + dígito)',
  provincia VARCHAR(2) NOT NULL COMMENT 'Código de provincia',
  cuenta_corriente VARCHAR(5) NOT NULL COMMENT 'Número de cuenta corriente',
  digito_verificador VARCHAR(1) NOT NULL COMMENT 'Dígito verificador',
  nombre VARCHAR(255),
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_numero (numero),
  INDEX idx_provincia (provincia)
);

-- Tabla de Auditoría
CREATE TABLE IF NOT EXISTS auditoria (
  id INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT,
  accion VARCHAR(100) NOT NULL,
  modulo VARCHAR(50),
  tabla_afectada VARCHAR(50),
  registro_id INT,
  datos_anteriores JSON,
  datos_nuevos JSON,
  ip VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX idx_archivos_fecha ON archivos_cargados(fecha_sorteo);
CREATE INDEX idx_archivos_estado ON archivos_cargados(estado);
CREATE INDEX idx_extractos_fecha ON extractos(fecha);
CREATE INDEX idx_extractos_numero_sorteo ON extractos(numero_sorteo);
CREATE INDEX idx_control_previo_fecha ON control_previo(fecha);
CREATE INDEX idx_control_posterior_fecha ON control_posterior(fecha);
CREATE INDEX idx_auditoria_fecha ON auditoria(created_at);
`;

async function initDatabase() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    });

    console.log('🔄 Conectando a MySQL...');

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ Base de datos '${DB_NAME}' verificada/creada`);

    await connection.query(`USE \`${DB_NAME}\``);

    console.log('🔄 Creando tablas...');
    await connection.query(schema);
    console.log('✅ Tablas creadas correctamente');

    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Base de datos inicializada correctamente');
    console.log('═══════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error inicializando la base de datos:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

initDatabase();
