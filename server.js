const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');
const axios = require('axios'); 
const crypto = require('crypto'); 

const app = express();
const PORT = process.env.PORT || 3000;

// === CONFIGURACIÓN DE LA APLICACIÓN Y MIDDLEWARE ===
app.use(cors());
app.use(express.json()); 
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);
    next();
});

const pool = mysql.createPool(process.env.DATABASE_URL);

// --- CONSTANTES DE NEGOCIO Y API DE FLOW ---
const TASA_INTERES_ANUAL = 10;
const TASA_MORA_MENSUAL = 1; 

const FLOW_API_KEY = process.env.FLOW_API_KEY || '1FF50655-0135-4F50-9A60-774ABDBL14C7'; 
const FLOW_SECRET = process.env.FLOW_SECRET || '1b7e761342e5525b8a294499bde19d29cfa76090'; 
const FLOW_ENDPOINT = 'https://flow.cl/api/payment/start'; 
const YOUR_BACKEND_URL = process.env.BACKEND_URL || 'https://prestaproagilegithubio-production-be75.up.railway.app'; 

// ==========================================================
// 1. UTILIDADES DE CÁLCULO Y HASHING
// ==========================================================

// Función para generar la firma SHA-256 (CRÍTICO para Flow)
function createFlowSignature(params, secret) {
    // 1. Ordenar los parámetros alfabéticamente
    const keys = Object.keys(params).sort();
    
    // 2. Concatenar los valores
    let stringToHash = '';
    keys.forEach(key => {
        // Excluir la firma si está presente (aunque no debería)
        if (key !== 's') {
            stringToHash += params[key];
        }
    });
    
    // 3. Añadir la clave secreta al final
    stringToHash += secret;
    
    // 4. Generar el HASH SHA-256
    const hash = crypto.createHash('sha256').update(stringToHash).digest('hex');
    return hash;
}

function calculateSchedule(loan) {
    const monthlyInterestRate = parseFloat(loan.interes) / 100;
    const principal = parseFloat(loan.monto);
    const schedule = [];
    const startDate = new Date(loan.fecha);

    let monthlyPayment;
    let totalDue;
    
    if (loan.tipo_calculo === 'Hibrido' && loan.meses_solo_interes > 0) {
        const interestOnlyPayment = principal * monthlyInterestRate;
        const remainingTerm = loan.plazo - loan.meses_solo_interes;
        monthlyPayment = (principal * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -remainingTerm));
        
        for (let i = 1; i <= loan.plazo; i++) {
            const paymentDate = new Date(startDate);
            paymentDate.setUTCMonth(paymentDate.getUTCMonth() + i);

            const monto = (i <= loan.meses_solo_interes) ? interestOnlyPayment : monthlyPayment;
            schedule.push({ cuota: i, fecha: paymentDate, monto: parseFloat(monto.toFixed(2)) });
        }
        totalDue = (interestOnlyPayment * loan.meses_solo_interes) + (monthlyPayment * remainingTerm);
    } else {
        monthlyPayment = (principal * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -loan.plazo));
        for (let i = 1; i <= loan.plazo; i++) {
            const paymentDate = new Date(startDate);
            paymentDate.setUTCMonth(paymentDate.getUTCMonth() + i);
            schedule.push({ cuota: i, fecha: paymentDate, monto: parseFloat(monthlyPayment.toFixed(2)) });
        }
        totalDue = monthlyPayment * loan.plazo;
    }
    
    return { schedule, totalDue: parseFloat(totalDue.toFixed(2)) };
}

function calculateMora(loan, totalPaid) {
    const { schedule } = calculateSchedule(loan);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalMora = 0;
    let totalAmountOverdue = 0;
    let latestDueDate = new Date(loan.fecha);

    for (const item of schedule) {
        const dueDate = new Date(item.fecha);
        dueDate.setHours(0, 0, 0, 0);

        if (dueDate <= today) {
            const cumulativeExpected = schedule.slice(0, item.cuota).reduce((sum, s) => sum + s.monto, 0);

            if (totalPaid < cumulativeExpected) {
                const monthsLate = (today.getFullYear() - dueDate.getFullYear()) * 12 +
                    (today.getMonth() - dueDate.getMonth());
                const monthsToCharge = Math.max(1, monthsLate);

                const outstandingBalanceForMora = loan.total_due - totalPaid;

                totalMora = outstandingBalanceForMora * (TASA_MORA_MENSUAL / 100) * monthsToCharge;
                totalAmountOverdue = cumulativeExpected - totalPaid;
                latestDueDate = dueDate;
                break; 
            }
        }
    }

    return parseFloat(totalMora > 0 ? totalMora.toFixed(2) : 0);
}

function verifyFlowSignature(data, secret) {
    console.log("⚠️ Advertencia: La verificación de firma de Flow está deshabilitada/simulada. ¡Implementar en producción!");
    return true; 
}

async function registerPaymentInternal(loanId, paymentData) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { payment_amount, payment_date, mora_amount, payment_method } = paymentData;
        
        await connection.query('INSERT INTO payments (loan_id, payment_amount, payment_date, mora_amount, payment_method) VALUES (?, ?, ?, ?, ?)', 
            [loanId, payment_amount, payment_date, mora_amount, payment_method]);
        
        await connection.commit();
        connection.release();

    } catch (e) {
        await connection.rollback();
        connection.release();
        throw e;
    }
}


// ==========================================================
// 2. RUTAS API 
// ==========================================================

// GET /api/loans (Omitido por brevedad)
// POST /api/loans (Omitido por brevedad)
// POST /api/loans/:loanId/payments (Omitido por brevedad)
// DELETE /api/loans/:loanId (Omitido por brevedad)
// GET /api/dni/:dni (Omitido por brevedad)


// POST /api/flow/create-order (INCLUYE LA FIRMA CRIPTOGRÁFICA)
app.post('/api/flow/create-order', async (req, res) => {
    const { amount, loanId, clientDni, amount_ci, amount_mora, payment_date } = req.body;

    if (!amount || !loanId || !clientDni) {
        return res.status(400).json({ error: 'Faltan campos requeridos: amount, loanId y clientDni.' });
    }
    
    const commerceOrder = `PRESTAPRO-${loanId}-${Date.now()}`;
    const subject = `Pago Cuota Préstamo ID #${loanId}`;
    
    const optionalData = JSON.stringify({ 
        loanId: loanId, 
        amount_ci: amount_ci, 
        amount_mora: amount_mora,
        payment_date: payment_date 
    });

    // 1. Preparar los parámetros que Flow espera
    const params = {
        apiKey: FLOW_API_KEY,
        commerceOrder: commerceOrder,
        subject: subject,
        amount: amount, // Asegúrate que el frontend lo envía como string con 2 decimales
        email: `${clientDni}@prestapro.com`,
        urlConfirmation: `${YOUR_BACKEND_URL}/api/flow/webhook`, 
        urlReturn: `${YOUR_BACKEND_URL}/payment-status.html`, 
        optional: optionalData
        // Flow también puede requerir 'currency' y otros campos dependiendo de la configuración
    };

    // 2. Generar la firma criptográfica (S)
    const signature = createFlowSignature(params, FLOW_SECRET);

    // 3. Ensamblar la solicitud final
    const flowRequest = {
        ...params,
        s: signature // CRÍTICO: Añadir la firma HASHED
    };


    try {
        console.log(`[FLOW API] Enviando solicitud a Flow para Orden: ${commerceOrder}`);
        
        // ** LLAMADA REAL A LA API DE FLOW **
        const flowResponse = await axios.post(FLOW_ENDPOINT, flowRequest);

        const flowToken = flowResponse.data.token;
        const flowPaymentUrl = `https://flow.cl/app/payment/start?token=${flowToken}`; 

        res.json({ success: true, url: flowPaymentUrl });

    } catch (error) {
        // 🚨 CAPTURA EL ERROR 400/401/403 DE FLOW
        let errorMessage = 'Fallo al procesar la orden con Flow.';
        let statusCode = 500;

        if (error.response) {
            statusCode = error.response.status;
            errorMessage = error.response.data || 'Error de API de Flow sin cuerpo.';
        }
        
        console.error(`[FLOW ERROR DETALLE] Estado: ${statusCode}, Mensaje:`, errorMessage);
        res.status(statusCode).json({ success: false, error: errorMessage, status: statusCode });
    }
});

// POST /api/flow/webhook (RECIBE CONFIRMACIÓN REAL DE FLOW)
app.post('/api/flow/webhook', async (req, res) => {
    const flowData = req.body;

    if (!verifyFlowSignature(flowData, FLOW_SECRET)) {
        return res.status(401).send('Firma de Webhook no válida.');
    }

    if (flowData.status === 1) { 
        try {
            const optional = JSON.parse(flowData.optional);

            const paymentData = {
                payment_amount: parseFloat(flowData.amount), 
                mora_amount: parseFloat(optional.amount_mora),
                payment_date: new Date().toISOString().split('T')[0],
                payment_method: 'Transferencia'
            };

            await registerPaymentInternal(optional.loanId, paymentData); 
            
            console.log(`✅ Webhook Exitoso. Pago registrado para Préstamo ID: ${optional.loanId}`);
            
            res.status(200).send('OK');

        } catch (e) {
            console.error('Error al procesar datos del webhook:', e);
            res.status(500).send('Error interno al registrar pago.');
        }

    } else {
        res.status(200).send('Estado de pago no exitoso. OK');
    }
});


// ==========================================================
// 3. CONFIGURACIÓN FINAL DEL SERVIDOR Y MANEJO DE ESTATICOS
// ==========================================================

// Sirve archivos estáticos (index.html, logica.js, diseño.css)
app.use(express.static(path.join(__dirname))); 


// Manejador de errores 404 (Último middleware, captura todo lo que no fue API o archivo estático)
app.use((req, res, next) => {
    res.status(404).json({ success: false, error: 'Ruta de API o Recurso no encontrado', endpoint: req.originalUrl });
});

// INICIO DEL SERVIDOR
const startServer = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conexión a la base de datos establecida con éxito.');
    connection.release();

    app.listen(PORT, () => {
      console.log(`🚀 Servidor PrestaPro escuchando en el puerto ${PORT}`);
      console.log(`URL de Backend (Flow Webhook): ${YOUR_BACKEND_URL}`);
    });

  } catch (err) {
    console.error('❌ No se pudo conectar a la base de datos. Verifica la variable de entorno DATABASE_URL.');
    console.error(err.message);
    process.exit(1);
  }
};

startServer();
