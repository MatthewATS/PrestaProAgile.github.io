const mysql = require('mysql2/promise');

// Create database connection pool
const pool = mysql.createPool(process.env.DATABASE_URL);

/**
 * Test database connection
 */
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Conexión a la base de datos establecida con éxito.');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ No se pudo conectar a la base de datos.');
        console.error('Verifica la variable de entorno DATABASE_URL.');
        console.error(error.message);
        return false;
    }
}

module.exports = {
    pool,
    testConnection
};
