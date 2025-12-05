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
// 1. UTILIDADES DE CÁLCULO
// ==========================================================

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

// GET /api/loans
app.get('/api/loans', async (req, res) => {
  try {
    const loanQuery = `
      SELECT
        l.id, l.monto, l.interes, l.fecha, l.plazo, l.status,
        l.tipo_calculo, l.meses_solo_interes,
        c.dni, c.nombres, c.apellidos, c.is_pep
      FROM loans l
      JOIN clients c ON l.client_id = c.id
      ORDER BY l.fecha DESC, l.id DESC;
    `;
    const [loans] = await pool.query(loanQuery);
    
    const [payments] = await pool.query('SELECT loan_id, payment_amount, payment_date, mora_amount, payment_method FROM payments ORDER BY payment_date ASC');

    const loansWithPayments = loans.map(loan => {
      const { totalDue } = calculateSchedule(loan);
      loan.total_due = totalDue;

      const associatedPayments = payments.filter(p => p.loan_id === loan.id);
      
      const totalPaid = associatedPayments.reduce((sum, p) => sum + parseFloat(p.payment_amount), 0);
      loan.total_paid = parseFloat(totalPaid.toFixed(2));
      
      loan.mora_pendiente = calculateMora(loan, loan.total_paid);

      if (loan.total_paid >= loan.total_due) { 
        loan.status = 'Pagado'; 
      } else if (loan.mora_pendiente > 0) {
        loan.status = 'Atrasado';
      } else {
        loan.status = 'Activo';
      }

      return {
        ...loan,
        payments: associatedPayments,
      };
    });

    res.json(loansWithPayments);
  } catch (err) {
    console.error("ERROR en GET /api/loans:", err);
    res.status(500).json({ error: 'Error al obtener los préstamos' });
  }
});

// POST /api/loans
app.post('/api/loans', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { client, monto, fecha, plazo, status, declaracion_jurada = false, tipo_calculo = 'Amortizado', meses_solo_interes = 0 } = req.body;
    const { dni, nombres, apellidos, is_pep = false } = client;
    const interes = TASA_INTERES_ANUAL / 12;

    if (monto < 100 || monto > 20000) {
      return res.status(400).json({ error: 'El monto del préstamo debe estar entre S/ 100 y S/ 20,000.' });
    }

    const [activeLoans] = await connection.query(`SELECT l.id FROM loans l JOIN clients c ON l.client_id = c.id WHERE c.dni = ? AND l.status = 'Activo' LIMIT 1;`, [dni]);
    if (activeLoans.length > 0) {
      return res.status(409).json({ error: 'El cliente ya tiene un préstamo activo.' });
    }

    let [existingClient] = await connection.query('SELECT id FROM clients WHERE dni = ?', [dni]);
    let clientId;

    if (existingClient.length > 0) {
      clientId = existingClient[0].id;
      await connection.query('UPDATE clients SET nombres = ?, apellidos = ?, is_pep = ? WHERE id = ?', [nombres, apellidos, is_pep, clientId]);
    } else {
      const [result] = await connection.query('INSERT INTO clients (dni, nombres, apellidos, is_pep) VALUES (?, ?, ?, ?)', [dni, nombres, apellidos, is_pep]);
      clientId = result.insertId;
    }

    await connection.query(`INSERT INTO loans (client_id, monto, interes, fecha, plazo, status, declaracion_jurada, tipo_calculo, meses_solo_interes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`, 
      [clientId, monto, interes, fecha, plazo, status, declaracion_jurada, tipo_calculo, meses_solo_interes]);

    await connection.commit();
    res.status(201).json({ ...req.body, client_id: clientId });

  } catch (err) {
    await connection.rollback();
    console.error("ERROR en POST /api/loans:", err.message);
    res.status(500).json({ error: 'Error interno al guardar en la base de datos.' });
  } finally {
    connection.release();
  }
});

// POST /api/loans/:loanId/payments
app.post('/api/loans/:loanId/payments', async (req, res) => {
    const { loanId } = req.params;
    const { payment_amount, payment_date, mora_amount, payment_method } = req.body;

    const totalPayment = parseFloat(payment_amount); 
    const moraToRegister = parseFloat(mora_amount || 0);
    const CiPayment = totalPayment - moraToRegister;

    if (totalPayment <= 0 || !payment_date || CiPayment < 0) {
        return res.status(400).json({ error: 'Monto de pago inválido o fecha faltante.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [loanRows] = await connection.query('SELECT * FROM loans WHERE id = ?', [loanId]);
        if (loanRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Préstamo no encontrado.' });
        }
        const loan = loanRows[0];
        
        const [paymentsRows] = await connection.query('SELECT SUM(payment_amount) as totalPaid FROM payments WHERE loan_id = ?', [loanId]);
        const totalPaid = parseFloat(paymentsRows[0].totalPaid || 0);
        const { totalDue } = calculateSchedule(loan);
        
        const remainingBalanceCI = totalDue - totalPaid;
        const roundedRemainingBalanceCI = parseFloat(remainingBalanceCI.toFixed(2));

        if (CiPayment > roundedRemainingBalanceCI) {
            await connection.rollback();
            return res.status(400).json({ error: `El pago (Capital/Interés) de S/ ${CiPayment.toFixed(2)} excede el saldo pendiente de S/ ${roundedRemainingBalanceCI.toFixed(2)}.` });
        }

        // Registrar el pago en la base de datos
        await connection.query('INSERT INTO payments (loan_id, payment_amount, payment_date, mora_amount, payment_method) VALUES (?, ?, ?, ?, ?)', 
            [loanId, totalPayment, payment_date, moraToRegister, payment_method]);

        const newTotalPaid = totalPaid + totalPayment;

        if (newTotalPaid >= totalDue) {
            await connection.query("UPDATE loans SET status = 'Pagado' WHERE id = ?", [loanId]);
        }

        await connection.commit();
        res.status(201).json({ message: 'Pago registrado con éxito' });

    } catch (err) {
        await connection.rollback();
        console.error("ERROR en POST /api/loans/:loanId/payments:", err);
        res.status(500).json({ error: 'Error al registrar el pago.' });
    } finally {
        connection.release();
    }
});


// DELETE /api/loans/:loanId
app.delete('/api/loans/:loanId', async (req, res) => {
    const { loanId } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM payments WHERE loan_id = ?', [loanId]);
        const [result] = await connection.query('DELETE FROM loans WHERE id = ?', [loanId]);

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'El préstamo no fue encontrado.' });
        }

        await connection.commit();
        res.status(200).json({ message: 'Préstamo y pagos asociados eliminados correctamente.' });

    } catch (err) {
        await connection.rollback();
        console.error("ERROR en DELETE /api/loans/:loanId:", err);
        res.status(500).json({ error: 'Error en el servidor al intentar eliminar el préstamo.' });
    } finally {
        connection.release();
    }
});


// GET /api/dni/:dni (Ruta Proxy para DNI)
app.get('/api/dni/:dni', async (req, res) => {
  const { dni } = req.params;
  const token = process.env.DNI_API_TOKEN;

  if (!token) {
    return res.status(500).json({ error: 'El token de la API de DNI no está configurado en el servidor.' });
  }

  try {
    const apiResponse = await fetch(`https://dniruc.apisperu.com/api/v1/dni/${dni}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await apiResponse.json();
    res.status(apiResponse.status).json(data);
  } catch (error) {
    console.error("Error en el proxy de DNI:", error);
    res.status(500).json({ error: 'Error interno al consultar la API de DNI.' });
  }
});


// POST /api/flow/create-order (INICIA EL PAGO REAL CON FLOW)
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

    const flowRequest = {
        apiKey: FLOW_API_KEY,
        commerceOrder: commerceOrder,
        subject: subject,
        amount: amount,
        email: `${clientDni}@prestapro.com`,
        urlConfirmation: `${YOUR_BACKEND_URL}/api/flow/webhook`, 
        urlReturn: `${YOUR_BACKEND_URL}/payment-status.html`, 
        optional: optionalData,
        s: 'simulated_signature' 
    };

    try {
        console.log(`[FLOW API] Enviando solicitud a Flow para Orden: ${commerceOrder}`);
        
        // ** LLAMADA REAL A LA API DE FLOW **
        const flowResponse = await axios.post(FLOW_ENDPOINT, flowRequest);

        const flowToken = flowResponse.data.token;
        const flowPaymentUrl = `https://flow.cl/app/payment/start?token=${flowToken}`; 

        res.json({ success: true, url: flowPaymentUrl });

    } catch (error) {
        // 🚨 Manejo detallado del error 400 de Flow
        let errorMessage = 'Fallo al procesar la orden con Flow.';
        let statusCode = 500;

        if (error.response) {
            statusCode = error.response.status;
            // Capturar el mensaje de error de Flow para el log
            errorMessage = error.response.data || 'Error de API de Flow sin cuerpo.';
        } else {
             errorMessage = `Error de conexión: ${error.message}`;
             statusCode = 503; 
        }
        
        console.error(`[FLOW ERROR DETALLE] Estado: ${statusCode}, Mensaje:`, errorMessage);
        // Devolver el objeto de error para que el frontend lo capture y muestre legiblemente
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
