const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fetch = require('node-fetch'); // Necesario para la consulta de DNI

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
// app.use(express.static(path.join(__dirname, 'public'))); // Esta línea no es necesaria en tu configuración actual

// Conexión a la base de datos
const pool = mysql.createPool(process.env.DATABASE_URL);


// --- RUTAS DE LA API ---

// CAMBIO 1: SE AGREGA LA RUTA PARA BUSCAR DNI
app.get('/api/dni/:dni', async (req, res) => {
    try {
        const dni = req.params.dni;
        if (!/^\d{8}$/.test(dni)) {
            return res.status(400).json({ message: 'El DNI debe tener 8 dígitos.' });
        }
        
        // Se utiliza una API externa y gratuita para obtener los datos
        const apiResponse = await fetch(`https://dniruc.apisperu.com/api/v1/dni/${dni}?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImdpbHV4NTBAZ21haWwuY29tIn0.TBCiVxrT5t09jV25O63un2d_4AAb6S3GZ2aJ4g3sT7g`);

        if (!apiResponse.ok) {
            throw new Error('DNI no encontrado.');
        }

        const data = await apiResponse.json();
        res.json(data);

    } catch (error) {
        console.error("ERROR en GET /api/dni:", error.message);
        res.status(404).json({ message: 'No se encontraron datos para el DNI.' });
    }
});


// CAMBIO 2: SE CORRIGE LA LECTURA DE PRÉSTAMOS
app.get('/api/loans', async (req, res) => {
  try {
    // La consulta ahora devuelve los datos "planos" que el frontend necesita
    const [loans] = await pool.query('SELECT * FROM loans ORDER BY fecha DESC');
    res.json(loans);
  } catch (err) {
    console.error("ERROR en GET /api/loans:", err);
    res.status(500).json({ error: 'Error al obtener los préstamos' });
  }
});


// CAMBIO 3: SE CORRIGE LA ESCRITURA DE PRÉSTAMOS
app.post('/api/loans', async (req, res) => {
  try {
    const { client, monto, interes, fecha, plazo, status, declaracion_jurada } = req.body;
    
    // La consulta ahora guarda los nombres y apellidos en sus propias columnas
    const query = `
        INSERT INTO loans (dni, nombres, apellidos, monto, interes, fecha, plazo, status, declaracion_jurada) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const values = [
      client.dni,
      client.nombres,
      client.apellidos,
      monto,
      interes,
      fecha,
      plazo,
      status,
      !!declaracion_jurada
    ];
    await pool.query(query, values);
    res.status(201).json({ message: 'Préstamo guardado' });
  } catch (err) {
    console.error("ERROR en POST /api/loans:", err);
    res.status(500).json({ error: 'Error al guardar el préstamo' });
  }
});


// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
