const express = require('express');
const router = express.Router();
const { DNI_API_CONFIG } = require('../config/constants');

/**
 * GET /api/documento/:docId
 * Get document information (DNI or RUC)
 */
router.get('/:docId', async (req, res) => {
    const { docId } = req.params;
    const token = DNI_API_CONFIG.TOKEN;

    if (!token) {
        return res.status(500).json({ error: 'El token de la API de DNI no está configurado en el servidor.' });
    }

    let endpoint;
    let type;

    if (docId.length === 8) {
        endpoint = `${DNI_API_CONFIG.BASE_URL}/dni/${docId}`;
        type = 'DNI';
    } else if (docId.length === 11) {
        endpoint = `${DNI_API_CONFIG.BASE_URL}/ruc/${docId}`;
        type = 'RUC';
    } else {
        return res.status(400).json({ error: 'ID de documento inválido. Debe ser DNI (8 dígitos) o RUC (11 dígitos).' });
    }

    try {
        const apiResponse = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        const data = await apiResponse.json();

        if (type === 'RUC' && apiResponse.ok && data.razonSocial) {
            const mappedData = {
                nombres: data.razonSocial,
                apellidoPaterno: '',
                apellidoMaterno: '',
            };
            return res.status(200).json(mappedData);
        }

        res.status(apiResponse.status).json(data);
    } catch (error) {
        console.error(`ERROR en el proxy de ${type}:`, error);
        res.status(500).json({ error: `Error interno al consultar la API de ${type}.` });
    }
});

module.exports = router;
