// ==========================================
// --- CONTROL DE APERTURA/CIERRE DE CAJA ---
// ==========================================

// Get API URL from window or use default
function getApiUrl() {
    if (window.API_URL) return window.API_URL;
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    return isLocalhost ? 'http://localhost:3000' : 'https://prestaproagilegithubio-production-be75.up.railway.app';
}

let cashRegisterStatus = { isOpen: false };

/**
 * Check cash register status and update UI
 */
/**
 * Check cash register status and update UI
 */
async function checkCashRegisterStatus() {
    try {
        const response = await fetch(`${getApiUrl()}/api/cash-closures/status`);
        const status = await response.json();
        cashRegisterStatus = status;

        updateCashStatusUI(status);

        // 🚨 NUEVO: Actualizar el saldo en vivo si la caja está abierta
        if (status.isOpen) {
            updateLiveCashBalance(status.date);
        }

        return status;
    } catch (error) {
        console.error("Error checking cash register status:", error);
        return { isOpen: false };
    }
}

/**
 * Update cash status UI panel
 */
function updateCashStatusUI(status) {
    const statusText = getDomElement('cashStatusText');
    const statusIndicator = getDomElement('cashStatusIndicator');
    const openBtn = getDomElement('openCashRegisterBtn');
    const closeBtn = getDomElement('closeCashRegisterBtn');

    if (!statusText || !statusIndicator) return;

    if (status.isOpen) {
        statusText.textContent = `Caja abierta - ${new Date(status.date).toLocaleDateString('es-PE')}`;
        statusIndicator.textContent = '🔓';
        statusIndicator.style.backgroundColor = 'rgba(16, 185, 129, 0.3)';

        if (openBtn) openBtn.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'block';
    } else {
        statusText.textContent = 'Caja cerrada - Debe abrir la caja para operar';
        statusIndicator.textContent = '🔒';
        statusIndicator.style.backgroundColor = 'rgba(239, 68, 68, 0.3)';

        if (openBtn) openBtn.style.display = 'block';
        if (closeBtn) closeBtn.style.display = 'none';

        // Reset balance if closed
        const balanceEl = getDomElement('cashStatusBalance');
        if (balanceEl) balanceEl.textContent = 'S/ 0.00';
    }
}

// 🚨 NUEVO: Función para obtener y mostrar el saldo actual
async function updateLiveCashBalance(date) {
    try {
        const response = await fetch(`${getApiUrl()}/api/cash-closures/balance/${date}`);
        const data = await response.json();
        const balanceEl = getDomElement('cashStatusBalance');
        if (balanceEl) {
            balanceEl.textContent = `S/ ${parseFloat(data.balance || 0).toFixed(2)}`;
            balanceEl.style.color = '#10B981'; // Green success
        }
    } catch (error) {
        console.error("Error getting live balance:", error);
    }
}

/**
 * Open cash register modal
 */
function openCashRegisterModal() {
    const modal = getDomElement('openCashModal');
    const dateInput = getDomElement('openingDate');
    const balanceInput = getDomElement('openingBalance');
    const messageDiv = getDomElement('openCashMessage');

    if (dateInput) dateInput.value = getTodayDateISO();
    if (balanceInput) balanceInput.value = '';
    if (messageDiv) messageDiv.style.display = 'none';

    openModal(modal);
}

/**
 * Handle open cash register form submission
 */
async function handleOpenCashRegister(e) {
    e.preventDefault();

    const date = getDomElement('openingDate').value;
    const openingBalance = parseFloat(getDomElement('openingBalance').value);
    const messageDiv = getDomElement('openCashMessage');

    if (!date || isNaN(openingBalance) || openingBalance < 0) {
        messageDiv.className = 'alert alert-danger';
        messageDiv.innerHTML = '<span>❌</span> Por favor, ingresa un saldo inicial válido.';
        messageDiv.style.display = 'block';
        return;
    }

    try {
        const response = await fetch(`${getApiUrl()}/api/cash-closures/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, openingBalance })
        });

        const data = await response.json();

        if (response.ok) {
            messageDiv.className = 'alert alert-success';
            messageDiv.innerHTML = '<span>✅</span> Caja abierta exitosamente.';
            messageDiv.style.display = 'block';

            setTimeout(() => {
                closeModal(getDomElement('openCashModal'));
                checkCashRegisterStatus();
                showSuccessAnimation('✅ Caja Abierta');
            }, 1000);
        } else {
            throw new Error(data.error || 'Error al abrir la caja');
        }
    } catch (error) {
        messageDiv.className = 'alert alert-danger';
        messageDiv.innerHTML = `<span>❌</span> ${error.message}`;
        messageDiv.style.display = 'block';
    }
}

/**
 * Close cash register
 */
async function handleCloseCashRegister() {
    const confirmed = confirm('¿Estás seguro de que deseas cerrar la caja? No podrás acceder a los módulos hasta que la vuelvas a abrir.');

    if (!confirmed) return;

    try {
        const date = getTodayDateISO();
        const response = await fetch(`${getApiUrl()}/api/cash-closures/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date })
        });

        const data = await response.json();

        if (response.ok) {
            showSuccessAnimation('✅ Caja Cerrada');
            checkCashRegisterStatus();
        } else {
            throw new Error(data.error || 'Error al cerrar la caja');
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

/**
 * Check if modules should be accessible
 */
function checkModuleAccess(targetModule) {
    // Skip check for cash register module
    if (targetModule === 'module-caja') return true;

    if (!cashRegisterStatus.isOpen) {
        alert('⚠️ CAJA CERRADA\n\nDebe abrir la caja antes de acceder a este módulo.\nDiríjase al módulo de "Cuadre de Caja" para abrir la caja del día.');
        return false;
    }

    return true;
}

// Initialize cash control when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check status when page loads
    checkCashRegisterStatus();

    // Open cash register button
    const openBtn = getDomElement('openCashRegisterBtn');
    if (openBtn) {
        openBtn.addEventListener('click', openCashRegisterModal);
    }

    // Close cash register button
    const closeBtn = getDomElement('closeCashRegisterBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', handleCloseCashRegister);
    }

    // Open cash form submission
    const openCashForm = getDomElement('openCashForm');
    if (openCashForm) {
        openCashForm.addEventListener('submit', handleOpenCashRegister);
    }

    // Close open cash modal button
    const closeOpenCashModalBtn = getDomElement('closeOpenCashModalBtn');
    if (closeOpenCashModalBtn) {
        closeOpenCashModalBtn.addEventListener('click', () => {
            closeModal(getDomElement('openCashModal'));
        });
    }

    // Intercept module navigation
    const moduleCards = document.querySelectorAll('.module-card');
    moduleCards.forEach(card => {
        card.addEventListener('click', (e) => {
            const targetModule = card.getAttribute('data-target');
            if (!checkModuleAccess(targetModule)) {
                e.stopPropagation();
                e.preventDefault();
            }
        }, true); // Use capture phase to intercept before other handlers
    });
});

// Expose functions globally
// Expose functions globally
window.checkCashRegisterStatus = checkCashRegisterStatus;
window.checkModuleAccess = checkModuleAccess;
window.updateLiveCashBalance = updateLiveCashBalance;
