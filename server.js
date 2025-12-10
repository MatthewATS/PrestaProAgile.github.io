const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');
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

// --- CONSTANTES DE NEGOCIO Y API DE MERCADO PAGO ---
// 🚨 MODIFICACIÓN: TASA_INTERES_ANUAL ELIMINADA. LA TASA SE RECIBE EN EL POST.
const TASA_MORA_MENSUAL = 1;

// 🚨 CREDENCIALES DE MERCADO PAGO DE PRODUCCIÓN 🚨
const MP_ACCESS_TOKEN = 'APP_USR-1246920437893290-120617-768190e0a707195da7806e0964a2f70a-3045510589';
const MP_PUBLIC_KEY = 'APP_USR-11b6bf25-952a-4b6e-a2e1-f2d387b9c8d8';
const MP_ENDPOINT_BASE = 'https://api.mercadopago.com/checkout/preferences';

const YOUR_BACKEND_URL = process.env.BACKEND_URL || 'https://prestaproagilegithubio-production-be75.up.railway.app';


// ==========================================================
// 1. UTILIDADES DE CÁLCULO Y DB
// ==========================================================

function calculateSchedule(loan) {
    const monthlyInterestRate = parseFloat(loan.interes) / 100;
    const principal = parseFloat(loan.monto);
    const schedule = [];

    // 🚨 FIX: Inicializar la fecha para evitar desfase de zona horaria (usando "T12:00:00")
    const startDate = new Date(loan.fecha + 'T12:00:00');

    let monthlyPayment;
    let totalDue;

    if (loan.tipo_calculo === 'Hibrido' && loan.meses_solo_interes > 0) {
        const interestOnlyPayment = principal * monthlyInterestRate;
        const remainingTerm = loan.plazo - loan.meses_solo_interes;
        monthlyPayment = (principal * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -remainingTerm));

        for (let i = 1; i <= loan.plazo; i++) {
            const paymentDate = new Date(startDate);
            // Usamos setUTCMonth para manipular los meses sin cambiar la hora local.
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

    // 🚨 FIX: Inicializar la fecha para evitar desfase de zona horaria (usando "T12:00:00")
    const startDate = new Date(loan.fecha + 'T12:00:00');
    let latestDueDate = new Date(startDate);

    for (const item of schedule) {
        // La fecha en el schedule ya es un objeto Date
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

async function registerPaymentInternal(loanId, paymentData) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { payment_amount, payment_date, mora_amount, payment_method } = paymentData;

        const finalMethod = payment_method || 'Mercado Pago';

        console.log(`[PAYMENT INTERNAL] Registrando pago para préstamo ${loanId}:`, {
            payment_amount,
            payment_date,
            mora_amount,
            payment_method: finalMethod
        });

        // 🚨 CRÍTICO: El payment_amount enviado aquí es el MONTO TOTAL (CI + MORA)
        await connection.query(
            'INSERT INTO payments (loan_id, payment_amount, payment_date, mora_amount, payment_method) VALUES (?, ?, ?, ?, ?)',
            [loanId, payment_amount, payment_date, mora_amount, finalMethod]
        );

        // Verificar si el préstamo está totalmente pagado
        const [paymentsRows] = await connection.query(
            'SELECT SUM(payment_amount - mora_amount) as totalPaidCI FROM payments WHERE loan_id = ?',
            [loanId]
        );
        // Se suma solo el Capital/Interés (payment_amount - mora_amount) para comparar con totalDue
        const totalPaidCI = parseFloat(paymentsRows[0].totalPaidCI || 0);

        const [loanRows] = await connection.query('SELECT * FROM loans WHERE id = ?', [loanId]);
        const loan = loanRows[0];
        const { totalDue } = calculateSchedule(loan);

        if (totalPaidCI >= totalDue) {
            await connection.query("UPDATE loans SET status = 'Pagado' WHERE id = ?", [loanId]);
            console.log(`[PAYMENT INTERNAL] ✅ Préstamo ${loanId} marcado como PAGADO`);
        }


        await connection.commit();
        console.log(`[PAYMENT INTERNAL] ✅ Pago registrado exitosamente`);

    } catch (e) {
        await connection.rollback();
        console.error(`[PAYMENT INTERNAL ERROR]`, e);
        throw e;
    } finally {
        connection.release();
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

        const [payments] = await pool.query(
            'SELECT loan_id, payment_amount, payment_date, mora_amount, payment_method FROM payments ORDER BY payment_date ASC'
        );

        const loansWithPayments = loans.map(loan => {
            const { totalDue } = calculateSchedule(loan);
            loan.total_due = totalDue;

            const associatedPayments = payments.filter(p => p.loan_id === loan.id);

            // Calcular Capital/Interés Pagado
            const totalPaidCI = associatedPayments.reduce((sum, p) => sum + (parseFloat(p.payment_amount) - (parseFloat(p.mora_amount) || 0)), 0);
            loan.total_paid = parseFloat(totalPaidCI.toFixed(2));

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

        const {
            client,
            monto,
            // 🚨 MODIFICACIÓN: Recibir interes_anual
            interes_anual,
            fecha,
            plazo,
            status,
            declaracion_jurada = false,
            tipo_calculo = 'Amortizado',
            meses_solo_interes = 0
        } = req.body;

        // 🚨 CORRECCIÓN CLAVE: Asegurar que 'monto' se parsea a flotante
        const parsedMonto = parseFloat(monto);

        const { dni, nombres, apellidos, is_pep = false } = client;
        // 🚨 MODIFICACIÓN: Calcular tasa mensual a partir de la tasa anual recibida
        const interes = parseFloat(interes_anual) / 12;

        // 🚨 USAR el monto parseado para la validación
        if (parsedMonto < 100 || parsedMonto > 20000 || isNaN(parsedMonto)) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'El monto del préstamo debe ser un número válido entre S/ 100 y S/ 20,000.' });
        }


        let [activeLoans] = await connection.query(
            `SELECT l.id FROM loans l JOIN clients c ON l.client_id = c.id WHERE c.dni = ? AND l.status = 'Activo' LIMIT 1;`,
            [dni]
        );

        if (activeLoans.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(409).json({ error: 'El cliente ya tiene un préstamo activo.' });
        }

        let [existingClient] = await connection.query('SELECT id FROM clients WHERE dni = ?', [dni]);
        let clientId;

        if (existingClient.length > 0) {
            clientId = existingClient[0].id;
            await connection.query(
                'UPDATE clients SET nombres = ?, apellidos = ?, is_pep = ? WHERE id = ?',
                [nombres, apellidos, is_pep, clientId]
            );
        } else {
            const [result] = await connection.query(
                'INSERT INTO clients (dni, nombres, apellidos, is_pep) VALUES (?, ?, ?, ?)',
                [dni, nombres, apellidos, is_pep]
            );
            clientId = result.insertId;
        }

        await connection.query(
            `INSERT INTO loans (client_id, monto, interes, fecha, plazo, status, declaracion_jurada, tipo_calculo, meses_solo_interes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [clientId, parsedMonto, interes, fecha, plazo, status, declaracion_jurada, tipo_calculo, meses_solo_interes]
        );

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
    const CiPayment = totalPayment - moraToRegister; // Capital/Interés pagado

    if (totalPayment <= 0 || !payment_date || CiPayment < 0) {
        return res.status(400).json({ error: 'Monto de pago inválido o fecha faltante.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [loanRows] = await connection.query('SELECT * FROM loans WHERE id = ?', [loanId]);
        if (loanRows.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Préstamo no encontrado.' });
        }
        const loan = loanRows[0];

        // Obtener la suma total de CAPITAL/INTERÉS pagado
        const [paymentsRows] = await connection.query(
            'SELECT SUM(payment_amount - mora_amount) as totalPaidCI FROM payments WHERE loan_id = ?',
            [loanId]
        );
        const totalPaidCI = parseFloat(paymentsRows[0].totalPaidCI || 0);
        const { totalDue } = calculateSchedule(loan);

        const remainingBalanceCI = totalDue - totalPaidCI;
        const roundedRemainingBalanceCI = parseFloat(remainingBalanceCI.toFixed(2));

        if (CiPayment > roundedRemainingBalanceCI) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                error: `El pago (Capital/Interés) de S/ ${CiPayment.toFixed(2)} excede el saldo pendiente de S/ ${roundedRemainingBalanceCI.toFixed(2)}.`
            });
        }

        // 🚨 CRÍTICO: Registrar el monto total (CI + MORA)
        await connection.query(
            'INSERT INTO payments (loan_id, payment_amount, payment_date, mora_amount, payment_method) VALUES (?, ?, ?, ?, ?)',
            [loanId, totalPayment, payment_date, moraToRegister, payment_method]
        );

        const newTotalPaidCI = totalPaidCI + CiPayment;

        if (newTotalPaidCI >= totalDue) {
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
            connection.release();
            return res.status(404).json({ error: 'Préstamo no fue encontrado.' });
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
        console.error("ERROR en el proxy de DNI:", error);
        res.status(500).json({ error: 'Error interno al consultar la API de DNI.' });
    }
});


// ==========================================================
// 3. RUTAS DE CIERRE DE CAJA (CASH CLOSURES)
// ==========================================================

// POST /api/cash-closures (Registra un nuevo cierre diario)
app.post('/api/cash-closures', async (req, res) => {
    const { closure_date, declared_amount, system_cash_amount, difference } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Verificar si ya existe un cierre para esa fecha
        const [existing] = await connection.query(
            'SELECT id FROM cash_closures WHERE closure_date = ?',
            [closure_date]
        );

        if (existing.length > 0) {
            await connection.rollback();
            return res.status(409).json({ error: 'Ya existe un cierre de caja registrado para esta fecha.' });
        }

        // 2. Registrar el cierre
        await connection.query(
            `INSERT INTO cash_closures (closure_date, declared_amount, system_cash_amount, difference, closed_by)
             VALUES (?, ?, ?, ?, 'admin')`, // Asumimos 'admin' como usuario
            [closure_date, declared_amount, system_cash_amount, difference]
        );

        await connection.commit();
        res.status(201).json({ message: 'Cierre de caja registrado exitosamente.' });

    } catch (err) {
        await connection.rollback();
        console.error("ERROR en POST /api/cash-closures:", err.message);
        res.status(500).json({ error: 'Error al registrar el cierre en la base de datos.' });
    } finally {
        connection.release();
    }
});

// ********** ORDEN CRÍTICO CORREGIDO: RUTA ESPECÍFICA ANTES DE RUTA DINÁMICA **********

// GET /api/cash-closures/history (NUEVA RUTA: Obtiene todo el historial de cierres)
app.get('/api/cash-closures/history', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT closure_date, declared_amount, system_cash_amount, difference, closed_at, closed_by FROM cash_closures ORDER BY closure_date DESC'
        );
        // Convertir fechas a strings para manejo consistente en frontend
        const history = rows.map(row => ({
            ...row,
            closed_at: new Date(row.closed_at).toISOString()
        }));

        res.json(history);
    } catch (err) {
        console.error("ERROR en GET /api/cash-closures/history:", err.message);
        res.status(500).json({ error: 'Error al obtener el historial de cierres.' });
    }
});

// GET /api/cash-closures/:date (Verifica si hay un cierre registrado para una fecha)
app.get('/api/cash-closures/:date', async (req, res) => {
    const { date } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT id, closed_at, declared_amount, system_cash_amount, difference FROM cash_closures WHERE closure_date = ?',
            [date]
        );
        if (rows.length > 0) {
            // Asegurarse de que `closed_at` sea una cadena ISO o similar para el frontend
            rows[0].closed_at = new Date(rows[0].closed_at).toISOString();
            return res.json({ closed: true, data: rows[0] });
        }
        res.json({ closed: false });
    } catch (err) {
        console.error("ERROR en GET /api/cash-closures/:date:", err.message);
        res.status(500).json({ error: 'Error al consultar el cierre de caja.' });
    }
});


// ==========================================================
// 4. RUTAS DE MERCADO PAGO
// ==========================================================

// POST /api/mp/create-order (CREAR PREFERENCIA DE PAGO)
app.post('/api/mp/create-order', async (req, res) => {
    console.log('[MP] 📥 Recibida solicitud de creación de orden:', req.body);

    const { amount, loanId, clientDni, clientName, clientLastName, payment_date, amount_ci, amount_mora } = req.body;

    // Validación de campos
    if (!amount || !loanId || !clientDni) {
        console.error('[MP ERROR] ❌ Faltan campos requeridos');
        return res.status(400).json({
            success: false,
            error: 'Faltan campos requeridos: amount, loanId, clientDni'
        });
    }

    const externalReference = `PRESTAPRO-${loanId}-${Date.now()}`;
    const totalAmount = parseFloat(amount);

    // Verificar que el monto sea válido
    if (isNaN(totalAmount) || totalAmount <= 0) {
        console.error('[MP ERROR] ❌ Monto inválido:', amount);
        return res.status(400).json({
            success: false,
            error: 'El monto debe ser un número válido mayor a 0'
        });
    }

    const preferenceData = {
        items: [
            {
                id: loanId.toString(),
                title: `Pago Préstamo PrestaPro #${loanId}`,
                description: `Cliente: ${clientName} ${clientLastName}`,
                quantity: 1,
                unit_price: totalAmount,
                currency_id: 'PEN'
            }
        ],
        payer: {
            name: clientName,
            surname: clientLastName,
            identification: {
                type: 'DNI',
                number: clientDni
            }
        },
        // 🚨 CRÍTICO: Redirecciona a una página de estado simulada (requiere un front-end/payment-status.html)
        back_urls: {
            success: `${YOUR_BACKEND_URL}/payment-status.html?status=success&loanId=${loanId}`,
            pending: `${YOUR_BACKEND_URL}/payment-status.html?status=pending&loanId=${loanId}`,
            failure: `${YOUR_BACKEND_URL}/payment-status.html?status=failure&loanId=${loanId}`
        },
        external_reference: externalReference,
        notification_url: `${YOUR_BACKEND_URL}/api/mp/webhook`,
        auto_return: 'approved',
        statement_descriptor: 'PRESTAPRO',
        metadata: {
            loanId: loanId.toString(),
            payment_date: payment_date,
            amount_ci: amount_ci || '0',
            amount_mora: amount_mora || '0'
        }
    };

    try {
        console.log('[MP] 🚀 Enviando solicitud a Mercado Pago...');

        const mpResponse = await fetch(MP_ENDPOINT_BASE, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(preferenceData)
        });

        const mpData = await mpResponse.json();

        if (mpResponse.ok && mpData.id) {
            // Mercado Pago en producción usa init_point
            const checkoutUrl = mpData.init_point;

            if (checkoutUrl) {
                console.log('[MP] ✅ Orden creada exitosamente');
                return res.json({
                    success: true,
                    url: checkoutUrl,
                    preferenceId: mpData.id,
                    externalReference: externalReference
                });
            } else {
                // Esto podría ocurrir si hay problemas de configuración de URLs en MP Dashboard
                throw new Error("Mercado Pago no devolvió una URL de inicialización válida. Revise su configuración de URLs de retorno.");
            }

        } else {
            console.error('[MP ERROR] ❌ Respuesta no exitosa:', mpData);
            // Si el error es de autenticación (401), se captura aquí.
            if (mpResponse.status === 401) {
                throw new Error("Error de Autenticación (401). Revise su Access Token de Producción.");
            }
            throw new Error(mpData.message || JSON.stringify(mpData));
        }

    } catch (error) {
        console.error(`[MP ERROR CRÍTICO] 💥`, error);
        return res.status(500).json({
            success: false,
            error: error.message,
            details: error.toString()
        });
    }
});


// POST /api/mp/webhook (RECIBIR NOTIFICACIONES DE MERCADO PAGO)
app.post('/api/mp/webhook', async (req, res) => {
    // 🚨 CRÍTICO: Responder inmediatamente a Mercado Pago
    res.status(200).send('OK');

    const notification = req.body;

    // MP envia notificaciones de tipo 'payment'
    if (notification.type === 'payment' && notification.data && notification.data.id) {
        const paymentId = notification.data.id;

        try {
            console.log('[MP WEBHOOK] 🔎 Consultando detalles del pago ID:', paymentId);

            // OBTENER DETALLES COMPLETOS DEL PAGO DESDE MERCADO PAGO
            const paymentDetailsUrl = `https://api.mercadopago.com/v1/payments/${paymentId}`;

            const paymentResponse = await fetch(paymentDetailsUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                }
            });

            if (!paymentResponse.ok) {
                throw new Error(`Error al obtener detalles del pago: ${paymentResponse.status}`);
            }

            const paymentData = await paymentResponse.json();

            // VERIFICAR QUE EL PAGO FUE APROBADO (status 'approved')
            if (paymentData.status === 'approved') {
                console.log('[MP WEBHOOK] ✅ Pago APROBADO');

                // Extraer loanId del external_reference (formato: PRESTAPRO-123-1234567890)
                const externalRef = paymentData.external_reference;
                const loanId = externalRef ? externalRef.split('-')[1] : null;

                const paymentAmount = paymentData.transaction_amount; // Monto total
                const paymentDate = paymentData.date_approved?.split('T')[0] || new Date().toISOString().split('T')[0];
                const amountMora = paymentData.metadata?.amount_mora || '0';

                if (loanId && paymentAmount) {
                    const paymentDataToRegister = {
                        payment_amount: parseFloat(paymentAmount), // Total
                        mora_amount: parseFloat(amountMora),
                        payment_date: paymentDate,
                        payment_method: 'Mercado Pago'
                    };

                    await registerPaymentInternal(loanId, paymentDataToRegister);
                    console.log(`[MP WEBHOOK] ✅ Pago registrado exitosamente para Préstamo ID: ${loanId}`);
                }
            } else {
                console.log(`[MP WEBHOOK] ℹ️ Pago no aprobado. Estado: ${paymentData.status}`);
            }

        } catch (error) {
            console.error('[MP WEBHOOK ERROR] 💥', error);
        }
    }
});


// ==========================================================
// 5. CONFIGURACIÓN FINAL DEL SERVIDOR
// ==========================================================

// Sirve archivos estáticos (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Ruta para servir el front.html como index
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'front.html'));
});

// Manejador de errores 404
app.use((req, res, next) => {
    console.log('[404] Ruta no encontrada:', req.originalUrl);
    res.status(404).json({
        success: false,
        message: 'Ruta de API o Recurso no encontrado',
        endpoint: req.originalUrl
    });
});

// INICIO DEL SERVIDOR
const startServer = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Conexión a la base de datos establecida con éxito.');
        connection.release();

        app.listen(PORT, () => {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`🚀 Servidor PrestaPro escuchando en el puerto ${PORT}`);
            console.log(`📡 URL de Backend: ${YOUR_BACKEND_URL}`);
            console.log(`💳 Mercado Pago configurado: ${MP_ACCESS_TOKEN ? '✅' : '❌'}`);
            console.log(`${'='.repeat(60)}\n`);
        });

    } catch (err) {
        console.error('❌ No se pudo conectar a la base de datos.');
        console.error('Verifica la variable de entorno DATABASE_URL.');
        console.error(err.message);
        process.exit(1);
    }
};

startServer();
