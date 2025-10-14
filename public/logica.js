// --- VARIABLES GLOBALES ---
// ▼▼▼ CORRECCIÓN APLICADA AQUÍ: Se debe dejar vacío para que use rutas relativas ▼▼▼
const API_URL = '';

let loans = [];
let clients = new Set();
let currentLoanForDetails = null;

// --- OBTENER ELEMENTOS DEL DOM ---
const addLoanBtn = document.getElementById('addLoanBtn');
const loanModal = document.getElementById('loanModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const loanForm = document.getElementById('loanForm');
const historyTableBody = document.getElementById('historyTableBody');
const detailsModal = document.getElementById('detailsModal');
const closeDetailsModalBtn = document.getElementById('closeDetailsModalBtn');
const printScheduleBtn = document.getElementById('printScheduleBtn');
const shareBtn = document.getElementById('shareBtn');

// --- CARGA DINÁMICA DEL FORMULARIO ---
loanForm.innerHTML = `
    <fieldset>
        <legend>👤 Información del Cliente</legend>
        <div class="form-group">
            <label for="dni">DNI</label>
            <input type="text" id="dni" placeholder="Ingresa 8 dígitos y presiona Tab" required pattern="\\d{8}" maxlength="8">
            <small id="dni-status" style="margin-top: 5px; display: block;"></small>
        </div>
        <div class="form-row">
            <div class="form-group"><label for="nombres">Nombres</label><input type="text" id="nombres" placeholder="Nombres completos" required></div>
            <div class="form-group"><label for="apellidos">Apellidos</label><input type="text" id="apellidos" placeholder="Apellidos completos" required></div>
        </div>
    </fieldset>
    <fieldset>
        <legend>📋 Detalles del Préstamo</legend>
        <div class="form-row">
            <div class="form-group"><label for="monto">Monto (S/)</label><input type="number" id="monto" placeholder="Ej: 1000" required step="0.01" min="100" max="50000"></div>
            <div class="form-group"><label for="fecha">Fecha</label><input type="date" id="fecha" required></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label for="interes">Interés Mensual (%)</label><input type="number" id="interes" placeholder="Ej: 3.5" required step="0.01" min="1" max="15"></div>
            <div class="form-group"><label for="plazo">Plazo (Meses)</label><input type="number" id="plazo" placeholder="Ej: 12" required min="1" max="60"></div>
        </div>
    </fieldset>
    <button type="submit" class="submit-button">Guardar Préstamo</button>
`;

// --- REFERENCIAS A CAMPOS DEL FORMULARIO ---
const dniInput = document.getElementById('dni');
const nombresInput = document.getElementById('nombres');
const apellidosInput = document.getElementById('apellidos');
const dniStatus = document.getElementById('dni-status');

// --- MANEJO DE MODALES ---
const openModal = (modal) => modal.style.display = 'flex';
const closeModal = (modal) => {
    modal.style.display = 'none';
    if (modal.id === 'loanModal') {
        loanForm.reset();
        nombresInput.readOnly = false;
        apellidosInput.readOnly = false;
        dniStatus.textContent = '';
        dniStatus.style.color = '';
    }
    if (modal.id === 'detailsModal') {
        currentLoanForDetails = null;
    }
};

// --- EVENT LISTENERS ---
addLoanBtn.addEventListener('click', () => openModal(loanModal));
closeModalBtn.addEventListener('click', () => closeModal(loanModal));
closeDetailsModalBtn.addEventListener('click', () => closeModal(detailsModal));
printScheduleBtn.addEventListener('click', () => window.print());
shareBtn.addEventListener('click', compartirPDF);

window.addEventListener('click', (event) => {
    if (event.target === loanModal) closeModal(loanModal);
    if (event.target === detailsModal) closeModal(detailsModal);
});

// --- LÓGICA DE CONSULTA DE DNI (A TRAVÉS DE NUESTRO PROPIO SERVIDOR) ---
dniInput.addEventListener('blur', async () => {
    const dni = dniInput.value;
    if (dni.length !== 8) {
        dniStatus.textContent = '';
        return;
    }

    dniStatus.textContent = 'Buscando...';
    dniStatus.style.color = '#667085';
    nombresInput.readOnly = true;
    apellidosInput.readOnly = true;

    try {
        const response = await fetch(`${API_URL}/api/dni/${dni}`);

        const data = await response.json();

        if (response.ok && data.nombres) {
            nombresInput.value = data.nombres;
            apellidosInput.value = `${data.apellidoPaterno} ${data.apellidoMaterno}`;
            dniStatus.textContent = '✅ Cliente encontrado.';
            dniStatus.style.color = 'var(--success-color)';
        } else {
            throw new Error(data.message || 'No se encontraron resultados.');
        }

    } catch (error) {
        console.error("Error al consultar DNI:", error);
        dniStatus.textContent = `❌ ${error.message}`;
        dniStatus.style.color = 'red';
        nombresInput.value = '';
        apellidosInput.value = '';
    } finally {
        if (!nombresInput.value) {
            nombresInput.readOnly = false;
            apellidosInput.readOnly = false;
            nombresInput.focus();
        }
    }
});


loanForm.addEventListener('submit', async function(event) {
    event.preventDefault();

    const monto = parseFloat(document.getElementById('monto').value);
    const interes = parseFloat(document.getElementById('interes').value);
    const plazo = parseInt(document.getElementById('plazo').value);

    if (monto < 100 || monto > 50000) {
        alert("El monto debe estar entre S/ 100 y S/ 50,000.");
        return;
    }
    if (interes < 1 || interes > 15) {
        alert("El interés mensual debe estar entre 1% y 15%.");
        return;
    }
     if (plazo < 1 || plazo > 60) {
        alert("El plazo debe ser entre 1 y 60 meses.");
        return;
    }

    const newLoan = {
        client: {
            dni: document.getElementById('dni').value,
            nombres: document.getElementById('nombres').value,
            apellidos: document.getElementById('apellidos').value,
        },
        monto: monto,
        interes: interes,
        fecha: document.getElementById('fecha').value,
        plazo: plazo,
        status: 'Activo'
    };

    try {
        const response = await fetch(`${API_URL}/api/loans`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(newLoan),
        });

        if (!response.ok) {
            throw new Error('Error al guardar el préstamo en el servidor');
        }

        await fetchAndRenderLoans();
        closeModal(loanModal);

    } catch (error) {
        console.error(error);
        alert('No se pudo guardar el préstamo. Inténtalo de nuevo.');
    }
});

historyTableBody.addEventListener('click', function(event) {
    if (event.target.classList.contains('view-details-btn')) {
        const loanId = event.target.getAttribute('data-loan-id');
        const loan = loans.find(l => l.id == loanId);
        if (loan) populateDetailsModal(loan);
    }
});

// --- FUNCIONES PRINCIPALES ---

function renderHistoryTable() {
    historyTableBody.innerHTML = '';
    if (loans.length === 0) {
        historyTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #98A2B3;">Aún no hay préstamos registrados.</td></tr>`;
        return;
    }
    loans.forEach(loan => {
        const row = document.createElement('tr');
        const clientName = loan.nombres || (loan.client && loan.client.nombres);
        const clientLastName = loan.apellidos || (loan.client && loan.client.apellidos);
        row.innerHTML = `
            <td>${clientName} ${clientLastName}</td>
            <td>S/ ${parseFloat(loan.monto).toFixed(2)}</td>
            <td>${new Date(loan.fecha).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</td>
            <td>${loan.plazo} meses</td>
            <td><span class="status status-active">${loan.status}</span></td>
            <td><button class="button button-secondary view-details-btn" data-loan-id="${loan.id}">Ver Detalles</button></td>
        `;
        historyTableBody.appendChild(row);
    });
}

function populateDetailsModal(loan) {
    currentLoanForDetails = loan;
    const { monthlyPayment, schedule } = calculateSchedule(loan);
    const clientName = loan.nombres || (loan.client && loan.client.nombres);
    const clientLastName = loan.apellidos || (loan.client && loan.client.apellidos);

    document.getElementById('scheduleSummary').innerHTML = `
        <p><strong>Cliente:</strong> ${clientName} ${clientLastName}</p>
        <p><strong>Monto:</strong> S/ ${parseFloat(loan.monto).toFixed(2)} | <strong>Interés:</strong> ${loan.interes}% | <strong>Plazo:</strong> ${loan.plazo} meses
