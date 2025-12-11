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

        // Validate it was opened first?
        const [opening] = await connection.query(
            'SELECT id FROM cash_openings WHERE opening_date = ?',
            [closure_date]
        );
        if (opening.length === 0) {
            throw new Error('No se puede cerrar una caja que no ha sido abierta.');
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
 * Open cash register
 * @param {Object} openingData
 */
async function openCashRegister(openingData) {
    const { opening_date, initial_amount } = openingData;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Check if already open
        const [existing] = await connection.query(
            'SELECT id FROM cash_openings WHERE opening_date = ?',
            [opening_date]
        );

        if (existing.length > 0) {
            throw new Error('La caja ya está abierta para esta fecha.');
        }

        // Check if already closed
        const [closed] = await connection.query(
            'SELECT id FROM cash_closures WHERE closure_date = ?',
            [opening_date]
        );
        if (closed.length > 0) {
            throw new Error('La caja ya fue cerrada para esta fecha. No se puede reabrir.');
        }

        await connection.query(
            `INSERT INTO cash_openings (opening_date, initial_amount, opened_by)
             VALUES (?, ?, 'admin')`,
            [opening_date, initial_amount]
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
 * Get cash status for a specific date
 * @param {String} date - YYYY-MM-DD
 */
async function getCashStatus(date) {
    const [openRows] = await pool.query(
        'SELECT * FROM cash_openings WHERE opening_date = ?',
        [date]
    );
    const [closeRows] = await pool.query(
        'SELECT * FROM cash_closures WHERE closure_date = ?',
        [date]
    );

    let status = 'pending'; // Default: Not opened
    let initialAmount = 0;

    if (openRows.length > 0) {
        status = 'open';
        initialAmount = parseFloat(openRows[0].initial_amount);
    }

    if (closeRows.length > 0) {
        status = 'closed';
    }

    return {
        status,
        date,
        initialAmount,
        openingData: openRows[0] || null,
        closureData: closeRows[0] || null
    };
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
 * Get cash closure by date (Legacy wrapper, mapped to getCashStatus logic partially or kept simple)
 * Keeping it for compatibility if used elsewhere, but updating logic slightly
 */
async function getCashClosureByDate(date) {
    return getCashStatus(date);
}

module.exports = {
    createCashClosure,
    openCashRegister,
    getCashClosureHistory,
    getCashClosureByDate,
    getCashStatus
};
