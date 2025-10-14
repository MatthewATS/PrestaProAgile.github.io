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

// --- NUEVA RUTA PROXY PARA LA CONSULTA DE DNI ---
// Esta ruta recibe la solicitud desde nuestro frontend y la reenvía a la API externa.
app.get('/api/dni/:dni', async (req, res) => {
  const { dni } = req.params;
  // Es una mejor práctica guardar el token en variables de entorno para mayor seguridad.
  const token = process.env.DNI_API_TOKEN;

  if (!token) {
    // Si olvidamos configurar el token en el servidor, enviamos un error claro.
    return res.status(500).json({ message: 'El token de la API de DNI no está configurado en el servidor.' });
  }

  try {
    // Usamos 'fetch' para llamar a la API externa desde nuestro servidor.
    const apiResponse = await fetch(`https://dniruc.apisperu.com/api/v1/dni/${dni}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await apiResponse.json();

    // Reenviamos la respuesta de la API (sea de éxito o de error) a nuestro frontend.
    res.status(apiResponse.status).json(data);

  } catch (error) {
    console.error("Error en el proxy de DNI:", error);
    res.status(500).json({ message: 'Error interno al consultar la API de DNI.' });
  }
});


// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
