const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise'); // Importamos mysql2
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Conexión a la base de datos MySQL de Railway ---
// Creamos un "pool" de conexiones que gestiona las conexiones de forma eficiente.
// La variable DATABASE_URL es proporcionada por Railway.
const pool = mysql.createPool(process.env.DATABASE_URL);

// --- RUTAS DE LA API ---

// OBTENER TODOS LOS PRÉSTAMOS
app.get('/api/loans', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM loans ORDER BY fecha DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los préstamos' });
  }
});

// GUARDAR UN NUEVO PRÉSTAMO
// GUARDAR UN NUEVO PRÉSTAMO
app.post('/api/loans', async (req, res) => {
  try {
    const newLoan = req.body;
    
    // Cambiamos 'id' por 'dni' en la consulta
    const query = `
      INSERT INTO loans (dni, client, monto, interes, fecha, plazo, status)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `;
    
    const values = [
      newLoan.client.dni, // <-- Usamos el DNI del cliente como clave primaria
      JSON.stringify(newLoan.client),
      newLoan.monto,
      newLoan.interes,
      newLoan.fecha,
      newLoan.plazo,
      newLoan.status
    ];
    
    await pool.query(query, values);
    res.status(201).json(newLoan);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar el préstamo' });
  }
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
