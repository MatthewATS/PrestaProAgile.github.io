const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---

// Configuración de CORS que permite solicitudes desde tu página de GitHub
const allowedOrigins = ['https://matthewhs.github.io']; // URL CORRECTA
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    },
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

let pool;

// --- Función Principal para Iniciar el Servidor ---
async function startServer() {
    try {
        // Validar que la variable de conexión a la BD exista
        if (!process.env.DATABASE_URL) {
            throw new Error('La variable de entorno DATABASE_URL no está definida.');
        }
        pool = mysql.createPool(process.env.DATABASE_URL);
        
        // Hacer una conexión de prueba para asegurar que todo esté bien
        const connection = await pool.getConnection();
        console.log('✅ Conexión a la base de datos exitosa.');
        connection.release();

        // --- RUTAS DE LA API ---

        // RUTA PARA CONSULTAR DNI
        app.get('/api/dni/:dni', async (req, res) => {
            try {
                const dni = req.params.dni;
                if (!/^\d{8}$/.test(dni)) {
                    return res.status(400).json({ message: 'El DNI debe tener 8 dígitos.' });
                }
                const apiResponse = await fetch(`https://dniruc.apisperu.com/api/v1/dni/${dni}?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImdpbHV4NTBAZ21haWwuY29tIn0.TBCiVxrT5t09jV25O63un2d_4AAb6S3GZ2aJ4g3sT7g`);
                if (!apiResponse.ok) { throw new Error('DNI no encontrado.'); }
                const data = await apiResponse.json();
                res.json(data);
            } catch (error) {
                res.status(404).json({ message: 'No se encontraron datos para el DNI.' });
            }
        });

        // RUTA PARA OBTENER TODOS LOS PRÉSTAMOS
        app.get('/api/loans', async (req, res) => {
            try {
                const [loans] = await pool.query('SELECT * FROM loans ORDER BY fecha DESC');
                res.json(loans);
            } catch (err) {
                console.error("❌ ERROR en GET /api/loans:", err.message);
                res.status(500).json({ error: 'Error al obtener los préstamos' });
            }
        });

        // RUTA PARA CREAR UN NUEVO PRÉSTAMO
        app.post('/api/loans', async (req, res) => {
            try {
                const { client, monto, interes, fecha, plazo, status, declaracion_jurada } = req.body;
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
                console.error("❌ ERROR en POST /api/loans:", err.message);
                res.status(500).json({ error: 'Error al guardar el préstamo' });
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

// Ejecutar la función para iniciar todo
startServer();
