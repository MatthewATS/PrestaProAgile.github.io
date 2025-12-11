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

const app = express();
const PORT = SERVER_CONFIG.PORT;

// ==========================================================
// MIDDLEWARE CONFIGURATION
// ==========================================================

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);
    next();
});

// ==========================================================
// API ROUTES
// ==========================================================

app.use('/api/loans', loanRoutes);
app.use('/api/loans', paymentRoutes); // Payment routes are nested under loans
app.use('/api/cash-closures', cashClosureRoutes);
app.use('/api/flow', flowRoutes);
app.use('/flow-simulator', flowRoutes); // Simulator route for development
app.use('/api/documento', documentRoutes);


// ==========================================================
// STATIC FILES AND FRONTEND
// ==========================================================

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Serve front.html as index
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'front.html'));
});

// ==========================================================
// ERROR HANDLING
// ==========================================================

// 404 handler
app.use((req, res, next) => {
    console.log('[404] Ruta no encontrada:', req.originalUrl);
    res.status(404).json({
        success: false,
        message: 'Ruta de API o Recurso no encontrado',
        endpoint: req.originalUrl
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ==========================================================
// SERVER STARTUP
// ==========================================================

const startServer = async () => {
    try {
        // Test database connection
        const dbConnected = await testConnection();

        if (!dbConnected) {
            console.error('❌ No se pudo conectar a la base de datos.');
            console.error('Verifica la variable de entorno DATABASE_URL.');
            process.exit(1);
        }

        // Start server
        app.listen(PORT, () => {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`🚀 Servidor PrestaPro escuchando en el puerto ${PORT}`);
            console.log(`📡 URL de Backend: ${SERVER_CONFIG.BACKEND_URL}`);
            console.log(`💳 Flow Payment Gateway: ${FLOW_CONFIG.API_KEY ? '✅ Configurado' : '❌ No configurado'}`);
            console.log(`🔑 Flow API Key: ${FLOW_CONFIG.API_KEY || 'No configurado'}`);
            console.log(`🌍 Entorno: ${SERVER_CONFIG.NODE_ENV}`);
            console.log(`${'='.repeat(60)}\n`);
        });

    } catch (err) {
        console.error('❌ Error al iniciar el servidor:', err.message);
        process.exit(1);
    }
};

startServer();

module.exports = app;
