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

    let monthlyPayment;
    let totalDue;

    if (loan.tipo_calculo === 'Hibrido' && loan.meses_solo_interes > 0) {
        const interestOnlyPayment = principal * monthlyInterestRate;
        const remainingTerm = loan.plazo - loan.meses_solo_interes;

        if (remainingTerm > 0) {
            monthlyPayment = (principal * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -remainingTerm));
        } else {
            monthlyPayment = 0;
        }

        for (let i = 1; i <= loan.plazo; i++) {
            const paymentDate = new Date(startDate);
            paymentDate.setUTCMonth(paymentDate.getUTCMonth() + i);

            const monto = (i <= loan.meses_solo_interes) ? interestOnlyPayment : monthlyPayment;
            schedule.push({ cuota: i, fecha: paymentDate, monto: parseFloat(monto.toFixed(2)) });
        }
        totalDue = (interestOnlyPayment * loan.meses_solo_interes) + (monthlyPayment * remainingTerm);
    } else {
        if (monthlyInterestRate > 0 && loan.plazo > 0) {
            monthlyPayment = (principal * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -loan.plazo));
        } else if (principal > 0 && loan.plazo > 0) {
            monthlyPayment = principal / loan.plazo;
        } else {
            monthlyPayment = 0;
        }

        for (let i = 1; i <= loan.plazo; i++) {
            const paymentDate = new Date(startDate);
            paymentDate.setUTCMonth(paymentDate.getUTCMonth() + i);
            schedule.push({ cuota: i, fecha: paymentDate, monto: parseFloat(monthlyPayment.toFixed(2)) });
        }
        totalDue = monthlyPayment * loan.plazo;
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
        console.log('🔍 [MORA] Calculating for loan:', loan.id, 'TotalPaid:', totalPaid, 'Payments:', payments.length);
        const { schedule } = calculateSchedule(loan);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        console.log('📅 [MORA] Today:', today.toISOString().split('T')[0]);

        // If loan is paid or no overdue amount, no mora
        if (loan.status === 'Pagado' || totalPaid >= loan.total_due) {
            console.log('❌ [MORA] No mora - Status:', loan.status, 'Paid:', totalPaid, 'Due:', loan.total_due);
            return 0;
        }

        // Find the first overdue installment
        let firstOverdueDate = null;
        for (const item of schedule) {
            const dueDate = new Date(item.fecha);
            dueDate.setHours(0, 0, 0, 0);

            if (dueDate <= today) {
                const cumulativeExpected = schedule.slice(0, item.cuota).reduce((sum, s) => sum + s.monto, 0);

                if (totalPaid < cumulativeExpected) {
                    firstOverdueDate = dueDate;
                    console.log('📍 [MORA] First overdue:', dueDate.toISOString().split('T')[0], 'Expected:', cumulativeExpected);
                    break;
                }
            }
        }

        // If no overdue installments, no mora
        if (!firstOverdueDate) {
            console.log('❌ [MORA] No overdue installments found');
            return 0;
        }

        // Calculate mora month by month from first overdue date to today
        let totalMora = 0;

        // Start from the NEXT month after the due date
        let currentDate = new Date(firstOverdueDate);
        currentDate.setHours(0, 0, 0, 0);
        currentDate.setMonth(currentDate.getMonth() + 1); // Move to next month after due date
        currentDate.setDate(1); // Set to first day of the month
        console.log('🗓️ [MORA] Starting from:', currentDate.toISOString().split('T')[0]);

        // Create a set of months that had payments (format: "YYYY-MM")
        const monthsWithPayments = new Set();
        payments.forEach(payment => {
            const paymentDate = new Date(payment.payment_date);
            const monthKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;
            monthsWithPayments.add(monthKey);
        });

        // Iterate through each month from month after due date to current month
        const todayMonth = new Date(today);
        todayMonth.setDate(1); // Set to first day of current month
        console.log('🎯 [MORA] Today month:', todayMonth.toISOString().split('T')[0]);

        while (currentDate <= todayMonth) {
            const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

            // If this month had NO payment, charge mora
            if (!monthsWithPayments.has(monthKey)) {
                // Calculate outstanding balance at this point
                const outstandingBalance = loan.total_due - totalPaid;

                // Charge 1% of outstanding balance for this month
                const moraForMonth = outstandingBalance * (TASA_MORA_MENSUAL / 100);
                totalMora += moraForMonth;
                console.log(`💸 [MORA] Month ${monthKey}: +S/ ${moraForMonth.toFixed(2)} (Balance: ${outstandingBalance.toFixed(2)})`);
            } else {
                console.log(`✅ [MORA] Month ${monthKey}: Has payment, no mora`);
            }

            // Move to next month
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        console.log('✅ [MORA] Total calculated:', totalMora.toFixed(2));
        return parseFloat(totalMora > 0 ? totalMora.toFixed(2) : 0);
    } catch (e) {
        console.error(`ERROR CRÍTICO en calculateMora para el préstamo ID ${loan.id}:`, e.message);
        return 0;
    }
}



module.exports = {
    calculateSchedule,
    calculateMora
};
