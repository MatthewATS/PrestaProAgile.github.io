const express = require('express');
const router = express.Router();
const { createCashClosure, openCashRegister, getCashClosureHistory, getCashClosureByDate, getCashStatus } = require('../services/cashClosureService');

/**
 * POST /api/cash-closures/open
 * Open cash register for a specific date
 */
router.post('/open', async (req, res) => {
    try {
        await openCashRegister(req.body); // { opening_date, initial_amount }
        res.status(201).json({ message: 'Caja abierta exitosamente.' });
    } catch (err) {
        console.error("ERROR en POST /api/cash-closures/open:", err.message);
        if (err.message.includes('ya está abierta') || err.message.includes('ya fue cerrada')) {
            return res.status(409).json({ error: err.message });
        }
        res.status(500).json({ error: 'Error al abrir la caja.' });
    }
});

/**
 * GET /api/cash-closures/status/:date
 * Get detailed status (open, closed, pending)
 */
router.get('/status/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const status = await getCashStatus(date);
        res.json(status);
    } catch (err) {
        console.error("ERROR en GET /api/cash-closures/status/:date:", err.message);
        res.status(500).json({ error: 'Error al consultar estado de caja.' });
    }
});

/**
 * POST /api/cash-closures
 * Create a new cash closure (Close the box)
 */
router.post('/', async (req, res) => {
    try {
        await createCashClosure(req.body);
        res.status(201).json({ message: 'Cierre de caja registrado exitosamente.' });
    } catch (err) {
        console.error("ERROR en POST /api/cash-closures:", err.message);

        if (err.message.includes('Ya existe') || err.message.includes('no ha sido abierta')) {
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
 * LEGACY/COMPATIBILITY: Get cash closure by date
 */
router.get('/:date', async (req, res) => {
    const { date } = req.params;
    try {
        const result = await getCashStatus(date);
        // Map to old format expected by some older logic if any: { closed: boolean, data: ... }
        if (result.status === 'closed') {
            res.json({ closed: true, data: result.closureData });
        } else {
            res.json({ closed: false });
        }
    } catch (err) {
        console.error("ERROR en GET /api/cash-closures/:date:", err.message);
        res.status(500).json({ error: 'Error al consultar el cierre de caja.' });
    }
});

module.exports = router;
