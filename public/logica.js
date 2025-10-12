// --- VARIABLES GLOBALES ---
const API_URL = 'https://prestaproagilegithubio-production-be75.up.railway.app';
let loans = []; // Esta variable ahora será una caché de los datos del servidor
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
        <div class="form-group"><label for="dni">DNI</label><input type="text" id="dni" placeholder="Ej: 71234567" required pattern="\\d{8}"></div>
        <div class="form-row">
            <div class="form-group"><label for="nombres">Nombres</label><input type="text" id="nombres" placeholder="Nombres completos" required></div>
            <div class="form-group"><label for="apellidos">Apellidos</label><input type="text" id="apellidos" placeholder="Apellidos completos" required></div>
        </div>
    </fieldset>
    <fieldset>
        <legend>📋 Detalles del Préstamo</legend>
        <div class="form-row">
            <div class="form-group"><label for="monto">Monto (S/)</label><input type="number" id="monto" placeholder="Ej: 1000" required step="0.01"></div>
            <div class="form-group"><label for="fecha">Fecha</label><input type="date" id="fecha" required></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label for="interes">Interés Mensual (%)</label><input type="number" id="interes" placeholder="Ej: 3.5" required step="0.01"></div>
            <div class="form-group"><label for="plazo">Plazo (Meses)</label><input type="number" id="plazo" placeholder="Ej: 12" required></div>
        </div>
    </fieldset>
    <button type="submit" class="submit-button">Guardar Préstamo</button>
`;

// --- MANEJO DE MODALES ---
const openModal = (modal) => modal.style.display = 'flex';
const closeModal = (modal) => {
    modal.style.display = 'none';
    if (modal.id === 'detailsModal') {
        currentLoanForDetails = null;
    }
};

// --- EVENT LISTENERS ---
addLoanBtn.addEventListener('click', () => openModal(loanModal));
closeModalBtn.addEventListener('click', () => closeModal(loanModal));
closeDetailsModalBtn.addEventListener('click', () => closeModal(detailsModal));
printScheduleBtn.addEventListener('click', () => window.print());

// BOTÓN DE COMPARTIR - NUEVO EVENT LISTENER
shareBtn.addEventListener('click', function() {
    console.log('Botón compartir clickeado');
    compartirPDF();
});

window.addEventListener('click', (event) => {
    if (event.target === loanModal) closeModal(loanModal);
    if (event.target === detailsModal) closeModal(detailsModal);
});

loanForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    const newLoan = {
        client: {
            dni: document.getElementById('dni').value,
            nombres: document.getElementById('nombres').value,
            apellidos: document.getElementById('apellidos').value,
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
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(newLoan),
        });

        if (!response.ok) {
            throw new Error('Error al guardar el préstamo en el servidor');
        }

        await fetchAndRenderLoans();
        loanForm.reset();
        closeModal(loanModal);

    } catch (error) {
        console.error(error);
        alert('No se pudo guardar el préstamo. Inténtalo de nuevo.');
    }
});

historyTableBody.addEventListener('click', function(event) {
    if (event.target.classList.contains('view-details-btn')) {
        const loanDNI = event.target.getAttribute('data-loan-dni');
        const loan = loans.find(l => l.client.dni === loanDNI);
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
        row.innerHTML = `
            <td>${loan.client.nombres} ${loan.client.apellidos}</td>
            <td>S/ ${parseFloat(loan.monto).toFixed(2)}</td>
            <td>${new Date(loan.fecha.replace(/-/g, '/')).toLocaleDateString('es-PE')}</td>
            <td>${loan.plazo} meses</td>
            <td><span class="status status-active">${loan.status}</span></td>
            <td><button class="button button-secondary view-details-btn" data-loan-dni="${loan.client.dni}">Ver Detalles</button></td>
        `;
        historyTableBody.appendChild(row);
    });
}

function populateDetailsModal(loan) {
    currentLoanForDetails = loan;
    const { monthlyPayment, schedule } = calculateSchedule(loan);
    document.getElementById('scheduleSummary').innerHTML = `
        <p><strong>Cliente:</strong> ${loan.client.nombres} ${loan.client.apellidos}</p>
        <p><strong>Monto:</strong> S/ ${loan.monto.toFixed(2)} | <strong>Interés:</strong> ${loan.interes}% | <strong>Plazo:</strong> ${loan.plazo} meses</p>
        <p><strong>Cuota Mensual Fija: S/ ${monthlyPayment.toFixed(2)}</strong></p>
    `;
    const scheduleTableBody = document.getElementById('scheduleTableBody');
    scheduleTableBody.innerHTML = schedule.map(item => `
        <tr><td>${item.cuota}</td><td>${item.fecha}</td><td>S/ ${item.monto}</td></tr>`).join('');
    openModal(detailsModal);
}

function updateDashboard() {
    const totalLoaned = loans.reduce((sum, loan) => sum + parseFloat(loan.monto), 0);
    document.getElementById('totalLoaned').textContent = `S/ ${totalLoaned.toFixed(2)}`;
    document.getElementById('activeLoans').textContent = loans.filter(loan => loan.status === 'Activo').length;
    document.getElementById('totalClients').textContent = clients.size;
}

function calculateSchedule(loan) {
    const monthlyInterestRate = loan.interes / 100;
    const monthlyPayment = (loan.monto * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -loan.plazo));
    const schedule = [];
    const startDate = new Date(loan.fecha.replace(/-/g, '/'));
    for (let i = 1; i <= loan.plazo; i++) {
        const paymentDate = new Date(startDate);
        paymentDate.setMonth(paymentDate.getMonth() + i);
        schedule.push({
            cuota: i,
            fecha: paymentDate.toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' }),
            monto: monthlyPayment.toFixed(2)
        });
    }
    return { monthlyPayment, schedule };
}

// --- FUNCIÓN DE COMPARTIR PDF ---
function compartirPDF() {
    console.log('Función compartirPDF ejecutándose...');

    if (!currentLoanForDetails) {
        alert("No hay información del préstamo para compartir.");
        return;
    }

    // Verificar que jsPDF esté cargado
    if (typeof window.jspdf === 'undefined') {
        alert("Error: La librería jsPDF no se cargó correctamente. Verifica tu conexión a internet.");
        return;
    }

    try {
        const loan = currentLoanForDetails;
        const { monthlyPayment, schedule } = calculateSchedule(loan);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // TÍTULO
        doc.setFontSize(22);
        doc.setTextColor(0, 93, 255);
        doc.text("PRESTAPRO", 105, 20, { align: 'center' });

        doc.setFontSize(16);
        doc.setTextColor(52, 64, 84);
        doc.text("Cronograma de Pagos", 105, 30, { align: 'center' });

        // INFORMACIÓN DEL CLIENTE
        doc.setFontSize(12);
        doc.setTextColor(100, 100, 100);
        doc.text("DATOS DEL CLIENTE", 14, 45);

        doc.setFontSize(11);
        doc.setTextColor(52, 64, 84);
        doc.text(`Nombre: ${loan.client.nombres} ${loan.client.apellidos}`, 14, 52);
        doc.text(`DNI: ${loan.client.dni}`, 14, 58);
        doc.text(`Fecha: ${new Date(loan.fecha.replace(/-/g, '/')).toLocaleDateString('es-PE')}`, 14, 64);

        // INFORMACIÓN DEL PRÉSTAMO
        doc.setFontSize(12);
        doc.setTextColor(100, 100, 100);
        doc.text("DATOS DEL PRÉSTAMO", 14, 75);

        doc.setFontSize(11);
        doc.setTextColor(52, 64, 84);
        doc.text(`Monto Prestado: S/ ${loan.monto.toFixed(2)}`, 14, 82);
        doc.text(`Interés Mensual: ${loan.interes}%`, 14, 88);
        doc.text(`Plazo: ${loan.plazo} meses`, 14, 94);
        doc.text(`Cuota Mensual Fija: S/ ${monthlyPayment.toFixed(2)}`, 14, 100);

        // TABLA DE CRONOGRAMA
        const tableData = schedule.map(item => [
            item.cuota.toString(),
            item.fecha,
            `S/ ${item.monto}`
        ]);

        doc.autoTable({
            head: [['N° Cuota', 'Fecha de Vencimiento', 'Monto a Pagar']],
            body: tableData,
            startY: 110,
            theme: 'grid',
            headStyles: {
                fillColor: [0, 93, 255],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center',
                fontSize: 11
            },
            bodyStyles: {
                fontSize: 10
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 25 },
                1: { halign: 'left', cellWidth: 100 },
                2: { halign: 'right', cellWidth: 40 }
            }
        });

        // PIE DE PÁGINA
        const finalY = doc.lastAutoTable.finalY || 250;
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Generado por PrestaPro', 105, finalY + 10, { align: 'center' });
        doc.text(new Date().toLocaleString('es-PE'), 105, finalY + 15, { align: 'center' });

        // INTENTAR COMPARTIR O DESCARGAR
        const fileName = `Cronograma_${loan.client.apellidos}_${loan.client.dni}.pdf`;
        const pdfBlob = doc.output('blob');

        // Intentar usar la API de compartir (funciona en móviles)
        if (navigator.share) {
            const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

            navigator.share({
                files: [file],
                title: 'Cronograma de Pagos',
                text: `Cronograma de pagos de ${loan.client.nombres} ${loan.client.apellidos}`
            })
                .then(() => {
                    console.log('Compartido exitosamente');
                })
                .catch((error) => {
                    console.log('Error al compartir o cancelado:', error);
                    // Si falla o se cancela, descargar
                    descargarPDF(doc, fileName);
                });
        } else {
            // Si no hay API de compartir, descargar directamente
            descargarPDF(doc, fileName);
        }

    } catch (error) {
        console.error('Error al generar PDF:', error);
        alert('Hubo un error al generar el PDF. Por favor, intenta nuevamente.');
    }
}

function descargarPDF(doc, fileName) {
    doc.save(fileName);
    console.log('PDF descargado:', fileName);
}

async function fetchAndRenderLoans() {
    try {
        const response = await fetch(`${API_URL}/api/loans`);
        if (!response.ok) {
            throw new Error('Error al cargar los préstamos');
        }
        loans = await response.json(); // Actualizamos la variable local con datos de la BD

        // Limpiamos y recalculamos el set de clientes
        clients.clear();
        loans.forEach(loan => clients.add(loan.client.dni));

        renderHistoryTable();
        updateDashboard();
    } catch (error) {
        console.error(error);
        historyTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">Error al cargar los datos.</td></tr>`;
    }
}

// --- Carga Inicial de Datos desde el Servidor ---
fetchAndRenderLoans();









