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

// Conexión a la base de datos (asegúrate que tu variable de entorno DATABASE_URL esté configurada)
// Para desarrollo local, puedes reemplazarlo con tus credenciales:
// const pool = mysql.createPool({ host: 'localhost', user: 'root', database: 'prestapro', password: 'tu_password' });
const pool = mysql.createPool(process.env.DATABASE_URL);


// --- RUTAS DE LA API ---

// GET /api/loans - Obtiene todos los préstamos con la información del cliente
app.get('/api/loans', async (req, res) => {
  try {
    // Hacemos un JOIN para unir las tablas loans y clients
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

// POST /api/loans - Crea un nuevo préstamo y, si es necesario, un nuevo cliente
app.post('/api/loans', async (req, res) => {
  const connection = await pool.getConnection(); // Obtenemos una conexión del pool
  try {
    const { client, monto, interes, fecha, plazo, status } = req.body;
    const { dni, nombres, apellidos } = client;

    // Iniciamos una transacción para asegurar la integridad de los datos
    await connection.beginTransaction();

    // 1. Buscar o crear el cliente (lógica de "UPSERT")
    let [existingClient] = await connection.query('SELECT id FROM clients WHERE dni = ?', [dni]);
    let clientId;

    if (existingClient.length > 0) {
      // El cliente ya existe, usamos su ID
      clientId = existingClient[0].id;
    } else {
      // El cliente es nuevo, lo insertamos
      const [result] = await connection.query(
        'INSERT INTO clients (dni, nombres, apellidos) VALUES (?, ?, ?)',
        [dni, nombres, apellidos]
      );
      clientId = result.insertId;
    }

    // 2. Insertar el nuevo préstamo asociándolo con el ID del cliente
    const loanQuery = `
      INSERT INTO loans (client_id, monto, interes, fecha, plazo, status) 
      VALUES (?, ?, ?, ?, ?, ?);
    `;
    const loanValues = [clientId, monto, interes, fecha, plazo, status];
    await connection.query(loanQuery, loanValues);

    // Si todo salió bien, confirmamos la transacción
    await connection.commit();
    
    // Devolvemos el préstamo creado como confirmación
    res.status(201).json({ ...req.body, client_id: clientId });

  } catch (err) {
    // Si algo falla, revertimos todos los cambios de la transacción
    await connection.rollback();
    console.error("ERROR en POST /api/loans:", err);
    res.status(500).json({ error: 'Error al guardar el préstamo' });
  } finally {
    // Liberamos la conexión para que pueda ser usada por otras peticiones
    connection.release();
  }
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
