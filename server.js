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

// GET /api/loans (MODIFICADO)
app.get('/api/loans', async (req, res) => {
  try {
    const query = `
      SELECT 
        l.id, l.monto, l.interes, l.fecha, l.plazo, l.status,
        c.dni, c.nombres, c.apellidos, c.is_pep
      FROM loans l
      JOIN clients c ON l.client_id = c.id
      ORDER BY l.fecha DESC, l.id DESC;
    `;
    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error("ERROR en GET /api/loans:", err);
    res.status(500).json({ error: 'Error al obtener los préstamos' });
  }
});


// POST /api/loans (MODIFICADO)
app.post('/api/loans', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { client, monto, interes, fecha, plazo, status, declaracion_jurada = false } = req.body;
    const { dni, nombres, apellidos, is_pep = false } = client;

    // Validación de préstamo activo (sin cambios)
    const searchActiveLoanQuery = `
      SELECT l.id FROM loans l JOIN clients c ON l.client_id = c.id
      WHERE c.dni = ? AND l.status = 'Activo' LIMIT 1;`;
    const [activeLoans] = await connection.query(searchActiveLoanQuery, [dni]);

    if (activeLoans.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'El cliente ya tiene un préstamo activo.' });
    }

    // Lógica para crear o actualizar cliente
    let [existingClient] = await connection.query('SELECT id FROM clients WHERE dni = ?', [dni]);
    let clientId;

    if (existingClient.length > 0) {
      // Si el cliente existe, actualizamos su estado PEP
      clientId = existingClient[0].id;
      await connection.query('UPDATE clients SET is_pep = ? WHERE id = ?', [is_pep, clientId]);
    } else {
      // Si el cliente es nuevo, lo insertamos con su estado PEP
      const [result] = await connection.query(
        'INSERT INTO clients (dni, nombres, apellidos, is_pep) VALUES (?, ?, ?, ?)',
        [dni, nombres, apellidos, is_pep]
      );
      clientId = result.insertId;
    }
    
    // Insertar el nuevo préstamo
    const loanQuery = `
      INSERT INTO loans (client_id, monto, interes, fecha, plazo, status, declaracion_jurada) 
      VALUES (?, ?, ?, ?, ?, ?, ?);`;
    const loanValues = [clientId, monto, interes, fecha, plazo, status, declaracion_jurada];
    await connection.query(loanQuery, loanValues);

    await connection.commit();
    res.status(201).json({ ...req.body, client_id: clientId });

  } catch (err) {
    await connection.rollback();
    console.error("ERROR en POST /api/loans:", err);
    res.status(500).json({ error: 'Error al guardar el préstamo' });
  } finally {
    connection.release();
  }
});

// ... (El resto del archivo server.js no necesita cambios) ...
app.get('/api/dni/:dni', async (req, res) => { /* ... sin cambios ... */ });
const startServer = async () => { /* ... sin cambios ... */ };
startServer();
