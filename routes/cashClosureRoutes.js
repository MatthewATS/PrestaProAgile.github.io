const express = require('express');
const router = express.Router();
const { createCashClosure, getCashClosureHistory, getCashClosureByDate } = require('../services/cashClosureService');

/**
 * POST /api/cash-closures
 * Create a new cash closure
 */
router.post('/', async (req, res) => {
    try {
        await createCashClosure(req.body);
        res.status(201).json({ message: 'Cierre de caja registrado exitosamente.' });
    } catch (err) {
        console.error("ERROR en POST /api/cash-closures:", err.message);

        if (err.message.includes('Ya existe')) {
            return res.status(409).json({ error: err.message });
        }

        res.status(500).json({ error: 'Error al registrar el cierre en la base de datos.' });
    }
});

/**
 * GET /api/cash-closures/history
 * Get cash closure history
 */
router.get('/history', async (req, res) => {
    try {
        const history = await getCashClosureHistory();
        res.json(history);
    } catch (err) {
        console.error("ERROR en GET /api/cash-closures/history:", err.message);
        res.status(500).json({ error: 'Error al obtener el historial de cierres.' });
    }
});

/**
 * GET /api/cash-closures/:date
 * Get cash closure by date
 */
router.get('/:date', async (req, res) => {
    const { date } = req.params;
    try {
        const result = await getCashClosureByDate(date);
        res.json(result);
    } catch (err) {
        console.error("ERROR en GET /api/cash-closures/:date:", err.message);
        res.status(500).json({ error: 'Error al consultar el cierre de caja.' });
    }
});

module.exports = router;
