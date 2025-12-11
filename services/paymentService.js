const { pool } = require('../config/database');
const { calculateSchedule } = require('../utils/calculations');

/**
 * Register payment internally
 * @param {Number} loanId - Loan ID
 * @param {Object} paymentData - Payment data
 */
async function registerPaymentInternal(loanId, paymentData) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { payment_amount, payment_date, mora_amount, payment_method, correlativo_boleta, transaction_id } = paymentData;

        const finalMethod = payment_method || 'Flow/Transferencia';

        await connection.query(
            'INSERT INTO payments (loan_id, payment_amount, payment_date, mora_amount, payment_method, correlativo_boleta, transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [loanId, payment_amount, payment_date, mora_amount, finalMethod, correlativo_boleta, transaction_id]
        );

        const [paymentsRows] = await connection.query(
            'SELECT SUM(payment_amount - mora_amount) as totalPaidCI FROM payments WHERE loan_id = ?',
            [loanId]
        );
        const totalPaidCI = parseFloat(paymentsRows[0].totalPaidCI || 0);

        const [loanRows] = await connection.query('SELECT * FROM loans WHERE id = ?', [loanId]);
        const loan = loanRows[0];
        const { totalDue } = calculateSchedule(loan);

        if (totalPaidCI >= totalDue) {
            await connection.query("UPDATE loans SET status = 'Pagado' WHERE id = ?", [loanId]);
            console.log(`[PAYMENT INTERNAL] ✅ Préstamo ${loanId} marcado como PAGADO`);
        }

        await connection.commit();
        console.log(`[PAYMENT INTERNAL] ✅ Pago registrado exitosamente`);

    } catch (e) {
        await connection.rollback();
        console.error(`[PAYMENT INTERNAL ERROR]`, e);
        throw e;
    } finally {
        connection.release();
    }
}

/**
 * Get payments by loan ID
 * @param {Number} loanId - Loan ID
 * @returns {Array} - Array of payments
 */
async function getPaymentsByLoanId(loanId) {
    const [payments] = await pool.query(
        'SELECT * FROM payments WHERE loan_id = ? ORDER BY payment_date ASC',
        [loanId]
    );
    return payments;
}

/**
 * Get all payments
 * @returns {Array} - Array of all payments
 */
async function getAllPayments() {
    const [payments] = await pool.query(
        'SELECT loan_id, payment_amount, payment_date, mora_amount, payment_method, correlativo_boleta, transaction_id FROM payments ORDER BY payment_date ASC'
    );
    return payments;
}

module.exports = {
    registerPaymentInternal,
    getPaymentsByLoanId,
    getAllPayments
};
