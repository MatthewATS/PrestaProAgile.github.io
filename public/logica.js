// --- VARIABLES GLOBALES ---
const API_URL = 'https://prestaproagilegithubio-production-be75.up.railway.app';
const VALOR_UIT = 5150; // Valor de la UIT en Soles (ej: S/ 5,150 para 2024)
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
        <div class="form-group" style="background-color: #F9FAFB; padding: 12px; border-radius: 8px;">
            <div style="display: flex; align-items: center;">
                 <input type="checkbox" id="is_pep" style="width: auto; margin-right: 12px; height: 18px; width: 18px;">
                 <label for="is_pep" style="margin-bottom: 0;">¿Es una Persona Expuesta Políticamente (PEP)?</label>
            </div>
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
        <div id="declaracion-container" class="form-group" style="display: none; background-color: #E6F0FF; padding: 15px; border-radius: 8px; margin-top: 10px;">
            <div style="display: flex; align-items: center;">
                 <input type="checkbox" id="declaracion_jurada" required style="width: auto; margin-right: 12px; height: 18px; width: 18px;">
                 <label for="declaracion_jurada" style="margin-bottom: 0;">Declaro bajo juramento el origen lícito del dinero.</label>
            </div>
            <small id="declaracion-motivo" style="margin-left: 30px; margin-top: 4px; color: #667085;"></small>
        </div>
    </fieldset>
    <button type="submit" class="submit-button">Guardar Préstamo</button>
`;

// --- REFERENCIAS A CAMPOS DEL FORMULARIO ---
const dniInput = document.getElementById('dni');
const nombresInput = document.getElementById('nombres');
const apellidosInput = document.getElementById('apellidos');
const dniStatus = document.getElementById('dni-status');
const montoInput = document.getElementById('monto');
const declaracionContainer = document.getElementById('declaracion-container');
const declaracionCheckbox = document.getElementById('declaracion_jurada');
const isPepCheckbox = document.getElementById('is_pep');
const submitButton = loanForm.querySelector('button[type="submit"]');

// --- FUNCIÓN AUXILIAR ---
function toggleFormFields(isEnabled) {
    const fieldsToToggle = [nombresInput, apellidosInput, montoInput, document.getElementById('fecha'), document.getElementById('interes'), document.getElementById('plazo'), isPepCheckbox, declaracionCheckbox, submitButton];
    fieldsToToggle.forEach(field => { if (field) field.disabled = !isEnabled; });
}

// --- LÓGICA CENTRALIZADA PARA DECLARACIÓN JURADA ---
function updateDeclaracionVisibility() {
    const monto = parseFloat(montoInput.value) || 0;
    const esPEP = isPepCheckbox.checked;
    const motivo = document.getElementById('declaracion-motivo');
    
    if (monto > VALOR_UIT || esPEP) {
        declaracionContainer.style.display = 'block';
        declaracionCheckbox.required = true;
        if (esPEP && monto <= VALOR_UIT) {
            motivo.textContent = 'Requerido por ser Persona Expuesta Políticamente (PEP).';
        } else if (esPEP && monto > VALOR_UIT) {
            motivo.textContent = 'Requerido por monto mayor a 1 UIT y por ser PEP.';
        } else {
            motivo.textContent = `Requerido para montos mayores a 1 UIT (S/ ${VALOR_UIT.toFixed(2)}).`;
        }
    } else {
        declaracionContainer.style.display = 'none';
        declaracionCheckbox.required = false;
        declaracionCheckbox.checked = false;
    }
}

montoInput.addEventListener('input', updateDeclaracionVisibility);
isPepCheckbox.addEventListener('change', updateDeclaracionVisibility);

// --- MANEJO DE MODALES ---
const openModal = (modal) => modal.style.display = 'flex';
const closeModal = (modal) => {
    modal.style.display = 'none';
    if (modal.id === 'loanModal') {
        loanForm.reset();
        nombresInput.readOnly = false;
        apellidosInput.readOnly = false;
        dniStatus.textContent = '';
        updateDeclaracionVisibility();
        toggleFormFields(true);
    }
    if (modal.id === 'detailsModal') {
        currentLoanForDetails = null;
    }
};

// --- EVENT LISTENERS ---
addLoanBtn.addEventListener('click', () => openModal(loanModal));
closeModalBtn.addEventListener('click', () => closeModal(loanModal));
closeDetailsModalBtn.addEventListener('click', () => closeModal(detailsModal));
printScheduleBtn.addEventListener('click', printSchedule);
shareBtn.addEventListener('click', compartirPDF);

window.addEventListener('click', (event) => {
    if (event.target === loanModal) closeModal(loanModal);
    if (event.target === detailsModal) closeModal(detailsModal);
});

// --- LÓGICA DE CONSULTA DE DNI ---
dniInput.addEventListener('blur', async () => {
    const dni = dniInput.value;

    if (dni.length !== 8) {
        dniStatus.textContent = '';
        toggleFormFields(true);
        nombresInput.readOnly = false;
        apellidosInput.readOnly = false;
        return;
    }

    const hasActiveLoan = loans.some(loan => loan.dni === dni && loan.status === 'Activo');

    if (hasActiveLoan) {
        dniStatus.textContent = '⚠️ Este cliente ya tiene un préstamo activo.';
        dniStatus.style.color = 'orange';
        toggleFormFields(false);
        nombresInput.value = '';
        apellidosInput.value = '';
        montoInput.value = '';
        return;
    } else {
        toggleFormFields(true);
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
                dniStatus.textContent = '✅ Cliente encontrado y sin préstamos activos.';
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
    }
});

// --- LÓGICA DE ENVÍO DE FORMULARIO ---
loanForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    
    const newLoanData = {
        client: {
            dni: dniInput.value,
            nombres: nombresInput.value,
            apellidos: apellidosInput.value,
            is_pep: isPepCheckbox.checked
        },
        monto: parseFloat(montoInput.value),
        interes: parseFloat(document.getElementById('interes').value),
        fecha: document.getElementById('fecha').value,
        plazo: parseInt(document.getElementById('plazo').value),
        status: 'Activo',
        declaracion_jurada: declaracionCheckbox.checked
    };

    try {
        const response = await fetch(`${API_URL}/api/loans`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(newLoanData),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error ${response.status}`);
        }
        await fetchAndRenderLoans();
        closeModal(loanModal);
    } catch (error) {
        console.error(error);
        alert(`No se pudo guardar el préstamo: ${error.message}`);
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
        row.innerHTML = `
            <td>${loan.nombres} ${loan.apellidos} ${loan.is_pep ? '<strong style="color: #D92D20;">(PEP)</strong>' : ''}</td>
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
    const declaracionSection = document.getElementById('declaracionJuradaSection');

    document.getElementById('scheduleSummary').innerHTML = `
        <p><strong>Cliente:</strong> ${loan.nombres} ${loan.apellidos} ${loan.is_pep ? '<strong style="color: #D92D20;">(PEP)</strong>' : ''}</p>
        <p><strong>Monto:</strong> S/ ${parseFloat(loan.monto).toFixed(2)} | <strong>Interés:</strong> ${loan.interes}% | <strong>Plazo:</strong> ${loan.plazo} meses</p>
        <p><strong>Cuota Mensual Fija: S/ ${monthlyPayment.toFixed(2)}</strong></p>
    `;
    
    if (parseFloat(loan.monto) > VALOR_UIT || loan.is_pep) {
        declaracionSection.style.display = 'block';
        declaracionSection.innerHTML = `
            <h3 class="declaracion-title">Declaración Jurada de Origen de Fondos</h3>
            <p class="declaracion-body">
                Yo, <strong>${loan.nombres} ${loan.apellidos}</strong>, identificado(a) con DNI N° <strong>${loan.dni}</strong>, declaro bajo juramento que los fondos y/o bienes utilizados en la operación de préstamo de <strong>S/ ${parseFloat(loan.monto).toFixed(2)}</strong> otorgado en la fecha ${new Date(loan.fecha).toLocaleDateString('es-PE', { timeZone: 'UTC' })}, provienen de actividades lícitas y no están vinculados con el lavado de activos, financiamiento del terrorismo ni cualquier otra actividad ilegal contemplada en la legislación peruana.
            </p>
            <div class="declaracion-signature">
                <p>_________________________</p>
                <p><strong>${loan.nombres} ${loan.apellidos}</strong></p>
                <p>DNI: ${loan.dni}</p>
            </div>
        `;
    } else {
        declaracionSection.style.display = 'none';
        declaracionSection.innerHTML = '';
    }

    const scheduleTableBody = document.getElementById('scheduleTableBody');
    scheduleTableBody.innerHTML = schedule.map(item => `
        <tr><td>${item.cuota}</td><td>${item.fecha}</td><td>S/ ${item.monto}</td></tr>`).join('');
    
    openModal(detailsModal);
}

function updateDashboard() {
    const totalLoaned = loans.reduce((sum, loan) => sum + parseFloat(loan.monto), 0);
    clients.clear();
    loans.forEach(loan => clients.add(loan.dni));
    document.getElementById('totalLoaned').textContent = `S/ ${totalLoaned.toFixed(2)}`;
    document.getElementById('activeLoans').textContent = loans.filter(loan => loan.status === 'Activo').length;
    document.getElementById('totalClients').textContent = clients.size;
}

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

// --- FUNCIÓN DE IMPRESIÓN DEFINITIVA (CORREGIDA) ---
function printSchedule() {
    const printableContent = document.querySelector('#detailsModal .printable').innerHTML;
    
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <title>Cronograma de Pagos</title>
            <link rel="stylesheet" href="diseño.css">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
                /* --- Estilos Definitivos para Impresión Limpia --- */

                /* 1. Reseteo Agresivo: Se eliminan TODOS los márgenes y paddings del documento.
                   Esto es la clave para evitar que el navegador genere una página en blanco. */
                @page {
                    margin: 0;
                }
                html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    font-family: 'Poppins', sans-serif;
                }

                /* 2. Contenedor Controlado: Creamos márgenes "virtuales" usando padding
                   dentro de un contenedor principal. Esto es más estable que usar 'margin' en el body. */
                .print-container {
                    padding: 20mm;
                }

                /* Se oculta el botón 'x' que se copia accidentalmente del modal */
                .close-button {
                    display: none;
                }
                
                /* 3. Mejoras de Paginación para la tabla */
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                thead {
                    display: table-header-group; /* Repite el encabezado de la tabla en cada nueva página */
                }
                tr, .summary-info {
                    page-break-inside: avoid !important; /* Evita que estos elementos se corten */
                }
            </style>
        </head>
        <body>
            <div class="print-container">
                ${printableContent}
            </div>
        </body>
        </html>
    `);
    iframeDoc.close();

    iframe.onload = function() {
        setTimeout(function() {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            document.body.removeChild(iframe);
        }, 350); // Un poco más de tiempo para asegurar la carga completa de estilos
    };
}

function compartirPDF() {
    if (!currentLoanForDetails) { alert("No hay información del préstamo para compartir."); return; }
    if (typeof window.jspdf === 'undefined') { alert("Error: La librería jsPDF no se cargó correctamente."); return; }
    try {
        const loan = currentLoanForDetails;
        const { monthlyPayment, schedule } = calculateSchedule(loan);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let finalY = 0;

        doc.setFontSize(22); doc.setTextColor(0, 93, 255); doc.text("PRESTAPRO", 105, 20, { align: 'center' });
        doc.setFontSize(16); doc.setTextColor(52, 64, 84); doc.text("Detalles del Préstamo", 105, 30, { align: 'center' });
        
        doc.setFontSize(12); doc.setTextColor(100, 100, 100); doc.text("DATOS GENERALES", 14, 45);
        doc.setFontSize(11); doc.setTextColor(52, 64, 84);
        doc.text(`Cliente: ${loan.nombres} ${loan.apellidos} ${loan.is_pep ? '(PEP)' : ''}`, 14, 52);
        doc.text(`DNI: ${loan.dni}`, 105, 52);
        doc.text(`Monto Prestado: S/ ${parseFloat(loan.monto).toFixed(2)}`, 14, 58);
        doc.text(`Fecha de Préstamo: ${new Date(loan.fecha).toLocaleDateString('es-PE', { timeZone: 'UTC' })}`, 105, 58);
        doc.text(`Interés Mensual: ${loan.interes}%`, 14, 64);
        doc.text(`Plazo: ${loan.plazo} meses`, 105, 64);
        doc.text(`Cuota Mensual Fija: S/ ${monthlyPayment.toFixed(2)}`, 14, 70);

        finalY = 80;

        if (parseFloat(loan.monto) > VALOR_UIT || loan.is_pep) {
            doc.setFontSize(14); doc.setTextColor(52, 64, 84); doc.text("Declaración Jurada de Origen de Fondos", 105, finalY, { align: 'center' });
            finalY += 10;
            
            const textoDeclaracion = `Yo, ${loan.nombres} ${loan.apellidos}, identificado(a) con DNI N° ${loan.dni}, declaro bajo juramento que los fondos y/o bienes utilizados en la operación de préstamo de S/ ${parseFloat(loan.monto).toFixed(2)} provienen de actividades lícitas y no están vinculados con el lavado de activos ni cualquier otra actividad ilegal.`;
            
            doc.setFontSize(10); doc.setTextColor(100, 100, 100);
            const splitText = doc.splitTextToSize(textoDeclaracion, 180);
            doc.text(splitText, 14, finalY);
            finalY += (splitText.length * 5) + 20;
            
            doc.text("_________________________", 105, finalY, { align: 'center' });
            finalY += 5;
            doc.text(`${loan.nombres} ${loan.apellidos}`, 105, finalY, { align: 'center' });
            finalY += 15;
        }

        doc.setFontSize(14); doc.setTextColor(52, 64, 84); doc.text("Cronograma de Pagos", 105, finalY, { align: 'center' });
        
        const tableData = schedule.map(item => [item.cuota.toString(), item.fecha, `S/ ${item.monto}`]);
        doc.autoTable({
            head: [['N° Cuota', 'Fecha de Vencimiento', 'Monto a Pagar']],
            body: tableData, startY: finalY + 5, theme: 'grid',
            headStyles: { fillColor: [0, 93, 255], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 11 },
            bodyStyles: { fontSize: 10 },
            columnStyles: { 0: { halign: 'center' }, 2: { halign: 'right' } }
        });
        
        const pageFinalY = doc.lastAutoTable.finalY || 250;
        doc.setFontSize(8); doc.setTextColor(150, 150, 150);
        doc.text('Generado por PrestaPro', 105, pageFinalY + 10, { align: 'center' });
        doc.text(new Date().toLocaleString('es-PE'), 105, pageFinalY + 15, { align: 'center' });

        const fileName = `Detalles_${loan.apellidos}_${loan.dni}.pdf`;
        const pdfBlob = doc.output('blob');
        if (navigator.share) {
            const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
            navigator.share({ files: [file], title: 'Detalles del Préstamo', text: `Detalles del préstamo de ${loan.nombres} ${loan.apellidos}`})
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
