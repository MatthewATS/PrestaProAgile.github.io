// --- LÓGICA DE LOGIN (AGREGAR AL INICIO) ---
document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DEL DOM PARA LOGIN Y APP ---
    const loginContainer = document.getElementById('loginContainer');
    const appContainer = document.getElementById('appContainer');
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('error-message');
    const logoutBtn = document.getElementById('logoutBtn');

    // --- FUNCIÓN PARA MOSTRAR/OCULTAR SECCIONES ---
    const showApp = () => {
        loginContainer.style.display = 'none';
        appContainer.style.display = 'block';
        fetchAndRenderLoans(); // Cargar datos cruciales solo después de iniciar sesión
    };

    const showLogin = () => {
        loginContainer.style.display = 'flex';
        appContainer.style.display = 'none';
    };
    
    // --- LÓGICA DE AUTENTICACIÓN ---
    // Verificar si el usuario ya está autenticado al cargar la página
    if (sessionStorage.getItem('isAuthenticated') === 'true') {
        showApp();
    } else {
        showLogin();
    }

    // Event listener para el formulario de login
    if(loginForm) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            // Credenciales predeterminadas
            if (username === 'admin' && password === 'admin123') {
                sessionStorage.setItem('isAuthenticated', 'true');
                showApp();
            } else {
                errorMessage.textContent = 'Usuario o contraseña incorrectos.';
                errorMessage.style.display = 'block';
            }
        });
    }

    // Event listener para el botón de cerrar sesión
    if(logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('isAuthenticated');
            window.location.reload();
        });
    }
});

// --- VARIABLES GLOBALES ---
const API_URL = 'https://prestaproagilegithubio-production-be75.up.railway.app';
const VALOR_UIT = 5150;
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
// Elementos del DOM para Pagos
const paymentModal = document.getElementById('paymentModal');
const closePaymentModalBtn = document.getElementById('closePaymentModalBtn');
const paymentForm = document.getElementById('paymentForm');
const paymentModalTitle = document.getElementById('paymentModalTitle');
const paymentLoanIdInput = document.getElementById('paymentLoanId');
const paymentAmountInput = document.getElementById('payment_amount'); // Obtenemos el input de monto
// Elementos del DOM para Confirmación de Eliminación
const deleteConfirmationModal = document.getElementById('deleteConfirmationModal');
const closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn');
const deleteConfirmationForm = document.getElementById('deleteConfirmationForm');
const deleteLoanIdInput = document.getElementById('deleteLoanId');
const deleteConfirmationTextInput = document.getElementById('delete_confirmation_text');
const deleteModalTitle = document.getElementById('deleteModalTitle');
const deleteErrorMessage = document.getElementById('delete-error-message');


// --- CARGA DINÁMICA DEL FORMULARIO DE PRÉSTAMO ---
loanForm.innerHTML = `
    <fieldset>
        <legend>👤 Información del Cliente</legend>
        <div class="form-group">
            <label for="dni">DNI</label>
            <input type="text" id="dni" placeholder="Ingresa 8 dígitos y presiona Tab" required pattern="\\d{8}" maxlength="8" inputmode="numeric">
            <small id="dni-status" style="margin-top: 5px; display: block;"></small>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="nombres">Nombres</label>
                <input type="text" id="nombres" placeholder="Autocompletado con DNI" required readonly>
            </div>
            <div class="form-group">
                <label for="apellidos">Apellidos</label>
                <input type="text" id="apellidos" placeholder="Autocompletado con DNI" required readonly>
            </div>
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
            <div class="form-group"><label for="monto">Monto (S/)</label><input type="number" id="monto" placeholder="Ej: 1000" required step="0.01" min="100" max="20000"></div>
            <div class="form-group">
                <label for="fecha">Fecha de Desembolso</label>
                <input type="date" id="fecha" required>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group"><label for="interes">Interés Mensual (%)</label><input type="number" id="interes" placeholder="Ej: 3.5" required step="0.01" min="1" max="15"></div>
            <div class="form-group"><label for="plazo">Plazo (Meses)</label><input type="number" id="plazo" placeholder="Ej: 12" required min="1" max="60"></div>
        </div>
        <div class="form-group" style="background-color: #F9FAFB; padding: 12px; border-radius: 8px;">
             <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <input type="checkbox" id="hibrido_check" style="width: auto; margin-right: 12px; height: 18px; width: 18px;">
                <label for="hibrido_check" style="margin-bottom: 0;">Activar período de "solo interés"</label>
            </div>
            <div id="hibrido_options" style="display: none;">
                <label for="meses_solo_interes">N° de meses de "solo interés"</label>
                <input type="number" id="meses_solo_interes" placeholder="Ej: 3" min="1">
                <small id="hibrido-info" style="margin-top: 8px; display: block; color: #667085; font-size: 12px;"></small>
            </div>
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

const dniInput = document.getElementById('dni');
const nombresInput = document.getElementById('nombres');
const apellidosInput = document.getElementById('apellidos');
const dniStatus = document.getElementById('dni-status');
const montoInput = document.getElementById('monto');
const declaracionContainer = document.getElementById('declaracion-container');
const declaracionCheckbox = document.getElementById('declaracion_jurada');
const isPepCheckbox = document.getElementById('is_pep');
const hibridoCheck = document.getElementById('hibrido_check');
const hibridoOptions = document.getElementById('hibrido_options');
const mesesSoloInteresInput = document.getElementById('meses_solo_interes');
const interesInput = document.getElementById('interes'); 

// --- ¡NUEVO LISTENER AÑADIDO! ---
// Este listener se asegura de que el valor nunca exceda el máximo permitido
paymentAmountInput.addEventListener('input', () => {
    const maxValue = parseFloat(paymentAmountInput.max);
    if (parseFloat(paymentAmountInput.value) > maxValue) {
        paymentAmountInput.value = maxValue.toFixed(2);
    }
});


dniInput.addEventListener('input', () => { dniInput.value = dniInput.value.replace(/[^0-9]/g, ''); });

function updateHibridoInfo() {
    const infoEl = document.getElementById('hibrido-info');
    if (!hibridoCheck.checked) { infoEl.textContent = ''; return; }
    const monto = parseFloat(montoInput.value) || 0;
    const interes = parseFloat(interesInput.value) || 0;
    const meses = parseInt(mesesSoloInteresInput.value) || 0;
    if (monto > 0 && interes > 0 && meses > 0) {
        const pagoSoloInteres = monto * (interes / 100);
        infoEl.textContent = `Durante ${meses} mes(es), pagará S/ ${pagoSoloInteres.toFixed(2)} (solo interés).`;
    } else { infoEl.textContent = ''; }
}

hibridoCheck.addEventListener('change', () => {
    hibridoOptions.style.display = hibridoCheck.checked ? 'block' : 'none';
    mesesSoloInteresInput.required = hibridoCheck.checked;
    if (!hibridoCheck.checked) mesesSoloInteresInput.value = '';
    const plazo = parseInt(document.getElementById('plazo').value, 10) || 1;
    mesesSoloInteresInput.max = plazo - 1;
    updateHibridoInfo(); 
});
document.getElementById('plazo').addEventListener('input', () => {
    const plazo = parseInt(document.getElementById('plazo').value, 10) || 1;
    mesesSoloInteresInput.max = plazo - 1;
});
function updateDeclaracionVisibility() {
    const monto = parseFloat(montoInput.value) || 0;
    const esPEP = isPepCheckbox.checked;
    const motivo = document.getElementById('declaracion-motivo');
    if (monto > VALOR_UIT || esPEP) {
        declaracionContainer.style.display = 'block';
        declaracionCheckbox.required = true;
        if (esPEP && monto <= VALOR_UIT) motivo.textContent = 'Requerido por ser Persona Expuesta Políticamente (PEP).';
        else if (esPEP && monto > VALOR_UIT) motivo.textContent = 'Requerido por monto mayor a 1 UIT y por ser PEP.';
        else motivo.textContent = `Requerido para montos mayores a 1 UIT (S/ ${VALOR_UIT.toFixed(2)}).`;
    } else {
        declaracionContainer.style.display = 'none';
        declaracionCheckbox.required = false;
        declaracionCheckbox.checked = false;
    }
}
montoInput.addEventListener('input', () => { updateDeclaracionVisibility(); updateHibridoInfo(); });
isPepCheckbox.addEventListener('change', updateDeclaracionVisibility);
interesInput.addEventListener('input', updateHibridoInfo);
mesesSoloInteresInput.addEventListener('input', updateHibridoInfo);

const openModal = (modal) => modal.style.display = 'flex';
const closeModal = (modal) => {
    modal.style.display = 'none';
    if (modal.id === 'loanModal') {
        loanForm.reset();
        dniStatus.textContent = '';
        hibridoOptions.style.display = 'none';
        document.getElementById('hibrido-info').textContent = '';
        updateDeclaracionVisibility();
    }
    if (modal.id === 'detailsModal') currentLoanForDetails = null;
    if (modal.id === 'paymentModal') paymentForm.reset();
    if (modal.id === 'deleteConfirmationModal') {
        deleteConfirmationForm.reset();
        deleteErrorMessage.style.display = 'none';
    }
};

addLoanBtn.addEventListener('click', () => openModal(loanModal));
closeModalBtn.addEventListener('click', () => closeModal(loanModal));
closeDetailsModalBtn.addEventListener('click', () => closeModal(detailsModal));
closePaymentModalBtn.addEventListener('click', () => closeModal(paymentModal));
closeDeleteModalBtn.addEventListener('click', () => closeModal(deleteConfirmationModal));
printScheduleBtn.addEventListener('click', printSchedule);
shareBtn.addEventListener('click', compartirPDF);

window.addEventListener('click', (event) => {
    if (event.target === loanModal) closeModal(loanModal);
    if (event.target === detailsModal) closeModal(detailsModal);
    if (event.target === paymentModal) closeModal(paymentModal);
    if (event.target === deleteConfirmationModal) closeModal(deleteConfirmationModal);
});

function toggleFormLock(locked) {
    const formElements = loanForm.querySelectorAll('input, button');
    const fieldsets = loanForm.querySelectorAll('fieldset');
    formElements.forEach(element => {
        if (element.id !== 'dni') {
            element.disabled = locked;
        }
    });
    fieldsets.forEach(fieldset => {
        fieldset.style.opacity = locked ? 0.6 : 1;
    });
}

dniInput.addEventListener('blur', async () => {
    toggleFormLock(false);
    nombresInput.value = '';
    apellidosInput.value = '';
    
    const dni = dniInput.value;

    if (dni.length !== 8) {
        dniStatus.textContent = '';
        return;
    }

    const hasActiveLoan = loans.some(loan => loan.dni === dni && loan.status === 'Activo');

    if (hasActiveLoan) {
        dniStatus.textContent = '⚠️ Este cliente ya tiene un préstamo activo. Formulario bloqueado.';
        dniStatus.style.color = 'orange';
        toggleFormLock(true);
        return;
    } 
    
    dniStatus.textContent = 'Buscando...';
    dniStatus.style.color = '#667085';
    
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
        dniStatus.textContent = `❌ ${error.message}`;
        dniStatus.style.color = 'red';
    }
});

loanForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    const newLoanData = {
        client: { dni: dniInput.value, nombres: nombresInput.value, apellidos: apellidosInput.value, is_pep: isPepCheckbox.checked },
        monto: parseFloat(montoInput.value),
        interes: parseFloat(interesInput.value),
        fecha: document.getElementById('fecha').value,
        plazo: parseInt(document.getElementById('plazo').value),
        status: 'Activo',
        declaracion_jurada: declaracionCheckbox.checked,
        tipo_calculo: hibridoCheck.checked ? 'Hibrido' : 'Amortizado',
        meses_solo_interes: hibridoCheck.checked ? parseInt(mesesSoloInteresInput.value) : 0
    };
    try {
        const response = await fetch(`${API_URL}/api/loans`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(newLoanData) });
        if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || `Error ${response.status}`); }
        await fetchAndRenderLoans();
        showSuccessAnimation('¡Préstamo Registrado!');
    } catch (error) { alert(`No se pudo guardar el préstamo: ${error.message}`); }
});

paymentForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    const loanId = paymentLoanIdInput.value;
    const paymentData = {
        payment_amount: parseFloat(document.getElementById('payment_amount').value),
        payment_date: document.getElementById('payment_date').value
    };
    try {
        const response = await fetch(`${API_URL}/api/loans/${loanId}/payments`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(paymentData)
        });
        if (!response.ok) { 
            const errorData = await response.json();
            // Mostramos el error específico del backend
            throw new Error(errorData.error || `Error ${response.status}`); 
        }
        await fetchAndRenderLoans();
        showSuccessAnimation('¡Pago Registrado!');
        closeModal(paymentModal);
    } catch (error) { 
        alert(`No se pudo registrar el pago: ${error.message}`); 
    }
});

deleteConfirmationForm.addEventListener('submit', function(event) {
    event.preventDefault();
    const loanId = deleteLoanIdInput.value;
    const confirmationText = 'ELIMINAR';

    if (deleteConfirmationTextInput.value.trim() === confirmationText) {
        deleteErrorMessage.style.display = 'none';
        deleteLoan(loanId);
        closeModal(deleteConfirmationModal);
    } else {
        deleteErrorMessage.style.display = 'block';
        deleteConfirmationTextInput.focus();
    }
});

function showSuccessAnimation(message) {
    document.getElementById('successText').textContent = message;
    document.getElementById('successAnimation').style.display = 'flex';
    setTimeout(() => {
        document.getElementById('successAnimation').style.display = 'none';
        closeModal(loanModal);
    }, 2500);
}

async function fetchAndRenderLoans() {
    try {
        const response = await fetch(`${API_URL}/api/loans`);
        if (!response.ok) throw new Error('Error al cargar los préstamos');
        loans = await response.json();
        renderHistoryTable();
        updateDashboard();
    } catch (error) {
        historyTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">Error al cargar datos.</td></tr>`;
    }
}

function renderHistoryTable() {
    historyTableBody.innerHTML = '';
    if (loans.length === 0) { 
        historyTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #98A2B3;">Aún no hay préstamos registrados.</td></tr>`;
        return; 
    }
    loans.forEach(loan => {
        const row = document.createElement('tr');
        const pepLabel = loan.is_pep ? ' <strong style="color: #D92D20;">(PEP)</strong>' : '';
        const hibridoLabel = loan.tipo_calculo === 'Hibrido' ? ' <strong style="color: #005DFF;">(Híbrido)</strong>' : '';

        const isPaid = loan.status === 'Pagado';
        const statusClass = isPaid ? 'status-paid' : 'status-active';
        const payButtonDisabled = isPaid ? 'disabled' : '';

        const progressPercent = loan.total_due > 0 ? (loan.total_paid / loan.total_due) * 100 : 0;

        row.innerHTML = `
            <td>${loan.nombres} ${loan.apellidos}${pepLabel}${hibridoLabel}</td>
            <td>S/ ${parseFloat(loan.monto).toFixed(2)}</td>
            <td>
                <div class="progress-text">S/ ${loan.total_paid.toFixed(2)} de S/ ${loan.total_due.toFixed(2)}</div>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${progressPercent > 100 ? 100 : progressPercent}%;"></div>
                </div>
            </td>
            <td><span class="status ${statusClass}">${loan.status}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="button button-secondary view-details-btn" data-loan-id="${loan.id}">Detalles</button>
                    <button class="button button-primary register-payment-btn" data-loan-id="${loan.id}" ${payButtonDisabled}>Pagar</button>
                    <button class="button button-danger delete-loan-btn" data-loan-id="${loan.id}">Eliminar</button>
                </div>
            </td>
        `;
        historyTableBody.appendChild(row);
    });
}

function populateDetailsModal(loan) {
    currentLoanForDetails = loan;
    const { payments, schedule } = calculateSchedule(loan);
    let paymentSummary = '';
    if(loan.tipo_calculo === 'Hibrido' && loan.meses_solo_interes > 0) {
        paymentSummary = `
            <p><strong>Cuota "Solo Interés" (Mes 1-${loan.meses_solo_interes}): S/ ${payments.interestOnlyPayment.toFixed(2)}</strong></p>
            <p><strong>Cuota Regular (Desde Mes ${loan.meses_solo_interes + 1}): S/ ${payments.amortizedPayment.toFixed(2)}</strong></p>
        `;
    } else {
        paymentSummary = `<p><strong>Cuota Mensual Fija: S/ ${payments.amortizedPayment.toFixed(2)}</strong></p>`;
    }

    const disbursementDate = new Date(loan.fecha).toLocaleDateString('es-PE', {
        day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC'
    });

    document.getElementById('scheduleSummary').innerHTML = `
        <p><strong>Cliente:</strong> ${loan.nombres} ${loan.apellidos} ${loan.is_pep ? '<strong style="color: #D92D20;">(PEP)</strong>' : ''}</p>
        <p>
            <strong>Monto:</strong> S/ ${parseFloat(loan.monto).toFixed(2)} | 
            <strong>Interés:</strong> ${loan.interes}% | 
            <strong>Plazo:</strong> ${loan.plazo} meses
        </p>
        <p><strong>Fecha de Desembolso:</strong> ${disbursementDate}</p>
        ${paymentSummary}
    `;
    
    const declaracionSection = document.getElementById('declaracionJuradaSection');
    if (parseFloat(loan.monto) > VALOR_UIT || loan.is_pep) {
        declaracionSection.style.display = 'block';
        declaracionSection.innerHTML = `
            <h4 class="declaracion-title">DECLARACIÓN JURADA DE ORIGEN DE FONDOS</h4>
            <div class="declaracion-body">
                <p>Yo, <strong>${loan.nombres} ${loan.apellidos}</strong>, identificado(a) con DNI N° <strong>${loan.dni}</strong>, declaro bajo juramento que los fondos y/o bienes utilizados en la operación de préstamo de S/ ${parseFloat(loan.monto).toFixed(2)} provienen de actividades lícitas y no están vinculados con el lavado de activos, financiamiento del terrorismo ni cualquier otra actividad ilegal contemplada en las leyes vigentes del Perú.</p>
                <p>Asimismo, declaro que la información proporcionada es veraz y autorizo a PRESTAPRO a realizar las verificaciones correspondientes.</p>
            </div>
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

    document.getElementById('scheduleTableBody').innerHTML = schedule.map(item => `
        <tr><td>${item.cuota}</td><td>${item.fecha}</td><td>S/ ${item.monto}</td></tr>`).join('');
    
    const paymentHistoryBody = document.getElementById('paymentHistoryBody');
    if (loan.payments && loan.payments.length > 0) {
        paymentHistoryBody.innerHTML = loan.payments.map((p, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${new Date(p.payment_date).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</td>
                <td>S/ ${parseFloat(p.payment_amount).toFixed(2)}</td>
            </tr>
        `).join('');
    } else {
        paymentHistoryBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No hay pagos registrados.</td></tr>';
    }

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
    const target = event.target.closest('button');
    if (!target) return;

    if (target.classList.contains('view-details-btn')) {
        const loanId = target.getAttribute('data-loan-id');
        const loan = loans.find(l => l.id == loanId);
        if (loan) populateDetailsModal(loan);
    }
    
    if (target.classList.contains('register-payment-btn')) {
        const loanId = target.getAttribute('data-loan-id');
        const loan = loans.find(l => l.id == loanId);
        if (loan) {
            const remainingBalance = loan.total_due - loan.total_paid;
            
            paymentAmountInput.max = remainingBalance > 0 ? remainingBalance.toFixed(2) : '0.01';
            paymentAmountInput.value = remainingBalance > 0 ? remainingBalance.toFixed(2) : '';

            paymentModalTitle.textContent = `Registrar Pago para ${loan.apellidos}`;
            paymentLoanIdInput.value = loan.id;
            document.getElementById('payment_date').valueAsDate = new Date();
            openModal(paymentModal);
        }
    }

    if (target.classList.contains('delete-loan-btn')) {
        const loanId = target.getAttribute('data-loan-id');
        const loan = loans.find(l => l.id == loanId);
        if (loan) {
            deleteLoanIdInput.value = loan.id;
            deleteModalTitle.textContent = `Eliminar Préstamo de ${loan.apellidos}`;
            openModal(deleteConfirmationModal);
        }
    }
});

async function deleteLoan(loanId) {
    try {
        const response = await fetch(`${API_URL}/api/loans/${loanId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error en el servidor');
        }
        
        document.getElementById('successText').textContent = "¡Préstamo Eliminado!";
        document.getElementById('successAnimation').style.display = 'flex';
        setTimeout(() => { document.getElementById('successAnimation').style.display = 'none'; }, 2500);

        fetchAndRenderLoans();
    } catch (error) {
        alert(`No se pudo eliminar el préstamo: ${error.message}`);
    }
}

function calculateSchedule(loan) {
   const monthlyInterestRate = parseFloat(loan.interes) / 100;
   const principal = parseFloat(loan.monto);
   const schedule = [];
   const startDate = new Date(loan.fecha);
   let payments = {};

   if (loan.tipo_calculo === 'Hibrido' && loan.meses_solo_interes > 0) {
        const interestOnlyPayment = principal * monthlyInterestRate;
        payments.interestOnlyPayment = interestOnlyPayment;

        for (let i = 1; i <= loan.meses_solo_interes; i++) {
            const paymentDate = new Date(startDate);
            paymentDate.setUTCMonth(paymentDate.getUTCMonth() + i);
            schedule.push({
                cuota: i,
                fecha: paymentDate.toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
                monto: interestOnlyPayment.toFixed(2)
            });
        }

        const remainingTerm = loan.plazo - loan.meses_solo_interes;
        const amortizedPayment = (principal * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -remainingTerm));
        payments.amortizedPayment = amortizedPayment;

        for (let i = 1; i <= remainingTerm; i++) {
            const paymentDate = new Date(startDate);
            paymentDate.setUTCMonth(paymentDate.getUTCMonth() + loan.meses_solo_interes + i);
            schedule.push({
                cuota: loan.meses_solo_interes + i,
                fecha: paymentDate.toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
                monto: amortizedPayment.toFixed(2)
            });
        }

   } else {
        const monthlyPayment = (principal * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -loan.plazo));
        payments.amortizedPayment = monthlyPayment;
        
        for (let i = 1; i <= loan.plazo; i++) {
            const paymentDate = new Date(startDate);
            paymentDate.setUTCMonth(paymentDate.getUTCMonth() + i);
            schedule.push({
                cuota: i,
                fecha: paymentDate.toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
                monto: monthlyPayment.toFixed(2)
            });
        }
   }
    return { payments, schedule };
}

function printSchedule() {
    const printableContent = document.querySelector('#detailsModal .printable').innerHTML;
    
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Cronograma de Pagos</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
                @page { margin: 15mm; size: A4; } * { box-sizing: border-box; }
                html, body { margin: 0; padding: 0; font-family: 'Poppins', sans-serif; font-size: 12px; line-height: 1.4; color: #344054; }
                .modal-header { padding: 0 0 15px 0; border-bottom: 2px solid #D0D5DD; margin-bottom: 20px; }
                .modal-header h2 { font-size: 18px; color: #0D244F; margin: 0; } .close-button { display: none !important; }
                .summary-info { padding: 15px; background-color: #E6F0FF; border-radius: 8px; margin-bottom: 20px; border: 1px solid #005DFF; page-break-inside: avoid; }
                .summary-info p { margin: 5px 0; font-size: 11px; }
                #declaracionJuradaSection { margin: 20px 0; padding: 15px; border: 1px solid #D0D5DD; border-radius: 8px; page-break-inside: avoid; }
                .declaracion-title { text-align: center; font-size: 14px; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; color: #0D244F; }
                .declaracion-body { font-size: 10px; line-height: 1.6; text-align: justify; margin-bottom: 25px; }
                .declaracion-signature { margin-top: 30px; text-align: center; font-size: 10px; } .declaracion-signature p { margin: 3px 0; }
                .table-container { width: 100%; overflow: visible; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; } thead { display: table-header-group; }
                th, td { padding: 10px; text-align: left; border: 1px solid #D0D5DD; font-size: 11px; }
                th { background-color: #F9FAFB; font-weight: 600; text-transform: uppercase; color: #667085; font-size: 10px; }
                tr { page-break-inside: avoid; } tbody tr:nth-child(even) { background-color: #FAFBFC; }
            </style>
        </head>
        <body>${printableContent}</body>
        </html>
    `);
    iframeDoc.close();

    iframe.onload = function() {
        setTimeout(function() {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => { document.body.removeChild(iframe); }, 100);
        }, 500);
    };
}

function compartirPDF() {
    if (!currentLoanForDetails) { alert("No hay información del préstamo para compartir."); return; }
    if (typeof window.jspdf === 'undefined') { alert("Error: La librería jsPDF no se cargó correctamente."); return; }
    try {
        const loan = currentLoanForDetails;
        const { payments, schedule } = calculateSchedule(loan);
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

        if (loan.tipo_calculo === 'Hibrido' && loan.meses_solo_interes > 0) {
            doc.text(`Cuota 'Solo Interés': S/ ${payments.interestOnlyPayment.toFixed(2)}`, 14, 70);
            doc.text(`Cuota Regular: S/ ${payments.amortizedPayment.toFixed(2)}`, 14, 76);
            finalY = 86;
        } else {
            doc.text(`Cuota Mensual Fija: S/ ${payments.amortizedPayment.toFixed(2)}`, 14, 70);
            finalY = 80;
        }

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

