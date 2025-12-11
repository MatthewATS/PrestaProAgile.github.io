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

/**
 * Check and update database schema
 */
async function checkSchema() {
    const connection = await pool.getConnection();
    try {
        // Check if columns exist in cash_closures
        const [columns] = await connection.query(`SHOW COLUMNS FROM cash_closures LIKE 'opening_balance'`);
        if (columns.length === 0) {
            console.log('🔧 Actualizando esquema de base de datos: Agregando columnas a cash_closures...');
            await connection.query(`
                ALTER TABLE cash_closures
                ADD COLUMN opening_balance DECIMAL(10, 2) DEFAULT 0,
                ADD COLUMN added_money DECIMAL(10, 2) DEFAULT 0,
                ADD COLUMN withdrawn_money DECIMAL(10, 2) DEFAULT 0;
            `);
            console.log('✅ Esquema actualizado correctamente.');
        }
    } catch (error) {
        console.error('⚠️ Error verificando esquema:', error.message);
    } finally {
        connection.release();
    }
}

module.exports = {
    pool,
    testConnection,
    checkSchema
};
