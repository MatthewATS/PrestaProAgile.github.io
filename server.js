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

// GET /api/loans
app.get('/api/loans', async (req, res) => {
  try {
    const query = `
      SELECT 
        l.id, l.monto, l.interes, l.fecha, l.plazo, l.status,
        c.dni, c.nombres, c.apellidos
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

// POST /api/loans
app.post('/api/loans', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { client, monto, interes, fecha, plazo, status } = req.body;
    const { dni, nombres, apellidos } = client;

    let [existingClient] = await connection.query('SELECT id FROM clients WHERE dni = ?', [dni]);
    let clientId;

    if (existingClient.length > 0) {
      clientId = existingClient[0].id;
    } else {
      const [result] = await connection.query(
        'INSERT INTO clients (dni, nombres, apellidos) VALUES (?, ?, ?)',
        [dni, nombres, apellidos]
      );
      clientId = result.insertId;
    }

    const loanQuery = `
      INSERT INTO loans (client_id, monto, interes, fecha, plazo, status) 
      VALUES (?, ?, ?, ?, ?, ?);
    `;
    const loanValues = [clientId, monto, interes, fecha, plazo, status];
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

// RUTA PROXY PARA DNI
app.get('/api/dni/:dni', async (req, res) => {
  const { dni } = req.params;
  const token = process.env.DNI_API_TOKEN;

  if (!token) {
    return res.status(500).json({ message: 'El token de la API de DNI no está configurado en el servidor.' });
  }

  try {
    const apiResponse = await fetch(`https://dniruc.apisperu.com/api/v1/dni/${dni}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await apiResponse.json();
    res.status(apiResponse.status).json(data);
  } catch (error) {
    console.error("Error en el proxy de DNI:", error);
    res.status(500).json({ message: 'Error interno al consultar la API de DNI.' });
  }
});

// --- FUNCIÓN PARA INICIAR EL SERVIDOR ---
const startServer = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conexión a la base de datos establecida con éxito.');
    connection.release();

    app.listen(PORT, () => {
      console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
    });

  } catch (err) {
    console.error('❌ No se pudo conectar a la base de datos. Verifica la variable de entorno DATABASE_URL.');
    console.error(err.message);
    process.exit(1);
  }
};

startServer();
