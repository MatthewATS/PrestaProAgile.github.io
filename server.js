// server.js MODIFICADO

const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool(process.env.DATABASE_URL);

// --- RUTAS DE LA API ---

// GET /api/loans (sin cambios)
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


// POST /api/loans (MODIFICADO)
app.post('/api/loans', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { client, monto, interes, fecha, plazo, status, declaracion_jurada = false } = req.body;
    const { dni, nombres, apellidos } = client;

    // --- NUEVA VALIDACIÓN ---
    // 1. Buscar si ya existe un préstamo con status 'Activo' para este DNI.
    const searchActiveLoanQuery = `
      SELECT l.id FROM loans l
      JOIN clients c ON l.client_id = c.id
      WHERE c.dni = ? AND l.status = 'Activo'
      LIMIT 1;
    `;
    const [activeLoans] = await connection.query(searchActiveLoanQuery, [dni]);

    // 2. Si se encuentra un préstamo activo, enviar error y detener.
    if (activeLoans.length > 0) {
      await connection.rollback(); // Revertir la transacción
      // Usamos el código 409 Conflict para indicar que la solicitud no se puede procesar
      // porque entra en conflicto con el estado actual del recurso.
      return res.status(409).json({ error: 'El cliente ya tiene un préstamo activo.' });
    }
    // --- FIN DE LA VALIDACIÓN ---


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
      INSERT INTO loans (client_id, monto, interes, fecha, plazo, status, declaracion_jurada) 
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `;
    const loanValues = [clientId, monto, interes, fecha, plazo, status, declaracion_jurada];
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


// RUTA PROXY PARA DNI (sin cambios)
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


// FUNCIÓN PARA INICIAR EL SERVIDOR (sin cambios)
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
