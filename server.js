const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---

// Configuración final y correcta de CORS
const allowedOrigins = ['https://matthewhs.github.io'];
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir solicitudes sin origen (como Postman, apps móviles, etc.)
    if (!origin) return callback(null, true);
    
    // Normalizar el origen quitando el slash final si existe
    const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;

    if (allowedOrigins.indexOf(normalizedOrigin) !== -1) {
      callback(null, true);
    } else {
      // Si el origen no está permitido, rechazar la solicitud
      callback(new Error(`El origen ${origin} no está permitido por CORS.`));
    }
  },
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

let pool;

// Función para iniciar la aplicación
async function startServer() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('La variable de entorno DATABASE_URL no está definida.');
    }
    pool = mysql.createPool(process.env.DATABASE_URL);
    // Realizar una conexión de prueba para validar las credenciales
    const connection = await pool.getConnection();
    console.log('✅ Conexión a la base de datos exitosa.');
    connection.release(); // Liberar la conexión de prueba

    // --- RUTAS DE LA API ---

    app.get('/api/loans', async (req, res) => {
      try {
        const sqlQuery = 'SELECT id, dni, nombres, apellidos, monto, interes, fecha, plazo, status, declaracion_jurada FROM loans ORDER BY fecha DESC';
        const [loans] = await pool.query(sqlQuery);
        res.json(loans);
      } catch (err) {
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

// Iniciar la aplicación
startServer();
