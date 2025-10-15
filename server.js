const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---

// CAMBIO 1: CORS más flexible para aceptar variaciones en la URL de origen
const allowedOrigins = ['https://matthewhs.github.io', 'https://matthewhs.github.io/'];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());


let pool;

async function startServer() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('La variable de entorno DATABASE_URL no está definida.');
    }
    pool = mysql.createPool(process.env.DATABASE_URL);
    await pool.getConnection();
    console.log('✅ Conexión a la base de datos exitosa.');

    // --- RUTAS DE LA API ---

    app.get('/api/loans', async (req, res) => {
      try {
        const sqlQuery = 'SELECT id, dni, nombres, apellidos, monto, interes, fecha, plazo, status, declaracion_jurada FROM loans ORDER BY fecha DESC';
        const [loans] = await pool.query(sqlQuery);
        res.json(loans);
      } catch (err) {
        // CAMBIO 2: Registro de error más detallado
        // Esto te dirá exactamente por qué falló la consulta SQL en los logs de Railway.
        console.error("❌ ERROR en la consulta SQL [GET /api/loans]:", err.message);
        res.status(500).json({ error: 'Error interno del servidor al obtener los préstamos.', details: err.message });
      }
    });

    app.post('/api/loans', async (req, res) => {
      try {
        const { client, monto, interes, fecha, plazo, status, declaracion_jurada } = req.body;
        if (!client || !client.dni || !client.nombres || !client.apellidos) {
          return res.status(400).json({ error: 'Faltan datos del cliente.' });
        }
        const query = `
          INSERT INTO loans (dni, nombres, apellidos, monto, interes, fecha, plazo, status, declaracion_jurada) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        `;
        const values = [
          client.dni, client.nombres, client.apellidos, monto, interes, fecha, plazo, status, !!declaracion_jurada
        ];
        await pool.query(query, values);
        res.status(201).json({ message: 'Préstamo creado exitosamente' });
      } catch (err) {
        console.error("❌ ERROR en la consulta SQL [POST /api/loans]:", err.message);
        res.status(500).json({ error: 'Error interno del servidor al guardar el préstamo.', details: err.message });
      }
    });

    // --- Iniciar el servidor ---
    app.listen(PORT, () => {
      console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
    });

  } catch (error) {
    console.error('❌ Error fatal al iniciar el servidor:', error.message);
    process.exit(1);
  }
}

startServer();
