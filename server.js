require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { testConnection } = require('./config/database');
const { SERVER_CONFIG, FLOW_CONFIG } = require('./config/constants');

// Import routes
const loanRoutes = require('./routes/loanRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const cashClosureRoutes = require('./routes/cashClosureRoutes');
const flowRoutes = require('./routes/flowRoutes');
const documentRoutes = require('./routes/documentRoutes');

// IMPORTAR SERVICIOS (Solo una vez)
// Ajusta la ruta './services/...' si tu carpeta se llama diferente, pero por tu estructura parece ser esa.
const { getFlowPaymentStatus } = require('./services/flowService'); 
const { registerPaymentInternal } = require('./services/paymentService');

const app = express();
const PORT = SERVER_CONFIG.PORT;

// ==========================================================
// MIDDLEWARE CONFIGURATION
// ==========================================================

app.use(cors());
app.use(express.json());
// Habilitar lectura de formularios para el retorno de Flow
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);
    next();
});

// ==========================================================
// API ROUTES
// ==========================================================

app.use('/api/loans', loanRoutes);
app.use('/api/loans', paymentRoutes); 
app.use('/api/cash-closures', cashClosureRoutes);
app.use('/api/flow', flowRoutes);
app.use('/flow-simulator', flowRoutes); 
app.use('/api/documento', documentRoutes);


// ==========================================================
// STATIC FILES AND FRONTEND
// ==========================================================

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'front.html'));
});

// GET: Mostrar página de éxito normal
app.get('/payment-success', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'payment-success.html'));
});

// POST: RECIBIR RETORNO DE FLOW Y GUARDAR PAGO (TRUCO LOCALHOST)
app.post('/payment-success', async (req, res) => {
    console.log('[FLOW RETURN] 📥 Cliente regresó de Flow (POST)');
    const token = req.body.token;

    if (token) {
        // --- TRUCO PARA LOCALHOST: GUARDAR PAGO AQUÍ ---
        // Como el Webhook no llega a Localhost, lo guardamos al volver el usuario.
        if (SERVER_CONFIG.BACKEND_URL.includes('localhost')) {
            try {
                console.log('[LOCALHOST FIX] 🔧 Intentando registrar pago forzosamente...');
                const statusData = await getFlowPaymentStatus(token);
                
                if (statusData.status === 2) { 
                    const commerceOrder = statusData.commerceOrder || '';
                    const match = commerceOrder.match(/LOAN-(\d+)-(\d+)/);
                    
                    if (match) {
                        const loanId = parseInt(match[1]);
                        const correlativo = parseInt(match[2]);
                        const totalAmount = parseFloat(statusData.amount);
                        
                        // 🚨 NUEVO: Capturar el método específico (Ej: "Webpay", "Transferencia")
                        let metodoEspecifico = 'Flow (Genérico)';
                        
                        if (statusData.paymentData && statusData.paymentData.media) {
                            // Flow suele devolver "Webpay", "Transferencia", "Servipag", etc.
                            // Lo combinamos para que se entienda: "Flow - Webpay"
                            metodoEspecifico = `Flow - ${statusData.paymentData.media}`;
                        }

                        // Recuperar mora y fecha de la metadata (igual que antes)
                        let moraAmount = 0;
                        let paymentDate = new Date().toISOString().split('T')[0];
                        try {
                            if (statusData.optional) {
                                const meta = JSON.parse(statusData.optional);
                                moraAmount = parseFloat(meta.amount_mora || 0);
                                paymentDate = meta.payment_date || paymentDate;
                            }
                        } catch (e) {}

                        // REGISTRAR EN BD CON EL NOMBRE DETALLADO
                        await registerPaymentInternal(loanId, {
                            payment_amount: totalAmount,
                            mora_amount: moraAmount,
                            payment_date: paymentDate,
                            payment_method: metodoEspecifico, // <--- AQUÍ GUARDAMOS EL DETALLE
                            correlativo_boleta: correlativo,
                            transaction_id: statusData.flowOrder || token
                        });
                        console.log(`[LOCALHOST FIX] ✅ Pago guardado: ${metodoEspecifico}`);
                    }
                }
            } catch (error) {
                // Si falla (ej: ya estaba registrado), solo lo logueamos y seguimos
                console.log('[LOCALHOST FIX] ⚠️ Nota: El pago quizás ya existía o falló el registro forzoso:', error.message);
            }
        }
        // ------------------------------------------------

        // Redirigir a la página de éxito (que se cerrará sola)
        return res.redirect(`/payment-success?token=${token}`);
    }

    res.sendFile(path.join(__dirname, 'public', 'payment-success.html'));
});



// ==========================================================
// ERROR HANDLING Y STARTUP
// ==========================================================

app.use('/api/*', (req, res, next) => {
    res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
});

const startServer = async () => {
    try {
        const dbConnected = await testConnection();
        if (!dbConnected) process.exit(1);

        app.listen(PORT, () => {
            console.log(`\n🚀 Servidor listo en puerto ${PORT}`);
            console.log(`📡 Backend: ${SERVER_CONFIG.BACKEND_URL}`);
        });

    } catch (err) {
        console.error('❌ Error fatal:', err.message);
    }
};

startServer();

module.exports = app;