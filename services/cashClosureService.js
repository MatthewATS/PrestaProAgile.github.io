const { pool } = require('../config/database');

/**
 * Create cash closure
 * @param {Object} closureData - Closure data
 */
async function createCashClosure(closureData) {
    const { closure_date, declared_amount, system_cash_amount, difference } = closureData;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [existing] = await connection.query(
            'SELECT id FROM cash_closures WHERE closure_date = ?',
            [closure_date]
        );

        if (existing.length > 0) {
            throw new Error('Ya existe un cierre de caja registrado para esta fecha.');
        }

        await connection.query(
            `INSERT INTO cash_closures (closure_date, declared_amount, system_cash_amount, difference, closed_by)
             VALUES (?, ?, ?, ?, 'admin')`,
            [closure_date, declared_amount, system_cash_amount, difference]
        );

        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

/**
 * Get cash closure history
 * @returns {Array} - Array of cash closures
 */
async function getCashClosureHistory() {
    const [rows] = await pool.query(
        'SELECT closure_date, declared_amount, system_cash_amount, difference, closed_at, closed_by FROM cash_closures ORDER BY closure_date DESC'
    );
    const history = rows.map(row => ({
        ...row,
        closed_at: new Date(row.closed_at).toISOString()
    }));

    return history;
}

/**
 * Get cash closure by date
 * @param {String} date - Date in YYYY-MM-DD format
 * @returns {Object} - Closure data or null
 */
async function getCashClosureByDate(date) {
    const [rows] = await pool.query(
        'SELECT id, closed_at, declared_amount, system_cash_amount, difference FROM cash_closures WHERE closure_date = ?',
        [date]
    );
    if (rows.length > 0) {
        rows[0].closed_at = new Date(rows[0].closed_at).toISOString();
        return { closed: true, data: rows[0] };
    }
    return { closed: false };
}

module.exports = {
    createCashClosure,
    getCashClosureHistory,
    getCashClosureByDate
};
