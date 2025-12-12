const { TASA_MORA_MENSUAL } = require('../config/constants');

/**
 * Calculate loan payment schedule
 * @param {Object} loan - Loan object with monto, interes, plazo, fecha, tipo_calculo, meses_solo_interes
 * @returns {Object} - { schedule: Array, totalDue: Number }
 */
function calculateSchedule(loan) {
    const monthlyInterestRate = parseFloat(loan.interes) / 100;
    const principal = parseFloat(loan.monto);
    const schedule = [];
    const startDate = new Date(loan.fecha + 'T12:00:00');

    let monthlyPayment; // This is the SUB-TOTAL (Capital + Interest)
    let totalDue;
    const IGV_RATE = 0.18; // 18% IGV

    if (loan.tipo_calculo === 'Hibrido' && loan.meses_solo_interes > 0) {
        // Interest Only Phase
        const subtotalInterestOnly = principal * monthlyInterestRate;
        const interestOnlyPayment = subtotalInterestOnly;

        const remainingTerm = loan.plazo - loan.meses_solo_interes;
        let subtotalAmortized = 0;
        let amortizedPayment = 0;

        if (remainingTerm > 0) {
            subtotalAmortized = (principal * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -remainingTerm));
            amortizedPayment = subtotalAmortized;
        }

        for (let i = 1; i <= loan.plazo; i++) {
            const paymentDate = new Date(startDate);
            paymentDate.setUTCMonth(paymentDate.getUTCMonth() + i);

            const isInterestOnly = (i <= loan.meses_solo_interes);
            const rawAmount = isInterestOnly ? interestOnlyPayment : amortizedPayment;

            schedule.push({ cuota: i, fecha: paymentDate, monto: parseFloat(rawAmount.toFixed(2)) });
        }
        totalDue = (interestOnlyPayment * loan.meses_solo_interes) + (amortizedPayment * remainingTerm);
    } else {
        // Standard Amortization or Simple
        if (monthlyInterestRate > 0 && loan.plazo > 0) {
            monthlyPayment = (principal * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -loan.plazo));
        } else if (principal > 0 && loan.plazo > 0) {
            monthlyPayment = principal / loan.plazo;
        } else {
            monthlyPayment = 0;
        }

        // IGV Removed from here. Displayed only at payment.
        const paymentAmount = monthlyPayment;

        for (let i = 1; i <= loan.plazo; i++) {
            const paymentDate = new Date(startDate);
            paymentDate.setUTCMonth(paymentDate.getUTCMonth() + i);
            schedule.push({ cuota: i, fecha: paymentDate, monto: parseFloat(paymentAmount.toFixed(2)) });
        }
        totalDue = paymentAmount * loan.plazo;
    }

    return { schedule, totalDue: parseFloat(totalDue.toFixed(2)) };
}

/**
 * Calculate late payment fee (mora)
 * @param {Object} loan - Loan object
 * @param {Number} totalPaid - Total amount paid so far (capital + interest only, excluding mora)
 * @param {Array} payments - Array of payment objects with payment_date and payment_amount
 * @returns {Number} - Late payment fee amount
 */
function calculateMora(loan, totalPaid, payments = []) {
    try {
        const { schedule } = calculateSchedule(loan);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        console.log('📅 [MORA] Today:', today.toISOString().split('T')[0]);

        if (loan.status === 'Pagado' || totalPaid >= loan.total_due) {
            console.log('❌ [MORA] No mora - Status:', loan.status, 'Paid:', totalPaid, 'Due:', loan.total_due);
            return 0;
        }

        let totalMora = 0;
        let runningPaid = totalPaid;

        for (const item of schedule) {
            const dueDate = new Date(item.fecha);
            dueDate.setHours(0, 0, 0, 0);

            // Calculate how much of this installment is paid
            const amount = item.monto;
            const paidForThis = Math.min(amount, runningPaid);
            const unpaidAmount = amount - paidForThis;
            runningPaid -= paidForThis; // Deduct used payment from the running total

            // If there is an unpaid amount and the due date has passed
            if (unpaidAmount > 0.05 && dueDate < today) { // > 0.05 tolerance for rounding
                const diffTime = Math.abs(today - dueDate);
                const daysLate = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // Formula: Mora = Capital Vencido * (0.01 / 30) * Días de Atraso
                // We use TASA_MORA_MENSUAL from config (default 1) instead of hardcoded 0.01
                // TASA_MORA_MENSUAL is typically 1 (representing 1%), so we divide by 100

                const rate = (TASA_MORA_MENSUAL / 100) / 30;
                const moraForInstallment = unpaidAmount * rate * daysLate;

                totalMora += moraForInstallment;

                console.log(`💸 [MORA] Cuota ${item.cuota} Vencida:`,
                    `Capital: ${unpaidAmount.toFixed(2)}`,
                    `Days Late: ${daysLate}`,
                    `Mora: ${moraForInstallment.toFixed(2)}`
                );
            }
        }

        // Calculate total mora previously paid to deduct it (avoid double charging)
        let totalMoraPaid = 0;
        if (payments && Array.isArray(payments)) {
            totalMoraPaid = payments.reduce((sum, p) => sum + parseFloat(p.mora_amount || 0), 0);
        }

        const netMora = totalMora - totalMoraPaid;
        console.log('✅ [MORA] Gross:', totalMora.toFixed(2), 'Paid:', totalMoraPaid.toFixed(2), 'Net Due:', netMora.toFixed(2));
        return parseFloat(Math.max(0, netMora).toFixed(2));
    } catch (e) {
        console.error(`ERROR CRÍTICO en calculateMora para el préstamo ID ${loan.id}:`, e.message);
        return 0;
    }
}



/**
 * Calculate detailed amortization table with balance, principal, and interest breakdown
 * @param {Object} loan - Loan object with monto, interes, plazo, fecha
 * @returns {Array} - Array of amortization rows with { nper, saldo, amortizacion, interes, cuota, fecha }
 */
function calculateDetailedAmortization(loan) {
    const monthlyInterestRate = parseFloat(loan.interes) / 100; // Convert percentage to decimal
    const principal = parseFloat(loan.monto);
    const plazo = parseInt(loan.plazo);
    const startDate = new Date(loan.fecha + 'T12:00:00');

    const amortizationTable = [];

    // Calculate monthly payment using amortization formula
    let monthlyPayment = 0;
    if (monthlyInterestRate > 0 && plazo > 0) {
        monthlyPayment = (principal * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -plazo));
    } else if (principal > 0 && plazo > 0) {
        monthlyPayment = principal / plazo;
    }

    // Row 0: Initial balance
    amortizationTable.push({
        nper: 0,
        saldo: parseFloat(principal.toFixed(2)),
        amortizacion: 0,
        interes: 0,
        cuota: 0,
        fecha: null
    });

    let remainingBalance = principal;

    // Calculate each period
    for (let i = 1; i <= plazo; i++) {
        // Interest for this period = remaining balance * monthly rate
        const interestPayment = remainingBalance * monthlyInterestRate;

        // Principal payment = total payment - interest
        const principalPayment = monthlyPayment - interestPayment;

        // New balance = previous balance - principal payment
        remainingBalance = remainingBalance - principalPayment;

        // Handle rounding for last payment
        if (i === plazo && Math.abs(remainingBalance) < 0.01) {
            remainingBalance = 0;
        }

        // Calculate payment date
        const paymentDate = new Date(startDate);
        paymentDate.setUTCMonth(paymentDate.getUTCMonth() + i);

        amortizationTable.push({
            nper: i,
            saldo: parseFloat(remainingBalance.toFixed(2)),
            amortizacion: parseFloat(principalPayment.toFixed(2)),
            interes: parseFloat(interestPayment.toFixed(2)),
            cuota: parseFloat(monthlyPayment.toFixed(2)),
            fecha: paymentDate.toISOString().split('T')[0]
        });
    }

    return amortizationTable;
}

/**
 * Calculate TEA (Tasa Efectiva Anual) from annual rate
 * Formula: TEA = (1 + TEM)^12 - 1
 * @param {Number} annualRate - Annual interest rate (as percentage, e.g., 10 for 10%)
 * @returns {Number} - Effective annual interest rate (as percentage, e.g., 10.47 for 10.47%)
 */
function calculateTEA(annualRate) {
    const tem = (annualRate / 12.5) / 100; // Convert annual to monthly decimal
    return (Math.pow(1 + tem, 12) - 1) * 100;
}

/**
 * Calculate TCEA (Tasa de Costo Efectivo Anual)
 * Formula: TCEA = ((Total Paid / Monto)^(12/n) - 1) * 100
 * @param {Number} monto - Original loan amount
 * @param {Number} totalCost - Total amount paid (all installments)
 * @param {Number} plazoMeses - Loan term in months
 * @returns {Number} - TCEA as percentage
 */
function calculateTCEA(monto, totalCost, plazoMeses) {
    if (plazoMeses <= 0 || monto <= 0) return 0;

    // TCEA = ((Total Paid / Principal)^(12/n) - 1) * 100
    const tcea = (Math.pow(totalCost / monto, 12 / plazoMeses) - 1) * 100;



    return parseFloat(tcea.toFixed(2));
}

module.exports = {
    calculateSchedule,
    calculateMora,
    calculateDetailedAmortization,
    calculateTEA,
    calculateTCEA
};
