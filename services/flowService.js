const axios = require('axios');
const querystring = require('querystring');
const { FLOW_CONFIG, SERVER_CONFIG } = require('../config/constants');
const { generateFlowSignature, verifyFlowSignature } = require('../utils/helpers');

/**
 * Create Flow payment order
 * @param {Object} orderData - Order data
 * @returns {Object} - Flow payment response
 */
async function createFlowPayment(orderData) {
    const { amount, commerceOrder, subject, email, urlConfirmation, urlReturn, optional } = orderData;

    // 🚨 MODO DESARROLLO: Simular Flow si estamos en localhost
    const isDevelopment = SERVER_CONFIG.NODE_ENV === 'development' ||
        SERVER_CONFIG.BACKEND_URL.includes('localhost') ||
        SERVER_CONFIG.BACKEND_URL.includes('127.0.0.1');

    if (isDevelopment) {
        console.log('[FLOW DEV MODE] 🔧 Modo desarrollo activado - Simulando Flow');
        console.log('[FLOW DEV MODE] 📦 Datos de la orden:', {
            amount,
            commerceOrder,
            subject,
            currency: 'PEN'
        });

        // Simular respuesta de Flow
        const mockToken = `DEV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const mockFlowOrder = `MOCK-${Date.now()}`;

        // Crear URL simulada que apunta a una página de confirmación local
        const mockUrl = `${SERVER_CONFIG.BACKEND_URL}/flow-simulator?token=${mockToken}&amount=${amount}&order=${commerceOrder}`;

        console.log('[FLOW DEV MODE] ✅ Orden simulada creada:', {
            token: mockToken,
            flowOrder: mockFlowOrder,
            url: mockUrl
        });

        return {
            success: true,
            url: mockUrl,
            token: mockToken,
            flowOrder: mockFlowOrder,
            isDevelopment: true
        };
    }

    // 🚨 MODO PRODUCCIÓN: Usar Flow real
    const params = {
        apiKey: FLOW_CONFIG.API_KEY,
        commerceOrder: commerceOrder,
        subject: subject,
        currency: 'PEN', // Soles Peruanos
        amount: Math.round(amount), // Flow espera el monto en unidades enteras
        email: email || 'cliente@prestapro.com',
        paymentMethod: 9, // 9 = Todos los métodos disponibles
        urlConfirmation: urlConfirmation || `${SERVER_CONFIG.BACKEND_URL}/api/flow/webhook`,
        urlReturn: urlReturn || `${SERVER_CONFIG.BACKEND_URL}/payment-success`
    };

    // Agregar parámetros opcionales si existen
    if (optional) {
        params.optional = optional;
    }

    // Generate signature según documentación Flow
    const signature = generateFlowSignature(params, FLOW_CONFIG.SECRET_KEY);
    params.s = signature;

    console.log('[FLOW PRODUCTION] 📤 Enviando solicitud a Flow API:', {
        endpoint: `${FLOW_CONFIG.API_URL}/payment/create`,
        commerceOrder: params.commerceOrder,
        amount: params.amount,
        currency: params.currency
    });

    try {
        // 🚨 CRÍTICO: Flow requiere application/x-www-form-urlencoded
        const response = await axios({
            method: 'POST',
            url: `${FLOW_CONFIG.API_URL}/payment/create`,
            data: querystring.stringify(params),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('[FLOW PRODUCTION] 📥 Respuesta de Flow:', response.data);

        if (response.data && response.data.url && response.data.token) {
            return {
                success: true,
                url: `${response.data.url}?token=${response.data.token}`,
                token: response.data.token,
                flowOrder: response.data.flowOrder,
                isDevelopment: false
            };
        } else {
            throw new Error('Respuesta inválida de Flow');
        }
    } catch (error) {
        console.error('[FLOW PRODUCTION ERROR] Error al crear pago:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });

        const errorMessage = error.response?.data?.message || error.response?.data || error.message;
        throw new Error('Error al crear el pago con Flow: ' + errorMessage);
    }
}

/**
 * Get Flow payment status
 * @param {String} token - Flow payment token
 * @returns {Object} - Payment status
 */
async function getFlowPaymentStatus(token) {
    const params = {
        apiKey: FLOW_CONFIG.API_KEY,
        token: token
    };

    const signature = generateFlowSignature(params, FLOW_CONFIG.SECRET_KEY);
    params.s = signature;

    try {
        const response = await axios.get(
            `${FLOW_CONFIG.API_URL}/payment/getStatus`,
            { params }
        );

        return response.data;
    } catch (error) {
        console.error('[FLOW ERROR] Error al obtener estado del pago:', error.response?.data || error.message);
        throw new Error('Error al obtener el estado del pago');
    }
}

/**
 * Verify Flow webhook signature
 * @param {Object} data - Webhook data
 * @returns {Boolean} - True if signature is valid
 */
function verifyFlowWebhook(data) {
    const { s, ...params } = data;
    return verifyFlowSignature(params, s, FLOW_CONFIG.SECRET_KEY);
}

module.exports = {
    createFlowPayment,
    getFlowPaymentStatus,
    verifyFlowWebhook
};
