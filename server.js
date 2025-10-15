const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config(); // Asegúrate de tener dotenv instalado (npm i dotenv)

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// --- Conexión a la base de datos ---
// La configuración ahora se lee desde las variables de entorno para mayor seguridad
const pool = mysql.createPool(process.env.DATABASE_URL);


// --- RUTAS DE LA API ---

// RUTA GET: Obtener todos los préstamos
app.get('/api/loans', async (req, res) => {
    try {
        // La consulta ahora trae los datos en el formato que el frontend espera
        const [loans] = await pool.query(
            'SELECT id, dni, nombres, apellidos, monto, interes, fecha, plazo, status, declaracion_jurada FROM loans ORDER BY fecha DESC'
        );
        res.json(loans); // Se envían los datos directamente, ya no se necesita mapeo
    } catch (err) {
        console.error("ERROR en GET /api/loans:", err);
        res.status(500).json({ error: 'Error al obtener los préstamos' });
    }
});

// RUTA POST: Crear un nuevo préstamo
app.post('/api/loans', async (req, res) => {
    try {
        const newLoan = req.body;
        const clientData = newLoan.client; // Obtenemos el objeto cliente

        // Verificamos que los datos del cliente existan
        if (!clientData || !clientData.dni || !clientData.nombres || !clientData.apellidos) {
            return res.status(400).json({ error: 'Faltan datos del cliente.' });
        }

        const hasDeclaracion = !!newLoan.declaracion_jurada;

        // La consulta ahora inserta los campos del cliente de forma individual
        const query = `
            INSERT INTO loans (dni, nombres, apellidos, monto, interes, fecha, plazo, status, declaracion_jurada) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        `;
        
        const values = [
            clientData.dni,
            clientData.nombres,
            clientData.apellidos,
            newLoan.monto,
            newLoan.interes,
            newLoan.fecha,
            newLoan.plazo,
            newLoan.status,
            hasDeclaracion
        ];

        await pool.query(query, values);
        res.status(201).json({ message: 'Préstamo creado exitosamente', data: newLoan });

    } catch (err) {
        console.error("ERROR en POST /api/loans:", err);
        res.status(500).json({ error: 'Error al guardar el préstamo' });
    }
});


// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});
