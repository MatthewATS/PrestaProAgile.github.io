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

        // --- AUTO-MIGRATION: Ensure tables exist ---
        await connection.query(`
            CREATE TABLE IF NOT EXISTS cash_openings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                opening_date DATE NOT NULL,
                initial_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                opened_by VARCHAR(50) DEFAULT 'admin',
                opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_date (opening_date)
            )
        `);
        // Ensure cash_closures exists too (just as a safety check since we're here)
        await connection.query(`
             CREATE TABLE IF NOT EXISTS cash_closures (
                id INT AUTO_INCREMENT PRIMARY KEY,
                closure_date DATE NOT NULL,
                declared_amount DECIMAL(10, 2) NOT NULL,
                system_cash_amount DECIMAL(10, 2) NOT NULL,
                difference DECIMAL(10, 2) NOT NULL,
                closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                closed_by VARCHAR(50),
                UNIQUE KEY unique_closure_date (closure_date)
            )
        `);
        console.log('✅ Tablas de caja verificadas/creadas.');

        connection.release();
        return true;
    } catch (error) {
        console.error('❌ No se pudo conectar a la base de datos o inicializar tablas.');
        console.error('Verifica la variable de entorno DATABASE_URL.');
        console.error(error.message);
        return false;
    }
}

module.exports = {
    pool,
    testConnection
};
