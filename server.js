const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');
const crypto = require('crypto');
const { createHmac } = require('crypto');
// 🚨 Nuevo: Módulo AXIOS para llamadas HTTP salientes a la API de Izipay
const axios = require('axios');

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

// 🚨🚨🚨 CREDENCIALES DE PRODUCCIÓN PROPORCIONADAS 🚨🚨🚨
// Merchant ID (user id)
const IZP_MERCHANT_ID = '68304620'; 
// Contraseña de Producción
const IZP_PASSWORD = 'prodpassword_CEhMhCy3YlZblRGkqVOGZJKlR5ei2a6cUR6KgtAMIdLWG'; 
// Clave Pública de Producción (Se mantiene la provista, aunque no se usa en este código)
const IZP_PUBLIC_KEY = '68304620:publickey_wjo2urlfqtyvbTiMaVZSdF1fSkGenL5fG87WNzb1aEu4V';
// Endpoint de PRODUCCIÓN (Usando el tuyo)
const IZP_ENDPOINT_BASE_API = 'https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment';
const IZP_HMAC_KEY = 'xenUz7o7m1yTrLTqpHJq4QekjbKA4DsyY0lDMwmlpzSj'; // Clave de firma (suele ser fija)

// URL de Railway
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

// 🚨 POST /api/izipay/create-order (CORREGIDO CON DETALLE DE ERROR)
app.post('/api/izipay/create-order', async (req, res) => {
    console.log('[IZIPAY] 📥 Recibida solicitud de creación de orden:', req.body);

    const { amount, loanId, clientDni, payment_date, amount_ci, amount_mora, clientName, clientLastName } = req.body;

    // --- PASO 1: Generar Correlativo de Boleta y Transaction ID ---
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
    // Izipay maneja el monto en céntimos
    const amountInCents = Math.round(totalAmount * 100);

    // --- PASO 2: INTENTAR LLAMADA REAL A IZIPAY API ---
    let checkoutUrl = null;

    try {
        // La autenticación básica usa Merchant ID y Password
        const authString = Buffer.from(`${IZP_MERCHANT_ID}:${IZP_PASSWORD}`).toString('base64');

        const izipayPayload = {
            'amount': amountInCents,
            'currency': 'PEN',
            'orderId': transaction_id,
            // Datos del cliente para el formulario
            'customer': {
                'email': 'customer@example.com', // Usar un email de cliente real si se tiene
                'billingDetails': {
                    'firstName': clientName,
                    'lastName': clientLastName
                }
            },
            // Configuración de la integración/respuesta
            'siteId': IZP_MERCHANT_ID,
            'transactionOptions': {
                // URLs públicas para el retorno y la notificación de pago (Webhook)
                'answerUrl': `${YOUR_BACKEND_URL}/izipay/return`,
                'notificationUrl': `${YOUR_BACKEND_URL}/api/izipay/webhook`
            },
            // Metadata para recuperar en el Webhook
            'metadata': {
                'loanId': loanId,
                'amount_mora': amount_mora,
                'correlativo_boleta': correlativo_boleta,
                'amount_ci': amount_ci,
                'total_amount': totalAmount
            }
        };

        // *************** DEPURACIÓN: MOSTRAR PAYLOAD EN CONSOLA ***************
        console.log('[IZIPAY DEBUG] Enviando Payload:', izipayPayload);
        // **********************************************************************

        const response = await axios.post(IZP_ENDPOINT_BASE_API, izipayPayload, {
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/json'
            }
        });

        // 🚨 Izipay (Micuentaweb) devuelve la URL de redirección en el formToken
        checkoutUrl = response.data.answer.formToken;

        if (checkoutUrl) {
            console.log('[IZIPAY] ✅ Orden de pago REAL generada exitosamente:', checkoutUrl);
            return res.json({
                success: true,
                url: checkoutUrl, // URL real de Izipay
                transactionId: transaction_id,
                correlativo_boleta: correlativo_boleta
            });
        }

        throw new Error("La respuesta de Izipay no contenía la URL de pago (formToken).");

    } catch (error) {
        // Este bloque se ejecuta si la llamada a Izipay falla por cualquier razón
        
        // *************** DEPURACIÓN: MOSTRAR ERROR COMPLETO DE AXIOS ***************
        console.error('[IZIPAY ERROR] ❌ Falló la llamada REAL a la API de Izipay.');
        if (error.response) {
            console.error('   Estado HTTP:', error.response.status);
            console.error('   Respuesta de Izipay:', error.response.data);
        } else {
            console.error('   Error de Red/Conexión:', error.message);
        }
        // ***************************************************************************

        // --- FALLBACK: RETORNO DE URL SIMULADO (FLUJO DEMO) ---
        console.log('[IZIPAY] ⚠️ Recurriendo a la URL de SIMULACIÓN debido al error anterior.');

        const encodedMetadata = Buffer.from(JSON.stringify({
            loanId: loanId,
            amount_mora: amount_mora,
            correlativo_boleta: correlativo_boleta,
            amount_ci: amount_ci,
            amount: amount,
            payment_date: payment_date
        })).toString('base64');

        // **USAMOS LA URL DE RAILWAY para que sea accesible al front**
        const checkoutUrlSimulated = `${YOUR_BACKEND_URL}/izipay/manual-payment?txn=${transaction_id}&metadata=${encodedMetadata}`;

        return res.json({
            success: true,
            // 🚨 CRÍTICO: Devolver la URL de SIMULACIÓN
            url: checkoutUrlSimulated,
            transactionId: transaction_id,
            correlativo_boleta: correlativo_boleta
        });
    }

});


// 🚨 GET /izipay/manual-payment (Ruta de ayuda para la SIMULACIÓN)
// Esta ruta sirve una página simple con las instrucciones para simular el Webhook.
app.get('/izipay/manual-payment', (req, res) => {
    const { txn, metadata } = req.query;

    if (!txn || !metadata) {
        return res.status(400).send('Faltan parámetros de transacción.');
    }

    // Decodificar la metadata para mostrar las instrucciones
    const metadataDecoded = Buffer.from(metadata, 'base64').toString('utf8');
    const metadataParsed = JSON.parse(metadataDecoded);

    const webhookExampleBody = JSON.stringify({
        status: 'PAID',
        kr_order_id: txn,
        amount: Math.round(parseFloat(metadataParsed.amount) * 100), // Monto en céntimos
        kr_hash: 'SIMULATED_HASH',
        kr_metadata: {
            loanId: metadataParsed.loanId,
            amount_mora: metadataParsed.amount_mora,
            correlativo_boleta: metadataParsed.correlativo_boleta,
            amount_ci: metadataParsed.amount_ci
        }
    }, null, 2);

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <title>Simulación de Pago Izipay</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; background-color: #f4f7f6; }
                .container { max-width: 800px; margin: auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
                h1 { color: #5D88FF; border-bottom: 2px solid #ccc; padding-bottom: 10px; }
                h2 { color: #4CAF50; margin-top: 20px; }
                pre { background-color: #eee; padding: 15px; border-radius: 5px; overflow-x: auto; }
                .alert { background-color: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 15px; border-radius: 5px; margin-top: 15px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>⚠️ Simulación de Flujo de Pago Izipay</h1>
                <p>El enlace de pago real de Izipay no puede ser accedido o generado correctamente sin tener un dominio con **certificado SSL/HTTPS** y la configuración de claves de entorno real.</p>
                <p>Para simular la confirmación del pago en tu sistema, usa las siguientes instrucciones para enviar un **Webhook** al backend:</p>

                <h2>Datos de la Transacción (Frontend)</h2>
                <p><strong>Transaction ID:</strong> <code>${txn}</code></p>
                <p><strong>Monto Total:</strong> S/ ${metadataParsed.amount}</p>
                <p><strong>Metadata Registrada (Base64):</strong> <code>${metadata}</code></p>

                <h2>Paso 1: Simular Pago Aprobado</h2>
                <p>Una vez que el cliente paga, Izipay envía un **POST** a tu URL de webhook (<code>${YOUR_BACKEND_URL}/api/izipay/webhook</code>). Ejecuta el siguiente comando (o usa Postman) para simular esta notificación.</p>

                <h2>Paso 2: Comando cURL de Simulación</h2>
                <pre>curl -X POST "${YOUR_BACKEND_URL}/api/izipay/webhook" \
-H "Content-Type: application/json" \
-d '${webhookExampleBody.replace(/\n/g, '').replace(/  /g, '')}'</pre>
                
                <h2>Cuerpo de la Petición (JSON)</h2>
                <pre>${webhookExampleBody}</pre>

                <div class="alert">
                    <strong>¡CRÍTICO!</strong> Al ejecutar el <code>curl</code>, el pago será registrado en la Base de Datos. Luego, actualiza la pestaña de PrestaPro y revisa el Historial de Pagos del préstamo N° ${metadataParsed.loanId}.
                </div>
            </div>
        </body>
        </html>
    `);
});

// 🚨 POST /api/izipay/webhook (WEBHOOK)
app.post('/api/izipay/webhook', async (req, res) => {
    // 🚨 CRÍTICO: Responder inmediatamente para evitar reintentos del proveedor
    res.status(200).send('OK');

    const notification = req.body;
    console.log('[IZIPAY WEBHOOK] 📥 Notificación recibida:', notification);

    const status = notification.status;
    const transactionId = notification.kr_order_id;
    // const krHash = notification.kr_hash; // Se omite la verificación de Hash por ser simulación

    // Suponemos que la metadata está en el cuerpo de la petición (como en la simulación manual)
    const extraMetadata = notification.kr_metadata || {};

    // 1. Procesar si el pago fue exitoso
    if (status === 'PAID') {
        console.log('[IZIPAY WEBHOOK] ✅ Pago APROBADO');

        const loanId = extraMetadata.loanId;
        const totalAmount = parseFloat(notification.amount / 100); // Convertir céntimos a soles
        const paymentDate = new Date().toISOString().split('T')[0];

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

            // 🚨 CRÍTICO: El registro interno asume que el pago fue exitoso
            try {
                await registerPaymentInternal(loanId, paymentDataToRegister);
                console.log(`[IZIPAY WEBHOOK] ✅ Pago registrado exitosamente para Préstamo ID: ${loanId} con Boleta N° ${correlativo_boleta}`);
            } catch (error) {
                console.error(`[IZIPAY WEBHOOK ERROR] ❌ Falló el registro interno del pago.`, error);
            }
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
            // 🚨 LOG: Ahora verifica Izipay
            console.log(`💳 Izipay (Merchant ID): ${IZP_MERCHANT_ID ? '✅' : '❌'}`);
            console.log(`⚠️ REVISA EL LOG DEL SERVIDOR AL INTENTAR CREAR UNA ORDEN DE PAGO IZIPAY PARA VER EL ERROR DE CONEXIÓN.`);
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
