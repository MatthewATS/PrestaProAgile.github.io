const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
// OJO: Si tu front.html no está en una carpeta 'public', esta línea podría no ser necesaria
// o debería apuntar al directorio correcto. Por ahora la dejamos.
app.use(express.static(path.join(__dirname, 'public')));

// Conexión a la base de datos
const pool = mysql.createPool(process.env.DATABASE_URL);

// --- RUTAS DE LA API DE PRÉSTAMOS ---

app.get('/api/loans', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM loans ORDER BY fecha DESC');
    // Para asegurar que `client` sea un objeto, lo parseamos si es un string
    const loans = rows.map(loan => {
        if (typeof loan.client === 'string') {
            try {
                loan.client = JSON.parse(loan.client);
            } catch (e) {
                console.error("Error parsing client JSON:", e);
                loan.client = {}; // Fallback a objeto vacío
            }
        }
        return loan;
    });
    res.json(loans);
  } catch (err) {
    console.error("ERROR en GET /api/loans:", err);
    res.status(500).json({ error: 'Error al obtener los préstamos' });
  }
});

app.post('/api/loans', async (req, res) => {
  try {
    const newLoan = req.body;
    // Asegurarse de que el campo declaracion_jurada sea booleano
    const hasDeclaracion = !!newLoan.declaracion_jurada; 

    const query = `INSERT INTO loans (dni, client, monto, interes, fecha, plazo, status, declaracion_jurada) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`;
    const values = [
      newLoan.client.dni, JSON.stringify(newLoan.client), newLoan.monto,
      newLoan.interes, newLoan.fecha, newLoan.plazo, newLoan.status, hasDeclaracion
    ];
    await pool.query(query, values);
    res.status(201).json(newLoan);
  } catch (err) {
    console.error("ERROR en POST /api/loans:", err);
    res.status(500).json({ error: 'Error al guardar el préstamo' });
  }
});


// --- RUTA NUEVA PARA CONSULTAR DNI (SIMULACIÓN) ---
app.get('/api/dni/:dni', async (req, res) => {
  const { dni } = req.params;

  // Simulación: En un caso real, aquí llamarías a una API externa (como Apis.net.pe, etc.)
  // Por ahora, vamos a simular una respuesta para un DNI de ejemplo.
  
  console.log(`Buscando DNI: ${dni}`);

  if (dni === '12345678') {
    // Si el DNI es el de ejemplo, devolvemos datos exitosos
    res.json({
      nombres: 'Juan Andrés',
      apellidoPaterno: 'Pérez',
      apellidoMaterno: 'Gómez',
      tipoDocumento: '1',
      numeroDocumento: dni,
      digitoVerificador: '5'
    });
  } else if (dni.length === 8) {
     // Para cualquier otro DNI de 8 dígitos, simulamos otro usuario
     res.json({
      nombres: 'Maria Claudia',
      apellidoPaterno: 'Flores',
      apellidoMaterno: 'Rojas',
      tipoDocumento: '1',
      numeroDocumento: dni,
      digitoVerificador: '2'
    });
  }
  else {
    // Si no es el DNI de ejemplo, devolvemos un error
    res.status(404).json({ message: 'No se encontraron resultados para el DNI consultado.' });
  }
});


// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
