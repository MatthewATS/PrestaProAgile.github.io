const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---

// CAMBIO 1: Configuración de CORS más específica y robusta
// Esto le da permiso explícito a tu frontend para que se conecte.
const corsOptions = {
  origin: 'https://matthewhs.github.io',
  optionsSuccessStatus: 200 // Para compatibilidad con navegadores antiguos
};
app.use(cors(corsOptions));
app.use(express.json());


// --- Conexión a la base de datos ---
let pool; // Definimos pool aquí para que sea accesible globalmente

// CAMBIO 2: Función asíncrona para iniciar el servidor
// Esto nos permite verificar la conexión a la BD antes de que el servidor empiece a escuchar peticiones.
async function startServer() {
  try {
    // Verificamos que la variable de entorno exista
    if (!process.env.DATABASE_URL) {
      throw new Error('La variable de entorno DATABASE_URL no está definida.');
    }
    
    pool = mysql.createPool(process.env.DATABASE_URL);
    
    // Intentamos hacer una conexión de prueba
    await pool.getConnection();
    console.log('✅ Conexión a la base de datos exitosa.');

    // --- RUTAS DE LA API (AHORA DENTRO DE startServer) ---

    app.get('/api/loans', async (req, res) => {
      try {
        const [loans] = await pool.query(
          'SELECT id, dni, nombres, apellidos, monto, interes, fecha, plazo, status, declaracion_jurada FROM loans ORDER BY fecha DESC'
        );
        res.json(loans);
      } catch (err) {
        console.error("ERROR en GET /api/loans:", err);
        res.status(500).json({ error: 'Error al obtener los préstamos' });
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
        console.error("ERROR en POST /api/loans:", err);
        res.status(500).json({ error: 'Error al guardar el préstamo' });
      }
    });

    // --- Iniciar el servidor ---
    app.listen(PORT, () => {
      console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
    });

  } catch (error) {
    console.error('❌ Error fatal al iniciar el servidor:', error.message);
    process.exit(1); // Detiene la aplicación si no se puede conectar a la BD
  }
}

// Ejecutamos la función para iniciar todo
startServer();
