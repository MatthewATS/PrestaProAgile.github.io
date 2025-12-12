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
            // Update existing closure
            await connection.query(
                `UPDATE cash_closures 
                 SET declared_amount = ?, system_cash_amount = ?, difference = ?, closed_at = CURRENT_TIMESTAMP, closed_by = 'admin'
                 WHERE closure_date = ?`,
                [declared_amount, system_cash_amount, difference, closure_date]
            );
        } else {
            // Insert new closure
            await connection.query(
                `INSERT INTO cash_closures (closure_date, declared_amount, system_cash_amount, difference, closed_by)
                 VALUES (?, ?, ?, ?, 'admin')`,
                [closure_date, declared_amount, system_cash_amount, difference]
            );
        }

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
/**
 * Get cash closure by date
 * @param {String} date - Date in YYYY-MM-DD format
 * @returns {Object} - Closure data or null
 */
async function getCashClosureByDate(date) {
    const [rows] = await pool.query(
        'SELECT id, closed_at, declared_amount, system_cash_amount, difference, opening_balance, added_money, withdrawn_money FROM cash_closures WHERE closure_date = ?',
        [date]
    );
    if (rows.length > 0) {
        // Only return closed=true if closed_at is not null (which it is by default if the row exists? No, createCashClosure inserts it.
        // Wait, if we use cash_closures table for daily balance even BEFORE closing, we need to distinguish closed vs open.
        // Usually 'closed_at' is set on INSERT in createCashClosure? No, database defaults? 
        // createCashClosure inserts `closed_by` and others.
        // We should allow pre-creating the row for movement tracking.

        const isClosed = rows[0].declared_amount !== null; // Hack: if declared_amount is null, it's just movements. But createCashClosure requires declared_amount.

        // Actually, let's keep it simple: If createCashClosure was called, it's closed.
        // But if registerCashMovement makes a row, it might not be closed.
        // We'll trust client side logic or check if 'closed_at' exists if we modify createCashClosure.
        // For now, let's assume if it exists, it returns data.

        const data = rows[0];
        if (data.closed_at) { // Assuming closed_at is timestamp
            try { data.closed_at = new Date(data.closed_at).toISOString(); } catch (e) { }
            return { closed: true, data: data };
        } else {
            // It's a row just for movements, not closed yet.
            return { closed: false, data: data };
        }
    }
    return { closed: false, data: { opening_balance: 0, added_money: 0, withdrawn_money: 0 } };
}

/**
 * Register manual cash movement
 */
async function registerCashMovement(date, type, amount, reason) {
    const connection = await pool.getConnection();
    try {
        // Check if row exists
        const [existing] = await connection.query('SELECT id, closed_at FROM cash_closures WHERE closure_date = ?', [date]);

        if (existing.length === 0) {
            // Create row
            // Create row with all fields initialized
            let insertQuery = `INSERT INTO cash_closures (closure_date, opening_balance, added_money, withdrawn_money, declared_amount, system_cash_amount, difference) VALUES (?, 0, 0, 0, 0, 0, 0)`;
            if (type === 'add') insertQuery = `INSERT INTO cash_closures (closure_date, opening_balance, added_money, withdrawn_money, declared_amount, system_cash_amount, difference) VALUES (?, 0, ?, 0, 0, 0, 0)`;
            if (type === 'withdraw') insertQuery = `INSERT INTO cash_closures (closure_date, opening_balance, added_money, withdrawn_money, declared_amount, system_cash_amount, difference) VALUES (?, 0, 0, ?, 0, 0, 0)`;

            await connection.query(insertQuery, [date, amount]);
        } else {
            // Update row
            if (existing[0].closed_at) { // If it has a date, it might be closed. But user wanted "editable".
                // We allow updating added_money even if closed? Or maybe reset closing?
                // The user said: "each closure can be editable to register more payments in the day or add money".
                // So we allow it.
            }

            if (type === 'add') {
                await connection.query('UPDATE cash_closures SET added_money = added_money + ? WHERE closure_date = ?', [amount, date]);
            } else if (type === 'withdraw') {
                await connection.query('UPDATE cash_closures SET withdrawn_money = withdrawn_money + ? WHERE closure_date = ?', [amount, date]);
            }
        }
    } finally {
        connection.release();
    }
}

/**
 * Open cash register with initial balance
 * @param {String} date - Date in YYYY-MM-DD format
 * @param {Number} openingBalance - Initial balance
 */
async function openCashRegister(date, openingBalance) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Check if there's already an open register
        const [openRegisters] = await connection.query(
            'SELECT id FROM cash_closures WHERE is_open = 1 OR is_open = TRUE'
        );

        if (openRegisters.length > 0) {
            throw new Error('Ya existe una caja abierta. Debe cerrarla antes de abrir una nueva.');
        }

        // Check if register exists for this date
        const [existing] = await connection.query(
            'SELECT id FROM cash_closures WHERE closure_date = ?',
            [date]
        );

        if (existing.length > 0) {
            // Update existing register
            await connection.query(
                `UPDATE cash_closures 
                 SET is_open = 1, opening_balance = ?, closed_at = NULL, declared_amount = 0, 
                     system_cash_amount = 0, difference = 0
                 WHERE closure_date = ?`,
                [openingBalance, date]
            );
        } else {
            // Create new register - use explicit column names
            await connection.query(
                `INSERT INTO cash_closures 
                 (closure_date, opening_balance, is_open, added_money, withdrawn_money, declared_amount, system_cash_amount, difference) 
                 VALUES (?, ?, 1, 0, 0, 0, 0, 0)`,
                [date, openingBalance]
            );
        }

        await connection.commit();
    } catch (err) {
        await connection.rollback();
        console.error('Error en openCashRegister:', err);
        throw err;
    } finally {
        connection.release();
    }
}

/**
 * Close cash register
 * @param {String} date - Date in YYYY-MM-DD format
 */
async function closeCashRegister(date) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [existing] = await connection.query(
            'SELECT id, is_open FROM cash_closures WHERE closure_date = ?',
            [date]
        );

        if (existing.length === 0) {
            throw new Error('No existe un registro de caja para esta fecha.');
        }

        if (!existing[0].is_open || existing[0].is_open === 0) {
            throw new Error('La caja ya está cerrada.');
        }

        await connection.query(
            'UPDATE cash_closures SET is_open = 0 WHERE closure_date = ?',
            [date]
        );

        await connection.commit();
    } catch (err) {
        await connection.rollback();
        console.error('Error en closeCashRegister:', err);
        throw err;
    } finally {
        connection.release();
    }
}

/**
 * Get current cash register status
 * @returns {Object} - Status object with isOpen and current date
 */
async function getCashRegisterStatus() {
    const [rows] = await pool.query(
        `SELECT closure_date, is_open, opening_balance, added_money, withdrawn_money 
         FROM cash_closures 
         WHERE is_open = 1 OR is_open = TRUE
         LIMIT 1`
    );

    if (rows.length > 0) {
        return {
            isOpen: true,
            date: rows[0].closure_date,
            openingBalance: parseFloat(rows[0].opening_balance || 0),
            addedMoney: parseFloat(rows[0].added_money || 0),
            withdrawnMoney: parseFloat(rows[0].withdrawn_money || 0)
        };
    }

    return { isOpen: false };
}

/**
 * Get available cash balance for a specific date
 * @param {String} date - Date in YYYY-MM-DD format
 * @returns {Number} - Available cash balance
 */
async function getAvailableCashBalance(date) {
    const connection = await pool.getConnection();
    try {
        // Get cash register data
        const [cashData] = await connection.query(
            `SELECT opening_balance, added_money, withdrawn_money 
             FROM cash_closures 
             WHERE closure_date = ?`,
            [date]
        );

        const openingBalance = cashData.length > 0 ? parseFloat(cashData[0].opening_balance || 0) : 0;
        const addedMoney = cashData.length > 0 ? parseFloat(cashData[0].added_money || 0) : 0;
        const withdrawnMoney = cashData.length > 0 ? parseFloat(cashData[0].withdrawn_money || 0) : 0;

        // Get cash payments for the day
        const [payments] = await connection.query(
            `SELECT SUM(payment_amount) as total_cash 
             FROM payments 
             WHERE DATE(payment_date) = ? AND payment_method = 'Efectivo'`,
            [date]
        );

        const cashIncome = payments.length > 0 ? parseFloat(payments[0].total_cash || 0) : 0;

        // Calculate available balance
        const availableBalance = openingBalance + addedMoney + cashIncome - withdrawnMoney;

        return availableBalance;
    } finally {
        connection.release();
    }
}

module.exports = {
    createCashClosure,
    getCashClosureHistory,
    getCashClosureByDate,
    registerCashMovement,
    openCashRegister,
    closeCashRegister,
    getCashRegisterStatus,
    getAvailableCashBalance
};
