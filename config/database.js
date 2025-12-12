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
        // First, check if the table exists
        const [tables] = await connection.query(`
            SELECT TABLE_NAME 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'cash_closures'
        `);

        if (tables.length === 0) {
            // Create the table if it doesn't exist
            console.log('🔧 Creando tabla cash_closures...');
            await connection.query(`
                CREATE TABLE cash_closures (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    closure_date DATE NOT NULL UNIQUE,
                    declared_amount DECIMAL(10, 2),
                    system_cash_amount DECIMAL(10, 2),
                    difference DECIMAL(10, 2),
                    closed_at TIMESTAMP NULL,
                    closed_by VARCHAR(100),
                    opening_balance DECIMAL(10, 2) DEFAULT 0,
                    added_money DECIMAL(10, 2) DEFAULT 0,
                    withdrawn_money DECIMAL(10, 2) DEFAULT 0,
                    is_open TINYINT(1) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ Tabla cash_closures creada correctamente.');
            return;
        }

        // Table exists, check for missing columns
        const [columns] = await connection.query(`SHOW COLUMNS FROM cash_closures LIKE 'opening_balance'`);
        if (columns.length === 0) {
            console.log('🔧 Agregando columnas de balance a cash_closures...');
            await connection.query(`
                ALTER TABLE cash_closures
                ADD COLUMN opening_balance DECIMAL(10, 2) DEFAULT 0,
                ADD COLUMN added_money DECIMAL(10, 2) DEFAULT 0,
                ADD COLUMN withdrawn_money DECIMAL(10, 2) DEFAULT 0
            `);
            console.log('✅ Columnas de balance agregadas.');
        }

        // Check for is_open column
        const [isOpenColumn] = await connection.query(`SHOW COLUMNS FROM cash_closures LIKE 'is_open'`);
        if (isOpenColumn.length === 0) {
            console.log('🔧 Agregando columna is_open a cash_closures...');
            try {
                await connection.query(`
                    ALTER TABLE cash_closures
                    ADD COLUMN is_open TINYINT(1) DEFAULT 0
                `);
                console.log('✅ Columna is_open agregada correctamente.');
            } catch (alterError) {
                console.error('⚠️ Error al agregar columna is_open:', alterError.message);
            }
        }

        // Ensure declared_amount, system_cash_amount, and difference have defaults
        console.log('🔧 Verificando valores por defecto en cash_closures...');
        try {
            await connection.query(`
                ALTER TABLE cash_closures
                MODIFY COLUMN declared_amount DECIMAL(10, 2) NULL DEFAULT 0,
                MODIFY COLUMN system_cash_amount DECIMAL(10, 2) NULL DEFAULT 0,
                MODIFY COLUMN difference DECIMAL(10, 2) NULL DEFAULT 0
            `);
            console.log('✅ Campos modificados con DEFAULT 0.');
        } catch (modifyError) {
            console.log('ℹ️ Nota sobre esquema:', modifyError.message);
        }

        // 🔧 FIX: Ensure 'loans' table has ON DELETE CASCADE for 'client_id'
        // This solves the "Cannot delete or update a parent row" error
        // 🔧 FORZAR CORRECCIÓN DE CLAVE FORÁNEA (Always Move)
        try {
            // 1. Intentamos borrar la restricción existente (si existe)
            try {
                await connection.query(`ALTER TABLE loans DROP FOREIGN KEY loans_ibfk_1`);
                console.log('🔧 Restricción anterior eliminada (preparando CASCADE).');
            } catch (dropError) {
                // Si falla es probablemente porque no existe o tiene otro nombre. 
                // Pero el error del usuario dice explícitamente 'loans_ibfk_1', así que confiamos.
                if (!dropError.message.includes("check that column/key exists")) {
                    console.log('ℹ️ Nota al borrar FK:', dropError.message);
                }
            }

            // 2. Creamos la restricción correcta con CASCADE
            await connection.query(`
                ALTER TABLE loans 
                ADD CONSTRAINT loans_ibfk_1 
                FOREIGN KEY (client_id) REFERENCES clients(id) 
                ON DELETE CASCADE ON UPDATE CASCADE
            `);
            console.log('✅ REGLA CORREGIDA: Ahora los clientes se pueden borrar (CASCADE activado).');

        } catch (fkError) {
            // Si falla aquí, suele ser porque la FK ya existe (si el DROP falló) o datos inconsistentes
            if (!fkError.message.includes("Duplicate")) {
                console.log('⚠️ No se pudo corregir automáticamente la FK:', fkError.message);
            }
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
