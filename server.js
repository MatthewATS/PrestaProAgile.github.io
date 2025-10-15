const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool(process.env.DATABASE_URL);

// --- RUTAS DE LA API ---

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
    const [payments] = await pool.query('SELECT * FROM payments ORDER BY payment_date ASC');

    const loansWithPayments = loans.map(loan => {
      const monthlyInterestRate = parseFloat(loan.interes) / 100;
      let totalDue;
      if (loan.tipo_calculo === 'Hibrido' && loan.meses_solo_interes > 0) {
        const interestOnlyPayment = loan.monto * monthlyInterestRate;
        const remainingTerm = loan.plazo - loan.meses_solo_interes;
        const amortizedPayment = (loan.monto * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -remainingTerm));
        totalDue = (interestOnlyPayment * loan.meses_solo_interes) + (amortizedPayment * remainingTerm);
      } else {
        const monthlyPayment = (loan.monto * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -loan.plazo));
        totalDue = monthlyPayment * loan.plazo;
      }

      const associatedPayments = payments.filter(p => p.loan_id === loan.id);
      const totalPaid = associatedPayments.reduce((sum, p) => sum + parseFloat(p.payment_amount), 0);

      return {
        ...loan,
        payments: associatedPayments,
        total_due: totalDue,
        total_paid: totalPaid
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

    const { client, monto, interes, fecha, plazo, status, declaracion_jurada = false, tipo_calculo = 'Amortizado', meses_solo_interes = 0 } = req.body;
    const { dni, nombres, apellidos, is_pep = false } = client;

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
    
    await connection.query(`INSERT INTO loans (client_id, monto, interes, fecha, plazo, status, declaracion_jurada, tipo_calculo, meses_solo_interes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`, [clientId, monto, interes, fecha, plazo, status, declaracion_jurada, tipo_calculo, meses_solo_interes]);

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

// POST /api/loans/:loanId/payments (RUTA CORREGIDA)
app.post('/api/loans/:loanId/payments', async (req, res) => {
    const { loanId } = req.params;
    const { payment_amount, payment_date } = req.body;
    
    if (!payment_amount || !payment_date || parseFloat(payment_amount) <= 0) {
        return res.status(400).json({ error: 'El monto y la fecha del pago son obligatorios.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [loanRows] = await connection.query('SELECT monto, interes, plazo, tipo_calculo, meses_solo_interes FROM loans WHERE id = ?', [loanId]);
        if (loanRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Préstamo no encontrado.' });
        }
        const loan = loanRows[0];
        
        const [totalPaidRows] = await connection.query('SELECT SUM(payment_amount) as totalPaid FROM payments WHERE loan_id = ?', [loanId]);
        const totalPaid = totalPaidRows[0].totalPaid || 0;

        const monthlyInterestRate = parseFloat(loan.interes) / 100;
        let totalDue;
        if (loan.tipo_calculo === 'Hibrido' && loan.meses_solo_interes > 0) {
            const interestOnlyPayment = loan.monto * monthlyInterestRate;
            const remainingTerm = loan.plazo - loan.meses_solo_interes;
            const amortizedPayment = (loan.monto * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -remainingTerm));
            totalDue = (interestOnlyPayment * loan.meses_solo_interes) + (amortizedPayment * remainingTerm);
        } else {
            const monthlyPayment = (loan.monto * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -loan.plazo));
            totalDue = monthlyPayment * loan.plazo;
        }

        // ===== ¡VALIDACIÓN CORREGIDA! =====
        const remainingBalance = totalDue - totalPaid;
        // Se redondea el saldo pendiente a 2 decimales ANTES de comparar
        const roundedRemainingBalance = Math.round(remainingBalance * 100) / 100;
        
        // Se compara el pago con el saldo redondeado.
        if (parseFloat(payment_amount) > roundedRemainingBalance) {
            await connection.rollback();
            return res.status(400).json({ error: `El pago excede el saldo pendiente de S/ ${roundedRemainingBalance.toFixed(2)}.` });
        }
        
        await connection.query('INSERT INTO payments (loan_id, payment_amount, payment_date) VALUES (?, ?, ?)', [loanId, payment_amount, payment_date]);

        const newTotalPaid = totalPaid + parseFloat(payment_amount);

        // Se usa una pequeña tolerancia para la comparación final por si quedan micro-decimales
        if (newTotalPaid >= totalDue - 0.001) {
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


// RUTA PROXY PARA DNI
app.get('/api/dni/:dni', async (req, res) => {
  const { dni } = req.params;
  const token = process.env.DNI_API_TOKEN;

  if (!token) {
    return res.status(500).json({ message: 'El token de la API de DNI no está configurado en el servidor.' });
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
    res.status(500).json({ message: 'Error interno al consultar la API de DNI.' });
  }
});


// FUNCIÓN PARA INICIAR EL SERVIDOR
const startServer = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conexión a la base de datos establecida con éxito.');
    connection.release();

    app.listen(PORT, () => {
      console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
    });

  } catch (err) {
    console.error('❌ No se pudo conectar a la base de datos. Verifica la variable de entorno DATABASE_URL.');
    console.error(err.message);
    process.exit(1);
  }
};

startServer();
