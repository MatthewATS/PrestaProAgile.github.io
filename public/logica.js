// --- VARIABLES GLOBALES Y CONFIGURACIÓN ---
const API_URL = 'https://prestaproagilegithubio-production-be75.up.railway.app';
const VALOR_UIT = 5150;
// ❌ MODIFICACIÓN: TASA_INTERES_ANUAL ELIMINADA. SE USA EL VALOR DEL INPUT.
const TASA_MORA_MENSUAL = 1; // 1% de mora por mes
const MP_LIMIT_YAPE = 500; // Nuevo límite para Yape/Plin

const MAX_HISTORY_SIZE = 10;

let currentShareType = null;

let RUC_EMPRESA = localStorage.getItem('config_ruc') || '20609939521'; // RUC de ejemplo
let RAZON_SOCIAL_EMPRESA = localStorage.getItem('config_razon_social') || 'PRESTAPRO S.A.C.';
let DIRECCION_EMPRESA = localStorage.getItem('config_direccion') || 'Av. Javier Prado Este 123, San Isidro'
let loans = [];
let clients = new Set();
let currentLoanForDetails = null;
let currentLoanForQuickPayment = null;
let calculatedPaymentData = { amount: 0, mora: 0 }; // Guarda el último cálculo flexible
let currentIzpUrl = null; // 🚨 CAMBIO: Almacena el URL de Izipay generado (antes currentMpUrl)
let currentClientName = null; // Almacena el nombre del cliente para el mensaje compartido

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
    if (modal.id === 'checkoutLinkModal') {
        // 🚨 CAMBIO: Limpiar la URL de Izipay
        currentIzpUrl = null;
        currentClientName = null;
        // Reiniciar la vista del módulo de pagos después de cerrar el link de checkout
        if (getDomElement('module-pagos')?.classList.contains('active')) {
            getDomElement('search-dni-pago').value = '';
            getDomElement('search-dni-status').textContent = '';
            getDomElement('quick-payment-result-section').style.display = 'none';
            getDomElement('quick-payment-summary-section').style.display = 'none';
            getDomElement('quickPaymentTableBody').innerHTML = '<tr><td colspan="4" style="text-align: center; color: #9CA3AF;">Busca un DNI para encontrar préstamos.</td></tr>';
            currentLoanForQuickPayment = null;
        }
    }
    if (modal.id === 'shareOptionsModal') {
        currentShareType = null;
    }
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
    initTheme();
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

    const receiptConfigModal = getDomElement('receiptConfigModal');
    const receiptConfigForm = getDomElement('receiptConfigForm');
    const menuReceiptConfig = getDomElement('menuReceiptConfig');
    const closeReceiptConfigModalBtn = getDomElement('closeReceiptConfigModalBtn');

    updateClock();
    setInterval(updateClock, 1000);

    // Nuevo Modal Link
    getDomElement('closeCheckoutLinkModalBtn')?.addEventListener('click', () => closeModal(getDomElement('checkoutLinkModal')));
    getDomElement('copyLinkBtn')?.addEventListener('click', copyMpLink);
    // 🚨 CAMBIO: Usa la función shareMpLink
    getDomElement('shareMpLinkBtn')?.addEventListener('click', shareMpLink);


    // --- FUNCIÓN DE MOSTRAR APLICACIÓN (MODIFICADA) ---
    const showApp = () => {
        loginContainer.style.display = 'none';
        appContainer.style.display = 'block';

        // 1. Mostrar nombre de usuario en el header
        const userNameDisplay = getDomElement('headerUserName');
        if (userNameDisplay) {
            // Capitalizar (admin -> Admin)
            userNameDisplay.textContent = currentUser.charAt(0).toUpperCase() + currentUser.slice(1);
        }

        // 2. Configurar listener para "Cambiar Contraseña" del menú
        const menuChangePass = getDomElement('menuChangePassword');
        if (menuChangePass) {
            // Usamos clonación para limpiar listeners viejos si se recarga la app
            const newBtn = menuChangePass.cloneNode(true);
            menuChangePassword.parentNode.replaceChild(newBtn, menuChangePassword);

            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                // Aseguramos que el form y modal existan (definidos al inicio de initializeApp)
                if (typeof changePasswordForm !== 'undefined') changePasswordForm.reset();
                if (typeof changePasswordModal !== 'undefined') openModal(changePasswordModal);
            });
        }

        fetchAndRenderLoans();
        window.history.replaceState({ module: 'module-menu' }, '', '#module-menu');
        showModule('module-menu', false);
    };

    const showLogin = () => {
        loginContainer.style.display = 'flex';
        appContainer.style.display = 'none';
    };

    // --- LÓGICA DE NAVEGACIÓN (MODIFICADA) ---
    function showModule(moduleId, addToHistory = true) {
        // 1. Ocultar todos los módulos
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
        const navBar = getDomElement('navigation-bar');

        // 2. Gestión del Historial del Navegador (CRÍTICO)
        if (addToHistory) {
            window.history.pushState({ module: moduleId }, '', `#${moduleId}`);
        }

        // 3. Lógica visual del Botón Retroceder
        if (moduleId === 'module-menu') {
            if (navBar) navBar.style.display = 'none';
            appTitle.innerHTML = '<img src="assets/logo-verde.png" alt="Logo" class="header-logo"> PrestaPro';
        } else {
            // ✅ SOLUCIÓN 2: Mostrar barra en cualquier otro módulo
            if (navBar) navBar.style.display = 'flex'; // Usamos flex para mostrar

            // Configurar títulos y reseteos según el módulo
            if (moduleId === 'module-pagos') {
                appTitle.textContent = '💳 Registrar Pagos';
                // Reseteos específicos de pagos
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
    getDomElement('closeShareOptionsModalBtn')?.addEventListener('click', () => closeModal(getDomElement('shareOptionsModal')));
    getDomElement('printScheduleBtn')?.addEventListener('click', printSchedule);
    getDomElement('shareBtn')?.addEventListener('click', () => { currentShareType = 'details';openModal(getDomElement('shareOptionsModal')); });
    getDomElement('printReceiptBtn')?.addEventListener('click', () => printModalContent(getDomElement('receiptModal')));
    getDomElement('downloadReceiptBtn')?.addEventListener('click', downloadReceipt);


    moduleCards.forEach(card => {
        card.addEventListener('click', () => {
            const moduleId = card.getAttribute('data-target');
            showModule(moduleId);
        });
    });


    getDomElement('closeChangePasswordModalBtn')?.addEventListener('click', () => {
        closeModal(getDomElement('changePasswordModal'));
    });

    backToMenuBtn?.addEventListener('click', () => {
        // Simula presionar "Atrás" en el navegador
        window.history.back();
    });

    addLoanBtn?.addEventListener('click', () => openModal(loanModal));

    deleteConfirmationForm?.addEventListener('submit', handleDeleteSubmit);


    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.module) {
            // Si hay estado guardado, volvemos a ese módulo SIN añadirlo al historial de nuevo (false)
            showModule(event.state.module, false);
        } else {
            // Si no hay estado (llegamos al inicio), mostramos el menú
            showModule('module-menu', false);
        }
    });

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

    closeReceiptConfigModalBtn?.addEventListener('click', () => closeModal(getDomElement('receiptConfigModal')));

    menuReceiptConfig?.addEventListener('click', (e) => {
        e.preventDefault();
        openReceiptConfigModal();
    });

    receiptConfigForm?.addEventListener('submit', handleReceiptConfigSubmit);


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
            // openPaymentModal(loan); // Deshabilitado, el pago se hace desde el módulo 'pagos'
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
    initLoanFormLogic(); // CRÍTICO: Inicializa el HTML del formulario
    initCashRegisterListeners();
    initReceiptButtonListeners();
}


function openReceiptConfigModal() {
    const rucInput = getDomElement('configRuc');
    const razonSocialInput = getDomElement('configRazonSocial');
    const direccionInput = getDomElement('configDireccion');

    // Cargar los valores actuales (globales) en el formulario
    rucInput.value = RUC_EMPRESA;
    razonSocialInput.value = RAZON_SOCIAL_EMPRESA;
    direccionInput.value = DIRECCION_EMPRESA;

    getDomElement('receipt-config-message').style.display = 'none';
    openModal(getDomElement('receiptConfigModal'));
}

function handleReceiptConfigSubmit(e) {
    e.preventDefault();

    const rucInput = getDomElement('configRuc').value;
    const razonSocialInput = getDomElement('configRazonSocial').value;
    const direccionInput = getDomElement('configDireccion').value;
    const messageEl = getDomElement('receipt-config-message');

    // 🚨 Aquí actualizamos las variables globales (solo en memoria local)
    RUC_EMPRESA = rucInput;
    RAZON_SOCIAL_EMPRESA = razonSocialInput;
    DIRECCION_EMPRESA = direccionInput;

    // GUARDAR EN LOCALSTORAGE para que persista
    localStorage.setItem('config_ruc', RUC_EMPRESA);
    localStorage.setItem('config_razon_social', RAZON_SOCIAL_EMPRESA);
    localStorage.setItem('config_direccion', DIRECCION_EMPRESA);

    messageEl.className = 'alert alert-success';
    messageEl.innerHTML = '<span>✅</span> Configuración guardada correctamente.';
    messageEl.style.display = 'flex';

    // Opcional: Cerrar después de un delay
    setTimeout(() => closeModal(getDomElement('receiptConfigModal')), 2000);
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

async function deleteLoan(loanId) {
    try {
        const response = await fetch(`${API_URL}/api/loans/${loanId}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error ${response.status}`);
        }
        await fetchAndRenderLoans();
        showSuccessAnimation('¡Préstamo Eliminado!');
    } catch (error) {
        alert(`No se pudo eliminar el préstamo: ${error.message}`);
    }
}


// --- LÓGICA DE CUADRE DE CAJA (Mínima) ---
async function openCashRegister() {
    const today = getTodayDateISO();
    // Se fuerza la misma fecha en ambos campos para cuadre diario
    getDomElement('cashRegisterDateFrom').value = today;
    getDomElement('cashRegisterDateTo').value = today; // Mantener, aunque esté oculto
    await filterCashRegister();
}

function initCashRegisterListeners() {
    getDomElement('filterCashRegisterBtn')?.addEventListener('click', filterCashRegister);
    getDomElement('saveDailySquareBtn')?.addEventListener('click', saveDailySquare);

    // 🚨 MODIFICADO: Solo listener en DateFrom
    getDomElement('cashRegisterDateFrom')?.addEventListener('change', (e) => {
        const dateFrom = e.target.value;
        // Forzar DateTo a ser igual a DateFrom
        getDomElement('cashRegisterDateTo').value = dateFrom;
        filterCashRegister();
    });

    // 🚨 ELIMINADO: Ya no se filtra por DateTo independientemente.

    getDomElement('exportCashRegisterBtn')?.addEventListener('click', exportarCajaPDF);
    getDomElement('printCashRegisterBtn')?.addEventListener('click', imprimirCaja);
}

// 🚨 MODIFICADA: La función ahora solo se centra en un solo día
async function filterCashRegister() {
    const dateFrom = getDomElement('cashRegisterDateFrom').value;
    const dateTo = dateFrom; // Forzamos la igualdad

    // Usamos el rango estricto de la fecha seleccionada
    const allMovements = getMovementsByDateRange(dateFrom, dateTo, null);

    // 1. Filtrar movimientos del día seleccionado (este filtro es estricto por la hora)
    const todayMovements = allMovements.filter(m => {
        // Aseguramos que la comparación sea solo por fecha (ISO string YYYY-MM-DD)
        const paymentDate = new Date(m.date).toISOString().split('T')[0];
        return paymentDate === dateFrom;
    });

    const totalAllIngresos = todayMovements.reduce((sum, m) => sum + m.total, 0);
    const totalCashIngresos = todayMovements.filter(m => m.method === 'Efectivo').reduce((sum, m) => sum + m.total, 0);
    // 🚨 CAMBIO: Incluir "Izipay" junto a "Transferencia" y "Yape/Plin" en el cálculo de transferencias/MP
    const totalTransferIngresos = todayMovements.filter(m => m.method === 'Transferencia' || m.method === 'Yape/Plin' || m.method === 'Izipay').reduce((sum, m) => sum + m.total, 0);
    // 🚨 CAMBIO: Total de ingresos por tarjeta/Izipay
    const totalIzpIngresos = todayMovements.filter(m => m.method === 'Izipay').reduce((sum, m) => sum + m.total, 0);


    // Mostrar el resumen del día seleccionado
    const summaryContent = `
        <p><strong>Total de Ingresos (Caja + Transferencias + Izipay):</strong> <span style="font-weight: 700; color: var(--success-color);">S/ ${totalAllIngresos.toFixed(2)}</span></p>
        <p><strong>Ingreso Neto en Efectivo (Cuadre):</strong> <span style="font-weight: 700; color: var(--success-color);">S/ ${totalCashIngresos.toFixed(2)}</span></p>
        <p><strong>Ingreso por Transferencia/Yape:</strong> <span style="font-weight: 700; color: var(--primary-color);">S/ ${totalTransferIngresos.toFixed(2)}</span></p>
        <p><strong>Ingreso por Tarjeta/Izipay:</strong> <span style="font-weight: 700; color: var(--secondary-color);">S/ ${totalIzpIngresos.toFixed(2)}</span></p>
    `;
    // getDomElement('cashRegisterSummary').innerHTML = summaryContent; // Reubicado abajo

    // Control de la sección de cuadre diario
    const dailySquareSection = getDomElement('dailySquareSection');
    const squareFormContainer = getDomElement('squareFormContainer');
    const squareStatusMessage = getDomElement('squareStatusMessage');
    const declaredAmountInput = getDomElement('declaredAmount');

    // Obtener el contenedor de la tabla de movimientos para aplicar estilos
    const cashRegisterTableContainer = getDomElement('cashRegisterTableBody').closest('.table-container');

    // 1. Verificar estado del cierre en DB
    const closureDate = dateFrom;
    const checkResponse = await fetch(`${API_URL}/api/cash-closures/${closureDate}`);
    const checkData = await checkResponse.json();

    const formattedDateTitle = new Date(closureDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
    getDomElement('dailySquareDate').textContent = formattedDateTitle;

    const cashRegisterSummary = getDomElement('cashRegisterSummary');

    if (checkData.closed) {
        // Cierre ya realizado: Mostrar resumen estático de cierre.
        squareFormContainer.style.display = 'none';
        squareStatusMessage.className = 'alert alert-info';
        squareStatusMessage.innerHTML = `<span>🔒</span> <strong>Cierre de Caja Realizado.</strong> Monto del Sistema: S/ ${checkData.data.system_cash_amount.toFixed(2)}. Diferencia: S/ ${checkData.data.difference.toFixed(2)}. Cerrado el ${new Date(checkData.data.closed_at).toLocaleString('es-PE')}.`;
        squareStatusMessage.style.display = 'flex';

        // 🚨 CAMBIO CRÍTICO: Sobreescribir el resumen con el mensaje de "CUADRE HECHO"
        cashRegisterSummary.className = 'cash-register-summary alert-success';
        cashRegisterSummary.style.backgroundColor = 'var(--success-color)';
        cashRegisterSummary.style.color = 'var(--bg-primary)';
        cashRegisterSummary.style.border = '1px solid var(--success-color)';
        cashRegisterSummary.innerHTML = `
            <p style="text-align: center; font-size: 18px; font-weight: 700; color: var(--bg-primary);">✅ CUADRE DE CAJA HECHO (${formattedDateTitle})</p>
            <p style="text-align: center; font-size: 14px; color: var(--bg-primary);">Revisa la sección de 'Historial de Cierres Oficiales' para más detalles.</p>
        `;

        // Aplicar clase para bloquear visualmente la tabla
        if (cashRegisterTableContainer) {
            cashRegisterTableContainer.classList.add('locked-cash-register');
        }

    } else {
        // Cierre pendiente: Mostrar resumen con los totales calculados.
        squareFormContainer.style.display = 'block';
        squareStatusMessage.style.display = 'none';

        // 🚨 CAMBIO CRÍTICO: Volver a los estilos por defecto y mostrar el resumen de totales
        cashRegisterSummary.className = 'cash-register-summary'; // Volver a la clase normal
        cashRegisterSummary.style.backgroundColor = 'var(--primary-light)';
        cashRegisterSummary.style.color = 'var(--text-color)';
        cashRegisterSummary.style.border = '1px solid var(--primary-color)';
        cashRegisterSummary.innerHTML = summaryContent; // Reutilizar el contenido de totales


        declaredAmountInput.value = totalCashIngresos.toFixed(2);
        getDomElement('squareValidationMessage').style.display = 'none';
        getDomElement('saveDailySquareBtn').disabled = false;

        // Remover clase si no está cerrado
        if (cashRegisterTableContainer) {
            cashRegisterTableContainer.classList.remove('locked-cash-register');
        }
    }


    // 🚨 CRÍTICO: Renderizar la tabla de movimientos detallada del día seleccionado
    renderCashRegisterTable(todayMovements, checkData.closed);

    // 🔹 IMPORTANTE: El historial de cierres se renderiza aparte y sin filtro
    await renderClosureHistory();
}

// 🚨 MODIFICADA: Ahora muestra los movimientos detallados del día y gestiona el estado de cierre
function renderCashRegisterTable(dailyMovements, isClosed) {
    const tbody = getDomElement('cashRegisterTableBody');
    const tableContainer = tbody.closest('.table-container');

    if (!tbody || !tableContainer) return;

    tbody.innerHTML = '';

    // 🚨 CAMBIO: Se ajusta el encabezado para mostrar movimientos (No cambia, pero se deja para referencia)
    getDomElement('cashRegisterTable').querySelector('thead tr').innerHTML = `
        <th style="text-align: left;">Cliente</th>
        <th style="text-align: center;">Método</th>
        <th style="text-align: right;">Capital/Interés</th>
        <th style="text-align: right;">Mora</th>
        <th style="text-align: right;">Total Ingreso</th>
    `;

    // Si la caja está cerrada, sobreescribir con el mensaje
    if (isClosed) {
        // Aplicar clase para bloquear visualmente la tabla
        tableContainer.classList.add('locked-cash-register');

        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--danger-color); font-weight: 700; padding: 40px; font-size: 16px; background-color: var(--light-gray);">
                    🔒 NO DISPONIBLE - CUADRE DE CAJA HECHO
                </td>
            </tr>
        `;
        return;
    }

    // Si no está cerrada, asegurar que sea interactuable
    tableContainer.classList.remove('locked-cash-register');

    if (dailyMovements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #9CA3AF;">No se encontraron movimientos para este día.</td></tr>';
        return;
    }

    dailyMovements.forEach(m => {
        const row = document.createElement('tr');

        // 🚨 MEJORA: Centrado y alineación optimizada
        row.innerHTML = `
            <td style="text-align: left; vertical-align: middle;">${m.client}</td>
            <td style="text-align: center; vertical-align: middle;">${m.method}</td>
            <td style="text-align: right; vertical-align: middle;">S/ ${m.amount.toFixed(2)}</td>
            <td style="color: var(--danger-color); text-align: right; vertical-align: middle;">S/ ${m.mora.toFixed(2)}</td>
            <td style="font-weight: 700; color: var(--success-color); text-align: right; vertical-align: middle;">S/ ${m.total.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    });
}


function getMovementsByDateRange(dateFrom, dateTo, methodFilter = null) {

    // 🚨 CRÍTICO: Establecer el rango estricto para un solo día (00:00:00.000 a 23:59:59.999)
    const startDate = new Date(dateFrom);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(dateTo);
    endDate.setHours(23, 59, 59, 999);

    const startTime = startDate.getTime();
    const endTime = endDate.getTime();


    const filteredMovements = [];
    loans.forEach(loan => {
        if (loan.payments) {
            loan.payments.forEach(p => {
                // Usamos el constructor Date() para obtener el timestamp del pago.
                const paymentDate = new Date(p.payment_date).getTime();
                let method = p.payment_method || 'Efectivo';

                // 🚨 CAMBIO CRÍTICO: Reemplazar Mercado Pago por Izipay en la visualización
                if (method === 'Mercado Pago') {
                    method = 'Izipay';
                }

                // 🚨 CRÍTICO: El filtro ahora usa los timestamps calculados (solo ese día)
                if (paymentDate >= startTime && paymentDate <= endTime && (!methodFilter || method === methodFilter)) {
                    filteredMovements.push({
                        date: paymentDate,
                        client: `${loan.nombres} ${loan.apellidos}`,
                        amount: parseFloat(p.payment_amount) - (parseFloat(p.mora_amount) || 0), // Capital/Interés
                        mora: parseFloat(p.mora_amount || 0),
                        total: parseFloat(p.payment_amount), // Total pagado
                        method: method
                    });
                }
            });
        }
    });

    return filteredMovements.sort((a, b) => a.date - b.date);
}

async function saveDailySquare() {
    const date = getDomElement('cashRegisterDateFrom').value;
    const declaredAmount = parseFloat(getDomElement('declaredAmount').value);
    const validationMessage = getDomElement('squareValidationMessage');
    validationMessage.style.display = 'block';

    if (!date) {
        validationMessage.className = 'alert alert-danger';
        validationMessage.innerHTML = '<span>❌</span> Seleccione una fecha para el cierre de caja.';
        return;
    }


    const allMovements = getMovementsByDateRange(date, date, null);
    const cashMovements = allMovements.filter(m => m.method === 'Efectivo');
    const totalCashIngresos = cashMovements.reduce((sum, m) => sum + m.total, 0);

    const difference = declaredAmount - totalCashIngresos;

    // 1. Validar el cuadre antes de enviar a DB
    if (Math.abs(difference) >= 0.01) {
        validationMessage.className = 'alert alert-danger';
        validationMessage.innerHTML = `<span>❌</span> <strong>¡Descuadre!</strong> El monto declarado (S/ ${declaredAmount.toFixed(2)}) no coincide con el ingreso en efectivo del sistema (S/ ${totalCashIngresos.toFixed(2)}). <br><strong>Diferencia:</strong> S/ ${difference.toFixed(2)}. Corrija el monto antes de cerrar.`;
        return;
    }

    // 2. Si cuadra, registrar en DB (Esto evita el doble registro gracias al backend)
    try {
        const response = await fetch(`${API_URL}/api/cash-closures`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                closure_date: date,
                declared_amount: declaredAmount.toFixed(2),
                system_cash_amount: totalCashIngresos.toFixed(2),
                difference: difference.toFixed(2)
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            if (response.status === 409) {
                // Error 409 (Conflict) significa que ya se cerró
                throw new Error("Ya existe un cierre de caja para esta fecha.");
            }
            throw new Error(errorData.error || `Error ${response.status}`);
        }

        // 3. Éxito: Deshabilitar el botón y actualizar el estado
        validationMessage.className = 'alert alert-success';
        validationMessage.innerHTML = `<span>✅</span> <strong>¡Caja Cuadrada!</strong> Cierre de caja registrado para el día ${new Date(date).toLocaleDateString('es-PE')}.`;

        // Vuelve a filtrar para mostrar el estado de "Cerrado" y actualizar el historial
        await filterCashRegister();

        // 🔹 NUEVA LÍNEA: Mostrar animación de éxito
        showSuccessAnimation('✅ Cierre de Caja Guardado en Historial');

    } catch (error) {
        validationMessage.className = 'alert alert-danger';
        validationMessage.innerHTML = `<span>❌</span> <strong>Error al Guardar:</strong> ${error.message}`;
    }
}


// --- FUNCIÓN: EXPORTAR REPORTE DE CAJA A PDF (MODIFICADA) ---
function exportarCajaPDF() {
    if (typeof window.jspdf === 'undefined') {
        alert("Error: Librería jsPDF no cargada.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // 1. Obtener datos de la interfaz (Solo un día)
    const dateFrom = getDomElement('cashRegisterDateFrom').value;
    const dateTo = dateFrom; // Forzado
    const summaryText = getDomElement('cashRegisterSummary').innerText.split('\n').filter(line => line.trim() !== '');

    // 1.1. Verificar si la caja está cerrada revisando el contenido de la tabla
    const tbody = getDomElement('cashRegisterTableBody');
    // Si el primer TD contiene el texto de cierre, está cerrado
    const isClosed = tbody.querySelector('td')?.textContent.includes('CUADRE DE CAJA HECHO');


    // 2. Encabezado
    doc.setFontSize(18);
    doc.setTextColor(0, 93, 255); // Azul PrestaPro
    doc.text("REPORTE DE MOVIMIENTOS DE CAJA", 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generado el: ${new Date().toLocaleString('es-PE')}`, 105, 28, { align: 'center' });
    doc.text(`Día Seleccionado: ${dateFrom}`, 105, 33, { align: 'center' });

    // 3. Resumen (Caja de totales)
    doc.setDrawColor(0, 93, 255);
    doc.setFillColor(240, 245, 255);
    doc.rect(14, 40, 182, 35, 'FD'); // Caja de fondo

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);

    let yResumen = 48;
    summaryText.forEach((line) => {
        if(line.includes('Diferencia')) return;
        doc.text(line, 20, yResumen);
        yResumen += 7;
    });

    let startYTable = 85;

    // 4. Tabla de Movimientos
    if (isClosed) {
        doc.setFontSize(14);
        doc.setTextColor(200, 0, 0); // Rojo para la advertencia
        doc.text("🔒 TABLA NO DISPONIBLE - CUADRE DE CAJA REALIZADO", 105, startYTable, { align: 'center' });
    } else {
        doc.autoTable({
            html: '#cashRegisterTable', // Jala los datos directo de tu tabla HTML
            startY: startYTable,
            theme: 'grid',
            headStyles: {
                fillColor: [0, 93, 255],
                textColor: [255, 255, 255],
                halign: 'center',
                fontStyle: 'bold'
            },
            bodyStyles: {
                textColor: [50, 50, 50],
                fontSize: 10
            },
            columnStyles: {
                0: { halign: 'left' },
                1: { halign: 'center' },
                2: { halign: 'right' },
                3: { halign: 'right', textColor: [200, 0, 0] }, // Mora
                4: { fontStyle: 'bold', halign: 'right', textColor: [16, 185, 129] } // Total Ingreso
            },
            footStyles: {
                fillColor: [240, 240, 240],
                textColor: [0, 0, 0],
                fontStyle: 'bold'
            }
        });
    }

    // 5. Descargar
    const fileName = `Reporte_Movimientos_${dateFrom}.pdf`;
    doc.save(fileName);
}

// --- FUNCIÓN: IMPRIMIR REPORTE DE CAJA (MODIFICADA) ---
function imprimirCaja() {
    const dateFrom = getDomElement('cashRegisterDateFrom').value;
    const dateTo = dateFrom; // Forzado

    // Clonamos el resumen y la tabla para no afectar la vista actual
    const summaryHTML = getDomElement('cashRegisterSummary').innerHTML;

    // 1. Verificar si la caja está cerrada revisando el contenido de la tabla
    const tbody = getDomElement('cashRegisterTableBody');
    const isClosed = tbody.querySelector('td')?.textContent.includes('CUADRE DE CAJA HECHO');

    let tableContentHTML = '';

    if (isClosed) {
        tableContentHTML = `
            <div style="text-align: center; color: #f44336; font-weight: 700; padding: 40px; font-size: 16px; background-color: #f9f9f9; border: 1px solid #f44336; border-radius: 5px;">
                🔒 NO DISPONIBLE - CUADRE DE CAJA HECHO
            </div>
        `;
    } else {
        // Si no está cerrado, usamos el HTML de la tabla normal
        tableContentHTML = getDomElement('cashRegisterTable').outerHTML;
    }


    // Crear iframe temporal para imprimir
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
            <title>Reporte de Caja</title>
            <style>
                body { font-family: sans-serif; padding: 20px; color: #333; }
                h1 { text-align: center; color: #000; margin-bottom: 5px; }
                .subtitle { text-align: center; font-size: 12px; color: #666; margin-bottom: 20px; }
                
                /* Estilos del Resumen */
                .summary-box { 
                    border: 2px solid #333; 
                    padding: 15px; 
                    margin-bottom: 20px; 
                    border-radius: 5px;
                    background-color: #f9f9f9;
                }
                .summary-box p { margin: 5px 0; font-size: 14px; }
                
                /* Estilos de la Tabla */
                table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
                th { background-color: #eee; border: 1px solid #999; padding: 8px; text-transform: uppercase; }
                td { border: 1px solid #999; padding: 8px; text-align: right; }
                td:first-child { text-align: left; } /* Cliente a la izquierda */
                td:nth-child(2) { text-align: center; } /* Método centrado */
                
                /* Utilidades de impresión */
                @media print {
                    @page { margin: 10mm; }
                    body { -webkit-print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            <h1>REPORTE DE MOVIMIENTOS DE CAJA</h1>
            <p class="subtitle">
                Día: ${dateFrom} <br>
                Impreso el: ${new Date().toLocaleString('es-PE')}
            </p>

            <div class="summary-box">
                ${summaryHTML}
            </div>

            <h2 style="font-size: 16px; margin-bottom: 10px;">Movimientos del Día</h2>
            ${tableContentHTML}
        </body>
        </html>
    `);

    iframeDoc.close();

    iframe.onload = function() {
        setTimeout(function() {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => { document.body.removeChild(iframe); }, 1000);
        }, 500);
    };
}


// --- LÓGICA DE PRÉSTAMOS (INYECCIÓN DE FORMULARIO) ---
function resetLoanForm() {
    // Lógica para reinyectar el formulario completo al cerrar/abrir el modal
    initLoanFormLogic();
}

function initLoanFormLogic() {
    const loanForm = getDomElement('loanForm');
    if (!loanForm) return;

    // 🚨 MODIFICACIÓN CLAVE: Obtener la fecha actual en formato ISO YYYY-MM-DD
    const today = getTodayDateISO();

    // INYECCIÓN DE HTML DEL FORMULARIO DE PRÉSTAMO (MODIFICADA PARA DOCUMENTO)
    loanForm.innerHTML = `
        <fieldset>
            <legend>📋 Información del Cliente</legend>
            <div class="form-row">
                <div class="form-group" style="max-width: 120px;">
                    <label for="doc_type">Tipo Doc.</label>
                    <select id="doc_type" required>
                        <option value="DNI">DNI</option>
                        <option value="RUC">RUC</option>
                    </select>
                </div>
                <div class="form-group" style="flex-grow: 1;">
                    <label for="doc_id">N° de Documento</label>
                    <input type="text" id="doc_id" placeholder="Ingresa 8 o 11 dígitos y presiona Tab" required maxlength="11" inputmode="numeric" oninput="this.value = this.value.replace(/[^0-9]/g, '');">
                    <small id="doc-id-status" style="margin-top: 5px; display: block;"></small>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="nombres">Nombres / Razón Social</label>
                    <input type="text" id="nombres" placeholder="Autocompletado con DNI/RUC" required readonly>
                </div>
                <div class="form-group" id="apellidos-group">
                    <label for="apellidos">Apellidos</label>
                    <input type="text" id="apellidos" placeholder="Autocompletado con DNI" required readonly>
                </div>
            </div>
            <div class="checkbox-container" id="is_pep_container">
                <input type="checkbox" id="is_pep">
                <label for="is_pep">¿Es Persona Expuesta Políticamente (PEP)?</label>
            </div>
        </fieldset>

        <fieldset>
            <legend>💰 Detalles del Préstamo</legend>
            <div class="form-row">
                <div class="form-group">
                    <label for="monto">Monto del Préstamo (S/)</label>
                    <input type="number" id="monto" required step="0.01" min="1" placeholder="5000">
                </div>
                <div class="form-group">
                    <label for="fecha">Fecha de Desembolso</label>
                    <input type="date" id="fecha" required value="${today}" >
                </div>
                <div class="form-group">
                    <label for="plazo">Plazo (meses)</label>
                    <input type="number" id="plazo" required min="1" max="60" step="1" placeholder="12" inputmode="numeric">
                </div>
            </div>
            <div class="form-group">
                <label for="interes_anual">Tasa de Interés Anual (%)</label>
                <input type="number" id="interes_anual" required step="0.01" min="1" max="99.99" maxlength="2" placeholder="10.00" value="10.00">
                <small id="interes-info">Tasa anual (TEA) con la que se calculará la cuota.</small>
            </div>
            
            <div id="monthly-payment-preview" class="summary-info" style="display: none; padding: 10px; font-size: 14px; margin-top: 5px;">
                <strong>Cuota Mensual Estimada (Amortizado):</strong> <span id="estimated-monthly-payment">S/ 0.00</span>
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
                <input type="number" id="meses_solo_interes" min="1" max="12" maxlength="2" step="1" placeholder="3" inputmode="numeric">
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
    const docTypeSelect = getDomElement('doc_type');
    const docIdInput = getDomElement('doc_id');
    const nombresInput = getDomElement('nombres');
    const apellidosInput = getDomElement('apellidos');
    const docIdStatus = getDomElement('doc-id-status');
    const apellidosGroup = getDomElement('apellidos-group');
    const isPepContainer = getDomElement('is_pep_container');

    // ... (rest of form elements declaration: montoInput, plazoInput, etc. - MANTENER)

    const montoInput = getDomElement('monto');
    const plazoInput = getDomElement('plazo');
    const interesAnualInput = getDomElement('interes_anual');
    const isPepCheckbox = getDomElement('is_pep');
    const declaracionContainer = getDomElement('declaracion-container');
    const declaracionCheckbox = getDomElement('declaracion_jurada');
    const tipoCalculoSelect = getDomElement('loan_tipo_calculo');
    const hibridoOptions = getDomElement('hibrido_options');
    const mesesSoloInteresInput = getDomElement('meses_solo_interes');
    const monthlyPaymentPreview = getDomElement('monthly-payment-preview');
    const estimatedMonthlyPayment = getDomElement('estimated-monthly-payment');


    // 🚨 NUEVA FUNCIÓN: Lógica para manejar DNI/RUC
    function handleDocumentTypeChange() {
        const type = docTypeSelect.value;
        // Reiniciar campos
        docIdInput.value = '';
        nombresInput.value = '';
        apellidosInput.value = '';
        docIdStatus.textContent = '';

        // Ajustar maxlength y visibilidad
        if (type === 'DNI') {
            docIdInput.maxLength = 8;
            apellidosGroup.style.display = 'block';
            isPepContainer.style.display = 'flex';
            docIdInput.placeholder = 'Ingresa 8 dígitos y presiona Tab';
        } else { // RUC
            docIdInput.maxLength = 11;
            apellidosInput.value = 'N/A';
            apellidosGroup.style.display = 'none';
            isPepContainer.style.display = 'none';
            isPepCheckbox.checked = false; // Desmarcar PEP para RUC
            docIdInput.placeholder = 'Ingresa 11 dígitos y presiona Tab';
        }
    }

    // Listener de cambio de tipo
    docTypeSelect.addEventListener('change', handleDocumentTypeChange);

    // Listener de búsqueda (on blur o tab out)
    docIdInput.addEventListener('blur', async () => {
        handleDocumentInput(docTypeSelect.value, docIdInput.value);
    });

    // Función que maneja la búsqueda real (separada para claridad)
    async function handleDocumentInput(type, id) {
        toggleFormLock(false);
        nombresInput.value = '';
        apellidosInput.value = '';

        if ((type === 'DNI' && id.length !== 8) || (type === 'RUC' && id.length !== 11)) {
            docIdStatus.textContent = '';
            return;
        }

        const hasActiveLoan = loans.some(loan =>
            // 🚨 CRÍTICO: Buscar si existe un préstamo activo asociado a ese DNI/RUC
            loan.dni === id && loan.status === 'Activo'
        );

        if (hasActiveLoan) {
            docIdStatus.textContent = '⚠️ Este cliente ya tiene un préstamo activo. Formulario bloqueado.';
            docIdStatus.style.color = 'var(--warning-color)';
            toggleFormLock(true);
            return;
        }

        docIdStatus.textContent = 'Buscando...'; docIdStatus.style.color = '#667085';

        try {
            // 🚨 CAMBIO CRÍTICO: Usar la nueva ruta /api/documento/:docId (maneja DNI y RUC)
            const response = await fetch(`${API_URL}/api/documento/${id}`);
            const data = await response.json();

            if (response.ok && data.nombres) {
                nombresInput.value = data.nombres;
                if (type === 'DNI') {
                    apellidosInput.value = `${data.apellidoPaterno} ${data.apellidoMaterno}`;
                } else { // RUC: usa la razón social como nombre, y apellidos queda N/A
                    apellidosInput.value = 'N/A';
                }
                docIdStatus.textContent = `✅ ${type} encontrado y sin préstamos activos.`;
                docIdStatus.style.color = 'var(--success-color)';
            } else {
                // Si el RUC no tiene razón social, o el DNI falla
                throw new Error(data.error || data.message || `No se encontraron resultados para ${type}.`);
            }
        } catch (error) {
            // 🚨 CORRECCIÓN DE DEBUG: Si la URL del API_URL no está funcionando correctamente,
            // el error se mostrará aquí como "Ruta de API no encontrado" o similar.
            if (error.message.includes('Failed to fetch') || error.message.includes('404')) {
                docIdStatus.textContent = `❌ Error de conexión: ${error.message}. Verifique la URL del backend (${API_URL}) y su estado.`
            } else {
                docIdStatus.textContent = `❌ ${error.message}`;
            }

            docIdStatus.style.color = 'var(--danger-color)';
        }
    }


    // 🚨 RESTO DE LISTENERS (Mantener la lógica de cálculo y PEP)
    interesAnualInput.addEventListener('input', (e) => {
        let value = e.target.value;
        const parts = value.split('.');
        let integerPart = parts[0];

        // 🚨 NUEVA RESTRICCIÓN: Limitar la parte entera a 2 dígitos
        if (integerPart.length > 2) {
            integerPart = integerPart.slice(0, 2);
        }

        // 3. Forzar el valor limpio y la limitación a 99
        let finalValue = integerPart;
        if (parts.length > 1) {
            finalValue += '.' + parts[1];
        }

        // Si el valor numérico supera 99, lo limitamos
        let numValue = parseFloat(finalValue);
        if (numValue > 99) {
            e.target.value = '99' + (parts.length > 1 ? '.' + parts[1] : '');
        } else {
            e.target.value = finalValue;
        }

        calculateEstimatedMonthlyPayment();
        updateHibridoInfo();
    });

    // Validación para evitar símbolos en campos numéricos de meses
    plazoInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });

    mesesSoloInteresInput.addEventListener('input', (e) => {
        // 1. Quitar caracteres no numéricos
        let value = e.target.value.replace(/[^0-9]/g, '');

        // 2. 🚨 CORRECCIÓN CRÍTICA: Limitar la longitud a 2 dígitos
        if (value.length > 2) {
            value = value.slice(0, 2);
        }

        // 3. Convertir a número y limitar al máximo permitido (99)
        let numValue = parseInt(value, 10);

        if (isNaN(numValue) || numValue > 99) {
            // Si es inválido o excede 99, forzar a 99 si no es vacío, o dejar vacío.
            e.target.value = (numValue > 99) ? '99' : value;
        } else {
            e.target.value = value;
        }

        // Llamar a la función de info
        updateHibridoInfo();
    });

    // 🚨 NUEVA FUNCIÓN: Lógica para previsualizar la cuota mensual (MANTENER)
    function calculateEstimatedMonthlyPayment() {
        const monto = parseFloat(montoInput.value) || 0;
        const interesAnual = parseFloat(interesAnualInput.value) || 0;
        const plazo = parseInt(plazoInput.value) || 0;

        // Solo calcular si todos los campos requeridos tienen valores válidos y es Amortizado
        if (monto > 0 && interesAnual > 0 && plazo > 0 && tipoCalculoSelect.value === 'Amortizado') {
            const monthlyInterestRate = (interesAnual / 12) / 100; // Tasa mensual en decimal

            // Fórmula de cuota fija (Amortizado)
            const monthlyPayment = (monto * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -plazo));

            if (isFinite(monthlyPayment) && monthlyPayment > 0) {
                estimatedMonthlyPayment.textContent = `S/ ${monthlyPayment.toFixed(2)}`;
                monthlyPaymentPreview.style.display = 'block';
                return;
            }
        }

        monthlyPaymentPreview.style.display = 'none';
        estimatedMonthlyPayment.textContent = 'S/ 0.00';
    }


    // Lógica para mostrar/ocultar el campo híbrido
    tipoCalculoSelect?.addEventListener('change', (e) => {
        if (e.target.value === 'Hibrido') {
            hibridoOptions.style.display = 'block';
            mesesSoloInteresInput.required = true;
        } else {
            hibridoOptions.style.display = 'none';
            mesesSoloInteresInput.required = false;
        }
        calculateEstimatedMonthlyPayment(); // 🚨 LLAMAR A LA FUNCIÓN
    });

    // 🚨 LISTENERS PARA RECALCULAR LA CUOTA
    montoInput.addEventListener('input', calculateEstimatedMonthlyPayment);
    plazoInput.addEventListener('input', calculateEstimatedMonthlyPayment);
    interesAnualInput.addEventListener('input', calculateEstimatedMonthlyPayment);


    // Lógica de validación PEP/UIT (MANTENER)
    function updateDeclaracionVisibility() {
        const monto = parseFloat(montoInput.value) || 0;
        const esPEP = isPepCheckbox.checked;
        const motivo = getDomElement('declaracion-motivo');
        const VALOR_UIT_LOCAL = 5150;

        // Solo se requiere PEP si el tipo de documento es DNI (visible)
        const isDniType = docTypeSelect.value === 'DNI';

        if ((monto > VALOR_UIT_LOCAL || (esPEP && isDniType))) {
            declaracionContainer.style.display = 'block';
            declaracionCheckbox.required = true;
            if (esPEP && isDniType && monto <= VALOR_UIT_LOCAL) motivo.textContent = 'Requerido por ser Persona Expuesta Políticamente (PEP).';
            else if (esPEP && isDniType && monto > VALOR_UIT_LOCAL) motivo.textContent = 'Requerido por monto mayor a 1 UIT y por ser PEP.';
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
        const interesAnual = parseFloat(interesAnualInput.value) || 0; // Usar el nuevo input
        const interesMensual = interesAnual / 12; // Tasa mensual en %
        const meses = parseInt(mesesSoloInteresInput.value) || 0;

        if (monto > 0 && interesMensual > 0 && meses > 0) {
            const pagoSoloInteres = monto * (interesMensual / 100);
            infoEl.textContent = `Durante ${meses} mes(es), pagará S/ ${pagoSoloInteres.toFixed(2)} (solo interés).`;
        } else { infoEl.textContent = ''; }
    }

    montoInput.addEventListener('input', () => { updateDeclaracionVisibility(); updateHibridoInfo(); });
    interesAnualInput.addEventListener('input', updateHibridoInfo); // 🚨 Nuevo listener
    isPepCheckbox.addEventListener('change', updateDeclaracionVisibility);
    mesesSoloInteresInput.addEventListener('input', updateHibridoInfo);

    // Event Listener del formulario de Préstamos (submit)
    getDomElement('loanForm').addEventListener('submit', async function(event) {
        event.preventDefault();

        // 🚨 MODIFICACIÓN: Capturar el ID del documento, no solo el DNI
        const documentId = docIdInput.value;

        // Validar campos obligatorios que podrían quedar vacíos si la búsqueda falla
        if (!nombresInput.value || !apellidosInput.value) {
            docIdStatus.textContent = '❌ Por favor, complete o valide los datos del cliente.';
            docIdStatus.style.color = 'var(--danger-color)';
            return;
        }


        const interes_anual = parseFloat(getDomElement('interes_anual').value);

        // 🚨 CAMBIO CRÍTICO: Usar el ID del documento en lugar de 'dni'
        const newLoanData = {
            client: {
                dni: documentId, // Se utiliza el campo 'dni' en la DB para guardar el DNI o RUC
                nombres: nombresInput.value,
                apellidos: apellidosInput.value,
                is_pep: isPepCheckbox.checked
            },
            monto: parseFloat(montoInput.value),
            interes_anual: interes_anual,
            fecha: getDomElement('fecha').value,
            plazo: parseInt(getDomElement('plazo').value),
            status: 'Activo',
            declaracion_jurada: declaracionCheckbox.checked,
            tipo_calculo: tipoCalculoSelect.value,
            meses_solo_interes: tipoCalculoSelect.value === 'Hibrido' ? parseInt(mesesSoloInteresInput.value) : 0
        };
        try {
            const response = await fetch(`${API_URL}/api/loans`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(newLoanData) });

            if (!response.ok) {
                const errorData = await response.json();

                if (response.status === 409 || response.status === 400) {
                    getDomElement('doc-id-status').textContent = `⚠️ Error: ${errorData.error || response.statusText}`;
                    getDomElement('doc-id-status').style.color = 'var(--danger-color)';
                    console.error("Error de Negocio al crear préstamo:", errorData.error);
                    return;
                }

                throw new Error(errorData.error || `Error ${response.status}`);
            }

            // ÉXITO
            await fetchAndRenderLoans();
            showSuccessAnimation('¡Préstamo Registrado!');

        } catch (error) {
            console.error(`Error CRÍTICO al guardar el préstamo:`, error);
        }
    });

    // Ejecutar el manejo de tipo de documento inicial
    handleDocumentTypeChange();
    calculateEstimatedMonthlyPayment();
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

    // *****************************************************************
    // FIX CRÍTICO: DELEGACIÓN DE EVENTOS PARA EL BOTÓN "VER RECIBO"
    // *****************************************************************
    const detailsModal = getDomElement('detailsModal');
    if (detailsModal) {
        // Adjuntamos el listener al modal de detalles, que siempre está presente.
        detailsModal.addEventListener('click', function(event) {
            const target = event.target.closest('.view-receipt-btn');
            if (target) {
                const loanId = target.getAttribute('data-loan-id');
                const paymentIndex = parseInt(target.getAttribute('data-payment-index'));
                // 🚨 CAMBIO: Obtener correlativo y transaction_id del botón
                const correlativo = target.getAttribute('data-correlativo');
                const transactionId = target.getAttribute('data-transaction');


                const loan = loans.find(l => l.id == loanId);
                // El payment index en la tabla HTML es el índice del array loan.payments
                if (loan && loan.payments && loan.payments.length > paymentIndex) {
                    const payment = loan.payments[paymentIndex];
                    // 🚨 CAMBIO: Añadir correlativo y transaction ID a la data de pago
                    payment.correlativo_boleta = correlativo;
                    payment.transaction_id = transactionId;

                    showReceipt(payment, loan);
                }
            }
        });
    }
    // *****************************************************************
}

function initReceiptButtonListeners() {
    // 🚨 FIX: Inicialización del botón de compartir del recibo
    getDomElement('shareReceiptBtn')?.addEventListener('click', () => {
        currentShareType = 'receipt';
        openModal(getDomElement('shareOptionsModal'));
    });
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
    paymentDateInput.value = getTodayDateISO(); // Usa la función auxiliar

    paymentAmountInput.value = remainingCapitalInterest.toFixed(2);
    paymentAmountInput.min = remainingCapitalInterest > 0 ? '1.00' : '0.00';
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

// NUEVA FUNCIÓN: Muestra el modal del enlace de pago
function showCheckoutLinkModal(izpUrl, totalAmount, paymentMethod, clientName, correlativo) {
    currentIzpUrl = izpUrl; // 🚨 CAMBIO: Usar variable Izipay
    currentClientName = clientName;
    getDomElement('checkoutLinkAmount').textContent = `S/ ${totalAmount.toFixed(2)}`;
    getDomElement('checkoutLinkMethod').textContent = paymentMethod;
    getDomElement('mpLinkOutput').value = izpUrl; // El ID del input HTML sigue siendo 'mpLinkOutput'

    // 🚨 CAMBIO: Mostrar el correlativo en el modal y cambiar la etiqueta
    const titleEl = getDomElement('checkoutLinkTitle');
    titleEl.textContent = `🔗 Enlace de Pago Generado (Boleta N° ${correlativo.toString().padStart(8, '0')})`;
    getDomElement('mpLinkOutput').previousElementSibling.textContent = 'Enlace de Pago (Izipay)';


    // Asegurarse de que el input esté enfocado para copiar si es posible
    const linkInput = getDomElement('mpLinkOutput');
    linkInput.select();
    linkInput.setSelectionRange(0, 99999);

    // Verificar si la API de compartir está disponible para habilitar el botón
    const shareBtn = getDomElement('shareMpLinkBtn');
    if (navigator.share) {
        shareBtn.disabled = false;
        shareBtn.textContent = '🔗 Compartir Enlace';
    } else {
        shareBtn.disabled = true;
        shareBtn.textContent = '❌ Compartir No Disp.';
    }

    openModal(getDomElement('checkoutLinkModal'));
}

function copyMpLink() {
    const linkInput = getDomElement('mpLinkOutput');
    linkInput.select();
    linkInput.setSelectionRange(0, 99999);
    // 🚨 CAMBIO: Usar currentIzpUrl si está definido, aunque el nombre del input sea 'mpLinkOutput'
    navigator.clipboard.writeText(currentIzpUrl || linkInput.value);
    showSuccessAnimation('✅ Enlace copiado al portapapeles.');
}

// NUEVA FUNCIÓN: Utiliza la API nativa de compartir
async function shareMpLink() {
    // 🚨 CAMBIO: Usar currentIzpUrl
    if (!navigator.share || !currentIzpUrl) {
        alert('La función de compartir no está disponible en este dispositivo o navegador.');
        return;
    }

    try {
        await navigator.share({
            title: `Pago Préstamo PrestaPro (S/ ${getDomElement('checkoutLinkAmount').textContent})`,
            text: `¡Hola ${currentClientName || 'cliente'}! Tu enlace de pago para PrestaPro (vía Izipay) ha sido generado. Paga S/ ${getDomElement('checkoutLinkAmount').textContent} usando este link:`,
            url: currentIzpUrl, // 🚨 CAMBIO: Usar currentIzpUrl
        });
        // Opcional: Mostrar una animación de éxito aquí si la compartición fue exitosa (aunque la API de Share no lo garantiza)
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error al compartir:', error);
            // Si falla la API nativa, se recomienda al usuario copiar
            alert("No se pudo iniciar la función de compartir. Por favor, utiliza el botón 'Copiar Enlace' para enviarlo manualmente.");
        }
    }
}


async function handlePaymentSubmit(e) {
    e.preventDefault();

    const selectedMethod = document.querySelector('input[name="payment_method"]:checked')?.value;
    if (!selectedMethod) {
        alert("Por favor, selecciona un método de pago.");
        return;
    }

    const loanId = getDomElement('paymentLoanId').value;
    // paymentAmount es Capital + Interés
    const paymentAmount = parseFloat(getDomElement('payment_amount').value);
    const moraAmount = parseFloat(getDomElement('mora_amount').value) || 0;
    const paymentDate = getDomElement('payment_date').value;
    const totalToCollect = paymentAmount + moraAmount; // Monto total que se enviará

    // Data básica para el registro interno (será enriquecida por el backend)
    const paymentData = {
        payment_amount: totalToCollect,
        mora_amount: moraAmount,
        payment_method: selectedMethod,
        payment_date: paymentDate
    };

    // Identificamos el préstamo y cliente para obtener datos necesarios para Izipay
    const loan = loans.find(l => l.id == loanId);

    // Si es Transferencia o Yape/Plin, ahora lo mapeamos a Izipay
    if (selectedMethod === 'Transferencia' || selectedMethod === 'Yape/Plin') {
        // --- INICIO DE FLUJO DE PAGO CON IZIPAY ---

        if (!loan) {
            alert("Error: No se encontró la información del cliente para iniciar el pago.");
            return;
        }

        if (!confirm(`Se generará un enlace de pago de S/ ${totalToCollect.toFixed(2)} mediante Izipay para que el cliente pague desde su dispositivo. ¿Continuar?`)) {
            return;
        }

        // Cerrar el modal actual de registro de pago
        closeModal(getDomElement('paymentModal'));

        try {
            // 🚨 CAMBIO CRÍTICO: Llamada a la nueva ruta de IZIPAY
            const response = await fetch(`${API_URL}/api/izipay/create-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: totalToCollect.toFixed(2),
                    loanId: loanId,
                    clientDni: loan.dni,
                    clientName: loan.nombres,
                    clientLastName: loan.apellidos,
                    payment_date: paymentDate,
                    amount_ci: paymentAmount.toFixed(2), // Solo Capital/Interés
                    amount_mora: moraAmount.toFixed(2)
                })
            });

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = { error: 'Error de formato (Estado: ' + response.status + ' ' + response.statusText + ')', status: response.status };
                }
                throw new Error(`(${response.status}) Error de Izipay. Detalles: ${errorData.error || errorData.message || JSON.stringify(errorData)}`);
            }

            const izpData = await response.json();
            const izpUrl = izpData.url;

            if (izpUrl) {
                // *** CRÍTICO: Muestra el link en un modal en lugar de redirigir ***
                // 🚨 CAMBIO: Pasar el correlativo de boleta y URL de Izipay
                showCheckoutLinkModal(izpUrl, totalToCollect, selectedMethod, `${loan.nombres} ${loan.apellidos}`, izpData.correlativo_boleta || 'N/A');
                return;
            } else {
                throw new Error("El backend no proporcionó un URL de pago válido de Izipay.");
            }

        } catch (error) {
            alert(`❌ Error al iniciar el pago con Izipay. Detalles: ${error.message}`);
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
                // Captura el objeto de error para que sea legible
                let errorDetail = 'Error desconocido del servidor.';
                try {
                    const errorData = await response.json();
                    errorDetail = errorData.error || errorData.message || JSON.stringify(errorData);
                } catch (e) {
                    errorDetail = `Error de formato (Estado: ${response.status} ${response.statusText})`;
                }
                throw new Error(`(${response.status}) ${errorDetail}`);
            }

            const loan = loans.find(l => l.id == loanId);
            const successData = await response.json(); // <-- CAPTURA LA RESPUESTA

            // 🚨 CRÍTICO: USAR el correlativo y transaction ID del backend
            const paymentWithDetails = {
                ...paymentData,
                correlativo_boleta: successData.correlativo_boleta,
                transaction_id: successData.transaction_id
            };

            // Mostrar recibo con la data de pago que SÍ se registró
            showReceipt(paymentWithDetails, loan);

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
    const searchDocTypePago = getDomElement('search-doc-type-pago');
    const quickPaymentTableBody = getDomElement('quickPaymentTableBody');
    const confirmQuickPaymentBtn = getDomElement('confirmQuickPaymentBtn');
    const paymentSelectionType = getDomElement('payment_selection_type');
    const numInstallmentsInput = getDomElement('num_installments_to_pay');

    searchDniInput?.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ''); });

    // Listener para cambio de tipo de documento
    searchDocTypePago?.addEventListener('change', () => {
        const type = searchDocTypePago.value;
        searchDniInput.value = '';
        getDomElement('search-dni-status').textContent = '';
        
        if (type === 'DNI') {
            searchDniInput.maxLength = 8;
            searchDniInput.placeholder = 'Ingresa 8 dígitos y presiona Enter';
        } else {
            searchDniInput.maxLength = 11;
            searchDniInput.placeholder = 'Ingresa 11 dígitos y presiona Enter';
        }
    });

    // CRÍTICO: Listener de búsqueda DNI (tecla Enter)
    searchDniInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            searchLoansByDni(searchDniInput.value);
            getDomElement('quick-payment-summary-section').style.display = 'none';
        }
    });

    quickPaymentTableBody?.addEventListener('click', function(event) {
        const target = event.target.closest('button');
        if (!target) return;

        const loanId = target.getAttribute('data-loan-id');
        const loan = loans.find(l => l.id == loanId);
        if (loan) {
            populateQuickPaymentSummary(loan);
        }
    });

    // Eventos para el cálculo automático
    paymentSelectionType?.addEventListener('change', () => {
        togglePaymentOptionDetail();
        if (currentLoanForQuickPayment) calculateFlexiblePayment(currentLoanForQuickPayment);
    });

    numInstallmentsInput?.addEventListener('input', () => {
        if (currentLoanForQuickPayment) calculateFlexiblePayment(currentLoanForQuickPayment);
    });

    // Listener para recalcular y habilitar el botón al cambiar el método de pago
    document.querySelectorAll('input[name="quick_payment_method"]').forEach(radio => {
        radio.addEventListener('change', () => {
            // Lógica para asignar la clase 'selected' (FIX de compatibilidad)
            document.querySelectorAll('#quick-payment-summary-section .payment-methods-row .checkbox-container').forEach(c => {
                c.classList.remove('selected');
            });
            radio.closest('.checkbox-container').classList.add('selected');

            if (currentLoanForQuickPayment) calculateFlexiblePayment(currentLoanForQuickPayment);
        });
    });

    confirmQuickPaymentBtn?.addEventListener('click', handleQuickPaymentSubmit);

    // FIX DE COMPATIBILIDAD: Reemplazar :has() en CSS con JS para el clic en las tarjetas
    document.querySelectorAll('#quick-payment-summary-section .payment-methods-row .checkbox-container').forEach(card => {
        card.addEventListener('click', () => {
            // Simular el comportamiento del radio button al hacer clic en el contenedor
            const radio = card.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                // Disparar el evento 'change' manualmente para activar el listener de recalcular
                const event = new Event('change');
                radio.dispatchEvent(event);
            }
        });
    });
}

async function searchLoansByDni(docId) {
    const statusEl = getDomElement('search-dni-status');
    const quickPaymentTableBody = getDomElement('quickPaymentTableBody');
    const quickPaymentResultSection = getDomElement('quick-payment-result-section');
    const docType = getDomElement('search-doc-type-pago')?.value || 'DNI';
    
    quickPaymentTableBody.innerHTML = '';

    // Validar longitud según tipo
    const expectedLength = docType === 'DNI' ? 8 : 11;
    if (docId.length !== expectedLength) {
        statusEl.textContent = `Ingresa ${expectedLength} dígitos de ${docType}.`;
        statusEl.style.color = 'var(--danger-color)';
        quickPaymentResultSection.style.display = 'none';
        return;
    }

    const foundLoans = loans.filter(loan => loan.dni === docId && loan.status === 'Activo');

    if (foundLoans.length === 0) {
        statusEl.textContent = `❌ No se encontraron préstamos activos para este ${docType}.`;
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
    // Se eliminó 'partial-payment-info'
    ['single-payment-info', 'multiple-payment-info'].forEach(id => {
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
    }
}

function populateQuickPaymentSummary(loan) {
    const quickPaymentSummarySection = getDomElement('quick-payment-summary-section');
    currentLoanForQuickPayment = loan;

    // **MODIFICACIÓN 1: Establecer la fecha actual y mantenerla como string (DD/MM/YYYY)**
    const today = new Date();
    // Utiliza el formato no editable, but the getTodayDateISO() function generates the ISO format for the backend
    const formattedDate = today.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    getDomElement('quick_payment_date').value = formattedDate;

    const moraInfo = calculateMora(loan);
    const { schedule } = calculateSchedule(loan);

    // Las cuotas pendientes son aquellas cuya expectativa acumulada es mayor al total pagado
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
        getDomElement('payment_selection_type').value = 'single';
        getDomElement('payment_description').textContent = '¡Préstamo al día! No hay cuotas pendientes.';
        // Aquí se debe deshabilitar el botón de Confirmar Pago
        getDomElement('confirmQuickPaymentBtn').disabled = true;
        alert("¡Préstamo al día! No hay cuotas pendientes para pagar.");
        return; // Salir si no hay cuotas
    }

    const maxAvailable = pendingInstallments.length;
    getDomElement('max_installments_available').textContent = maxAvailable;
    const numInstallmentsInput = getDomElement('num_installments_to_pay');
    numInstallmentsInput.value = maxAvailable > 0 ? 1 : 0;
    numInstallmentsInput.max = maxAvailable;

    togglePaymentOptionDetail();
    quickPaymentSummarySection.style.display = 'grid';

    // **MODIFICACIÓN 2: Llamada al cálculo automático después de cargar**
    calculateFlexiblePayment(loan);
}

function calculateFlexiblePayment(loan) {
    const paymentType = getDomElement('payment_selection_type').value;
    const { schedule } = calculateSchedule(loan);
    const moraInfo = calculateMora(loan);
    let amountToPayCapitalInterest = 0;
    let paymentDescriptionText = '';

    const pendingInstallments = schedule.filter(item => {
        const cumulativeExpected = schedule.slice(0, item.cuota).reduce((sum, s) => sum + parseFloat(s.monto), 0);
        return loan.total_paid < cumulativeExpected;
    });

    // CRÍTICO: Si no hay cuotas pendientes, avisar y salir.
    if (pendingInstallments.length === 0) {
        paymentDescriptionText = "¡Préstamo al día! No hay cuotas pendientes.";
        amountToPayCapitalInterest = 0;
        calculatedPaymentData = { amount: 0, mora: 0 };
    } else {
        if (paymentType === 'single') {
            const nextInstallment = pendingInstallments[0];
            amountToPayCapitalInterest = parseFloat(nextInstallment.monto);
            paymentDescriptionText = `Pagando 1 Cuota completa (N° ${nextInstallment.cuota}).`;

        } else if (paymentType === 'multiple') {
            const numInstallments = parseInt(getDomElement('num_installments_to_pay').value);
            const maxAvailable = parseInt(getDomElement('max_installments_available').textContent);

            if (isNaN(numInstallments) || numInstallments < 1 || numInstallments > maxAvailable) {
                // Si el número es inválido o excede el máximo, usar el máximo disponible
                const finalNum = Math.min(Math.max(1, numInstallments || 1), maxAvailable);
                getDomElement('num_installments_to_pay').value = finalNum;
                amountToPayCapitalInterest = pendingInstallments.slice(0, finalNum)
                    .reduce((sum, item) => sum + parseFloat(item.monto), 0);
                paymentDescriptionText = `Pagando ${finalNum} cuota(s) consecutiva(s). (Ajuste por máximo disponible)`;
            } else {
                amountToPayCapitalInterest = pendingInstallments.slice(0, numInstallments)
                    .reduce((sum, item) => sum + parseFloat(item.monto), 0);
                paymentDescriptionText = `Pagando ${numInstallments} cuota(s) consecutiva(s).`;
            }

        } else {
            // Caso de fallback
            paymentDescriptionText = "Tipo de pago no reconocido. Por favor, seleccione una opción válida.";
            amountToPayCapitalInterest = 0;
        }
    }

    const moraToCharge = (amountToPayCapitalInterest > 0) ? moraInfo.totalMora : 0;

    calculatedPaymentData = {
        amount: amountToPayCapitalInterest,
        mora: moraToCharge
    };

    const totalToCollect = calculatedPaymentData.amount + calculatedPaymentData.mora;
    const selectedMethod = document.querySelector('input[name="quick_payment_method"]:checked')?.value;

    let isPaymentAllowed = true;

    // **MODIFICACIÓN 3: Lógica de restricción de monto para Yape/Plin**
    if (selectedMethod === 'Yape/Plin' && totalToCollect > MP_LIMIT_YAPE) {
        isPaymentAllowed = false;
        paymentDescriptionText = `❌ Monto (S/ ${totalToCollect.toFixed(2)}) excede el límite de Yape/Plin (S/ ${MP_LIMIT_YAPE.toFixed(2)}). Seleccione otro método.`;
    }

    getDomElement('summary-capital-interest').textContent = `S/ ${calculatedPaymentData.amount.toFixed(2)}`;
    getDomElement('summary-mora').textContent = `S/ ${calculatedPaymentData.mora.toFixed(2)}`;
    getDomElement('summary-total').textContent = `S/ ${totalToCollect.toFixed(2)}`;
    getDomElement('payment_description').textContent = paymentDescriptionText;

    // Habilitar el botón solo si hay un monto mayor a cero, se seleccionó un método Y no hay restricción.
    if (totalToCollect > 0 && selectedMethod && isPaymentAllowed) {
        getDomElement('confirmQuickPaymentBtn').disabled = false;
    } else {
        getDomElement('confirmQuickPaymentBtn').disabled = true;
    }
}

async function handleQuickPaymentSubmit() {
    if (!currentLoanForQuickPayment || calculatedPaymentData.amount === 0) {
        alert("Error: El monto a pagar no ha sido calculado o es cero. Por favor, asegúrese de seleccionar un préstamo y cuotas.");
        return;
    }

    const selectedMethod = document.querySelector('input[name="quick_payment_method"]:checked')?.value;
    if (!selectedMethod) {
        alert("Por favor, selecciona un método de pago.");
        return;
    }

    // La fecha de registro es la fecha actual no editable
    const paymentDate = getTodayDateISO();

    const totalToCollect = calculatedPaymentData.amount + calculatedPaymentData.mora;

    // Validar restricción de monto nuevamente antes del envío
    if (selectedMethod === 'Yape/Plin' && totalToCollect > MP_LIMIT_YAPE) {
        alert(`Operación cancelada: El monto total de S/ ${totalToCollect.toFixed(2)} excede el límite de S/ ${MP_LIMIT_YAPE.toFixed(2)} para Yape/Plin.`);
        return;
    }

    // 🚨 MODIFICACIÓN CRÍTICA: Redondear a 2 decimales y convertir a número
    const totalToCollectRounded = Math.round(totalToCollect * 100) / 100;
    const amountCIRounded = Math.round(calculatedPaymentData.amount * 100) / 100;
    const moraRounded = Math.round(calculatedPaymentData.mora * 100) / 100;

    const paymentData = {
        payment_amount: totalToCollectRounded,
        mora_amount: moraRounded,
        payment_method: selectedMethod,
        payment_date: paymentDate
    };

    const loan = currentLoanForQuickPayment;

    // Si es Transferencia o Yape/Plin, se usa Izipay.
    if (selectedMethod === 'Transferencia' || selectedMethod === 'Yape/Plin') {
        if (!confirm(`Se generará un enlace de pago de S/ ${totalToCollectRounded.toFixed(2)} mediante Izipay para que el cliente pague desde su dispositivo. ¿Continuar?`)) {
            return;
        }

        getDomElement('quick-payment-summary-section').style.display = 'none';

        try {
            // 🚨 CAMBIO CRÍTICO: Llamada a la nueva ruta de IZIPAY
            const response = await fetch(`${API_URL}/api/izipay/create-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // 🚨 CRÍTICO: Enviar números redondeados como strings con exactamente 2 decimales
                    amount: totalToCollectRounded.toFixed(2),
                    loanId: loan.id,
                    clientDni: loan.dni,
                    clientName: loan.nombres,
                    clientLastName: loan.apellidos,
                    payment_date: paymentDate,
                    amount_ci: amountCIRounded.toFixed(2),
                    amount_mora: moraRounded.toFixed(2)
                })
            });

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = { error: 'Error de formato (Estado: ' + response.status + ' ' + response.statusText + ')', status: response.status };
                }
                throw new Error(`(${response.status}) Error de Izipay. Detalles: ${errorData.error || errorData.message || JSON.stringify(errorData)}`);
            }

            const izpData = await response.json();
            const izpUrl = izpData.url;

            if (izpUrl) {
                // 🚨 CAMBIO: Pasar la URL y datos de Izipay
                showCheckoutLinkModal(izpUrl, totalToCollectRounded, selectedMethod, `${loan.nombres} ${loan.apellidos}`, izpData.correlativo_boleta || 'N/A');
                return;
            } else {
                throw new Error("El backend no proporcionó un URL de pago válido de Izipay.");
            }

        } catch (error) {
            alert(`❌ Error al iniciar el pago con Izipay. Detalles: ${error.message}`);
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
                let errorDetail = 'Error desconocido del servidor.';
                try {
                    const errorData = await response.json();
                    errorDetail = errorData.error || errorData.message || JSON.stringify(errorData);
                } catch (e) {
                    errorDetail = `Error de formato (Estado: ${response.status} ${response.statusText})`;
                }
                throw new Error(`(${response.status}) ${errorDetail}`);
            }

            const loan = currentLoanForQuickPayment;
            const successData = await response.json();

            const paymentWithDetails = {
                ...paymentData,
                correlativo_boleta: successData.correlativo_boleta,
                transaction_id: successData.transaction_id
            };

            showReceipt(paymentWithDetails, loan);
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
    let totalPaid = loan.total_paid || 0; // Total pagado (Capital/Interés)

    for (const item of schedule) {
        const dueDate = new Date(item.fecha);
        dueDate.setHours(0, 0, 0, 0);

        if (dueDate <= today) {
            // Se calcula la expectativa acumulada de Capital/Interés
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
    // 🚨 CORRECCIÓN: Convertir la tasa de interés mensual (loan.interes) a decimal
    const monthlyInterestRate = parseFloat(loan.interes) / 100;
    const principal = parseFloat(loan.monto);
    const schedule = [];
    let payments = {};
    const startDate = new Date(loan.fecha);

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

        // Si el plazo restante es 0 o negativo, el total due es solo el interés.
        if (remainingTerm <= 0) {
            const totalDue = interestOnlyPayment * loan.plazo;
            return { payments, schedule, totalDue: parseFloat(totalDue.toFixed(2)) };
        }

        // Si hay plazo restante, calcular amortizado
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

        const totalDue = (interestOnlyPayment * loan.meses_solo_interes) + (amortizedPayment * remainingTerm);
        return { payments, schedule, totalDue: parseFloat(totalDue.toFixed(2)) };

    } else {
        // Cálculo Amortizado estándar
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

        const totalDue = monthlyPayment * loan.plazo;
        return { payments, schedule, totalDue: parseFloat(totalDue.toFixed(2)) };
    }
}


function getTodayDateISO() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- FETCH Y RENDER ---
async function fetchAndRenderLoans() {
    try {
        const response = await fetch(`${API_URL}/api/loans`); // <--- Fallo potencial
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
            // Nota: Estos encabezados ya existen en front.html, pero se deja por seguridad
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
// --- NUEVO: Lógica de Indicador de Mora ---
    const hasLateLoans = loans.some(loan => loan.status === 'Atrasado' || loan.mora_pendiente > 0);
    const moraIndicator = getDomElement('moraAlertIndicator');
    if (moraIndicator) {
        moraIndicator.style.display = hasLateLoans ? 'inline-block' : 'none';
        if (hasLateLoans) {
            moraIndicator.title = '¡ATENCIÓN! Hay préstamos con mora.';
        }
    }
// --- NUEVO: Lógica de Indicador de Mora ---
    clients.clear();
    loans.forEach(loan => clients.add(loan.dni));

    const today = getTodayDateISO();
    const collectedToday = loans.reduce((sum, loan) => {
        if (!loan.payments) return sum;
        // payment_amount es el monto TOTAL (CI + Mora)
        return sum + loan.payments
            .filter(p => p.payment_date.split('T')[0] === today)
            .reduce((pSum, p) => pSum + parseFloat(p.payment_amount), 0);
    }, 0);


    getDomElement('totalLoaned').textContent = `S/ ${totalLoaned.toFixed(2)}`;
    getDomElement('activeLoans').textContent = activeLoans;
    getDomElement('totalClients').textContent = clients.size;
    getDomElement('collectedToday').textContent = `S/ ${collectedToday.toFixed(2)}`;
}

/**
 * Genera un Data URL para un código QR a partir de un texto.
 * Utiliza la librería global QRCode.js (asumido que está cargada).
 * @param {string} text Texto a codificar.
 * @param {number} size Tamaño del QR.
 * @returns {string} Data URL de la imagen QR.
 */
function generateQrDataURL(text, size) {
    if (typeof QRCode === 'undefined') {
        console.error("QRCode.js no está cargado.");
        return '';
    }
    const tempDiv = document.createElement('div');
    new QRCode(tempDiv, {
        text: text,
        width: size,
        height: size,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    // Esperar un ciclo para que el QR se genere en el DOM
    // Esto es un workaround síncrono para obtener el data URL
    const canvas = tempDiv.querySelector('canvas');
    if (canvas) {
        const dataURL = canvas.toDataURL('image/png');
        tempDiv.remove(); // Limpiar el elemento temporal
        return dataURL;
    }

    tempDiv.remove();
    return '';
}

// --- REEMPLAZA TODA LA FUNCIÓN showReceipt POR ESTA (VERSIÓN SIN VENCIMIENTOS) ---
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

    // Generar Correlativo y Transaction ID
    const transactionId = payment.transaction_id || `TRX-${Math.floor(Math.random() * 90000000) + 10000000}`;
    const correlativo = payment.correlativo_boleta || (Math.floor(Math.random() * 999999) + 1);

    // 1. OBTENER FECHA DE PAGO (EMISIÓN)
    // Usamos split para asegurar que la fecha se lea correctamente sin errores de zona horaria
    const partsPago = payment.payment_date.split('-'); 
    const pDateLocal = new Date(partsPago[0], partsPago[1] - 1, partsPago[2]); 
    const paymentDateStr = pDateLocal.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaSimulada = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });

    // Determinar si es FACTURA (RUC 11 dígitos) o BOLETA
    const esFactura = loan.dni && loan.dni.length === 11;
    const tipoComprobante = esFactura ? 'FACTURA ELECTRÓNICA' : 'BOLETA DE VENTA ELECTRÓNICA';
    const serieComprobante = esFactura ? 'E001' : 'B002';

    // Generar QR
    const qrText = `|${RUC_EMPRESA}|${esFactura ? '01' : '03'}|${serieComprobante}|${correlativo}|${totalPagado.toFixed(2)}|${paymentDateStr}|${loan.dni}|`;
    const qrDataUrl = generateQrDataURL(qrText, 100);

    // =========================================================
    // DISEÑO 1: FACTURA (SIN VENCIMIENTO Y SIN TEXTO SUNAT)
    // =========================================================
    if (esFactura) {
        receiptContent.innerHTML = `
            <div class="receipt-container" style="max-width: 800px; margin: 0 auto; border: 1px solid #000; background: white; font-family: Arial, sans-serif; color: #000; padding: 0;">
                
                <div style="display: flex; justify-content: space-between; padding: 15px; border-bottom: 1px solid #000;">
                    <div style="width: 60%;">
                        <img src="assets/logo-verde.png" alt="Logo" style="height: 60px; margin-bottom: 10px;">
                        <h3 style="margin: 0; font-size: 16px; font-weight: bold;">${RAZON_SOCIAL_EMPRESA}</h3>
                        <p style="margin: 2px 0; font-size: 11px;">${DIRECCION_EMPRESA}</p>
                        <p style="margin: 2px 0; font-size: 11px;">LIMA - PERÚ</p>
                    </div>
                    
                    <div style="width: 35%; border: 2px solid #000; text-align: center; padding: 10px 0;">
                        <p style="margin: 5px 0; font-size: 14px; font-weight: bold;">R.U.C.: ${RUC_EMPRESA}</p>
                        <p style="margin: 5px 0; font-size: 14px; font-weight: bold; background-color: #f0f0f0; padding: 5px 0;">${tipoComprobante}</p>
                        <p style="margin: 5px 0; font-size: 14px;">${serieComprobante} - ${correlativo.toString().padStart(8, '0')}</p>
                    </div>
                </div>

                <div style="padding: 10px 15px; font-size: 11px; line-height: 1.6;">
                    <div style="display: flex; justify-content: space-between;">
                        <div style="width: 65%;">
                            <table style="width: 100%; border: none;">
                                <tr>
                                    <td style="font-weight: bold; width: 140px;">Fecha de Emisión</td>
                                    <td>: ${paymentDateStr}</td>
                                </tr>
                                <tr><td style="font-weight: bold;">Señor(es)</td><td>: ${loan.nombres}</td></tr>
                                <tr><td style="font-weight: bold;">RUC</td><td>: ${loan.dni}</td></tr>
                                <tr><td style="font-weight: bold;">Tipo de Moneda</td><td>: SOLES</td></tr>
                            </table>
                        </div>
                        <div style="width: 30%; text-align: right;">
                             <div style="border: 1px solid #000; padding: 3px; display: inline-block; font-size: 10px;">Forma de pago: ${paymentMethod}</div>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 10px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                        <thead>
                            <tr style="border-top: 1px solid #000; border-bottom: 1px solid #000;">
                                <th style="padding: 5px; text-align: center;">Cantidad</th>
                                <th style="padding: 5px; text-align: center;">Unidad Medida</th>
                                <th style="padding: 5px; text-align: left;">Código</th>
                                <th style="padding: 5px; text-align: left;">Descripción</th>
                                <th style="padding: 5px; text-align: right;">Valor Unitario</th>
                                <th style="padding: 5px; text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="padding: 5px; text-align: center;">1.00</td>
                                <td style="padding: 5px; text-align: center;">UNIDAD</td>
                                <td style="padding: 5px;">SERV01</td>
                                <td style="padding: 5px;">CUOTA PRÉSTAMO Y/O INTERESES</td>
                                <td style="padding: 5px; text-align: right;">${capitalInteresPagado.toFixed(2)}</td>
                                <td style="padding: 5px; text-align: right;">${capitalInteresPagado.toFixed(2)}</td>
                            </tr>
                            ${moraPagada > 0 ? `
                            <tr>
                                <td style="padding: 5px; text-align: center;">1.00</td>
                                <td style="padding: 5px; text-align: center;">UNIDAD</td>
                                <td style="padding: 5px;">MORA</td>
                                <td style="padding: 5px;">PENALIDAD POR ATRASO</td>
                                <td style="padding: 5px; text-align: right;">${moraPagada.toFixed(2)}</td>
                                <td style="padding: 5px; text-align: right;">${moraPagada.toFixed(2)}</td>
                            </tr>` : ''}
                        </tbody>
                    </table>
                </div>

                <div style="border-top: 1px solid #000; display: flex; font-size: 11px;">
                    <div style="width: 60%; padding: 10px;">
                        <p style="margin: 5px 0;"><strong>Valor de Venta de Operaciones Gratuitas : S/ 0.00</strong></p>
                        <p style="margin: 15px 0; font-weight: bold;">SON: ${numeroALetras(totalPagado)} SOLES</p>
                        
                        <div style="border: 1px solid #000; padding: 5px; margin-top: 10px;">
                            <p style="margin: 2px 0;"><strong>Información del crédito</strong></p>
                            <p style="margin: 2px 0;">Monto neto pendiente de pago : S/ 0.00 (Cancelado)</p>
                        </div>
                    </div>

                    <div style="width: 40%; border-left: 1px solid #000;">
                         <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="padding: 3px 10px; text-align: right;">Sub Total Ventas :</td><td style="padding: 3px 10px; text-align: right;">S/ ${totalPagado.toFixed(2)}</td></tr>
                            <tr><td style="padding: 3px 10px; text-align: right;">Op. Gravada :</td><td style="padding: 3px 10px; text-align: right;">S/ ${totalPagado.toFixed(2)}</td></tr>
                            <tr><td style="padding: 3px 10px; text-align: right;">IGV (0%) :</td><td style="padding: 3px 10px; text-align: right;">S/ 0.00</td></tr> 
                            <tr><td style="padding: 3px 10px; text-align: right; border-top: 1px solid #000; font-weight: bold;">Importe Total :</td><td style="padding: 3px 10px; text-align: right; border-top: 1px solid #000; font-weight: bold;">S/ ${totalPagado.toFixed(2)}</td></tr>
                         </table>
                    </div>
                </div>
                </div>
        `;
    } 
    // =========================================================
    // DISEÑO 2: BOLETA (SIN VENCIMIENTO)
    // =========================================================
    else {
        receiptContent.innerHTML = `
            <div class="receipt-container" style="width: 380px; margin: 0 auto; background: white; font-family: 'Courier New', Courier, monospace; color: #000; padding: 15px; border: 1px solid #ccc;">
                
                <div style="text-align: center; margin-bottom: 10px; background: #000; padding: 10px;">
                    <img src="assets/logo-verde.png" alt="Logo" style="height: 50px;">
                </div>

                <div style="text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 15px;">
                    <div style="font-size: 16px;">${RAZON_SOCIAL_EMPRESA}</div>
                    <div>RUC: ${RUC_EMPRESA}</div>
                    <div style="font-size: 12px; font-weight: normal;">${DIRECCION_EMPRESA}</div>
                </div>

                <div style="text-align: center; font-weight: bold; margin-bottom: 15px;">
                    <div style="font-size: 15px;">BOLETA DE VENTA ELECTRÓNICA</div>
                    <div style="font-size: 16px;">${serieComprobante} - ${correlativo.toString().padStart(8, '0')}</div>
                </div>

                <div style="text-align: center; margin-bottom: 10px; font-size: 13px;">
                    <div style="text-transform: uppercase;">${loan.nombres} ${loan.apellidos}</div>
                    <div>---</div>
                    <div style="font-weight: bold;">DNI ${loan.dni}</div>
                </div>

                <div style="border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 5px 0; margin-bottom: 10px; font-size: 12px; display: flex; justify-content: space-between;">
                    <span>FECHA: ${paymentDateStr}</span>
                    <span>HORA: ${horaSimulada}</span>
                </div>
                <table style="width: 100%; font-size: 12px; margin-bottom: 10px; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="text-align: left; border-bottom: 1px solid #000;">Cant</th>
                            <th style="text-align: left; border-bottom: 1px solid #000;">COD</th>
                            <th style="text-align: right; border-bottom: 1px solid #000;">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding-top: 5px;">1</td>
                            <td style="padding-top: 5px;">SERV</td>
                            <td style="text-align: right; padding-top: 5px;">${capitalInteresPagado.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td colspan="3" style="font-size: 11px;">CUOTA DE PRÉSTAMO</td>
                        </tr>
                        ${moraPagada > 0 ? `
                        <tr>
                            <td style="padding-top: 5px;">1</td>
                            <td style="padding-top: 5px;">MORA</td>
                            <td style="text-align: right; padding-top: 5px;">${moraPagada.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td colspan="3" style="font-size: 11px;">PENALIDAD POR ATRASO</td>
                        </tr>` : ''}
                    </tbody>
                </table>

                <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 13px; font-weight: bold;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>OP. GRAVADA</span>
                        <span>(S/) ${totalPagado.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>I.G.V</span>
                        <span>(S/) 0.00</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 18px; margin-top: 5px;">
                        <span>TOTAL</span>
                        <span>(S/) ${totalPagado.toFixed(2)}</span>
                    </div>
                </div>

                <div style="margin-top: 10px; font-size: 12px; border-bottom: 1px dashed #000; padding-bottom: 10px;">
                    SON: ${numeroALetras(totalPagado)} SOLES
                </div>

                <div style="margin-top: 10px; font-size: 12px;">
                    <div><strong>FORMA PAGO:</strong> ${paymentMethod.toUpperCase()}</div>
                </div>

                <div style="text-align: center; margin-top: 15px;">
                    <img src="${qrDataUrl}" alt="QR" style="width: 100px; height: 100px;">
                </div>

                <div style="text-align: center; font-size: 10px; margin-top: 10px; color: #555;">
                    <p style="margin: 0;">Representación Impresa de la BOLETA DE VENTA ELECTRÓNICA</p>
                    <p style="margin-top: 5px; font-weight: bold;">PrestaPro System</p>
                </div>

            </div>
        `;
    }

    openModal(getDomElement('receiptModal'));
    currentReceiptData = { payment, loan, totalPagado, paymentMethod, capitalInteresPagado, moraPagada, transactionId, correlativo, paymentDate: paymentDateStr };
}

function numeroALetras(num) {
    if (!/^\d+(\.\d{1,2})?$/.test(num)) return "CERO CON 00/100";

    const [entero, decimal] = num.toFixed(2).split('.').map(s => parseInt(s));

    const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVETENA'];
    const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    function convertirGrupo(n) {
        if (n === 0) return '';
        if (n < 10) return unidades[n];
        if (n >= 10 && n < 20) return especiales[n - 10];
        if (n >= 20 && n < 100) {
            const dec = Math.floor(n / 10);
            const uni = n % 10;
            return decenas[dec] + (uni > 0 ? ' Y ' + unidades[uni] : '');
        }
        if (n >= 100 && n < 1000) {
            const cent = Math.floor(n / 100);
            const resto = n % 100;
            const centenasStr = cent === 1 && resto === 0 ? 'CIEN' : centenas[cent];
            return centenasStr + (resto > 0 ? ' ' + convertirGrupo(resto) : '');
        }
        return '';
    }

    function convertirMiles(n) {
        if (n === 0) return 'CERO';
        if (n < 1000) return convertirGrupo(n);

        const miles = Math.floor(n / 1000);
        const resto = n % 1000;

        let milesStr = '';
        if (miles === 1) {
            milesStr = 'MIL';
        } else {
            milesStr = convertirGrupo(miles) + ' MIL';
        }

        return milesStr + (resto > 0 ? ' ' + convertirGrupo(resto) : '');
    }

    const letras = convertirMiles(entero);
    return `${letras} CON ${decimal.toString().padStart(2, '0')}/100`;
}

// MODIFICADA: Se corrigió la función para usar los nuevos estilos de PDF
function downloadReceipt() {
    if (!currentReceiptData) return;

    const {
        loan,
        totalPagado,
        paymentMethod,
        capitalInteresPagado,
        moraPagada,
        payment,
        transactionId,
        correlativo,
        paymentDate,
        valorVenta,
        IGV,
        subtotal
    } = currentReceiptData;

    // 🚨 USO del correlativo real
    const qrText = `|${RUC_EMPRESA}|03|B001|${correlativo.toString().padStart(8, '0')}|${totalPagado.toFixed(2)}|${IGV.toFixed(2)}|${paymentDate}|1|${loan.dni}|`;
    const qrDataUrl = generateQrDataURL(qrText, 100);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Colores corporativos
    const primaryColor = [93, 136, 255]; // Azul principal
    const darkColor = [52, 64, 84]; // Texto oscuro
    const grayColor = [100, 100, 100]; // Gris de labels
    const lightGray = [200, 200, 200]; // Gris claro para líneas
    const successColor = [76, 175, 80]; // Verde para total

    let yPos = 20;

    // ==================== HEADER (Mejorado) ====================
    doc.setFillColor(...primaryColor);
    doc.rect(14, yPos, 60, 12, 'F');
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.text("PRESTAPRO", 44, yPos + 8, { align: 'center' });

    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.8);
    doc.rect(130, yPos, 65, 35);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont(undefined, 'bold');
    doc.text(`R.U.C. N° ${RUC_EMPRESA}`, 162.5, yPos + 6, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(...primaryColor);
    doc.text("BOLETA DE VENTA", 162.5, yPos + 13, { align: 'center' });
    doc.text("ELECTRÓNICA", 162.5, yPos + 19, { align: 'center' });

    doc.setFontSize(11);
    doc.setTextColor(...darkColor);
    doc.setFont(undefined, 'bold');
    // 🚨 USO del correlativo real
    doc.text(`B001-${correlativo.toString().padStart(8, '0')}`, 162.5, yPos + 28, { align: 'center' });

    yPos += 2;
    doc.setFontSize(12);
    doc.setTextColor(...darkColor);
    doc.setFont(undefined, 'bold');
    doc.text(RAZON_SOCIAL_EMPRESA, 14, yPos + 13);

    doc.setFontSize(9);
    doc.setTextColor(...grayColor);
    doc.setFont(undefined, 'normal');
    doc.text(DIRECCION_EMPRESA, 14, yPos + 19);
    doc.text("Teléfono: (01) 123-4567", 14, yPos + 24);
    doc.text("Email: info@prestapro.com.pe", 14, yPos + 29);
    doc.setFontSize(8);
    doc.setFont(undefined, 'italic');
    doc.text("SERVICIOS DE PRÉSTAMOS PERSONALES", 14, yPos + 34);

    yPos += 42;
    doc.setDrawColor(...lightGray);
    doc.setLineWidth(0.3);
    doc.line(14, yPos, 196, yPos);
    yPos += 8;

    // ==================== DATOS DEL CLIENTE ====================
    doc.setFillColor(245, 247, 250);
    doc.rect(14, yPos, 182, 8, 'F');

    doc.setFontSize(10);
    doc.setTextColor(...primaryColor);
    doc.setFont(undefined, 'bold');
    doc.text("📋 DATOS DEL CLIENTE", 16, yPos + 5.5);

    yPos += 12;
    doc.setFontSize(9);
    doc.setTextColor(...grayColor);
    doc.setFont(undefined, 'normal');
    doc.text("Tipo/N° Documento:", 16, yPos);
    doc.setTextColor(...darkColor);
    doc.setFont(undefined, 'bold');
    doc.text(`DNI / ${loan.dni}`, 60, yPos);

    yPos += 6;
    doc.setTextColor(...grayColor);
    doc.setFont(undefined, 'normal');
    doc.text("Apellidos y Nombres:", 16, yPos);
    doc.setTextColor(...darkColor);
    doc.setFont(undefined, 'bold');
    doc.text(`${loan.nombres} ${loan.apellidos}`, 60, yPos);

    yPos += 6;
    doc.setTextColor(...grayColor);
    doc.setFont(undefined, 'normal');
    doc.text("Fecha de Emisión:", 16, yPos);
    doc.setTextColor(...darkColor);
    doc.setFont(undefined, 'bold');
    doc.text(paymentDate, 60, yPos);

    yPos += 10;
    doc.setDrawColor(...lightGray);
    doc.line(14, yPos, 196, yPos);
    yPos += 8;

    // ==================== DETALLE DE LA OPERACIÓN ====================
    doc.setFillColor(245, 247, 250);
    doc.rect(14, yPos, 182, 8, 'F');

    doc.setFontSize(10);
    doc.setTextColor(...primaryColor);
    doc.setFont(undefined, 'bold');
    doc.text("📄 DETALLE DE LA OPERACIÓN", 16, yPos + 5.5);

    yPos += 12;

    const tableData = [
        [
            `AMORTIZACIÓN PRÉSTAMO N° ${loan.id}\nCapital e Intereses - Cuota programada`,
            `S/ ${valorVenta.toFixed(2)}`,
            `S/ ${capitalInteresPagado.toFixed(2)}`
        ]
    ];

    if (moraPagada > 0) {
        tableData.push([
            'Mora / Penalidad por Atraso\nInterés moratorio aplicado',
            'S/ 0.00',
            `S/ ${moraPagada.toFixed(2)}`
        ]);
    }

    doc.autoTable({
        startY: yPos,
        head: [['DESCRIPCIÓN', 'VALOR VENTA', 'IMPORTE']],
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: primaryColor,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
            halign: 'center'
        },
        bodyStyles: {
            fontSize: 8,
            textColor: darkColor,
            cellPadding: 4
        },
        columnStyles: {
            0: { cellWidth: 100 },
            1: { halign: 'right', cellWidth: 35 },
            2: { halign: 'right', cellWidth: 35, fontStyle: 'bold' }
        },
        didParseCell: function(data) {
            // Resaltar mora en rojo
            if (data.row.index === 1 && moraPagada > 0 && data.column.index === 2) {
                data.cell.styles.textColor = [244, 67, 54];
            }
        }
    });

    yPos = doc.lastAutoTable.finalY + 10;

    // ==================== RESUMEN DE MONTOS (Mejorado) ====================

    const summaryX = 130;
    const summaryWidth = 66;

    // Subtotal
    doc.setFontSize(9);
    doc.setTextColor(...grayColor);
    doc.setFont(undefined, 'normal');
    doc.text("SUBTOTAL", summaryX, yPos);
    doc.setTextColor(...darkColor);
    doc.setFont(undefined, 'bold');
    doc.text(`S/ ${subtotal.toFixed(2)}`, summaryX + summaryWidth, yPos, { align: 'right' });

    yPos += 6;

    // IGV
    doc.setTextColor(...grayColor);
    doc.setFont(undefined, 'normal');
    doc.text("IGV (0%)", summaryX, yPos);
    doc.setTextColor(...darkColor);
    doc.setFont(undefined, 'bold');
    doc.text(`S/ ${IGV.toFixed(2)}`, summaryX + summaryWidth, yPos, { align: 'right' });

    yPos += 8;

    // Línea antes del total
    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.8);
    doc.line(summaryX, yPos - 2, summaryX + summaryWidth, yPos - 2);

    // Total
    doc.setFillColor(245, 250, 255);
    doc.rect(summaryX - 2, yPos - 3, summaryWidth + 4, 10, 'F');

    doc.setFontSize(11);
    doc.setTextColor(...primaryColor);
    doc.setFont(undefined, 'bold');
    doc.text("IMPORTE TOTAL", summaryX, yPos + 4);

    doc.setFontSize(13);
    doc.setTextColor(...successColor); // Verde para el total
    doc.text(`S/ ${totalPagado.toFixed(2)}`, summaryX + summaryWidth, yPos + 4, { align: 'right' });

    yPos += 18;

    // ==================== FOOTER (Mejorado con QR) ====================
    // --- QR Y TEXTO LEGAL EN DOS COLUMNAS ---
    const qrSize = 40;
    const qrX = 14;
    const qrY = yPos + 6;

    // 1. DIBUJAR EL QR REAL
    doc.setFontSize(8);
    doc.setTextColor(...darkColor);
    doc.setFont(undefined, 'bold');
    doc.text("Código QR SUNAT", qrX + (qrSize / 2), qrY - 3, { align: 'center' });

    // Dibuja la imagen QR generada (si existe)
    if (qrDataUrl.length > 100) {
        doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    } else {
        // Placeholder si falla la generación del DataURL
        doc.setDrawColor(...darkColor);
        doc.setLineWidth(0.5);
        doc.rect(qrX, qrY, qrSize, qrSize);
        doc.setFontSize(6);
        doc.setTextColor(150, 150, 150);
        doc.text("QR No Disponible", qrX + (qrSize / 2), qrY + 15, { align: 'center' });
    }

    // 2. Información en letras y detalles (Columna derecha)
    const infoX = qrX + qrSize + 10;
    let infoY = yPos;

    doc.setDrawColor(...lightGray);
    doc.setLineWidth(0.3);
    doc.line(infoX - 5, yPos, infoX - 5, yPos + 75); // Línea divisoria vertical

    // Monto en letras (Destacado)
    infoY += 6;
    doc.setFillColor(255, 249, 230); // Color amarillo claro
    doc.setDrawColor(255, 193, 7); // Borde amarillo
    doc.setLineWidth(0.5);
    doc.rect(infoX, infoY, 196 - infoX - 10, 12, 'FD');

    doc.setFontSize(9);
    doc.setTextColor(...darkColor);
    doc.setFont(undefined, 'bold');
    doc.text("SON:", infoX + 2, infoY + 5);
    doc.setFont(undefined, 'normal');
    doc.text(numeroALetras(totalPagado) + " SOLES", infoX + 2, infoY + 9);

    infoY += 16;
    doc.setFontSize(8);
    doc.setTextColor(...grayColor);
    doc.setFont(undefined, 'bold');
    doc.text("Forma de Pago: ", infoX, infoY);
    doc.setFont(undefined, 'normal');
    doc.text(paymentMethod, infoX + 26, infoY);

    doc.setFont(undefined, 'bold');
    doc.text("ID Transacción: ", infoX + 60, infoY);
    doc.setFont(undefined, 'normal');
    doc.text(transactionId, infoX + 86, infoY);

    infoY += 6;
    doc.setFont(undefined, 'bold');
    doc.text("Observaciones: ", infoX, infoY);
    doc.setFont(undefined, 'normal');
    doc.text(`Pago correspondiente al préstamo N° ${loan.id}. Operación registrada correctamente.`, infoX + 28, infoY);

    infoY += 8;
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont(undefined, 'italic');
    const legalText = doc.splitTextToSize(
        'Representación impresa de la Boleta de Venta Electrónica. Puede verificar este documento en www.sunat.gob.pe. Este es un documento simulado para fines demostrativos.',
        196 - infoX - 10
    );
    doc.text(legalText, infoX, infoY);

    // Actualizar yPos al final del QR + Info
    yPos = Math.max(qrY + qrSize + 10, infoY + legalText.length * 5 + 5);

    // Marca de agua (opcional)
    doc.setTextColor(200, 200, 200);
    doc.setFontSize(40);
    doc.setFont(undefined, 'bold');
    doc.text('SIMULACIÓN', 105, 150, {
        align: 'center',
        angle: 45
    });

    // Guardar el PDF
    // 🚨 USO del correlativo real para el nombre del archivo
    const fileName = `Boleta_B001-${correlativo.toString().padStart(8, '0')}_${loan.apellidos}.pdf`;
    doc.save(fileName);
}

function toggleFormLock(locked) {
    const loanForm = getDomElement('loanForm');
    const formElements = loanForm.querySelectorAll('input, button, select');
    const fieldsets = loanForm.querySelectorAll('fieldset');
    formElements.forEach(element => {
        // 🚨 CAMBIO CRÍTICO: No bloquear la selección de tipo de documento
        if (element.id !== 'doc_id' && element.id !== 'doc_type') {
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
    const modalHeaderH2 = getDomElement('detailsModal').querySelector('.modal-header h2');

    modalHeaderH2.textContent = 'Cronograma y Detalles'; // Solo texto, sin imagen
    modalHeaderH2.style = "";

    const summaryInfoDiv = getDomElement('detailsModal').querySelector('.modal-body .summary-info');
    if(summaryInfoDiv) {
        // Usar los estilos definidos en el CSS para la pantalla (var(--border-color))
        summaryInfoDiv.style.border = "1px solid var(--border-color)";
    }

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

    // 🚨 MODIFICACIÓN: Calcular TASA ANUAL para mostrarla, ya que solo guardamos la mensual (loan.interes)
    const interesAnualMostrado = (loan.interes * 12).toFixed(2);

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
            // 🚨 CAMBIO: Incluir el correlativo y transaction_id en el botón
            const correlativo = p.correlativo_boleta || '';
            const transactionId = p.transaction_id || '';

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${new Date(p.payment_date).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</td>
                    <td>S/ ${capitalInteresPagado}</td>
                    <td>S/ ${moraPagada}</td>
                    <td>${p.payment_method || 'Efectivo'}</td>
                    <td><button class="button button-secondary button-sm view-receipt-btn" 
                        data-loan-id="${loan.id}" 
                        data-payment-index="${index}"
                        data-correlativo="${correlativo}"
                        data-transaction="${transactionId}">Ver 🧾</button></td>
                </tr>`
        }).join('');

        // 🚨 CRÍTICO: SE ELIMINA EL LISTENER DELEGADO QUE ESTABA AQUÍ
        // Ahora se usa la delegación en initPaymentListeners()
    } else {
        paymentHistoryBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: #9CA3AF;">No hay pagos registrados.</td></tr>';
    }

    openModal(getDomElement('detailsModal'));
}


// En public/logica.js -> Reemplaza printSchedule

function printSchedule() {
    // 1. Clonar contenido
    const contentToPrint = document.querySelector('#detailsModal .printable').cloneNode(true);

    // 2. INYECTAR LOGO GRANDE (Solo impresión)
    const headerTitle = contentToPrint.querySelector('.modal-header h2');
    if (headerTitle) {
        headerTitle.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; border-bottom: 2px solid #000; padding-bottom: 15px;">
                <span style="color: #000; font-weight: 700; font-size: 24px;">Cronograma y Detalles</span>
                <img src="assets/presta-logo.png" style="height: 110px; width: auto;" alt="Logo">
            </div>
        `;
    }

    // 3. LIMPIEZA TABLAS
    const paymentTable = contentToPrint.querySelector('#paymentHistoryTable');
    if (paymentTable) {
        const headerRow = paymentTable.querySelector('thead tr');
        if (headerRow && headerRow.cells.length > 0) headerRow.deleteCell(-1);
        const bodyRows = paymentTable.querySelectorAll('tbody tr');
        bodyRows.forEach(row => { if (row.cells.length > 0) row.deleteCell(-1); });
    }

    // 4. ESTILOS NEGROS PARA RESUMEN
    const summaryInfo = contentToPrint.querySelector('#scheduleSummary');
    if (summaryInfo) {
        summaryInfo.style.border = '2px solid #000';
        summaryInfo.style.color = '#000';
        summaryInfo.style.backgroundColor = '#fff';
        const textElements = summaryInfo.querySelectorAll('*');
        textElements.forEach(el => el.style.color = '#000');
    }

    // 5. IFRAME
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
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
                @page { margin: 15mm; size: A4; }
                body { font-family: 'Poppins', sans-serif; font-size: 12px; color: #000; -webkit-print-color-adjust: exact; }
                
                .modal-header h2 { margin: 0; padding: 0; width: 100%; }
                .summary-info { padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                
                /* TABLAS BLANCAS CON BORDE NEGRO */
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th { 
                    background-color: #FFFFFF !important; 
                    color: #000000 !important; 
                    border: 1px solid #000000 !important;
                    padding: 8px; text-align: left; font-size: 10px; font-weight: 700;
                }
                td { border: 1px solid #000000; padding: 8px; font-size: 11px; color: #000000; }
                
                button, .close-button { display: none !important; }
            </style>
        </head>
        <body>
            ${contentToPrint.innerHTML}
        </body>
        </html>
    `);
    iframeDoc.close();

    iframe.onload = function() {
        setTimeout(function() {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => { document.body.removeChild(iframe); }, 500);
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
        let finalY = 40; // Inicializar finalY después del encabezado

        // 🚨 MODIFICACIÓN: Usar tasa anual calculada
        const interesAnualMostrado = (loan.interes * 12).toFixed(2);

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
        finalY = 70; // Ajustar finalY después de los datos generales

        if (parseFloat(loan.monto) > VALOR_UIT || loan.is_pep) {
            finalY += 10;
            doc.setFontSize(14); doc.setTextColor(52, 64, 84); doc.text("Declaración Jurada de Origen de Fondos", 105, finalY, { align: 'center' });
            finalY += 8;
            const textoDeclaracion = `Yo, ${loan.nombres} ${loan.apellidos}, identificado(a) con DNI N° ${loan.dni}, declaro bajo juramento que los fondos y/o bienes utilizados en la operación de préstamo de S/ ${parseFloat(loan.monto).toFixed(2)} provienen de actividades lícitas y no están vinculados con el lavado de activos, financiamiento del terrorismo ni cualquier otra actividad ilegal.`;
            doc.setFontSize(10); doc.setTextColor(100, 100, 100);
            const splitText = doc.splitTextToSize(textoDeclaracion, 180);
            doc.text(splitText, 14, finalY);
            finalY += (splitText.length * 5) + 15;
            doc.text("_________________________", 105, finalY, { align: 'center' });
            finalY += 5;
            doc.text(`${loan.nombres} ${loan.apellidos}`, 105, finalY, { align: 'center' });
            finalY += 10;
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
                .catch((error) => {
                    if (error.name !== 'AbortError') {
                        console.log('Error al compartir, iniciando descarga:', error);
                        descargarPDF(doc, fileName);
                    }
                });
        } else {
            descargarPDF(doc, fileName); // Fallback si no hay soporte nativo
        }

    } catch (error) { console.error('Error al generar PDF:', error); alert('Hubo un error al generar el PDF.'); }
}

function descargarPDF(doc, fileName) {
    doc.save(fileName);
    console.log('PDF descargado:', fileName);
}

// MODIFICADA: Se corrigió la función para usar los nuevos estilos de impresión
function printModalContent(contentElement) {
    if (!contentElement) {
        alert('No se pudo acceder al contenido para imprimir.');
        return;
    }

    // Crear iframe temporal
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow.document;
    iframeDoc.open();

    // HTML completo con estilos para impresión (Copiado de la lógica CSS)
    iframeDoc.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Boleta de Venta - PrestaPro</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
                @page { 
                    margin: 15mm; 
                    size: A4; 
                }
                
                * { 
                    box-sizing: border-box; 
                    margin: 0;
                    padding: 0;
                }
                
                body { 
                    font-family: 'Poppins', sans-serif; 
                    font-size: 12px; 
                    line-height: 1.6; 
                    color: #000;
                    background: white;
                }

                .receipt-container {
                    max-width: 100%;
                    border: 2px solid #000;
                    background: white;
                    padding: 0;
                    margin: 0 auto;
                }

                /* Header */
                .receipt-header.sunat-header {
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: 20px;
                    padding: 25px 30px;
                    border-bottom: 3px solid #000;
                    background: white;
                }

                .sunat-company-info {
                    text-align: left;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    gap: 4px;
                }

                .sunat-company-info p:first-child {
                    font-size: 18px;
                    font-weight: 700;
                    color: #000;
                    margin: 0 0 8px 0;
                    letter-spacing: 0.5px;
                }

                .sunat-company-info p {
                    font-size: 12px;
                    color: #333;
                    line-height: 1.6;
                    margin: 0;
                }
                
                .sunat-company-info p:last-child {
                    font-size: 11px;
                    color: #666;
                    font-style: italic;
                    margin-top: 4px;
                }

                .sunat-ruc-box {
                    text-align: center;
                    border: 3px solid #000;
                    padding: 15px 20px;
                    border-radius: 12px;
                    background: white;
                    min-width: 220px;
                    box-shadow: none; /* Sin sombra al imprimir */
                }

                .sunat-ruc-box strong {
                    display: block;
                    font-size: 13px;
                    color: #000;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    margin-bottom: 8px;
                }

                .sunat-ruc-box h3 {
                    color: #000;
                    margin: 8px 0;
                    font-size: 16px;
                    font-weight: 700;
                    line-height: 1.3;
                    text-transform: uppercase;
                }

                .sunat-ruc-box p {
                    margin: 6px 0 0 0;
                    font-size: 14px;
                    color: #000;
                    font-weight: 600;
                    letter-spacing: 1px;
                }

                /* Secciones */
                .receipt-section {
                    padding: 20px 30px;
                    border-bottom: 1px solid #ddd;
                    page-break-inside: avoid;
                }

                .receipt-section:last-of-type {
                    border-bottom: none;
                }

                .receipt-section h4 {
                    margin: 0 0 12px 0;
                    color: #000;
                    font-size: 13px;
                    font-weight: 700;
                    text-transform: uppercase;
                    padding-bottom: 8px;
                    border-bottom: 2px solid #ccc;
                }

                .receipt-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 10px 0;
                    border-bottom: 1px dashed #ccc;
                    align-items: center;
                }

                .receipt-row:last-child {
                    border-bottom: none;
                }

                .receipt-label {
                    color: #666;
                    font-size: 13px;
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }

                .receipt-value {
                    color: #000;
                    font-weight: 600;
                    font-size: 14px;
                    text-align: right;
                }

                /* Tabla */
                .receipt-detail-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 12px;
                }

                .receipt-detail-table thead tr {
                    background: #f0f0f0;
                }

                .receipt-detail-table th {
                    padding: 12px 10px;
                    text-align: left;
                    color: #000;
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border: 1px solid #000;
                }

                .receipt-detail-table th:nth-child(2),
                .receipt-detail-table th:nth-child(3) {
                    text-align: right;
                }

                .receipt-detail-table td {
                    padding: 12px 10px;
                    font-size: 13px;
                    color: #000;
                    border: 1px solid #000;
                }

                .receipt-detail-table td:nth-child(2),
                .receipt-detail-table td:nth-child(3) {
                    text-align: right;
                    font-weight: 600;
                }

                .receipt-detail-table tbody tr:last-child td {
                    border-bottom: 1px solid #000;
                }


                /* Resumen */
                .receipt-summary-box {
                    display: flex;
                    justify-content: flex-end;
                    padding: 20px 30px 10px 30px;
                }

                .receipt-summary-content {
                    width: 100%;
                    max-width: 320px;
                }

                .summary-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 10px 0;
                    font-size: 14px;
                    border-bottom: 1px dashed #ccc;
                }

                .summary-item span:first-child {
                    color: #666;
                    font-weight: 500;
                    text-transform: uppercase;
                    font-size: 12px;
                    letter-spacing: 0.3px;
                }

                .summary-item .receipt-value {
                    font-size: 15px;
                    font-weight: 700;
                }

                .summary-item.summary-total {
                    margin-top: 6px;
                    padding-top: 12px;
                    border-top: 3px solid #000;
                    border-bottom: none;
                }

                .summary-item.summary-total span:first-child {
                    color: #000;
                    font-size: 14px;
                    font-weight: 700;
                }

                .summary-item.summary-total .receipt-value {
                    color: #2e7d32; /* Verde oscuro */
                    font-size: 20px;
                    font-weight: 700;
                }

                /* Footer */
                .receipt-footer {
                    padding: 20px 30px;
                    background: white;
                    border-top: 2px solid #000;
                    page-break-inside: avoid;
                    display: flex;
                    gap: 20px;
                    align-items: flex-start;
                }

                .receipt-footer .qr-code-container {
                    flex-shrink: 0; 
                    text-align: center; 
                    border: 1px solid #000; 
                    padding: 10px; 
                    border-radius: 8px;
                }
                
                .receipt-footer .qr-code-container img {
                    width: 100px; 
                    height: 100px; 
                    display: block; 
                    margin: 0 auto;
                }

                .receipt-footer .amount-in-words {
                    background-color: #ffffe0;
                    padding: 10px 15px;
                    border-radius: 6px;
                    border-left: 4px solid #ffa000;
                    margin: 10px 0;
                }
                
                .receipt-footer p {
                    color: #000;
                    font-size: 12px;
                    line-height: 1.6;
                    margin: 6px 0;
                }

                .receipt-footer p:first-child {
                    font-weight: 600;
                    color: #000;
                }

                .receipt-footer p:last-child {
                    font-size: 10px;
                    color: #666;
                    font-style: italic;
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px dashed #ccc;
                }
                
                /* Ocultar elementos que no se deben imprimir */
                .close-button,
                button {
                    display: none !important;
                }
            </style>
        </head>
        <body>
            ${contentElement.innerHTML}
        </body>
        </html>
    `);

    iframeDoc.close();

    // Esperar a que cargue y luego imprimir
    iframe.onload = function() {
        setTimeout(function() {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();

            // Remover iframe después de imprimir
            setTimeout(() => {
                document.body.removeChild(iframe);
            }, 100);
        }, 500);
    };
}


// ==========================================
// --- LÓGICA DE TEMAS Y USUARIO (NUEVO) ---
// ==========================================

function setTheme(themeName) {
    const html = document.documentElement;
    localStorage.setItem('theme', themeName);

    if (themeName === 'system') {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        html.setAttribute('data-theme', systemDark ? 'dark' : 'light');
    } else {
        html.setAttribute('data-theme', themeName);
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'system';
    setTheme(savedTheme);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (localStorage.getItem('theme') === 'system') {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });


}

// Exponer globalmente
window.setTheme = setTheme;

// --- UTILIDAD: ACTUALIZAR RELOJ ---
function updateClock() {
    const now = new Date();
    const dateOptions = { day: '2-digit', month: 'short', year: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };

    const dateStr = now.toLocaleDateString('es-PE', dateOptions);
    const timeStr = now.toLocaleTimeString('es-PE', timeOptions);

    const displayElement = getDomElement('currentDateTime');
    if (displayElement) {
        displayElement.textContent = `${dateStr.toUpperCase()} | ${timeStr}`;
    }
}

// ==========================================
// --- LÓGICA DE COMPARTIR FINAL (SIN ALERTAS) ---
// ==========================================

function handleSmartShare(platform) {
    let subject, bodyText;

    // A. LÓGICA PARA RECIBOS (PAGOS)
    if (currentShareType === 'receipt') {
        if (!currentReceiptData) return;

        // 1. Descarga silenciosa
        downloadReceipt();

        // 2. Preparar texto
        const { loan, totalPagado } = currentReceiptData;
        subject = `Comprobante de Pago - ${loan.nombres} ${loan.apellidos}`;
        bodyText = `Hola, adjunto el comprobante de pago por S/ ${totalPagado.toFixed(2)}.`;
    }

    // B. LÓGICA PARA DETALLES (PRÉSTAMOS)
    else if (currentShareType === 'details') {
        if (!currentLoanForDetails) return;

        // SI ES WINDOWS NATIVO, USAMOS LA FUNCIÓN VIEJA Y SALIMOS
        if (platform === 'native') {
            compartirPDF(); // Esta sí abre el menú gris
            closeModal(getDomElement('shareOptionsModal'));
            return;
        }

        // 1. Descarga silenciosa (Usando la nueva función que NO abre menús)
        descargarPDFDetalles(currentLoanForDetails);

        // 2. Preparar texto
        const loan = currentLoanForDetails;
        subject = `Detalle de Préstamo - ${loan.nombres} ${loan.apellidos}`;
        bodyText = `Adjunto el cronograma y detalles del préstamo activo.`;
    }

    // C. REDIRECCIÓN INMEDIATA
    // Pequeño timeout para asegurar que la descarga inició antes de cambiar de pestaña
    setTimeout(() => {
        if (platform === 'gmail') {
            const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
            window.open(gmailUrl, '_blank');
        }
        else if (platform === 'whatsapp') {
            const waUrl = `https://wa.me/?text=${encodeURIComponent(subject + "\n" + bodyText)}`;
            window.open(waUrl, '_blank');
        }
        else if (platform === 'copy') {
            navigator.clipboard.writeText(`${subject}\n\n${bodyText}`);
            // Solo mostramos animación visual breve, sin alerta intrusiva
            const btn = document.querySelector('.share-option-btn.copy .text');
            if(btn) {
                const original = btn.textContent;
                btn.textContent = "¡Copiado!";
                setTimeout(() => btn.textContent = original, 2000);
            }
        }

        // Cerrar el modal al finalizar
        closeModal(getDomElement('shareOptionsModal'));
    }, 100);
}

// --- FUNCIÓN AUXILIAR: SOLO DESCARGAR PDF DETALLES (SIN MENÚ WINDOWS) ---
function descargarPDFDetalles(loan) {
    if (typeof window.jspdf === 'undefined') return;

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const { schedule } = calculateSchedule(loan);

        // --- COLORES ---
        const colorNegro = [0, 0, 0];
        const colorBlanco = [255, 255, 255];

        // 🚨 MODIFICACIÓN: Usar tasa anual calculada
        const interesAnualMostrado = (loan.interes * 12).toFixed(2);


        // 1. HEADER & LOGO
        const logoImg = new Image();
        logoImg.src = 'assets/presta-logo.png';

        try {
            // 🚨 CAMBIO: Logo más grande (55x55) y posición X ajustada (140)
            // Coordenadas: X=140, Y=10, Ancho=55, Alto=55
            doc.addImage(logoImg, 'PNG', 140, 10, 55, 55);
        } catch (e) {
            console.warn("No imagen");
        }

        doc.setFontSize(20);
        doc.setTextColor(...colorNegro);
        // Centramos verticalmente el título respecto al logo
        doc.text("Cronograma y Detalles", 14, 40);

        // Línea divisoria (Bajada a Y=70 para que no corte el logo)
        doc.setDrawColor(...colorNegro);
        doc.setLineWidth(0.5);
        doc.line(14, 70, 196, 70);

        // 2. CUADRO RESUMEN (Bajado a Y=75 por el logo grande)
        doc.setDrawColor(...colorNegro);
        doc.setLineWidth(0.5);
        doc.rect(14, 75, 182, 35);

        doc.setFontSize(10);
        doc.setTextColor(...colorNegro);

        // Textos dentro del cuadro (Ajustados +30 en Y)
        doc.text(`Cliente: ${loan.nombres} ${loan.apellidos}`, 20, 85);
        doc.text(`DNI: ${loan.dni}`, 110, 85);
        doc.text(`Monto Prestado: S/ ${parseFloat(loan.monto).toFixed(2)}`, 20, 95);
        // 🚨 MODIFICACIÓN: Mostrar tasa anual calculada
        doc.text(`Interés Anual: ${interesAnualMostrado}%`, 110, 95);
        doc.text(`Fecha: ${new Date(loan.fecha).toLocaleDateString('es-PE', { timeZone: 'UTC' })}`, 20, 105);

        // La tabla empieza más abajo ahora
        let finalY = 120;

        // 3. ESTILOS TABLA (Blanco/Negro)
        const tableStyles = {
            theme: 'grid',
            headStyles: {
                fillColor: colorBlanco,
                textColor: colorNegro,
                lineColor: colorNegro,
                lineWidth: 0.1,
                fontStyle: 'bold'
            },
            bodyStyles: {
                textColor: colorNegro,
                lineColor: colorNegro
            },
            styles: {
                lineColor: colorNegro,
                lineWidth: 0.1
            }
        };

        // TABLA CRONOGRAMA
        const tableData = schedule.map(item => [item.cuota.toString(), item.fecha, `S/ ${item.monto}`]);
        doc.autoTable({
            head: [['Cuota', 'Vencimiento', 'Monto']],
            body: tableData,
            startY: finalY,
            ...tableStyles
        });

        // TABLA HISTORIAL (Si existe)
        if(loan.payments && loan.payments.length > 0) {
            let pagstartY = doc.lastAutoTable.finalY + 15;

            // Si falta espacio en la hoja, saltar página
            if (pagstartY > 270) {
                doc.addPage();
                pagstartY = 20;
            }

            doc.setFontSize(12);
            doc.setTextColor(...colorNegro);
            doc.text("Historial de Pagos Realizados", 14, pagstartY);

            const pagosData = loan.payments.map((p, index) => [
                (index + 1).toString(),
                new Date(p.payment_date).toLocaleDateString('es-PE', { timeZone: 'UTC' }),
                `S/ ${(p.payment_amount - (p.mora_amount||0)).toFixed(2)}`,
                `S/ ${(p.mora_amount||0).toFixed(2)}`,
                p.payment_method || 'Efectivo'
            ]);

            doc.autoTable({
                head: [['#', 'Fecha', 'Monto', 'Mora', 'Método']],
                body: pagosData,
                startY: pagstartY + 5,
                ...tableStyles
            });
        }

        const fileName = `Detalle_${loan.dni}.pdf`;
        doc.save(fileName);

    } catch (error) {
        console.error("Error generando PDF", error);
    }
}

// 🔹 EXPORTAR E IMPRIMIR HISTORIAL DE CIERRES
function exportarHistorialCierresPDF() {
    if (typeof window.jspdf === 'undefined') {
        alert("Error: Librería jsPDF no cargada.");
        return;
    }

    // 1. Crear una tabla temporal para el historial y rellenarla
    const tempTable = document.createElement('table');
    tempTable.id = 'closureHistoryTableTemp'; // Usar un ID temporal
    tempTable.innerHTML = `
        <thead>
            <tr>
                <th>Fecha Cierre</th>
                <th>Hora Cierre</th>
                <th>Sistema (Efectivo)</th>
                <th>Declarado (Efectivo)</th>
                <th>Diferencia</th>
                <th>Cerrado Por</th>
            </tr>
        </thead>
        <tbody id="closureHistoryTableBodyTemp">
        </tbody>
    `;
    document.body.appendChild(tempTable);

    // 2. Rellenar el tbody
    const historyTableBody = getDomElement('closureHistoryTableBodyTemp');

    loadClosureHistory().then(closures => {
        if (closures.length === 0) {
            historyTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #9CA3AF;">No hay cierres registrados aún.</td></tr>';
        } else {
            closures.sort((a, b) => new Date(b.closure_date) - new Date(a.closure_date));
            historyTableBody.innerHTML = closures.map(closure => {
                const fecha = new Date(closure.closure_date).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
                const horaCierre = new Date(closure.closed_at).toLocaleString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
                const systemAmount = parseFloat(closure.system_cash_amount);
                const declaredAmount = parseFloat(closure.declared_amount);
                const difference = parseFloat(closure.difference);

                // Determinar el color de la diferencia (se usa solo para la lógica de ícono/texto en PDF)
                let diffIcon = Math.abs(difference) > 0.01 ? '⚠️ ' : '✅ ';

                return `
                    <tr>
                        <td>${fecha}</td>
                        <td>${horaCierre}</td>
                        <td>S/ ${systemAmount.toFixed(2)}</td>
                        <td>S/ ${declaredAmount.toFixed(2)}</td>
                        <td>${diffIcon} S/ ${difference.toFixed(2)}</td>
                        <td>${closure.closed_by || 'Admin'}</td>
                    </tr>
                `;
            }).join('');
        }

        // 3. Generar PDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Encabezado
        doc.setFontSize(18);
        doc.setTextColor(0, 93, 255);
        doc.text("HISTORIAL DE CIERRES DE CAJA", 105, 20, { align: 'center' });

        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`Generado el: ${new Date().toLocaleString('es-PE')}`, 105, 28, { align: 'center' });

        // Tabla
        doc.autoTable({
            html: '#closureHistoryTableTemp',
            startY: 35,
            theme: 'grid',
            headStyles: {
                fillColor: [0, 93, 255],
                textColor: [255, 255, 255],
                halign: 'center',
                fontStyle: 'bold'
            },
            bodyStyles: {
                textColor: [50, 50, 50],
                fontSize: 9
            },
            columnStyles: {
                0: { halign: 'center' },
                1: { halign: 'center' },
                2: { halign: 'right' },
                3: { halign: 'right' },
                4: { halign: 'right' },
                5: { halign: 'center' }
            }
        });

        // 4. Limpiar y Descargar
        document.body.removeChild(tempTable);
        const fileName = `Historial_Cierres_Caja_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
    });
}

function imprimirHistorialCierres() {
    // 1. Crear una tabla temporal para el historial y rellenarla
    const tempTable = document.createElement('table');
    tempTable.id = 'closureHistoryTableTemp';
    tempTable.innerHTML = `
        <thead>
            <tr>
                <th>Fecha Cierre</th>
                <th>Hora Cierre</th>
                <th>Sistema (Efectivo)</th>
                <th>Declarado (Efectivo)</th>
                <th>Diferencia</th>
                <th>Cerrado Por</th>
            </tr>
        </thead>
        <tbody id="closureHistoryTableBodyTemp">
        </tbody>
    `;
    document.body.appendChild(tempTable); // Se añade temporalmente

    // 2. Rellenar el tbody con los datos del historial
    const historyTableBody = getDomElement('closureHistoryTableBodyTemp');

    loadClosureHistory().then(closures => {
        if (closures.length === 0) {
            historyTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #9CA3AF;">No hay cierres registrados aún.</td></tr>';
        } else {
            closures.sort((a, b) => new Date(b.closure_date) - new Date(a.closure_date));
            historyTableBody.innerHTML = closures.map(closure => {
                const fecha = new Date(closure.closure_date).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
                const horaCierre = new Date(closure.closed_at).toLocaleString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
                const systemAmount = parseFloat(closure.system_cash_amount);
                const declaredAmount = parseFloat(closure.declared_amount);
                const difference = parseFloat(closure.difference);
                let diffIcon = Math.abs(difference) > 0.01 ? '⚠️ ' : '✅ ';

                return `
                    <tr>
                        <td>${fecha}</td>
                        <td>${horaCierre}</td>
                        <td>S/ ${systemAmount.toFixed(2)}</td>
                        <td>S/ ${declaredAmount.toFixed(2)}</td>
                        <td>${diffIcon} S/ ${difference.toFixed(2)}</td>
                        <td>${closure.closed_by || 'Admin'}</td>
                    </tr>
                `;
            }).join('');
        }

        // 3. Imprimir
        const tableHTML = tempTable.outerHTML;

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
                <title>Historial de Cierres de Caja</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; color: #333; }
                    h1 { text-align: center; color: #000; margin-bottom: 5px; }
                    .subtitle { text-align: center; font-size: 12px; color: #666; margin-bottom: 20px; }
                    
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
                    th { background-color: #eee; border: 1px solid #999; padding: 8px; text-transform: uppercase; }
                    td { border: 1px solid #999; padding: 8px; text-align: center; }
                    td:nth-child(3), td:nth-child(4), td:nth-child(5) { text-align: right; }
                    
                    @media print {
                        @page { margin: 10mm; }
                        body { -webkit-print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                <h1>HISTORIAL DE CIERRES DE CAJA</h1>
                <p class="subtitle">Impreso el: ${new Date().toLocaleString('es-PE')}</p>
                ${tableHTML}
            </body>
            </html>
        `);

        iframeDoc.close();

        iframe.onload = function() {
            setTimeout(function() {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                // 4. Limpiar
                setTimeout(() => {
                    document.body.removeChild(iframe);
                    document.body.removeChild(tempTable); // Eliminar la tabla temporal
                }, 1000);
            }, 500);
        };
    });
}

// 🔹 EXPONER FUNCIONES GLOBALMENTE
window.exportarHistorialCierresPDF = exportarHistorialCierresPDF;
window.imprimirHistorialCierres = imprimirHistorialCierres;
