// --- VARIABLES GLOBALES ---
// CORRECCIÓN FINAL: API_URL debe estar VACÍO para que funcione correctamente en Railway.
const API_URL = 'prestaproagilegithubio-production-be75.up.railway.app';

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

// --- LÓGICA PARA ENVIAR EL FORMULARIO ---
loanForm.addEventListener('submit', async function(event) {
    event.preventDefault();

    const newLoanData = {
        client: {
            dni: dniInput.value,
            nombres: nombresInput.value,
            apellidos: apellidosInput.value,
        },
        monto: parseFloat(document.getElementById('monto').value),
        interes: parseFloat(document.getElementById('interes').value),
        fecha: document.getElementById('fecha').value,
        plazo: parseInt(document.getElementById('plazo').value),
        status: 'Activo'
    };

    try {
        const response = await fetch(`${API_URL}/api/loans`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(newLoanData),
        });
        if (!response.ok) throw new Error('Error al guardar el préstamo.');
        await fetchAndRenderLoans();
        closeModal(loanModal);
    } catch (error) {
        console.error(error);
        alert('No se pudo guardar el préstamo. Inténtalo de nuevo.');
    }
});

// --- FUNCIONES PRINCIPALES ---

async function fetchAndRenderLoans() {
    try {
        const response = await fetch(`${API_URL}/api/loans`);
        if (!response.ok) throw new Error('Error al cargar los préstamos');
        loans = await response.json();
        renderHistoryTable();
        updateDashboard();
    } catch (error) {
        console.error(error);
        historyTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">Error al cargar los datos.</td></tr>`;
    }
}

function renderHistoryTable() {
    historyTableBody.innerHTML = '';
    if (loans.length === 0) {
        historyTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #98A2B3;">Aún no hay préstamos registrados.</td></tr>`;
        return;
    }
    loans.forEach(loan => {
        const row = document.createElement('tr');
        // CORRECCIÓN: Se accede a loan.nombres directamente (ya no es loan.client.nombres)
        row.innerHTML = `
            <td>${loan.nombres} ${loan.apellidos}</td>
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
    currentLoanForDetails = loan; // Guardamos el préstamo completo
    const { monthlyPayment, schedule } = calculateSchedule(loan);
    // CORRECCIÓN: Se accede a loan.nombres directamente
    document.getElementById('scheduleSummary').innerHTML = `
        <p><strong>Cliente:</strong> ${loan.nombres} ${loan.apellidos}</p>
        <p><strong>Monto:</strong> S/ ${parseFloat(loan.monto).toFixed(2)} | <strong>Interés:</strong> ${loan.interes}% | <strong>Plazo:</strong> ${loan.plazo} meses</p>
        <p><strong>Cuota Mensual Fija: S/ ${monthlyPayment.toFixed(2)}</strong></p>
    `;
    const scheduleTableBody = document.getElementById('scheduleTableBody');
    scheduleTableBody.innerHTML = schedule.map(item => `
        <tr><td>${item.cuota}</td><td>${item.fecha}</td><td>S/ ${item.monto}</td></tr>`).join('');
    openModal(detailsModal);
}

function updateDashboard() {
    const totalLoaned = loans.reduce((sum, loan) => sum + parseFloat(loan.monto), 0);
    clients.clear();
    loans.forEach(loan => clients.add(loan.dni)); // Ahora el DNI está en el nivel superior
    document.getElementById('totalLoaned').textContent = `S/ ${totalLoaned.toFixed(2)}`;
    document.getElementById('activeLoans').textContent = loans.filter(loan => loan.status === 'Activo').length;
    document.getElementById('totalClients').textContent = clients.size;
}

// El resto de funciones (calculateSchedule, compartirPDF, etc.) no necesitan cambios
// ya que reciben el objeto 'loan' completo y acceden a sus propiedades directamente.
historyTableBody.addEventListener('click', function(event) {
    if (event.target.classList.contains('view-details-btn')) {
        const loanId = event.target.getAttribute('data-loan-id');
        const loan = loans.find(l => l.id == loanId);
        if (loan) populateDetailsModal(loan);
    }
});

function calculateSchedule(loan) {
   const monthlyInterestRate = parseFloat(loan.interes) / 100;
   const principal = parseFloat(loan.monto);
   if (monthlyInterestRate === 0) {
       const monthlyPayment = loan.plazo > 0 ? principal / loan.plazo : 0;
       return { monthlyPayment, schedule: [] };
   }
   const monthlyPayment = (principal * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -loan.plazo));
   const schedule = [];
   const startDate = new Date(loan.fecha);
    for (let i = 1; i <= loan.plazo; i++) {
        const paymentDate = new Date(startDate);
        paymentDate.setUTCMonth(paymentDate.getUTCMonth() + i);
        schedule.push({
            cuota: i,
            fecha: paymentDate.toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
            monto: monthlyPayment.toFixed(2)
        });
    }
    return { monthlyPayment, schedule };
}

function compartirPDF() {
    if (!currentLoanForDetails) { alert("No hay información del préstamo para compartir."); return; }
    if (typeof window.jspdf === 'undefined') { alert("Error: La librería jsPDF no se cargó correctamente."); return; }
    try {
        const loan = currentLoanForDetails;
        const { monthlyPayment, schedule } = calculateSchedule(loan);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(22); doc.setTextColor(0, 93, 255); doc.text("PRESTAPRO", 105, 20, { align: 'center' });
        doc.setFontSize(16); doc.setTextColor(52, 64, 84); doc.text("Cronograma de Pagos", 105, 30, { align: 'center' });
        doc.setFontSize(12); doc.setTextColor(100, 100, 100); doc.text("DATOS DEL CLIENTE", 14, 45);
        doc.setFontSize(11); doc.setTextColor(52, 64, 84);
        doc.text(`Nombre: ${loan.nombres} ${loan.apellidos}`, 14, 52); // CORRECCIÓN
        doc.text(`DNI: ${loan.dni}`, 14, 58); // CORRECCIÓN
        doc.text(`Fecha de Préstamo: ${new Date(loan.fecha).toLocaleDateString('es-PE', { timeZone: 'UTC' })}`, 14, 64);
        doc.setFontSize(12); doc.setTextColor(100, 100, 100); doc.text("DATOS DEL PRÉSTAMO", 14, 75);
        doc.setFontSize(11); doc.setTextColor(52, 64, 84);
        doc.text(`Monto Prestado: S/ ${parseFloat(loan.monto).toFixed(2)}`, 14, 82);
        doc.text(`Interés Mensual: ${loan.interes}%`, 14, 88);
        doc.text(`Plazo: ${loan.plazo} meses`, 14, 94);
        doc.text(`Cuota Mensual Fija: S/ ${monthlyPayment.toFixed(2)}`, 14, 100);
        const tableData = schedule.map(item => [item.cuota.toString(), item.fecha, `S/ ${item.monto}`]);
        doc.autoTable({
            head: [['N° Cuota', 'Fecha de Vencimiento', 'Monto a Pagar']],
            body: tableData, startY: 110, theme: 'grid',
            headStyles: { fillColor: [0, 93, 255], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 11 },
            bodyStyles: { fontSize: 10 },
            columnStyles: { 0: { halign: 'center' }, 2: { halign: 'right' } }
        });
        const finalY = doc.lastAutoTable.finalY || 250;
        doc.setFontSize(8); doc.setTextColor(150, 150, 150);
        doc.text('Generado por PrestaPro', 105, finalY + 10, { align: 'center' });
        doc.text(new Date().toLocaleString('es-PE'), 105, finalY + 15, { align: 'center' });
        const fileName = `Cronograma_${loan.apellidos}_${loan.dni}.pdf`; // CORRECCIÓN
        const pdfBlob = doc.output('blob');
        if (navigator.share) {
            const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
            navigator.share({ files: [file], title: 'Cronograma de Pagos', text: `Cronograma de pagos de ${loan.nombres} ${loan.apellidos}`}) // CORRECCIÓN
            .catch((error) => { console.log('Error al compartir, iniciando descarga:', error); descargarPDF(doc, fileName); });
        } else { descargarPDF(doc, fileName); }
    } catch (error) { console.error('Error al generar PDF:', error); alert('Hubo un error al generar el PDF.'); }
}

function descargarPDF(doc, fileName) {
    doc.save(fileName);
    console.log('PDF descargado:', fileName);
}

// --- Carga Inicial ---
document.addEventListener('DOMContentLoaded', fetchAndRenderLoans);
