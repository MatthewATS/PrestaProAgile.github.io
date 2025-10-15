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

// GET /api/loans (MODIFICADO para incluir los pagos)
app.get('/api/loans', async (req, res) => {
  try {
    // 1. Obtenemos todos los préstamos
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

    // 2. Obtenemos todos los pagos
    const [payments] = await pool.query('SELECT * FROM payments ORDER BY payment_date ASC');

    // 3. Calculamos el total debido y asociamos los pagos a cada préstamo
    const loansWithPayments = loans.map(loan => {
      const monthlyInterestRate = parseFloat(loan.interes) / 100;
      let totalDue;
      // Simplificación del cálculo del total. Una versión más avanzada calcularía el total con intereses compuestos.
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

// POST /api/loans (Sin cambios, pero incluido para que el archivo esté completo)
app.post('/api/loans', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { client, monto, interes, fecha, plazo, status, declaracion_jurada = false, tipo_calculo = 'Amortizado', meses_solo_interes = 0 } = req.body;
    const { dni, nombres, apellidos, is_pep = false } = client;

    if (monto < 100 || monto > 20000) {
      await connection.rollback();
      return res.status(400).json({ error: 'El monto del préstamo debe estar entre S/ 100 y S/ 20,000.' });
    }

    const searchActiveLoanQuery = `
      SELECT l.id FROM loans l JOIN clients c ON l.client_id = c.id
      WHERE c.dni = ? AND l.status = 'Activo' LIMIT 1;`;
    const [activeLoans] = await connection.query(searchActiveLoanQuery, [dni]);

    if (activeLoans.length > 0) {
      await connection.rollback();
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
    
    const loanQuery = `
      INSERT INTO loans (client_id, monto, interes, fecha, plazo, status, declaracion_jurada, tipo_calculo, meses_solo_interes) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`;
    const loanValues = [clientId, monto, interes, fecha, plazo, status, declaracion_jurada, tipo_calculo, meses_solo_interes];
    await connection.query(loanQuery, loanValues);

    await connection.commit();
    res.status(201).json({ ...req.body, client_id: clientId });

  } catch (err) {
    await connection.rollback();
    console.error("----------- ERROR DE BASE DE DATOS -----------");
    console.error(`Ocurrió un error al intentar guardar un préstamo para el DNI: ${req.body.client.dni}`);
    console.error("Mensaje del error de MySQL:", err.message);
    console.error("--------------------------------------------");
    
    res.status(500).json({ error: 'Error interno al guardar en la base de datos.' });
  } finally {
    connection.release();
  }
});

// --- RUTA PARA REGISTRAR PAGOS ---
app.post('/api/loans/:loanId/payments', async (req, res) => {
    const { loanId } = req.params;
    const { payment_amount, payment_date } = req.body;
    
    if (!payment_amount || !payment_date || parseFloat(payment_amount) <= 0) {
        return res.status(400).json({ error: 'El monto y la fecha del pago son obligatorios.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Insertar el nuevo pago
        const paymentQuery = 'INSERT INTO payments (loan_id, payment_amount, payment_date) VALUES (?, ?, ?)';
        await connection.query(paymentQuery, [loanId, payment_amount, payment_date]);

        // 2. Recalcular el total pagado para este préstamo
        const [totalPaidRows] = await connection.query('SELECT SUM(payment_amount) as totalPaid FROM payments WHERE loan_id = ?', [loanId]);
        const totalPaid = totalPaidRows[0].totalPaid || 0;
        
        // 3. Obtener el monto original del préstamo para comparar
        const [loanRows] = await connection.query('SELECT monto, interes, plazo, tipo_calculo, meses_solo_interes FROM loans WHERE id = ?', [loanId]);
        const loan = loanRows[0];

        // 4. Calcular el total que se debe pagar (capital + intereses)
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

        // 5. Si el total pagado es mayor o igual al total debido, actualizar el estado
        if (totalPaid >= totalDue) {
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

// --- ¡NUEVA RUTA PARA ELIMINAR PRÉSTAMOS! ---
app.delete('/api/loans/:loanId', async (req, res) => {
    const { loanId } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Paso 1: Eliminar todos los pagos asociados al préstamo.
        // Esto es crucial para mantener la integridad de la base de datos.
        await connection.query('DELETE FROM payments WHERE loan_id = ?', [loanId]);

        // Paso 2: Eliminar el préstamo principal.
        const [result] = await connection.query('DELETE FROM loans WHERE id = ?', [loanId]);

        // Si no se afectó ninguna fila, significa que el préstamo no existía.
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


// RUTA PROXY PARA DNI (Sin cambios)
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


// FUNCIÓN PARA INICIAR EL SERVIDOR (Sin cambios)
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
