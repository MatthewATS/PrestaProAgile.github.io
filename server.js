const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conexión a la base de datos
const pool = mysql.createPool(process.env.DATABASE_URL);

// --- RUTAS DE LA API ---

app.get('/api/loans', async (req, res) => {
  try {
    console.log("INTENTO: Obteniendo préstamos desde /api/loans");
    const [rows] = await pool.query('SELECT * FROM loans ORDER BY fecha DESC');
    console.log("ÉXITO: Préstamos obtenidos.");
    res.json(rows);
  } catch (err) {
    console.error("ERROR en GET /api/loans:", err);
    res.status(500).json({ error: 'Error al obtener los préstamos' });
  }
});

app.post('/api/loans', async (req, res) => {
  try {
    const newLoan = req.body;
    const query = `INSERT INTO loans (dni, client, monto, interes, fecha, plazo, status) VALUES (?, ?, ?, ?, ?, ?, ?);`;
    const values = [
      newLoan.client.dni, JSON.stringify(newLoan.client), newLoan.monto,
      newLoan.interes, newLoan.fecha, newLoan.plazo, newLoan.status
    ];
    await pool.query(query, values);
    res.status(201).json(newLoan);
  } catch (err) {
    console.error("ERROR en POST /api/loans:", err);
    res.status(500).json({ error: 'Error al guardar el préstamo' });
  }
});

// --- RUTA DE DIAGNÓSTICO "ATRAPA-TODO" ---
// Esta ruta debe ir AL FINAL, justo antes de app.listen.
// Atrapa cualquier petición que no coincida con las rutas de arriba.
app.use((req, res) => {
  console.log(`RUTA NO ENCONTRADA: Se recibió una petición a: ${req.method} ${req.path}`);
  res.status(404).send({ error: 'Ruta no encontrada en el servidor. Verifica la URL.' });
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
