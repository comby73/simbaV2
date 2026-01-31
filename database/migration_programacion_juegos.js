/**
 * Migración: Agregar campos de código y tipo de juego
 * Permite la detección automática del juego desde el Excel
 * Soporta: Quiniela, Quini 6, Brinco, Loto 5 Plus, Loto Plus Tradicional, Poceada, Tombolina
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const os = require('os');

// Detectar si es local o producción
function isProduction() {
    const hostname = os.hostname();
    return process.env.NODE_ENV === 'production' ||
        hostname.includes('hostinger') ||
        hostname.includes('server') ||
        hostname === 'srv522141';
}

const getDbConfig = () => {
    if (isProduction()) {
        return {
            host: '127.0.0.1',
            port: 3306,
            user: 'u870508525_simba',
            password: 'Machu1733*',
            database: 'u870508525_control_loteri'
        };
    }
    return {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'control_loterias'
    };
};

async function migrate() {
    const config = getDbConfig();
    console.log('🔌 Conectando a:', config.host, '/', config.database);

    const connection = await mysql.createConnection(config);

    console.log('🔄 Iniciando migración de campos de juego...');

    try {
        // Verificar si las columnas ya existen
        const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'programacion_sorteos'
        AND COLUMN_NAME IN ('codigo_juego', 'tipo_juego')
    `, [config.database]);

        const existingColumns = columns.map(c => c.COLUMN_NAME);

        // Agregar campo codigo_juego si no existe
        if (!existingColumns.includes('codigo_juego')) {
            await connection.execute(`
        ALTER TABLE programacion_sorteos 
        ADD COLUMN codigo_juego VARCHAR(10) NULL 
        COMMENT 'Código del juego (0069=Quini6, 0013=Brinco, etc.)' 
        AFTER juego
      `);
            console.log('✅ Campo codigo_juego agregado');
        } else {
            console.log('ℹ️ Campo codigo_juego ya existe');
        }

        // Agregar campo tipo_juego si no existe
        if (!existingColumns.includes('tipo_juego')) {
            await connection.execute(`
        ALTER TABLE programacion_sorteos 
        ADD COLUMN tipo_juego VARCHAR(20) NULL 
        COMMENT 'Tipo de juego (quiniela, loto, poceada, tombolina)' 
        AFTER codigo_juego
      `);
            console.log('✅ Campo tipo_juego agregado');
        } else {
            console.log('ℹ️ Campo tipo_juego ya existe');
        }

        // Agregar índice por tipo de juego si no existe
        const [indexes] = await connection.execute(`
      SELECT INDEX_NAME 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'programacion_sorteos'
        AND INDEX_NAME = 'idx_tipo_juego'
    `, [config.database]);

        if (indexes.length === 0) {
            await connection.execute(`
        ALTER TABLE programacion_sorteos 
        ADD INDEX idx_tipo_juego (tipo_juego)
      `);
            console.log('✅ Índice idx_tipo_juego creado');
        } else {
            console.log('ℹ️ Índice idx_tipo_juego ya existe');
        }

        // Actualizar registros existentes para Quiniela
        const [result] = await connection.execute(`
      UPDATE programacion_sorteos 
      SET codigo_juego = '0080', tipo_juego = 'quiniela' 
      WHERE juego = 'Quiniela' AND codigo_juego IS NULL
    `);
        if (result.affectedRows > 0) {
            console.log(`✅ ${result.affectedRows} registros de Quiniela actualizados con código 0080`);
        }

        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('✅ Migración de campos de juego completada exitosamente');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('Juegos soportados:');
        console.log('  0080 - Quiniela');
        console.log('  0069 - Quini 6');
        console.log('  0013 - Brinco');
        console.log('  0005 - Loto 5 Plus');
        console.log('  0009 - Loto Plus Tradicional');
        console.log('  0082 - Quiniela Poceada');
        console.log('  0023 - Tombolina');

    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        throw error;
    } finally {
        await connection.end();
    }
}

migrate().catch(console.error);
