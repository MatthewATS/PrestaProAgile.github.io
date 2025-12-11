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
 * @param {Number} totalPaid - Total amount paid so far
 * @returns {Number} - Late payment fee amount
 */
function calculateMora(loan, totalPaid) {
    try {
        const { schedule } = calculateSchedule(loan);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let totalMora = 0;
        let totalAmountOverdue = 0;

        const startDate = new Date(loan.fecha + 'T12:00:00');
        let latestDueDate = new Date(startDate);

        for (const item of schedule) {
            const dueDate = new Date(item.fecha);
            dueDate.setHours(0, 0, 0, 0);

            if (dueDate <= today) {
                const cumulativeExpected = schedule.slice(0, item.cuota).reduce((sum, s) => sum + s.monto, 0);

                if (totalPaid < cumulativeExpected) {
                    const monthsLate = (today.getFullYear() - dueDate.getFullYear()) * 12 +
                        (today.getMonth() - dueDate.getMonth());
                    const monthsToCharge = Math.max(1, monthsLate);

                    const outstandingBalanceForMora = loan.total_due - totalPaid;

                    totalMora = outstandingBalanceForMora * (TASA_MORA_MENSUAL / 100) * monthsToCharge;
                    totalAmountOverdue = cumulativeExpected - totalPaid;
                    latestDueDate = dueDate;
                    break;
                }
            }
        }

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
