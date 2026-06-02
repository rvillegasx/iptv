import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'secret',
  database: process.env.DB_NAME || 'iptv_db',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Helper para inicializar la base de datos
export async function initializeDatabase() {
  const connection = await pool.getConnection();
  try {
    console.log('Creando o verificando la existencia de la tabla iptv_users...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`iptv_users\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`platform\` ENUM('FLIX', 'FUTVRE') NOT NULL,
        \`username\` VARCHAR(100) NOT NULL,
        \`password\` VARCHAR(100) DEFAULT NULL,
        \`name\` VARCHAR(150) DEFAULT NULL,
        \`email\` VARCHAR(150) DEFAULT NULL,
        \`mac_address\` VARCHAR(255) DEFAULT NULL,
        \`expiration_date\` DATETIME DEFAULT NULL,
        \`active_connections\` INT DEFAULT 0,
        \`max_connections\` INT DEFAULT 1,
        \`package_name\` VARCHAR(150) DEFAULT NULL,
        \`is_trial\` BOOLEAN DEFAULT FALSE,
        \`activation_date\` DATE DEFAULT NULL,
        \`is_banned\` BOOLEAN DEFAULT FALSE,
        \`last_seen_info\` TEXT DEFAULT NULL,
        \`notes\` TEXT DEFAULT NULL,
        \`raw_ocr_metadata\` JSON DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY \`idx_platform_username\` (\`platform\`, \`username\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('Tabla iptv_users verificada con éxito.');
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error);
    throw error;
  } finally {
    connection.release();
  }
}

export default pool;
