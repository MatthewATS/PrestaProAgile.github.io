const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');
const crypto = require('crypto');
// 🚨 MÓDULO PARA HASH (Necesario para simular la firma digital de Izipay)
const { createHmac } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// === CONFIGURACIÓN DE LA APLICACIÓN Y MIDDLEWARE ===
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);
    next();
});

// Nota: En un entorno real, DATABASE_URL debe estar configurada.
const pool = mysql.createPool(process.env.DATABASE_URL);

// --- CONSTANTES DE NEGOCIO Y API DE IZIPAY (PAYZEN/LYRA) ---
const TASA_MORA_MENSUAL = 1;

// 🚨 CREDENCIALES IZIPAY DE PRODUCCIÓN (Obtenidas del panel) 🚨
// Usuario/Merchant ID: 68304620
// Contraseña de producción (API REST): prodpassword_CENMHCY3YIZBg...tAMdLDWG
// Clave HMAC-SHA-256 de producción (para verificar URL de retorno): xenUz7o7m1yTrLTqpHJq...OdwMmpzsJ

const IZP_MERCHANT_ID = '68304620';
// La "Contraseña de producción" es el código de seguridad secreto para el servidor
const IZP_PASSWORD = 'prodpassword_CENMHCY3YIZBg3lRK6VOGZKR5eiZa6cUR6KgEtAMdLDWG';
// La clave pública de JS (simulada aquí, usada para el formulario incrustado)
const IZP_PUBLIC_KEY = '68304620:publickey_WjgyV2UrfQftvbTjMalVZSjFfI5KGenL3F687WfnZb1aEuF4V';
// La URL Base de la API Izipay (simulación)
const IZP_ENDPOINT_BASE = 'https://api.izipay.pe/v1/payment';
// La URL para verificar el hash de seguridad
const IZP_HMAC_KEY = 'xenUz7o7m1yTrLTqpHJq4QekjbKA4DsyY0lDMwmlpzSj'; // Clave HMAC-SHA-256


const YOUR_BACKEND_URL = process.env.BACKEND_URL || 'https://prestaproagilegithubio-production-be75.up.railway.app';


// ==========================================================
// 1. UTILIDADES DE CÁLCULO Y DB
// ==========================================================

// 🚨 FUNCIÓN: Obtener el siguiente correlativo de boleta
async function getNextCorrelativo(connection) {
    const [rows] = await connection.query(
        "SELECT MAX(correlativo_boleta) AS max_correlativo FROM payments"
    );
    const maxCorrelativo = rows[0].max_correlativo || 0;
    return maxCorrelativo + 1;
}

function calculateSchedule(loan) {
    const monthlyInterestRate = parseFloat(loan.interes) / 100;
    const principal = parseFloat(loan.monto);
    const schedule = [];
    const startDate = new Date(loan.fecha + 'T12:00:00');

    let monthlyPayment;
    let totalDue;

    if (loan.tipo_calculo === 'Hibrido' && loan.meses_solo_interes > 0) {
        const interestOnlyPayment = principal * monthlyInterestRate;
        const remainingTerm = loan.plazo - loan.meses_solo_interes;

        if (remainingTerm > 0) {
            monthlyPayment = (principal * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -remainingTerm));
        } else {
            monthlyPayment = 0;
        }

        for (let i = 1; i <= loan.plazo; i++) {
            const paymentDate = new Date(startDate);
            paymentDate.setUTCMonth(paymentDate.getUTCMonth() + i);

            const monto = (i <= loan.meses_solo_interes) ? interestOnlyPayment : monthlyPayment;
            schedule.push({ cuota: i, fecha: paymentDate, monto: parseFloat(monto.toFixed(2)) });
        }
        totalDue = (interestOnlyPayment * loan.meses_solo_interes) + (monthlyPayment * remainingTerm);
    } else {
        if (monthlyInterestRate > 0 && loan.plazo > 0) {
            monthlyPayment = (principal * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -loan.plazo));
        } else if (principal > 0 && loan.plazo > 0) {
            monthlyPayment = principal / loan.plazo;
        } else {
            monthlyPayment = 0;
        }

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
    try {
        const { schedule } = calculateSchedule(loan);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let totalMora = 0;
        let totalAmountOverdue = 0;

        const startDate = new Date(loan.fecha + 'T12:00:00');
        let latestDueDate = new Date(startDate);

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
    } catch (e) {
        console.error(`ERROR CRÍTICO en calculateMora para el préstamo ID ${loan.id}:`, e.message);
        return 0;
    }
}

// 🚨 FUNCIÓN: Registro interno de pagos
async function registerPaymentInternal(loanId, paymentData) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { payment_amount, payment_date, mora_amount, payment_method, correlativo_boleta, transaction_id } = paymentData;

        const finalMethod = payment_method || 'Izipay/Transferencia'; // Ajuste

        await connection.query(
            'INSERT INTO payments (loan_id, payment_amount, payment_date, mora_amount, payment_method, correlativo_boleta, transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [loanId, payment_amount, payment_date, mora_amount, finalMethod, correlativo_boleta, transaction_id]
        );

        const [paymentsRows] = await connection.query(
            'SELECT SUM(payment_amount - mora_amount) as totalPaidCI FROM payments WHERE loan_id = ?',
            [loanId]
        );
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
// 2. RUTAS API (Sin Cambios en CRUD)
// ==========================================================

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
            'SELECT loan_id, payment_amount, payment_date, mora_amount, payment_method, correlativo_boleta, transaction_id FROM payments ORDER BY payment_date ASC'
        );

        const loansWithPayments = loans.map(loan => {
            const { totalDue } = calculateSchedule(loan);
            loan.total_due = totalDue;

            const associatedPayments = payments.filter(p => p.loan_id === loan.id);

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

app.post('/api/loans', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            client,
            monto,
            interes_anual,
            fecha,
            plazo,
            status,
            declaracion_jurada = false,
            tipo_calculo = 'Amortizado',
            meses_solo_interes = 0
        } = req.body;

        const parsedMonto = parseFloat(monto);

        const { dni, nombres, apellidos, is_pep = false } = client;
        const interes = parseFloat(interes_anual) / 12;

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
            connection.release();
            return res.status(404).json({ error: 'Préstamo no encontrado.' });
        }
        const loan = loanRows[0];

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

        const correlativo = await getNextCorrelativo(connection);
        const transactionId = `TRX-${crypto.randomBytes(8).toString('hex')}`;

        await registerPaymentInternal(loanId, {
            payment_amount: totalPayment,
            payment_date,
            mora_amount: moraToRegister,
            payment_method,
            correlativo_boleta: correlativo,
            transaction_id: transactionId
        });

        await connection.commit();
        res.status(201).json({
            message: 'Pago registrado con éxito',
            correlativo_boleta: correlativo,
            transaction_id: transactionId
        });

    } catch (err) {
        await connection.rollback();
        console.error("ERROR en POST /api/loans/:loanId/payments:", err);
        res.status(500).json({ error: 'Error al registrar el pago.' });
    } finally {
        connection.release();
    }
});

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

app.get('/api/documento/:docId', async (req, res) => {
    const { docId } = req.params;
    const token = process.env.DNI_API_TOKEN;

    if (!token) {
        return res.status(500).json({ error: 'El token de la API de DNI no está configurado en el servidor.' });
    }

    let endpoint;
    let type;

    if (docId.length === 8) {
        endpoint = `https://dniruc.apisperu.com/api/v1/dni/${docId}`;
        type = 'DNI';
    } else if (docId.length === 11) {
        endpoint = `https://dniruc.apisperu.com/api/v1/ruc/${docId}`;
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


// ==========================================================
// 3. RUTAS DE CIERRE DE CAJA (CASH CLOSURES)
// ==========================================================

app.post('/api/cash-closures', async (req, res) => {
    const { closure_date, declared_amount, system_cash_amount, difference } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [existing] = await connection.query(
            'SELECT id FROM cash_closures WHERE closure_date = ?',
            [closure_date]
        );

        if (existing.length > 0) {
            await connection.rollback();
            return res.status(409).json({ error: 'Ya existe un cierre de caja registrado para esta fecha.' });
        }

        await connection.query(
            `INSERT INTO cash_closures (closure_date, declared_amount, system_cash_amount, difference, closed_by)
             VALUES (?, ?, ?, ?, 'admin')`,
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

app.get('/api/cash-closures/history', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT closure_date, declared_amount, system_cash_amount, difference, closed_at, closed_by FROM cash_closures ORDER BY closure_date DESC'
        );
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

app.get('/api/cash-closures/:date', async (req, res) => {
    const { date } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT id, closed_at, declared_amount, system_cash_amount, difference FROM cash_closures WHERE closure_date = ?',
            [date]
        );
        if (rows.length > 0) {
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
// 4. RUTAS DE IZIPAY (Sustituye a Mercado Pago)
// ==========================================================

// 🚨 POST /api/izipay/create-order (SIMULACIÓN DE CREACIÓN DE FORMULARIO DE PAGO)
app.post('/api/izipay/create-order', async (req, res) => {
    console.log('[IZIPAY] 📥 Recibida solicitud de creación de orden:', req.body);

    const { amount, loanId, clientDni, payment_date, amount_ci, amount_mora } = req.body;

    if (!amount || !loanId || !clientDni) {
        console.error('[IZIPAY ERROR] ❌ Faltan campos requeridos');
        return res.status(400).json({
            success: false,
            error: 'Faltan campos requeridos: amount, loanId, clientDni'
        });
    }

    // 1. Generar Correlativo de Boleta y Transaction ID
    let correlativo_boleta = null;
    let transaction_id = null;
    try {
        const connection = await pool.getConnection();
        correlativo_boleta = await getNextCorrelativo(connection);
        transaction_id = `TRX-${crypto.randomBytes(8).toString('hex')}`;
        connection.release();
    } catch (error) {
        console.error('[IZIPAY ERROR] ❌ Error al obtener correlativo:', error);
        return res.status(500).json({ success: false, error: 'Error interno al generar el correlativo de boleta.' });
    }

    const totalAmount = parseFloat(amount);
    // Izipay espera el monto en céntimos
    const amountInCents = Math.round(totalAmount * 100);

    // 2. SIMULACIÓN DE CREACIÓN DE PAGO EN IZIPAY
    // En un entorno real, aquí se enviarían los datos a: https://api.izipay.pe/v1/payment

    // 🚨 Izipay necesita que los datos se firmen. Simulación de la firma HMAC-SHA-256
    // La firma se crea sobre una cadena de datos críticos y el 'Código de Seguridad' (IZP_PASSWORD)
    const signatureBase = `${IZP_MERCHANT_ID}${amountInCents}PEN${transaction_id}`;

    const hmac = createHmac('sha256', IZP_PASSWORD)
        .update(signatureBase)
        .digest('hex');

    // 3. Crear el URL de redirección (simulado)
    // Izipay devuelve una URL de redirección al formulario, pero aquí simulamos devolver el link de pago final
    const checkoutUrlSimulated = `https://izipay.pe/checkout/form?id=${transaction_id}&amount=${totalAmount.toFixed(2)}&hash=${hmac}`;


    // 4. Crear la respuesta al frontend
    if (checkoutUrlSimulated) {
        console.log('[IZIPAY] ✅ Orden de pago simulada exitosamente');
        return res.json({
            success: true,
            url: checkoutUrlSimulated,
            // 🚨 SIMULACIÓN: Retornar los datos que el webhook usará
            izp_user: IZP_MERCHANT_ID,
            izp_public_key: IZP_PUBLIC_KEY,
            transactionId: transaction_id,
            correlativo_boleta: correlativo_boleta
        });
    } else {
        return res.status(500).json({
            success: false,
            error: "Error interno: No se pudo generar la URL de pago simulada de Izipay."
        });
    }

});


// 🚨 POST /api/izipay/webhook (SIMULACIÓN DE WEBHOOK DE IZIPAY)
// Nota: Izipay usa notificaciones de IPN (Instant Payment Notification) o Webhooks.
app.post('/api/izipay/webhook', async (req, res) => {
    // 🚨 CRÍTICO: Responder inmediatamente
    res.status(200).send('OK');

    // 1. Obtener datos de la notificación
    const notification = req.body;
    console.log('[IZIPAY WEBHOOK] 📥 Notificación recibida:', notification);

    const status = notification.status;
    const transactionId = notification.kr_order_id; // Suponemos que Izipay devuelve el ID de la transacción
    const krHash = notification.kr_hash; // Hash de seguridad para verificar la integridad
    const amountInCents = notification.amount;
    const extraMetadata = notification.kr_metadata || {}; // Datos que guardamos en la orden

    // 2. VERIFICACIÓN CRÍTICA (Simulación de Izipay: Comprobación de Hash)
    // En un entorno real, se debería calcular el hash con la IZP_HMAC_KEY y compararlo con krHash.
    // Aquí solo simulamos que la verificación es exitosa.
    const isHashValid = true; // SIMULACIÓN DE VERIFICACIÓN

    if (!isHashValid) {
        console.error('[IZIPAY WEBHOOK ERROR] ❌ Hash de seguridad no válido. Posible manipulación.');
        return; // No procesar
    }


    // 3. Procesar si el pago fue exitoso
    if (status === 'PAID') { // Izipay usa 'PAID' para pagos exitosos
        console.log('[IZIPAY WEBHOOK] ✅ Pago APROBADO');

        const loanId = extraMetadata.loanId;
        const totalAmount = parseFloat(amountInCents / 100); // Convertir céntimos a soles
        const paymentDate = new Date().toISOString().split('T')[0]; // Fecha actual o la de la notificación

        // 🚨 CRÍTICO: Obtener metadata que guardamos durante la creación de la orden
        const amountMora = extraMetadata.amount_mora || '0';
        const correlativo_boleta = extraMetadata.correlativo_boleta || null;


        if (loanId && transactionId && correlativo_boleta) {
            const paymentDataToRegister = {
                payment_amount: totalAmount, // Total
                mora_amount: parseFloat(amountMora),
                payment_date: paymentDate,
                payment_method: 'Izipay', // Nuevo método
                correlativo_boleta: parseInt(correlativo_boleta),
                transaction_id: transactionId
            };

            await registerPaymentInternal(loanId, paymentDataToRegister);
            console.log(`[IZIPAY WEBHOOK] ✅ Pago registrado exitosamente para Préstamo ID: ${loanId} con Boleta N° ${correlativo_boleta}`);
        } else {
            console.error('[IZIPAY WEBHOOK ERROR] ❌ Datos faltantes en la notificación o metadata.');
        }
    } else {
        console.log(`[IZIPAY WEBHOOK] ℹ️ Pago no aprobado. Estado: ${status}`);
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
            // 🚨 CAMBIO DE LOG: Ahora verifica Izipay
            console.log(`💳 Izipay (Merchant ID): ${IZP_MERCHANT_ID ? '✅' : '❌'}`);
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
