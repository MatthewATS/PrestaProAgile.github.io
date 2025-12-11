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

/**
 * POST /api/cash-closures/movement
 * Register a manual cash movement (add/withdraw)
 */
router.post('/movement', async (req, res) => {
    try {
        const { date, type, amount, reason } = req.body;
        // Import dynamically or assume it's passed in the require above. 
        // Better to update line 3 require.
        // For minimal diff, I will rely on updating line 3 in a separate edit or assume the user wants me to fix it.
        // Actually, I can just call the service function if I import it.
        const { registerCashMovement } = require('../services/cashClosureService');
        await registerCashMovement(date, type, amount, reason);
        res.json({ success: true, message: 'Movimiento registrado correctamente.' });
    } catch (err) {
        console.error("ERROR en POST /api/cash-closures/movement:", err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
