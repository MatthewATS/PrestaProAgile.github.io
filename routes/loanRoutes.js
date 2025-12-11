const express = require('express');
const router = express.Router();
const { getAllLoans, createLoan, deleteLoan } = require('../services/loanService');

/**
 * GET /api/loans
 * Get all loans with payments
 */
router.get('/', async (req, res) => {
    try {
        const loans = await getAllLoans();
        res.json(loans);
    } catch (err) {
        console.error("ERROR en GET /api/loans:", err);
        res.status(500).json({ error: 'Error al obtener los préstamos' });
    }
});

/**
 * POST /api/loans
 * Create a new loan
 */
router.post('/', async (req, res) => {
    try {
        const result = await createLoan(req.body);
        res.status(201).json(result);
    } catch (err) {
        console.error("ERROR en POST /api/loans:", err.message);

        if (err.message.includes('monto del préstamo')) {
            return res.status(400).json({ error: err.message });
        }
        if (err.message.includes('préstamo activo')) {
            return res.status(409).json({ error: err.message });
        }

        res.status(500).json({ error: 'Error interno al guardar en la base de datos.' });
    }
});

/**
 * DELETE /api/loans/:loanId
 * Delete a loan
 */
router.delete('/:loanId', async (req, res) => {
    const { loanId } = req.params;
    try {
        await deleteLoan(loanId);
        res.status(200).json({ message: 'Préstamo y pagos asociados eliminados correctamente.' });
    } catch (err) {
        console.error("ERROR en DELETE /api/loans/:loanId:", err);

        if (err.message.includes('no fue encontrado')) {
            return res.status(404).json({ error: err.message });
        }

        res.status(500).json({ error: 'Error en el servidor al intentar eliminar el préstamo.' });
    }
});

module.exports = router;
