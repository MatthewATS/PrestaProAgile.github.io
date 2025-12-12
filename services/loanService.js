const { pool } = require('../config/database');
const { calculateSchedule, calculateMora } = require('../utils/calculations');

/**
 * Get all loans with payments
 * @returns {Array} - Array of loans with payment information
 */
async function getAllLoans() {
    const loanQuery = `
        SELECT
            l.id, l.monto, l.interes, l.fecha, l.plazo, l.status,
            l.tipo_calculo, l.meses_solo_interes,
            c.dni, c.nombres, c.apellidos, c.is_pep
        FROM loans l
                 JOIN clients c ON l.client_id = c.id
        ORDER BY l.fecha DESC, l.id DESC;
    `;
    const [loans] = await pool.query(loanQuery);

    const [payments] = await pool.query(
        'SELECT loan_id, payment_amount, payment_date, mora_amount, payment_method, correlativo_boleta, transaction_id FROM payments ORDER BY payment_date ASC'
    );

    const loansWithPayments = loans.map(loan => {
        const { totalDue } = calculateSchedule(loan);
        loan.total_due = totalDue;

        const associatedPayments = payments.filter(p => p.loan_id === loan.id);

        // Since payment_amount in DB is the Gross Total (incl. IGV), we must strip IGV to compare with Loan Schedule (Net)
        const totalPaidCI = associatedPayments.reduce((sum, p) => sum + ((parseFloat(p.payment_amount) - (parseFloat(p.mora_amount) || 0)) / 1.18), 0);
        loan.total_paid = parseFloat(totalPaidCI.toFixed(2));

        loan.mora_pendiente = calculateMora(loan, loan.total_paid, associatedPayments);


        if (loan.total_paid >= loan.total_due) {
            loan.status = 'Pagado';
        } else if (loan.mora_pendiente > 0) {
            loan.status = 'Atrasado';
        } else {
            loan.status = 'Activo';
        }

        return {
            ...loan,
            payments: associatedPayments,
        };
    });

    return loansWithPayments;
}

/**
 * Create a new loan
 * @param {Object} loanData - Loan data
 * @returns {Object} - Created loan data
 */
async function createLoan(loanData) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            client,
            monto,
            interes_anual,
            fecha,
            plazo,
            status,
            declaracion_jurada = false,
            tipo_calculo = 'Amortizado',
            meses_solo_interes = 0
        } = loanData;

        const parsedMonto = parseFloat(monto);

        const { dni, nombres, apellidos, is_pep = false } = client;
        const interes = parseFloat(interes_anual) / 12.5;

        if (parsedMonto < 1 || parsedMonto > 200000 || isNaN(parsedMonto)) {
            throw new Error('El monto del préstamo debe ser un número válido entre S/ 1 y S/ 200,000.');
        }

        let [activeLoans] = await connection.query(
            `SELECT l.id FROM loans l JOIN clients c ON l.client_id = c.id WHERE c.dni = ? AND l.status = 'Activo' LIMIT 1;`,
            [dni]
        );

        if (activeLoans.length > 0) {
            throw new Error('El cliente ya tiene un préstamo activo.');
        }

        let [existingClient] = await connection.query('SELECT id FROM clients WHERE dni = ?', [dni]);
        let clientId;

        if (existingClient.length > 0) {
            clientId = existingClient[0].id;
            await connection.query(
                'UPDATE clients SET nombres = ?, apellidos = ?, is_pep = ? WHERE id = ?',
                [nombres, apellidos, is_pep, clientId]
            );
        } else {
            const [result] = await connection.query(
                'INSERT INTO clients (dni, nombres, apellidos, is_pep) VALUES (?, ?, ?, ?)',
                [dni, nombres, apellidos, is_pep]
            );
            clientId = result.insertId;
        }

        await connection.query(
            `INSERT INTO loans (client_id, monto, interes, fecha, plazo, status, declaracion_jurada, tipo_calculo, meses_solo_interes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [clientId, parsedMonto, interes, fecha, plazo, status, declaracion_jurada, tipo_calculo, meses_solo_interes]
        );

        await connection.commit();
        return { ...loanData, client_id: clientId };

    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

/**
 * Delete a loan
 * @param {Number} loanId - Loan ID
 */
async function deleteLoan(loanId) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM payments WHERE loan_id = ?', [loanId]);
        const [result] = await connection.query('DELETE FROM loans WHERE id = ?', [loanId]);

        if (result.affectedRows === 0) {
            throw new Error('Préstamo no fue encontrado.');
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
 * Get loan by ID
 * @param {Number} loanId - Loan ID
 * @returns {Object} - Loan object
 */
async function getLoanById(loanId) {
    const [loanRows] = await pool.query('SELECT * FROM loans WHERE id = ?', [loanId]);
    if (loanRows.length === 0) {
        throw new Error('Préstamo no encontrado.');
    }
    return loanRows[0];
}

module.exports = {
    getAllLoans,
    createLoan,
    deleteLoan,
    getLoanById
};
