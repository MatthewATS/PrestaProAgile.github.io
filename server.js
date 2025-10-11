const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors()); // Permite peticiones desde otros orígenes
app.use(express.json()); // Permite al servidor entender JSON
app.use(express.static(path.join(__dirname, 'public'))); // Sirve tus archivos HTML, CSS, JS

// Conexión a la base de datos de Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// --- RUTAS DE LA API ---

// OBTENER TODOS LOS PRÉSTAMOS
app.get('/api/loans', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM loans ORDER BY fecha DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los préstamos' });
  }
});

// GUARDAR UN NUEVO PRÉSTAMO
app.post('/api/loans', async (req, res) => {
  try {
    const newLoan = req.body;
    // El cliente se guardará como un objeto JSON en la base de datos
    const query = `
      INSERT INTO loans (id, client, monto, interes, fecha, plazo, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const values = [
      newLoan.id,
      newLoan.client, // client es un objeto JSON
      newLoan.monto,
      newLoan.interes,
      newLoan.fecha,
      newLoan.plazo,
      newLoan.status
    ];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar el préstamo' });
  }
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
