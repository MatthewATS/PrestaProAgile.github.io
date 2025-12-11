const express = require('express');
const router = express.Router();
const { createFlowPayment, getFlowPaymentStatus, verifyFlowWebhook } = require('../services/flowService');
const { registerPaymentInternal } = require('../services/paymentService');
const { pool } = require('../config/database');
const { getNextCorrelativo } = require('../utils/helpers');

/**
 * POST /api/flow/create-order
 * Create a Flow payment order
 */
router.post('/create-order', async (req, res) => {
    console.log('[FLOW] 📥 Recibida solicitud de creación de orden:', req.body);

    const { amount, loanId, clientDni, payment_date, amount_ci, amount_mora } = req.body;

    if (!amount || !loanId || !clientDni) {
        console.error('[FLOW ERROR] ❌ Faltan campos requeridos');
        return res.status(400).json({
            success: false,
            error: 'Faltan campos requeridos: amount, loanId, clientDni'
        });
    }

    try {
        // Get correlativo and transaction ID
        const connection = await pool.getConnection();
        const correlativo_boleta = await getNextCorrelativo(connection);
        connection.release();

        const totalAmount = parseFloat(amount);

        // Create Flow payment
        const orderData = {
            amount: totalAmount,
            commerceOrder: `LOAN-${loanId}-${correlativo_boleta}`,
            subject: `Pago de Préstamo #${loanId}`,
            email: `cliente-${clientDni}@prestapro.com`,
            // Optional: Add custom parameters for webhook
            optional: JSON.stringify({
                loanId,
                correlativo_boleta,
                amount_mora: amount_mora || 0,
                payment_date: payment_date || new Date().toISOString().split('T')[0]
            })
        };

        const flowResponse = await createFlowPayment(orderData);

        if (flowResponse.success) {
            console.log('[FLOW] ✅ Orden de pago creada exitosamente');
            return res.json({
                success: true,
                url: flowResponse.url,
                token: flowResponse.token,
                flowOrder: flowResponse.flowOrder,
                correlativo_boleta: correlativo_boleta
            });
        } else {
            throw new Error('Error al crear la orden de pago');
        }
    } catch (error) {
        console.error('[FLOW ERROR] ❌ Error al crear orden:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error interno al generar la orden de pago.'
        });
    }
});

/**
 * POST /api/flow/webhook
 * Flow webhook for payment notifications
 */
router.post('/webhook', async (req, res) => {
    console.log('[FLOW WEBHOOK] 📥 Notificación recibida:', JSON.stringify(req.body, null, 2));

    // Respond immediately to Flow
    res.status(200).send('OK');

    try {
        // Verify signature
        const isValid = verifyFlowWebhook(req.body);

        if (!isValid) {
            console.error('[FLOW WEBHOOK ERROR] ❌ Firma de seguridad no válida');
            return;
        }

        console.log('[FLOW WEBHOOK] ✅ Firma válida');

        const { token } = req.body;

        if (!token) {
            console.error('[FLOW WEBHOOK ERROR] ❌ Token no proporcionado');
            return;
        }

        // Get payment status from Flow
        console.log('[FLOW WEBHOOK] 🔍 Consultando estado del pago con token:', token);
        const paymentStatus = await getFlowPaymentStatus(token);

        console.log('[FLOW WEBHOOK] 📊 Estado del pago completo:', JSON.stringify(paymentStatus, null, 2));

        // Process if payment was successful
        if (paymentStatus.status === 2) { // Status 2 = Paid in Flow
            console.log('[FLOW WEBHOOK] ✅ Pago APROBADO');

            // Extraer loanId y correlativo del commerceOrder
            // Formato: LOAN-{loanId}-{correlativo}
            const commerceOrder = paymentStatus.commerceOrder || '';
            const match = commerceOrder.match(/LOAN-(\d+)-(\d+)/);

            let loanId, correlativo_boleta;

            if (match) {
                loanId = parseInt(match[1]);
                correlativo_boleta = parseInt(match[2]);
                console.log('[FLOW WEBHOOK] 📝 Datos extraídos del commerceOrder:', { loanId, correlativo_boleta });
            }

            // También intentar obtener de metadata opcional
            let metadata = {};
            try {
                if (paymentStatus.optional) {
                    metadata = JSON.parse(paymentStatus.optional);
                    console.log('[FLOW WEBHOOK] 📦 Metadata opcional:', metadata);

                    // Usar metadata si no se pudo extraer del commerceOrder
                    if (!loanId && metadata.loanId) {
                        loanId = parseInt(metadata.loanId);
                    }
                    if (!correlativo_boleta && metadata.correlativo_boleta) {
                        correlativo_boleta = parseInt(metadata.correlativo_boleta);
                    }
                }
            } catch (e) {
                console.error('[FLOW WEBHOOK] ⚠️ Error al parsear metadata:', e);
            }

            const amountMora = parseFloat(metadata.amount_mora || 0);
            const paymentDate = metadata.payment_date || new Date().toISOString().split('T')[0];
            const totalAmount = parseFloat(paymentStatus.amount);

            console.log('[FLOW WEBHOOK] 💰 Datos del pago:', {
                loanId,
                correlativo_boleta,
                totalAmount,
                amountMora,
                paymentDate
            });

            if (loanId && correlativo_boleta) {
                const paymentDataToRegister = {
                    payment_amount: totalAmount,
                    mora_amount: amountMora,
                    payment_date: paymentDate,
                    payment_method: 'Flow',
                    correlativo_boleta: correlativo_boleta,
                    transaction_id: paymentStatus.flowOrder || token
                };

                console.log('[FLOW WEBHOOK] 💾 Registrando pago:', paymentDataToRegister);

                await registerPaymentInternal(loanId, paymentDataToRegister);

                console.log(`[FLOW WEBHOOK] ✅✅✅ PAGO REGISTRADO EXITOSAMENTE`);
                console.log(`[FLOW WEBHOOK] 📋 Préstamo ID: ${loanId}`);
                console.log(`[FLOW WEBHOOK] 🧾 Boleta N°: ${String(correlativo_boleta).padStart(8, '0')}`);
                console.log(`[FLOW WEBHOOK] 💵 Monto: S/ ${totalAmount.toFixed(2)}`);
            } else {
                console.error('[FLOW WEBHOOK ERROR] ❌ No se pudo extraer loanId o correlativo_boleta');
                console.error('[FLOW WEBHOOK ERROR] commerceOrder:', commerceOrder);
                console.error('[FLOW WEBHOOK ERROR] metadata:', metadata);
            }
        } else {
            console.log(`[FLOW WEBHOOK] ℹ️ Pago no aprobado. Estado: ${paymentStatus.status}`);
            console.log('[FLOW WEBHOOK] Estados Flow: 1=Pendiente, 2=Pagado, 3=Rechazado, 4=Anulado');
        }
    } catch (error) {
        console.error('[FLOW WEBHOOK ERROR] ❌ Error procesando webhook:', error);
        console.error('[FLOW WEBHOOK ERROR] Stack:', error.stack);
    }
});

/**
 * GET /api/flow/status/:token
 * Get Flow payment status
 */
router.get('/status/:token', async (req, res) => {
    const { token } = req.params;

    try {
        const status = await getFlowPaymentStatus(token);
        res.json(status);
    } catch (error) {
        console.error('[FLOW ERROR] Error al obtener estado:', error);
        res.status(500).json({ error: 'Error al obtener el estado del pago' });
    }
});

/**
 * GET /flow-simulator
 * Simulador de Flow para desarrollo local
 */
router.get('/flow-simulator', async (req, res) => {
    const { token, amount, order } = req.query;

    console.log('[FLOW SIMULATOR] 🎭 Página de simulación de pago abierta');

    // Página HTML simple para simular Flow
    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Flow Simulator - Desarrollo</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .container {
                background: white;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                max-width: 500px;
                width: 100%;
                padding: 40px;
                text-align: center;
            }
            .logo {
                font-size: 48px;
                margin-bottom: 20px;
            }
            h1 {
                color: #333;
                margin-bottom: 10px;
                font-size: 24px;
            }
            .dev-badge {
                background: #fbbf24;
                color: #78350f;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: bold;
                display: inline-block;
                margin-bottom: 30px;
            }
            .amount {
                font-size: 48px;
                font-weight: bold;
                color: #667eea;
                margin: 30px 0;
            }
            .info {
                background: #f3f4f6;
                padding: 20px;
                border-radius: 10px;
                margin: 20px 0;
                text-align: left;
            }
            .info-row {
                display: flex;
                justify-content: space-between;
                padding: 10px 0;
                border-bottom: 1px solid #e5e7eb;
            }
            .info-row:last-child {
                border-bottom: none;
            }
            .info-label {
                color: #6b7280;
                font-size: 14px;
            }
            .info-value {
                color: #111827;
                font-weight: 600;
                font-size: 14px;
            }
            .buttons {
                display: flex;
                gap: 15px;
                margin-top: 30px;
            }
            button {
                flex: 1;
                padding: 16px;
                border: none;
                border-radius: 10px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s;
            }
            .btn-success {
                background: #10b981;
                color: white;
            }
            .btn-success:hover {
                background: #059669;
                transform: translateY(-2px);
                box-shadow: 0 10px 20px rgba(16, 185, 129, 0.3);
            }
            .btn-cancel {
                background: #ef4444;
                color: white;
            }
            .btn-cancel:hover {
                background: #dc2626;
                transform: translateY(-2px);
                box-shadow: 0 10px 20px rgba(239, 68, 68, 0.3);
            }
            .note {
                margin-top: 20px;
                padding: 15px;
                background: #fef3c7;
                border-left: 4px solid #f59e0b;
                border-radius: 5px;
                font-size: 13px;
                color: #92400e;
                text-align: left;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">🎭</div>
            <h1>Simulador de Pago Flow</h1>
            <div class="dev-badge">🔧 MODO DESARROLLO</div>

            <div class="amount">S/ ${parseFloat(amount).toFixed(2)}</div>

            <div class="info">
                <div class="info-row">
                    <span class="info-label">Orden de Comercio</span>
                    <span class="info-value">${order}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Token</span>
                    <span class="info-value">${token.substring(0, 20)}...</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Moneda</span>
                    <span class="info-value">PEN (Soles)</span>
                </div>
            </div>

            <div class="buttons">
                <button class="btn-success" onclick="simulateSuccess()">
                    ✅ Simular Pago Exitoso
                </button>
                <button class="btn-cancel" onclick="simulateCancel()">
                    ❌ Cancelar Pago
                </button>
            </div>

            <div class="note">
                <strong>⚠️ Nota:</strong> Este es un simulador para desarrollo local.
                En producción, se usará la pasarela real de Flow.
            </div>
        </div>

        <script>
            function simulateSuccess() {
                alert('✅ Pago simulado exitosamente!\\n\\nEn desarrollo, el webhook se llamará automáticamente.\\n\\nCierra esta ventana y verifica que el pago se haya registrado.');

                // Llamar al webhook simulado
                fetch('/api/flow/webhook-simulator', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token: '${token}',
                        status: 2,
                        amount: ${amount},
                        flowOrder: 'MOCK-${Date.now()}',
                        commerceOrder: '${order}'
                    })
                }).then(() => {
                    window.close();
                });
            }

            function simulateCancel() {
                alert('❌ Pago cancelado');
                window.close();
            }
        </script>
    </body>
    </html>
    `;

    res.send(html);
});

/**
 * POST /api/flow/webhook-simulator
 * Simulador de webhook para desarrollo
 */
router.post('/webhook-simulator', async (req, res) => {
    console.log('[FLOW SIMULATOR] 📥 Webhook simulado recibido:', req.body);

    const { token, status, amount, flowOrder, commerceOrder } = req.body;

    if (status === 2) {
        console.log('[FLOW SIMULATOR] ✅ Simulando pago exitoso');

        // Extraer loanId del commerceOrder (formato: LOAN-{id}-{correlativo})
        const match = commerceOrder.match(/LOAN-(\d+)-/);
        if (match) {
            const loanId = match[1];

            // Aquí normalmente se registraría el pago
            // Por ahora solo logueamos
            console.log('[FLOW SIMULATOR] 📝 Pago simulado para préstamo:', loanId);
        }
    }

    res.status(200).json({ success: true, message: 'Webhook simulado procesado' });
});

module.exports = router;
