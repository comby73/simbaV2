require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DB_NAME = process.env.DB_NAME || 'control_loterias';

async function resetAdminPassword() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: DB_NAME
    });

    console.log('🔄 Restableciendo contraseña de admin...');

    // Generar el hash correcto para 'admin123'
    const passwordHash = await bcrypt.hash('admin123', 10);

    // Actualizar usuario admin
    const [result] = await connection.execute(
      'UPDATE usuarios SET password = ? WHERE username = ?',
      [passwordHash, 'admin']
    );

    if (result.affectedRows > 0) {
      console.log('✅ Contraseña restablecida con éxito.');
      console.log('👉 Ahora puedes ingresar con: admin / admin123');
    } else {
      console.log('⚠️ No se encontró el usuario "admin". Creándolo...');
      // Si no existe, lo creamos de cero (para casos extremos)
      await connection.execute(`
        INSERT INTO usuarios (username, password, nombre, email, rol_id)
        SELECT 'admin', ?, 'Administrador', 'admin@sistema.com', id
        FROM roles WHERE codigo = 'admin'
      `, [passwordHash]);
      console.log('✅ Usuario admin recreado con éxito.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

resetAdminPassword();