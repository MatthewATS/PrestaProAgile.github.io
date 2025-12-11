const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { registerPaymentInternal } = require('../services/paymentService');
const { getLoanById } = require('../services/loanService');
const { calculateSchedule } = require('../utils/calculations');
const { getNextCorrelativo, generateTransactionId } = require('../utils/helpers');

/**
 * POST /api/loans/:loanId/payments
 * Register a payment for a loan
 */
router.post('/:loanId/payments', async (req, res) => {
    const { loanId } = req.params;
    const { payment_amount, payment_date, mora_amount, payment_method } = req.body;

    const totalPayment = parseFloat(payment_amount);
    const moraToRegister = parseFloat(mora_amount || 0);
    const CiPayment = totalPayment - moraToRegister;

    if (totalPayment <= 0 || !payment_date || CiPayment < 0) {
        return res.status(400).json({ error: 'Monto de pago inválido o fecha faltante.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const loan = await getLoanById(loanId);

        const [paymentsRows] = await connection.query(
            'SELECT SUM(payment_amount - mora_amount) as totalPaidCI FROM payments WHERE loan_id = ?',
            [loanId]
        );
        const totalPaidCI = parseFloat(paymentsRows[0].totalPaidCI || 0);
        const { totalDue } = calculateSchedule(loan);

        const remainingBalanceCI = totalDue - totalPaidCI;
        const roundedRemainingBalanceCI = parseFloat(remainingBalanceCI.toFixed(2));

        if (CiPayment > roundedRemainingBalanceCI) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                error: `El pago (Capital/Interés) de S/ ${CiPayment.toFixed(2)} excede el saldo pendiente de S/ ${roundedRemainingBalanceCI.toFixed(2)}.`
            });
        }

        const correlativo = await getNextCorrelativo(connection);
        const transactionId = generateTransactionId();

        await registerPaymentInternal(loanId, {
            payment_amount: totalPayment,
            payment_date,
            mora_amount: moraToRegister,
            payment_method,
            correlativo_boleta: correlativo,
            transaction_id: transactionId
        });

        await connection.commit();
        res.status(201).json({
            message: 'Pago registrado con éxito',
            correlativo_boleta: correlativo,
            transaction_id: transactionId
        });

    } catch (err) {
        await connection.rollback();
        console.error("ERROR en POST /api/loans/:loanId/payments:", err);

        if (err.message.includes('no encontrado')) {
            return res.status(404).json({ error: err.message });
        }

        res.status(500).json({ error: 'Error al registrar el pago.' });
    } finally {
        connection.release();
    }
});

module.exports = router;
