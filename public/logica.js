// --- VARIABLES GLOBALES Y CONFIGURACIÓN ---
const API_URL = 'https://prestaproagilegithubio-production-be75.up.railway.app';
const VALOR_UIT = 5150;
const TASA_INTERES_ANUAL = 10;
const TASA_MORA_MENSUAL = 1; // 1% de mora por mes

let loans = [];
let clients = new Set();
let currentLoanForDetails = null;
let currentLoanForQuickPayment = null;
let calculatedPaymentData = { amount: 0, mora: 0 }; // Guarda el último cálculo flexible
let currentReceiptData = null; 

// --- CREDENCIALES (SIMULACIÓN) ---
let currentUser = 'admin';
let currentPassword = 'admin123';

// --- FUNCIONES DE UTILIDAD DOM ---
function getDomElement(id) { return document.getElementById(id); }
function openModal(modal) { if (modal) { modal.style.display = 'flex'; } }
function closeModal(modal) { 
    if (!modal) return;
    modal.style.display = 'none';
    if (modal.querySelector('form')) { modal.querySelector('form').reset(); }
    if (modal.id === 'loanModal') resetLoanForm();
    if (modal.id === 'paymentModal') {
        const paymentMoraInfo = getDomElement('paymentMoraInfo');
        if (paymentMoraInfo) paymentMoraInfo.style.display = 'none';
        const paymentAmountHint = getDomElement('payment_amount_hint');
        if (paymentAmountHint) paymentAmountHint.textContent = '';
        const selectedMethodRadios = document.querySelectorAll('input[name="payment_method"]');
        selectedMethodRadios.forEach(radio => radio.checked = false);
    }
    if (modal.id === 'quick-payment-summary-section') {
        calculatedPaymentData = { amount: 0, mora: 0 };
    }
    if (modal.id === 'deleteConfirmationModal') getDomElement('delete-error-message').style.display = 'none';
}

function showSuccessAnimation(message) {
    getDomElement('successText').textContent = message;
    getDomElement('successAnimation').style.display = 'flex';
    setTimeout(() => {
        getDomElement('successAnimation').style.display = 'none';
        if(message.includes("Préstamo")) closeModal(getDomElement('loanModal'));
        if(message.includes("Pago")) {
             closeModal(getDomElement('paymentModal'));
             // Si el pago es rápido, resetear el módulo de pagos
             getDomElement('search-dni-pago').value = '';
             getDomElement('search-dni-status').textContent = '';
             getDomElement('quick-payment-result-section').style.display = 'none';
             getDomElement('quick-payment-summary-section').style.display = 'none';
             getDomElement('quickPaymentTableBody').innerHTML = '<tr><td colspan="4" style="text-align: center; color: #9CA3AF;">Busca un DNI para encontrar préstamos.</td></tr>';
             currentLoanForQuickPayment = null;
        }
    }, 2500);
}

// --- FUNCIÓN DE INICIALIZACIÓN PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // --- ELEMENTOS DEL DOM ---
    const loginContainer = getDomElement('loginContainer');
    const appContainer = getDomElement('appContainer');
    const loginForm = getDomElement('loginForm');
    const errorMessage = getDomElement('error-message');
    const logoutBtn = getDomElement('logoutBtn');
    const addLoanBtn = getDomElement('addLoanBtn');
    const loanModal = getDomElement('loanModal');
    const deleteConfirmationForm = getDomElement('deleteConfirmationForm');
    
    const changePasswordLink = getDomElement('changePasswordLink');
    const changePasswordModal = getDomElement('changePasswordModal');
    const changePasswordForm = getDomElement('changePasswordForm');
    const changePasswordError = getDomElement('change-password-error');

    const moduleCards = document.querySelectorAll('.module-card');
    const backToMenuBtn = getDomElement('backToMenuBtn');
    
    // --- FUNCIÓN DE MOSTRAR APLICACIÓN ---
    const showApp = () => {
        loginContainer.style.display = 'none';
        appContainer.style.display = 'block';
        fetchAndRenderLoans();
        showModule('module-menu');
    };

    const showLogin = () => {
        loginContainer.style.display = 'flex';
        appContainer.style.display = 'none';
    };

    // --- LÓGICA DE NAVEGACIÓN ---
    function showModule(moduleId) {
        document.querySelectorAll('.module-view').forEach(view => {
            view.style.display = 'none';
            view.classList.remove('active');
        });

        const targetModule = getDomElement(moduleId);
        if (targetModule) {
            targetModule.style.display = 'block';
            targetModule.classList.add('active');
        }

        const appTitle = getDomElement('appTitle');

        if (moduleId === 'module-menu') {
            backToMenuBtn.style.display = 'none';
            appTitle.textContent = '💰 PrestaPro';
            fetchAndRenderLoans();
        } else {
            backToMenuBtn.style.display = 'inline-flex';

            if (moduleId === 'module-pagos') {
                appTitle.textContent = '💳 Registrar Pagos';
                getDomElement('search-dni-pago').value = '';
                getDomElement('quickPaymentTableBody').innerHTML = '<tr><td colspan="4" style="text-align: center; color: #9CA3AF;">Busca un DNI para encontrar préstamos.</td></tr>';
                getDomElement('quick-payment-result-section').style.display = 'none';
                getDomElement('quick-payment-summary-section').style.display = 'none';
            } else if (moduleId === 'module-prestamos') {
                appTitle.textContent = '📋 Gestión de Préstamos';
            } else if (moduleId === 'module-caja') {
                 appTitle.textContent = '📊 Cuadre de Caja';
                 openCashRegister(); 
            }
        }
    }

    // --- LÓGICA DE AUTENTICACIÓN (CORREGIDA) ---
    if (sessionStorage.getItem('isAuthenticated') === 'true') { showApp(); } else { showLogin(); }

    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const username = getDomElement('username').value;
            const password = getDomElement('password').value;
            if (username === currentUser && password === currentPassword) {
                sessionStorage.setItem('isAuthenticated', 'true');
                showApp();
            } else {
                errorMessage.textContent = 'Usuario o contraseña incorrectos.';
                errorMessage.style.display = 'block';
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
             sessionStorage.removeItem('isAuthenticated');
             window.location.reload();
        });
    }

    // --- HANDLERS DE EVENTOS Y MODALES ---
    getDomElement('closeModalBtn')?.addEventListener('click', () => closeModal(loanModal));
    getDomElement('closeDetailsModalBtn')?.addEventListener('click', () => closeModal(getDomElement('detailsModal')));
    getDomElement('closePaymentModalBtn')?.addEventListener('click', () => closeModal(getDomElement('paymentModal')));
    getDomElement('closeDeleteModalBtn')?.addEventListener('click', () => closeModal(getDomElement('deleteConfirmationModal')));
    getDomElement('closeReceiptModalBtn')?.addEventListener('click', () => closeModal(getDomElement('receiptModal')));

    getDomElement('printScheduleBtn')?.addEventListener('click', printSchedule);
    getDomElement('shareBtn')?.addEventListener('click', compartirPDF);
    getDomElement('printReceiptBtn')?.addEventListener('click', () => printModalContent(getDomElement('receiptContent')));
    getDomElement('downloadReceiptBtn')?.addEventListener('click', downloadReceipt);

    moduleCards.forEach(card => {
        card.addEventListener('click', () => {
            const moduleId = card.getAttribute('data-target');
            showModule(moduleId);
        });
    });

    backToMenuBtn?.addEventListener('click', () => { showModule('module-menu'); });

    addLoanBtn?.addEventListener('click', () => openModal(loanModal));
    deleteConfirmationForm?.addEventListener('submit', handleDeleteSubmit);
    
    // --- CAMBIO DE CONTRASEÑA ---
    changePasswordLink?.addEventListener('click', (e) => {
        e.preventDefault();
        errorMessage.style.display = 'none';
        changePasswordError.style.display = 'none';
        changePasswordForm.reset();
        openModal(changePasswordModal);
    });

    changePasswordForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        const currentPasswordInput = getDomElement('current_password').value;
        const newPassword = getDomElement('new_password').value;
        const confirmNewPassword = getDomElement('confirm_new_password').value;
        
        if (currentPasswordInput !== currentPassword) {
            changePasswordError.textContent = 'La contraseña actual es incorrecta.';
            changePasswordError.style.display = 'block';
            return;
        }
        if (newPassword.length < 6) {
            changePasswordError.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.';
            changePasswordError.style.display = 'block';
            return;
        }
        if (newPassword !== confirmNewPassword) {
            changePasswordError.textContent = 'Las nuevas contraseñas no coinciden.';
            changePasswordError.style.display = 'block';
            return;
        }
        currentPassword = newPassword;
        showSuccessAnimation('¡Contraseña Actualizada!');
        setTimeout(() => closeModal(changePasswordModal), 2500);
    });

    // === DELEGACIÓN DE EVENTOS DE LA TABLA PRINCIPAL (CORREGIDA) ===
    getDomElement('historyTableBody')?.addEventListener('click', function(event) {
        const target = event.target.closest('button');
        if (!target) return;

        const loanId = target.getAttribute('data-loan-id');
        const loan = loans.find(l => l.id == loanId);
        if (!loan) return;
        
        if (target.classList.contains('view-details-btn')) {
            populateDetailsModal(loan);
        } else if (target.classList.contains('register-payment-btn')) {
            openPaymentModal(loan);
        } else if (target.classList.contains('delete-loan-btn')) {
            getDomElement('deleteLoanId').value = loan.id;
            getDomElement('deleteModalTitle').textContent = `⚠️ Confirmar Eliminación - ${loan.apellidos}`;
            getDomElement('delete_confirmation_text').value = '';
            openModal(getDomElement('deleteConfirmationModal'));
        }
    });

    // --- INICIALIZACIÓN DE LÓGICA DE NEGOCIO ---
    initPaymentListeners();
    initQuickPaymentListeners();
    initLoanFormLogic();
    initCashRegisterListeners();
    initReceiptButtonListeners(); // Añadido listener para recibos en detalles
}

function handleDeleteSubmit(e) {
    e.preventDefault();
    const loanId = getDomElement('deleteLoanId').value;
    const confirmationText = 'ELIMINAR';

    if (getDomElement('delete_confirmation_text').value.trim() === confirmationText) {
        getDomElement('delete-error-message').style.display = 'none';
        deleteLoan(loanId);
        closeModal(getDomElement('deleteConfirmationModal'));
    } else {
        getDomElement('delete-error-message').style.display = 'block';
        getDomElement('delete_confirmation_text').focus();
    }
}


// --- LÓGICA DE CUADRE DE CAJA (Mínima) ---
function openCashRegister() {
    const today = new Date().toISOString().split('T')[0];
    getDomElement('cashRegisterDateFrom').value = today;
    getDomElement('cashRegisterDateTo').value = today;
    filterCashRegister();
}

function initCashRegisterListeners() {
    getDomElement('filterCashRegisterBtn')?.addEventListener('click', filterCashRegister);
    getDomElement('saveDailySquareBtn')?.addEventListener('click', saveDailySquare);
}

function initReceiptButtonListeners() {
    const paymentHistoryBody = getDomElement('paymentHistoryBody');

    if (paymentHistoryBody) {
        paymentHistoryBody.addEventListener('click', function(event) {
            const target = event.target.closest('button');
            if (!target || !target.classList.contains('view-receipt-btn')) return;

            const loanId = target.getAttribute('data-loan-id');
            const paymentIndex = parseInt(target.getAttribute('data-payment-index'));

            const loan = loans.find(l => l.id == loanId);
            if (!loan || !loan.payments || !loan.payments[paymentIndex]) {
                alert('No se pudo encontrar el pago seleccionado.');
                return;
            }

            const payment = loan.payments[paymentIndex];
            showReceipt(payment, loan);
        });
    }
}

function filterCashRegister() {
    const allMovements = getMovementsByDateRange(getDomElement('cashRegisterDateFrom').value, getDomElement('cashRegisterDateTo').value, null);
    
    const totalAllIngresos = allMovements.reduce((sum, m) => sum + m.total, 0);
    const summaryContent = `
        <p><strong>Total de Ingresos (Calculado):</strong> <span style="font-weight: 700; color: var(--success-color);">S/ ${totalAllIngresos.toFixed(2)}</span></p>
        <p><strong>Ingreso Declarado (En Efectivo):</strong> N/A</p>
        <p style="border-top: 1px solid var(--border-color); padding-top: 5px; margin-top: 10px;"><strong>Diferencia:</strong> N/A</p>
    `;
    getDomElement('cashRegisterSummary').innerHTML = summaryContent;
    getDomElement('dailySquareSection').style.display = 'none';

    renderCashRegisterTable(allMovements); 
}

function renderCashRegisterTable(movements) {
    const tbody = getDomElement('cashRegisterTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (movements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #9CA3AF;">No se encontraron movimientos.</td></tr>';
        return;
    }

    movements.forEach(m => {
        const row = document.createElement('tr');
        const dateString = new Date(m.date).toLocaleDateString('es-PE', { timeZone: 'UTC' });
        const methodColor = m.method === 'Efectivo' ? 'var(--success-color)' : 'var(--primary-color)';

        row.innerHTML = `
            <td>${dateString}</td>
            <td>${m.client}</td>
            <td>S/ ${m.amount.toFixed(2)}</td>
            <td style="color: var(--warning-color); font-weight: 500;">S/ ${m.mora.toFixed(2)}</td>
            <td style="font-weight: 600; color: ${methodColor};">${m.method}</td>
            <td style="font-weight: 600; color: var(--success-color);">S/ ${m.total.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    });
}

function getMovementsByDateRange(dateFrom, dateTo, methodFilter = null) {
    const startDate = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : 0;
    const endDate = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : Date.now();

    const filteredMovements = [];
    loans.forEach(loan => {
        if (loan.payments) {
            loan.payments.forEach(p => {
                const paymentDate = new Date(p.payment_date).getTime();
                const method = p.payment_method || 'Efectivo'; 

                if (paymentDate >= startDate && paymentDate <= endDate && (!methodFilter || method === methodFilter)) {
                    filteredMovements.push({
                        date: paymentDate,
                        client: `${loan.nombres} ${loan.apellidos}`,
                        amount: parseFloat(p.payment_amount) - (parseFloat(p.mora_amount) || 0), 
                        mora: parseFloat(p.mora_amount || 0),
                        total: parseFloat(p.payment_amount),
                        method: method
                    });
                }
            });
        }
    });

    return filteredMovements;
}

function saveDailySquare() {
    alert('La función de Cuadre de Caja aún está en desarrollo. Los datos se basan en la simulación.');
}


// --- LÓGICA DE PRÉSTAMOS (ADAPTADA AL NUEVO HTML) ---
function initLoanFormLogic() {
    const loanForm = getDomElement('loanForm');
    if (!loanForm) return;

    const today = new Date().toISOString().split('T')[0];

    // INYECCIÓN DE HTML DEL FORMULARIO DE PRÉSTAMO
    loanForm.innerHTML = `
        <fieldset>
            <legend>📋 Información del Cliente</legend>
            <div class="form-group">
                <label for="dni">DNI (8 dígitos)</label>
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
            <div class="checkbox-container">
                <input type="checkbox" id="is_pep">
                <label for="is_pep">¿Es Persona Expuesta Políticamente (PEP)?</label>
            </div>
        </fieldset>

        <fieldset>
            <legend>💰 Detalles del Préstamo</legend>
            <div class="form-row">
                <div class="form-group">
                    <label for="monto">Monto del Préstamo (S/)</label>
                    <input type="number" id="monto" required step="0.01" min="100" placeholder="5000">
                </div>
                <div class="form-group">
                    <label for="fecha">Fecha de Desembolso</label>
                    <input type="date" id="fecha" required value="${today}">
                </div>
                <div class="form-group">
                    <label for="plazo">Plazo (meses)</label>
                    <input type="number" id="plazo" required min="1" max="60" placeholder="12">
                </div>
            </div>
            <div class="form-group">
                <label>Tasa de Interés Anual</label>
                <div class="static-value">${TASA_INTERES_ANUAL.toFixed(2)}% (Fijo)</div>
            </div>
            <div class="form-group">
                <label for="loan_tipo_calculo">Tipo de Cálculo</label>
                <select id="loan_tipo_calculo" required>
                    <option value="Amortizado" selected>Amortizado (Cuotas Fijas)</option>
                    <option value="Hibrido">Híbrido (Primeros Meses Solo Interés)</option>
                </select>
                <small>Amortizado: cuotas mensuales fijas. Híbrido: primeros meses solo paga interés.</small>
            </div>
            <div class="form-group" id="hibrido_options" style="display: none;">
                <label for="meses_solo_interes">Meses de "Solo Interés"</label>
                <input type="number" id="meses_solo_interes" min="1" placeholder="3">
                <small id="hibrido-info">Cantidad de meses donde solo se paga el interés mensual.</small>
            </div>
            
            <div id="declaracion-container" class="form-group" style="display: none; background-color: var(--primary-light); padding: 15px; border-radius: 8px; margin-top: 10px;">
                <div style="display: flex; align-items: center;">
                    <input type="checkbox" id="declaracion_jurada" style="width: 20px; height: 20px; margin-right: 12px;">
                    <label for="declaracion_jurada" style="margin-bottom: 0;">Declaro bajo juramento el origen lícito del dinero.</label>
                </div>
                <small id="declaracion-motivo" style="margin-left: 30px; margin-top: 4px; color: var(--text-color);"></small>
            </div>
        </fieldset>
        <button type="submit" class="submit-button">💾 Registrar Préstamo</button>
    `;

    // Re-declaración de elementos después de inyectar HTML
    const dniInput = getDomElement('dni');
    const nombresInput = getDomElement('nombres');
    const apellidosInput = getDomElement('apellidos');
    const dniStatus = getDomElement('dni-status');
    const montoInput = getDomElement('monto');
    const isPepCheckbox = getDomElement('is_pep');
    const declaracionContainer = getDomElement('declaracion-container');
    const declaracionCheckbox = getDomElement('declaracion_jurada');
    const tipoCalculoSelect = getDomElement('loan_tipo_calculo');
    const hibridoOptions = getDomElement('hibrido_options');
    const mesesSoloInteresInput = getDomElement('meses_solo_interes');

    // Lógica para mostrar/ocultar el campo híbrido
    tipoCalculoSelect?.addEventListener('change', (e) => {
        if (e.target.value === 'Hibrido') {
            hibridoOptions.style.display = 'block';
            mesesSoloInteresInput.required = true;
        } else {
            hibridoOptions.style.display = 'none';
            mesesSoloInteresInput.required = false;
        }
    });

    // Lógica de validación PEP/UIT
    function updateDeclaracionVisibility() {
        const monto = parseFloat(montoInput.value) || 0;
        const esPEP = isPepCheckbox.checked;
        const motivo = getDomElement('declaracion-motivo');
        const VALOR_UIT_LOCAL = 5150;
        
        if (monto > VALOR_UIT_LOCAL || esPEP) {
            declaracionContainer.style.display = 'block';
            declaracionCheckbox.required = true;
            if (esPEP && monto <= VALOR_UIT_LOCAL) motivo.textContent = 'Requerido por ser Persona Expuesta Políticamente (PEP).';
            else if (esPEP && monto > VALOR_UIT_LOCAL) motivo.textContent = 'Requerido por monto mayor a 1 UIT y por ser PEP.';
            else motivo.textContent = `Requerido para montos mayores a 1 UIT (S/ ${VALOR_UIT_LOCAL.toFixed(2)}).`;
        } else {
            declaracionContainer.style.display = 'none';
            declaracionCheckbox.required = false;
            declaracionCheckbox.checked = false;
        }
    }
    
    function updateHibridoInfo() {
        const infoEl = getDomElement('hibrido-info');
        if (!infoEl) return;
        const monto = parseFloat(montoInput.value) || 0;
        const interesMensual = TASA_INTERES_ANUAL / 12;
        const meses = parseInt(mesesSoloInteresInput.value) || 0;
        if (monto > 0 && interesMensual > 0 && meses > 0) {
            const pagoSoloInteres = monto * (interesMensual / 100);
            infoEl.textContent = `Durante ${meses} mes(es), pagará S/ ${pagoSoloInteres.toFixed(2)} (solo interés).`;
        } else { infoEl.textContent = ''; }
    }
    
    montoInput.addEventListener('input', () => { updateDeclaracionVisibility(); updateHibridoInfo(); });
    isPepCheckbox.addEventListener('change', updateDeclaracionVisibility);
    mesesSoloInteresInput.addEventListener('input', updateHibridoInfo);

    dniInput.addEventListener('blur', async () => {
        toggleFormLock(false);
        nombresInput.value = '';
        apellidosInput.value = '';
        
        const dni = dniInput.value;

        if (dni.length !== 8) { dniStatus.textContent = ''; return; }

        const hasActiveLoan = loans.some(loan => loan.dni === dni && loan.status === 'Activo');

        if (hasActiveLoan) {
            dniStatus.textContent = '⚠️ Este cliente ya tiene un préstamo activo. Formulario bloqueado.';
            dniStatus.style.color = 'orange';
            toggleFormLock(true);
            return;
        } 
        
        dniStatus.textContent = 'Buscando...'; dniStatus.style.color = '#667085';
        
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
            dniStatus.style.color = 'var(--danger-color)';
        }
    });

    // Event Listener del formulario de Préstamos (submit)
    getDomElement('loanForm').addEventListener('submit', async function(event) {
        event.preventDefault();
        const newLoanData = {
            client: { dni: dniInput.value, nombres: nombresInput.value, apellidos: apellidosInput.value, is_pep: isPepCheckbox.checked },
            monto: parseFloat(montoInput.value),
            interes: TASA_INTERES_ANUAL / 12,
            fecha: getDomElement('fecha').value,
            plazo: parseInt(getDomElement('plazo').value),
            status: 'Activo',
            declaracion_jurada: declaracionCheckbox.checked,
            tipo_calculo: tipoCalculoSelect.value,
            meses_solo_interes: tipoCalculoSelect.value === 'Hibrido' ? parseInt(mesesSoloInteresInput.value) : 0
        };
        try {
            const response = await fetch(`${API_URL}/api/loans`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(newLoanData) });
            if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || `Error ${response.status}`); }
            await fetchAndRenderLoans();
            showSuccessAnimation('¡Préstamo Registrado!');
        } catch (error) { alert(`No se pudo guardar el préstamo: ${error.message}`); }
    });
}

// --- LÓGICA DE PAGOS INDIVIDUALES (MODAL DE DETALLES) ---
function initPaymentListeners() {
    // Estilos de selección de método
    document.querySelectorAll('.payment-method-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.payment-method-card').forEach(c => {
                c.style.borderColor = 'var(--border-color)';
                c.style.backgroundColor = 'var(--bg-secondary)';
            });
            card.style.borderColor = 'var(--primary-color)';
            card.style.backgroundColor = 'var(--primary-light)';

            const radio = card.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
        });
    });

    getDomElement('paymentForm').addEventListener('submit', handlePaymentSubmit);
}

function openPaymentModal(loan) {
    const paymentModalTitle = getDomElement('paymentModalTitle');
    const paymentLoanIdInput = getDomElement('paymentLoanId');
    const paymentAmountInput = getDomElement('payment_amount');
    const moraAmountInput = getDomElement('mora_amount');
    const paymentDateInput = getDomElement('payment_date');
    const paymentAmountHint = getDomElement('payment_amount_hint');
    const paymentMoraInfo = getDomElement('paymentMoraInfo');

    paymentModalTitle.textContent = `💳 Registrar Pago - ${loan.nombres} ${loan.apellidos}`;
    paymentLoanIdInput.value = loan.id;

    // 1. Calcular Saldo y Mora
    const remainingCapitalInterest = loan.total_due - loan.total_paid;
    const moraInfo = calculateMora(loan);

    // 2. Llenar campos
    paymentDateInput.value = new Date().toISOString().split('T')[0];

    paymentAmountInput.value = remainingCapitalInterest.toFixed(2);
    paymentAmountInput.min = remainingCapitalInterest > 0 ? '0.01' : '0.00';
    paymentAmountInput.max = remainingCapitalInterest.toFixed(2);
    paymentAmountHint.textContent = `Monto máximo a pagar (Capital/Interés): S/ ${remainingCapitalInterest.toFixed(2)}`;

    moraAmountInput.value = moraInfo.totalMora.toFixed(2);
    moraAmountInput.readOnly = moraInfo.totalMora > 0; 

    // 3. Mostrar alerta de Mora
    if (moraInfo.totalMora > 0) {
        paymentMoraInfo.style.display = 'flex';
        paymentMoraInfo.className = 'alert alert-warning';
        paymentMoraInfo.innerHTML = `
            <span>⚠️</span>
            <div>
                <p style="margin: 0;"><strong>Préstamo con Atraso.</strong></p>
                <p style="margin: 5px 0 0 0;">Mora pendiente: S/ ${moraInfo.totalMora.toFixed(2)}. (Se carga automáticamente).</p>
            </div>
        `;
    } else {
        paymentMoraInfo.style.display = 'none';
        moraAmountInput.readOnly = false;
    }

    // 4. Resetear estilos de selección de método
    document.querySelectorAll('.payment-method-card').forEach(c => {
        c.style.borderColor = 'var(--border-color)';
        c.style.backgroundColor = 'var(--bg-secondary)';
        c.querySelector('input[type="radio"]').checked = false;
    });

    openModal(getDomElement('paymentModal'));
}

async function handlePaymentSubmit(e) {
    e.preventDefault();

    const selectedMethod = document.querySelector('input[name="payment_method"]:checked')?.value;
    if (!selectedMethod) {
        alert("Por favor, selecciona un método de pago.");
        return;
    }

    const loanId = getDomElement('paymentLoanId').value;
    const paymentAmount = parseFloat(getDomElement('payment_amount').value);
    const moraAmount = parseFloat(getDomElement('mora_amount').value) || 0;
    const paymentDate = getDomElement('payment_date').value;
    const totalToCollect = paymentAmount + moraAmount; // Monto total que se enviará a la API

    // Data completa, incluyendo la mora y el método
    const paymentData = {
        payment_amount: totalToCollect, // Total que se envía
        mora_amount: moraAmount,        
        payment_method: selectedMethod, 
        payment_date: paymentDate
    };

    if (selectedMethod === 'Transferencia') {
        // --- INICIO DE FLUJO DE PAGO REAL CON FLOW ---
        const loan = loans.find(l => l.id == loanId);
        
        try {
            const response = await fetch(`${API_URL}/api/flow/create-order`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // CRÍTICO: Asegurar que los montos sean strings con dos decimales para la API
                    amount: totalToCollect.toFixed(2), 
                    loanId: loanId,
                    clientDni: loan.dni,
                    amount_ci: paymentAmount.toFixed(2),
                    amount_mora: moraAmount.toFixed(2),
                    payment_date: paymentDate
                })
            });

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({ message: 'Error desconocido del servidor.' }));
                // CRÍTICO: Mostrar un mensaje legible del error 400/500
                throw new Error(`(${response.status}) ${errorBody.error || errorBody.message || 'Error al procesar la orden.'}`);
            }

            const flowData = await response.json();
            const flowUrl = flowData.url; 
            
            if (flowUrl) {
                // *** REDIRECCIÓN AL PAGO REAL EN FLOW ***
                window.location.href = flowUrl;
                return; 
            } else {
                 throw new Error("El backend no proporcionó un URL de pago válido.");
            }

        } catch (error) {
            alert(`❌ Error Crítico: No se pudo iniciar el pago con Flow. Detalles: ${error.message}`);
            return; 
        }

    } 
    
    // Si es Efectivo: Registro directo en DB
    if (selectedMethod === 'Efectivo') {
        try {
            const response = await fetch(`${API_URL}/api/loans/${loanId}/payments`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(paymentData)
            });
            
            if (!response.ok) { 
                const errorData = await response.json();
                throw new Error(errorData.error || `Error ${response.status}`); 
            }
            
            const loan = loans.find(l => l.id == loanId);
            showReceipt(paymentData, loan);

            await fetchAndRenderLoans();
            showSuccessAnimation('¡Pago Registrado!');
        } catch (error) { 
            alert(`No se pudo registrar el pago: ${error.message}`); 
        }
    }
}

// --- LÓGICA DE PAGOS RÁPIDOS (CHECKOUT) ---
function initQuickPaymentListeners() {
    const searchDniInput = getDomElement('search-dni-pago');
    const quickPaymentTableBody = getDomElement('quickPaymentTableBody');
    const confirmQuickPaymentBtn = getDomElement('confirmQuickPaymentBtn');
    const paymentSelectionType = getDomElement('payment_selection_type');
    const calculatePaymentBtn = getDomElement('calculatePaymentBtn');

    searchDniInput?.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ''); });

    searchDniInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            searchLoansByDni(searchDniInput.value);
            getDomElement('quick-payment-summary-section').style.display = 'none'; 
        }
    });

    quickPaymentTableBody?.addEventListener('click', function(event) {
        const target = event.target.closest('button');
        if (!target || !target.classList.contains('register-payment-btn')) return;

        const loanId = target.getAttribute('data-loan-id');
        const loan = loans.find(l => l.id == loanId);
        if (loan) {
            populateQuickPaymentSummary(loan); 
        }
    });

    paymentSelectionType?.addEventListener('change', togglePaymentOptionDetail);
    calculatePaymentBtn?.addEventListener('click', () => {
        if (currentLoanForQuickPayment) {
            calculateFlexiblePayment(currentLoanForQuickPayment);
        }
    });
    confirmQuickPaymentBtn?.addEventListener('click', handleQuickPaymentSubmit);

    document.querySelectorAll('#quick-payment-summary-section .payment-methods-row .checkbox-container').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.payment-methods-row .checkbox-container').forEach(c => {
                c.style.borderColor = 'var(--border-color)';
                c.style.backgroundColor = 'var(--input-bg)';
            });
            card.style.borderColor = 'var(--primary-color)';
            card.style.backgroundColor = 'var(--primary-light)';

            const radio = card.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;

            const currentTotal = parseFloat(getDomElement('summary-total').textContent.replace('S/ ', '') || 0);
            if (currentTotal > 0) {
                getDomElement('confirmQuickPaymentBtn').disabled = false;
            }
        });
    });
}

async function searchLoansByDni(dni) {
    const statusEl = getDomElement('search-dni-status');
    const quickPaymentTableBody = getDomElement('quickPaymentTableBody');
    const quickPaymentResultSection = getDomElement('quick-payment-result-section');
    quickPaymentTableBody.innerHTML = '';

    if (dni.length !== 8) {
        statusEl.textContent = 'Ingresa 8 dígitos de DNI.';
        statusEl.style.color = 'var(--danger-color)';
        quickPaymentResultSection.style.display = 'none';
        return;
    }

    const foundLoans = loans.filter(loan => loan.dni === dni && loan.status === 'Activo');

    if (foundLoans.length === 0) {
        statusEl.textContent = '❌ No se encontraron préstamos activos para este DNI.';
        statusEl.style.color = 'var(--danger-color)';
        quickPaymentResultSection.style.display = 'none';
        quickPaymentTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #9CA3AF;">No se encontraron préstamos activos.</td></tr>';
    } else {
        statusEl.textContent = `✅ Encontrados ${foundLoans.length} préstamo(s) activo(s).`;
        statusEl.style.color = 'var(--success-color)';
        quickPaymentResultSection.style.display = 'block';

        foundLoans.forEach(loan => {
            const remainingCapitalInterest = loan.total_due - loan.total_paid;
            const moraInfo = calculateMora(loan);
            const totalDue = remainingCapitalInterest + moraInfo.totalMora;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${loan.nombres} ${loan.apellidos}</td>
                <td>S/ ${parseFloat(loan.monto).toFixed(2)}</td>
                <td>S/ ${totalDue.toFixed(2)} ${moraInfo.totalMora > 0 ? `<span class="mora-badge">+ Mora</span>` : ''}</td>
                <td>
                    <button class="button button-primary register-payment-btn" data-loan-id="${loan.id}">Seleccionar</button>
                </td>
            `;
            quickPaymentTableBody.appendChild(row);
        });
    }
}

function togglePaymentOptionDetail() {
    const type = getDomElement('payment_selection_type').value;
    ['single-payment-info', 'multiple-payment-info', 'partial-payment-info'].forEach(id => {
        const el = getDomElement(id);
        if (el) el.style.display = 'none';
    });

    getDomElement('summary-capital-interest').textContent = 'S/ 0.00';
    getDomElement('summary-mora').textContent = 'S/ 0.00';
    getDomElement('summary-total').textContent = 'S/ 0.00';
    getDomElement('payment_description').textContent = 'Seleccione una opción de pago y presione "Calcular Monto Total".';
    getDomElement('confirmQuickPaymentBtn').disabled = true;
    calculatedPaymentData = { amount: 0, mora: 0 };


    if (type === 'single') {
        getDomElement('single-payment-info').style.display = 'block';
    } else if (type === 'multiple') {
        getDomElement('multiple-payment-info').style.display = 'block';
    } else if (type === 'partial') {
        getDomElement('partial-payment-info').style.display = 'block';
    }
}

function populateQuickPaymentSummary(loan) {
    const quickPaymentSummarySection = getDomElement('quick-payment-summary-section');
    currentLoanForQuickPayment = loan;

    const moraInfo = calculateMora(loan);
    const { schedule } = calculateSchedule(loan);

    const pendingInstallments = schedule.filter(item => {
        const cumulativeExpected = schedule.slice(0, item.cuota).reduce((sum, s) => sum + parseFloat(s.monto), 0);
        return loan.total_paid < cumulativeExpected;
    });

    const moraAlertSummary = getDomElement('mora-alert-summary');
    if (moraInfo.totalMora > 0) {
        moraAlertSummary.style.display = 'flex';
        getDomElement('payment_selection_type').value = 'single';
    } else {
        moraAlertSummary.style.display = 'none';
        getDomElement('payment_selection_type').value = 'single';
    }

    const nextInstallment = pendingInstallments[0];

    if (nextInstallment) {
        getDomElement('next_installment_date').textContent = nextInstallment.fecha;
        getDomElement('next_installment_amount').textContent = `S/ ${parseFloat(nextInstallment.monto).toFixed(2)}`;
    } else {
        getDomElement('payment_selection_type').value = 'partial';
        getDomElement('payment_description').textContent = '¡Préstamo al día! Solo se permite Abono/Anticipo.';
    }

    const maxAvailable = pendingInstallments.length;
    getDomElement('max_installments_available').textContent = maxAvailable;
    const numInstallmentsInput = getDomElement('num_installments_to_pay');
    numInstallmentsInput.value = maxAvailable > 0 ? 1 : 0;
    numInstallmentsInput.max = maxAvailable;

    togglePaymentOptionDetail(); 
    quickPaymentSummarySection.style.display = 'grid';
}

function calculateFlexiblePayment(loan) {
    const paymentType = getDomElement('payment_selection_type').value;
    const { schedule } = calculateSchedule(loan);
    const moraInfo = calculateMora(loan);
    let amountToPayCapitalInterest = 0;
    let paymentDescriptionText = '';
    const totalRemainingCI = loan.total_due - loan.total_paid;

    const pendingInstallments = schedule.filter(item => {
        const cumulativeExpected = schedule.slice(0, item.cuota).reduce((sum, s) => sum + parseFloat(s.monto), 0);
        return loan.total_paid < cumulativeExpected;
    });

    if (paymentType === 'single' && pendingInstallments.length > 0) {
        const nextInstallment = pendingInstallments[0];
        amountToPayCapitalInterest = parseFloat(nextInstallment.monto);
        paymentDescriptionText = `Pagando 1 Cuota completa (N° ${nextInstallment.cuota}).`;

    } else if (paymentType === 'multiple' && pendingInstallments.length > 0) {
        const numInstallments = parseInt(getDomElement('num_installments_to_pay').value);
        const maxAvailable = parseInt(getDomElement('max_installments_available').textContent);

        if (isNaN(numInstallments) || numInstallments < 1 || numInstallments > maxAvailable) {
            alert(`Número de cuotas no válido. Debe ser entre 1 y ${maxAvailable}.`);
            return;
        }

        amountToPayCapitalInterest = pendingInstallments.slice(0, numInstallments)
            .reduce((sum, item) => sum + parseFloat(item.monto), 0);

        paymentDescriptionText = `Pagando ${numInstallments} cuota(s) consecutiva(s).`;

    } else if (paymentType === 'partial') {
        const partialAmount = parseFloat(getDomElement('partial_payment_amount').value);

        if (isNaN(partialAmount) || partialAmount <= 0) {
            alert("Por favor, ingrese un monto de abono válido (mayor a S/ 0.01).");
            return;
        }

        amountToPayCapitalInterest = Math.min(partialAmount, totalRemainingCI);

        if (amountToPayCapitalInterest < partialAmount) {
            paymentDescriptionText = `¡El monto ingresado excede la deuda! Solo se aplicará S/ ${amountToPayCapitalInterest.toFixed(2)} a Cap/Int.`;
        } else {
            paymentDescriptionText = `Abono/Anticipo de Capital: S/ ${amountToPayCapitalInterest.toFixed(2)}.`;
        }

    } else {
        alert("No hay cuotas pendientes para este tipo de pago. Considere 'Abono Parcial'.");
        return;
    }

    const moraToCharge = (amountToPayCapitalInterest > 0) ? moraInfo.totalMora : 0;

    calculatedPaymentData = {
        amount: amountToPayCapitalInterest,
        mora: moraToCharge
    };

    const totalToCollect = calculatedPaymentData.amount + calculatedPaymentData.mora;

    getDomElement('summary-capital-interest').textContent = `S/ ${calculatedPaymentData.amount.toFixed(2)}`;
    getDomElement('summary-mora').textContent = `S/ ${calculatedPaymentData.mora.toFixed(2)}`;
    getDomElement('summary-total').textContent = `S/ ${totalToCollect.toFixed(2)}`;
    getDomElement('payment_description').textContent = paymentDescriptionText;

    if (totalToCollect > 0) {
        const selectedMethod = document.querySelector('input[name="quick_payment_method"]:checked');
        getDomElement('confirmQuickPaymentBtn').disabled = !selectedMethod;
    } else {
        getDomElement('confirmQuickPaymentBtn').disabled = true;
    }
}

async function handleQuickPaymentSubmit() {
    if (!currentLoanForQuickPayment || calculatedPaymentData.amount === 0) {
        alert("Error: El monto a pagar no ha sido calculado o es cero. Presione 'Calcular Monto Total'.");
        return;
    }

    const selectedMethod = document.querySelector('input[name="quick_payment_method"]:checked')?.value;
    if (!selectedMethod) {
        alert("Por favor, selecciona un método de pago.");
        return;
    }

    const paymentDate = getDomElement('quick_payment_date').value;
    if (!paymentDate) {
        alert("Por favor, selecciona una fecha de pago.");
        return;
    }
    
    const totalToCollect = calculatedPaymentData.amount + calculatedPaymentData.mora;

    const paymentData = {
        payment_amount: totalToCollect, // Total que se envía
        mora_amount: calculatedPaymentData.mora,     
        payment_method: selectedMethod, 
        payment_date: paymentDate
    };

    if (selectedMethod === 'Transferencia') {
        // --- INICIO DE FLUJO DE PAGO REAL CON FLOW ---
        const loan = currentLoanForQuickPayment;
        
        try {
            const response = await fetch(`${API_URL}/api/flow/create-order`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // CRÍTICO: Asegurar que los montos sean strings con dos decimales para la API
                    amount: totalToCollect.toFixed(2), 
                    loanId: loan.id,
                    clientDni: loan.dni,
                    amount_ci: calculatedPaymentData.amount.toFixed(2),
                    amount_mora: calculatedPaymentData.mora.toFixed(2),
                    payment_date: paymentDate
                })
            });

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({ message: 'Error desconocido del servidor.' }));
                // CRÍTICO: Mostrar un mensaje legible del error 400/500
                throw new Error(`(${response.status}) ${errorBody.error || errorBody.message || 'Error al procesar la orden.'}`);
            }

            const flowData = await response.json();
            const flowUrl = flowData.url; 
            
            if (flowUrl) {
                // *** REDIRECCIÓN AL PAGO REAL EN FLOW ***
                window.location.href = flowUrl;
                return; 
            } else {
                 throw new Error("El backend no proporcionó un URL de pago válido.");
            }

        } catch (error) {
            alert(`❌ Error Crítico: No se pudo iniciar el pago con Flow. Detalles: ${error.message}`);
            return; 
        }

    } 
    
    if (selectedMethod === 'Efectivo') {
        try {
            const response = await fetch(`${API_URL}/api/loans/${currentLoanForQuickPayment.id}/payments`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(paymentData)
            });
            
            if (!response.ok) { 
                const errorData = await response.json();
                throw new Error(errorData.error || `Error ${response.status}`); 
            }

            const loan = currentLoanForQuickPayment;
            showReceipt(paymentData, loan);

            await fetchAndRenderLoans();
            showSuccessAnimation('¡Pago Registrado Exitosamente en Efectivo!');

        } catch (error) {
            alert(`No se pudo registrar el pago: ${error.message}`);
        }
    }
}


// --- FUNCIONES DE MORA Y CÁLCULO ---
function calculateMora(loan) {
    if (loan.status === 'Pagado') return { totalMora: 0, mesesAtrasados: 0, amountOverdue: 0 };

    const { schedule } = calculateSchedule(loan);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalMora = 0;
    let totalAmountOverdue = 0;
    let latestDueDate = new Date(loan.fecha);
    let totalPaid = loan.total_paid || 0;

    for (const item of schedule) {
        const dueDate = new Date(item.fecha);
        dueDate.setHours(0, 0, 0, 0);

        if (dueDate <= today) {
            const cumulativeExpected = schedule.slice(0, item.cuota).reduce((sum, s) => sum + parseFloat(s.monto), 0);

            if (totalPaid < cumulativeExpected) {
                const amountOverdue = cumulativeExpected - totalPaid;

                const monthsLate = (today.getFullYear() - dueDate.getFullYear()) * 12 +
                    (today.getMonth() - dueDate.getMonth());

                const monthsToCharge = Math.max(1, monthsLate);

                const outstandingBalanceForMora = loan.total_due - totalPaid;

                totalMora = outstandingBalanceForMora * (TASA_MORA_MENSUAL / 100) * monthsToCharge;
                totalAmountOverdue = amountOverdue;
                latestDueDate = dueDate;
                break; 
            }
        }
    }

    let mesesAtrasados = 0;
    if (totalAmountOverdue > 0) {
        mesesAtrasados = (today.getFullYear() - latestDueDate.getFullYear()) * 12 +
            (today.getMonth() - latestDueDate.getMonth());

        if (today.getDate() < latestDueDate.getDate()) {
            mesesAtrasados -= 1;
        }
        mesesAtrasados = Math.max(1, mesesAtrasados); 
    }

    return { totalMora: totalMora > 0 ? parseFloat(totalMora.toFixed(2)) : 0, mesesAtrasados, amountOverdue: totalAmountOverdue };
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

// --- FETCH Y RENDER ---
async function fetchAndRenderLoans() {
    try {
        const response = await fetch(`${API_URL}/api/loans`);
        if (!response.ok) throw new Error('Error al cargar los préstamos');
        loans = await response.json();
        renderHistoryTable();
        updateDashboard();
    } catch (error) {
        getDomElement('historyTableBody').innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger-color);">Error al cargar datos. Asegúrate de que el backend está corriendo en ${API_URL}.</td></tr>`;
    }
}

function renderHistoryTable() {
    const historyTableBody = getDomElement('historyTableBody');
    historyTableBody.innerHTML = '';
    
    // Asegurar que el thead de la tabla principal tenga la columna de Mora y Acciones
    const historyTable = getDomElement('historyTable');
    if (historyTable) {
        const thead = historyTable.querySelector('thead tr');
        // Esto previene duplicados en caso de re-render
        if (thead && thead.cells.length < 6) { 
             thead.innerHTML += `<th>Mora</th><th>Acciones</th>`;
        }
    }

    if (loans.length === 0) { 
        historyTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #9CA3AF;">Aún no hay préstamos registrados.</td></tr>`;
        return; 
    }
    loans.forEach(loan => {
        const row = document.createElement('tr');
        const pepLabel = loan.is_pep ? ' <strong style="color: var(--danger-color);">(PEP)</strong>' : '';
        const hibridoLabel = loan.tipo_calculo === 'Hibrido' ? ' <strong style="color: var(--primary-color);">(Híbrido)</strong>' : '';

        const isPaid = loan.status === 'Pagado';
        const payButtonDisabled = isPaid ? 'disabled' : '';

        const progressPercent = loan.total_due > 0 ? (loan.total_paid / loan.total_due) * 100 : 0;

        const moraInfo = calculateMora(loan);
        let moraDisplay;
        let finalStatusClass;

        if (moraInfo.totalMora > 0) {
            moraDisplay = `<span class="mora-badge">S/ ${moraInfo.totalMora.toFixed(2)} (${moraInfo.mesesAtrasados} mes(es))</span>`;
            finalStatusClass = 'status-late';
        } else {
            finalStatusClass = loan.status === 'Pagado' ? 'status-paid' : 'status-active';
            moraDisplay = '<span style="color: var(--success-color); font-size: 12px;">✓ Al día</span>';
        }

        if (isPaid) {
            moraDisplay = '<span style="color: #9CA3AF; font-size: 12px;">N/A</span>';
            finalStatusClass = 'status-paid';
        }

        // Renderizado de botones de acción
        row.innerHTML = `
            <td>${loan.nombres} ${loan.apellidos}${pepLabel}${hibridoLabel}</td>
            <td><strong>S/ ${parseFloat(loan.monto).toFixed(2)}</strong></td>
            <td>
                <div class="progress-text">S/ ${loan.total_paid.toFixed(2)} de S/ ${loan.total_due.toFixed(2)}</div>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${Math.min(progressPercent, 100)}%;"></div>
                </div>
            </td>
            <td><span class="status ${finalStatusClass}">${loan.status}</span></td>
            <td>${moraDisplay}</td>
            <td>
                <div class="action-buttons">
                    <button class="button button-secondary view-details-btn" data-loan-id="${loan.id}">👁️ Detalles</button>
                    <button class="button button-success register-payment-btn" data-loan-id="${loan.id}" ${payButtonDisabled}>💳 Pagar</button>
                    <button class="button button-danger delete-loan-btn" data-loan-id="${loan.id}">🗑️ Eliminar</button>
                </div>
            </td>
        `;
        getDomElement('historyTableBody').appendChild(row);
    });
}

function updateDashboard() {
    const totalLoaned = loans.reduce((sum, loan) => sum + parseFloat(loan.monto), 0);
    const activeLoans = loans.filter(loan => loan.status === 'Activo').length;
    
    clients.clear();
    loans.forEach(loan => clients.add(loan.dni));

    const today = new Date().toISOString().split('T')[0];
    const collectedToday = loans.reduce((sum, loan) => {
        if (!loan.payments) return sum;
        // Asumiendo que payment_amount en la DB es el total (Capital+Interés+Mora)
        return sum + loan.payments
            .filter(p => p.payment_date.split('T')[0] === today)
            .reduce((pSum, p) => pSum + parseFloat(p.payment_amount), 0);
    }, 0);


    getDomElement('totalLoaned').textContent = `S/ ${totalLoaned.toFixed(2)}`;
    getDomElement('activeLoans').textContent = activeLoans;
    getDomElement('totalClients').textContent = clients.size;
    getDomElement('collectedToday').textContent = `S/ ${collectedToday.toFixed(2)}`;
}

function showReceipt(payment, loan) {
    if (!payment || !loan) {
        alert('No se pudieron obtener los datos completos del pago para generar el recibo.');
        return;
    }

    const receiptContent = getDomElement('receiptContent');
    
    const totalPagado = parseFloat(payment.payment_amount || 0);
    const moraPagada = parseFloat(payment.mora_amount || 0);
    const capitalInteresPagado = totalPagado - moraPagada;
    const paymentMethod = payment.payment_method || 'Efectivo';

    receiptContent.innerHTML = `
        <div class="receipt-header">
            <h2>🧾 RECIBO DE PAGO</h2>
            <p class="receipt-number">N° Transacción: ${Math.floor(Math.random() * 1000000)} | Préstamo ID: ${loan.id}</p>
        </div>
        
        <div class="receipt-section">
            <h3>👤 Cliente</h3>
            <div class="receipt-row"><span class="receipt-label">Nombre Completo:</span><span class="receipt-value">${loan.nombres} ${loan.apellidos}</span></div>
            <div class="receipt-row"><span class="receipt-label">DNI:</span><span class="receipt-value">${loan.dni}</span></div>
        </div>
        
        <div class="receipt-section">
            <h3>💰 Resumen del Pago</h3>
            <div class="receipt-row"><span class="receipt-label">Fecha de Pago:</span><span class="receipt-value">${new Date(payment.payment_date).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</span></div>
            <div class="receipt-row"><span class="receipt-label">Método de Pago:</span><span class="receipt-value">${paymentMethod}</span></div>
            <div class="receipt-row"><span class="receipt-label">Aplicado a Capital/Interés:</span><span class="receipt-value">S/ ${capitalInteresPagado.toFixed(2)}</span></div>
            <div class="receipt-row"><span class="receipt-label">Aplicado a Mora:</span><span class="receipt-value" style="color: ${moraPagada > 0 ? 'var(--danger-color)' : 'var(--text-color)'};">S/ ${moraPagada.toFixed(2)}</span></div>
        </div>

        <div class="receipt-total">
            <span class="receipt-label">TOTAL RECIBIDO:</span>
            <span class="receipt-value">S/ ${totalPagado.toFixed(2)}</span>
        </div>

        <div class="receipt-footer">
            <p>Recibo generado digitalmente por PrestaPro. Tiene validez sin firma.</p>
            <p>Gracias por su preferencia.</p>
        </div>
    `;

    openModal(getDomElement('receiptModal'));
    currentReceiptData = { payment, loan, totalPagado, paymentMethod, capitalInteresPagado, moraPagada }; 
}

function downloadReceipt() {
    if (!currentReceiptData) return;

    const { loan, totalPagado, paymentMethod, capitalInteresPagado, moraPagada, payment } = currentReceiptData;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const paymentDate = new Date(payment.payment_date).toLocaleDateString('es-PE', { timeZone: 'UTC' });

    doc.setFontSize(22); doc.setTextColor(93, 136, 255); doc.text("RECIBO DE PAGO", 105, 20, { align: 'center' });
    doc.setFontSize(10); doc.setTextColor(156, 163, 175); doc.text(`N° Transacción: ${Math.floor(Math.random() * 1000000)} | Préstamo ID: ${loan.id}`, 105, 30, { align: 'center' });

    let finalY = 40;

    doc.setFontSize(14); doc.setTextColor(93, 136, 255); doc.text("👤 Cliente", 14, finalY); finalY += 8;
    doc.setFontSize(11); doc.setTextColor(229, 231, 235);
    doc.text(`Nombre Completo: ${loan.nombres} ${loan.apellidos}`, 14, finalY); finalY += 7;
    doc.text(`DNI: ${loan.dni}`, 14, finalY); finalY += 15;

    doc.setFontSize(14); doc.setTextColor(93, 136, 255); doc.text("💰 Resumen del Pago", 14, finalY); finalY += 8;

    const tableData = [
        ['Fecha de Pago', paymentDate],
        ['Método de Pago', paymentMethod],
        ['Aplicado a Capital/Interés', `S/ ${capitalInteresPagado.toFixed(2)}`],
        ['Aplicado a Mora', `S/ ${moraPagada.toFixed(2)}`],
    ];

    doc.autoTable({
        startY: finalY + 5,
        head: [['Concepto', 'Monto']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [55, 65, 81], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 11 }, 
        bodyStyles: { fontSize: 10, textColor: [52, 64, 84] },
        columnStyles: { 1: { halign: 'right' } }
    });
    finalY = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(16); doc.setTextColor(93, 136, 255);
    doc.text(`TOTAL RECIBIDO: S/ ${totalPagado.toFixed(2)}`, 14, finalY); finalY += 15;

    doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text('Recibo generado digitalmente por PrestaPro. Tiene validez sin firma.', 105, 280, { align: 'center' });

    const fileName = `Recibo_Pago_${loan.apellidos}_${paymentDate.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
}

function toggleFormLock(locked) {
    const loanForm = getDomElement('loanForm');
    const formElements = loanForm.querySelectorAll('input, button, select');
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

function populateDetailsModal(loan) {
    currentLoanForDetails = loan;
    const { payments, schedule } = calculateSchedule(loan);
    const moraInfo = calculateMora(loan);
    const totalPending = (loan.total_due - loan.total_paid) + moraInfo.totalMora;
    const remainingCapitalInterest = loan.total_due - loan.total_paid;


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

    const interesAnualMostrado = TASA_INTERES_ANUAL.toFixed(2);

    getDomElement('scheduleSummary').innerHTML = `
        <p><strong>Cliente:</strong> ${loan.nombres} ${loan.apellidos} ${loan.is_pep ? '<strong style="color: var(--danger-color);">(PEP)</strong>' : ''}</p>
        <p>
            <strong>Monto:</strong> S/ ${parseFloat(loan.monto).toFixed(2)} | 
            <strong>Interés Anual:</strong> ${interesAnualMostrado}% | 
            <strong>Plazo:</strong> ${loan.plazo} meses
        </p>
        <p><strong>Fecha de Desembolso:</strong> ${disbursementDate}</p>
        ${paymentSummary}
        <p style="border-top: 1px solid var(--border-color); padding-top: 5px; margin-top: 10px;">
            <strong>Deuda Pendiente (Capital/Interés):</strong> S/ ${remainingCapitalInterest.toFixed(2)} |
            <strong>Mora Acumulada:</strong> <span style="color: ${moraInfo.totalMora > 0 ? 'var(--danger-color)' : 'var(--success-color)'}; font-weight: 600;">S/ ${moraInfo.totalMora.toFixed(2)}</span> |
            <strong>Total a Pagar:</strong> S/ ${totalPending.toFixed(2)}
        </p>
    `;

    const moraAlert = getDomElement('moraInfo');
    if (moraInfo.totalMora > 0) {
        moraAlert.style.display = 'flex';
        moraAlert.className = 'alert alert-warning';
        moraAlert.innerHTML = `
             <span>⚠️</span>
             <div>
                 <p style="margin: 0;"><strong>Préstamo con Atraso.</strong></p>
                 <p style="margin: 5px 0 0 0;">Mora pendiente: S/ ${moraInfo.totalMora.toFixed(2)}. (Se carga automáticamente).</p>
             </div>
        `;
    } else {
        moraAlert.style.display = 'none';
    }

    const declaracionSection = getDomElement('declaracionJuradaSection');
    if (parseFloat(loan.monto) > VALOR_UIT || loan.is_pep) {
        declaracionSection.style.display = 'block';
        declaracionSection.innerHTML = `
            <h4 class="declaracion-title">DECLARACIÓN JURADA DE ORIGEN DE FONDOS</h4>
            <div class="declaracion-body">
                <p>Yo, <strong>${loan.nombres} ${loan.apellidos}</strong>, identificado(a) with DNI N° <strong>${loan.dni}</strong>, declaro bajo juramento que los fondos y/o bienes utilizados en la operación de préstamo de S/ ${parseFloat(loan.monto).toFixed(2)} provienen de actividades lícitas y no están vinculados con el lavado de activos, financiamiento del terrorismo ni cualquier otra actividad ilegal contemplada en las leyes vigentes del Perú.</p>
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
    }

    getDomElement('scheduleTableBody').innerHTML = schedule.map(item => `
        <tr><td>${item.cuota}</td><td>${item.fecha}</td><td>S/ ${item.monto}</td></tr>`).join('');

    const paymentHistoryBody = getDomElement('paymentHistoryBody');
    if (loan.payments && loan.payments.length > 0) {
        paymentHistoryBody.innerHTML = loan.payments.map((p, index) => {
            const moraPagada = parseFloat(p.mora_amount || 0).toFixed(2);
            const capitalInteresPagado = (parseFloat(p.payment_amount) - moraPagada).toFixed(2);
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${new Date(p.payment_date).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</td>
                    <td>S/ ${capitalInteresPagado}</td>
                    <td>S/ ${moraPagada}</td>
                    <td>${p.payment_method || 'Efectivo'}</td>
                    <td><button class="button button-secondary button-sm view-receipt-btn" data-loan-id="${loan.id}" data-payment-index="${index}">Ver 🧾</button></td>
                </tr>`
        }).join('');
    } else {
        paymentHistoryBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: #9CA3AF;">No hay pagos registrados.</td></tr>';
    }

    openModal(getDomElement('detailsModal'));
}

function printSchedule() {
    // Implementación de impresión
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
                .declaracion-title { text-align: center; font-size: 14px; font-weight: bold; text-transform: uppercase; color: #0D244F; }
                .declaracion-body { font-size: 10px; line-height: 1.6; text-align: justify; margin-bottom: 25px; }
                .declaracion-signature { margin-top: 30px; text-align: center; font-size: 10px; } .declaracion-signature p { margin: 3px 0; }
                .table-container { width: 100%; overflow: visible; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; } thead { display: table-header-group; }
                th, td { padding: 10px; text-align: left; border: 1px solid #D0D5DD; font-size: 11px; }
                th { background-color: #F9FAFB; font-weight: 600; text-transform: uppercase; color: #667085; font-size: 10px; }
                tr { page-break-inside: avoid; } tbody tr:nth-child(even) { background-color: #FAFBFC; }
                .mora-badge { display: none; }
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
        
        const interesAnualMostrado = TASA_INTERES_ANUAL.toFixed(2);

        doc.setFontSize(22); doc.setTextColor(0, 93, 255); doc.text("PRESTAPRO", 105, 20, { align: 'center' });
        doc.setFontSize(16); doc.setTextColor(52, 64, 84); doc.text("Detalles del Préstamo", 105, 30, { align: 'center' });
        doc.setFontSize(12); doc.setTextColor(100, 100, 100); doc.text("DATOS GENERALES", 14, 45);
        doc.setFontSize(11); doc.setTextColor(52, 64, 84);
        doc.text(`Cliente: ${loan.nombres} ${loan.apellidos} ${loan.is_pep ? '(PEP)' : ''}`, 14, 52);
        doc.text(`DNI: ${loan.dni}`, 105, 52);
        doc.text(`Monto Prestado: S/ ${parseFloat(loan.monto).toFixed(2)}`, 14, 58);
        doc.text(`Fecha de Préstamo: ${new Date(loan.fecha).toLocaleDateString('es-PE', { timeZone: 'UTC' })}`, 105, 58);
        doc.text(`Interés Anual: ${interesAnualMostrado}%`, 14, 64);
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
