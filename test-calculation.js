// Test script to verify amortization calculations
// Run this in Node.js: node test-calculation.js

function calculateDetailedAmortization(loan) {
    const monthlyInterestRate = (parseFloat(loan.interes) / 12.5) / 100; // Annual to monthly
    const principal = parseFloat(loan.monto);
    const plazo = parseInt(loan.plazo);

    const amortizationTable = [];

    let monthlyPayment = 0;
    if (monthlyInterestRate > 0 && plazo > 0) {
        monthlyPayment = (principal * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -plazo));
    } else if (principal > 0 && plazo > 0) {
        monthlyPayment = principal / plazo;
    }

    console.log('Cuota Mensual Calculada:', monthlyPayment.toFixed(2));
    console.log('Tasa Mensual:', (monthlyInterestRate * 100).toFixed(4) + '%');
    console.log('');

    // Row 0: Initial balance
    amortizationTable.push({
        nper: 0,
        saldo: parseFloat(principal.toFixed(2)),
        amortizacion: 0,
        interes: 0,
        cuota: 0
    });

    let remainingBalance = principal;

    for (let i = 1; i <= plazo; i++) {
        const interestPayment = remainingBalance * monthlyInterestRate;
        const principalPayment = monthlyPayment - interestPayment;
        remainingBalance = remainingBalance - principalPayment;

        if (i === plazo && Math.abs(remainingBalance) < 0.01) {
            remainingBalance = 0;
        }

        amortizationTable.push({
            nper: i,
            saldo: parseFloat(remainingBalance.toFixed(2)),
            amortizacion: parseFloat(principalPayment.toFixed(2)),
            interes: parseFloat(interestPayment.toFixed(2)),
            cuota: parseFloat(monthlyPayment.toFixed(2))
        });
    }

    return amortizationTable;
}

function calculateTEA(annualRate) {
    const tem = (annualRate / 12.5) / 100;
    return (Math.pow(1 + tem, 12) - 1) * 100;
}

function calculateTCEA(monto, totalCost, plazoMeses) {
    if (plazoMeses <= 0 || monto <= 0) return 0;
    const tcea = (Math.pow(totalCost / monto, 12 / plazoMeses) - 1) * 100;
    return parseFloat(tcea.toFixed(2));
}

// Professor's example
const testLoan = {
    monto: 25.00,
    interes: 10, // 10% annual
    plazo: 5
};

console.log('=== TABLA DE AMORTIZACIÓN ===');
console.log('Crédito: S/', testLoan.monto);
console.log('Tasa Anual:', testLoan.interes + '%');
console.log('Plazo:', testLoan.plazo, 'meses');
console.log('');

const table = calculateDetailedAmortization(testLoan);

console.log('Nper | Saldo     | Amortización | Interés  | Cuota');
console.log('-----|-----------|--------------|----------|----------');
table.forEach(row => {
    console.log(
        row.nper.toString().padStart(4) + ' | ' +
        ('S/ ' + row.saldo.toFixed(2)).padStart(9) + ' | ' +
        ('S/ ' + row.amortizacion.toFixed(2)).padStart(12) + ' | ' +
        ('S/ ' + row.interes.toFixed(2)).padStart(8) + ' | ' +
        ('S/ ' + row.cuota.toFixed(2)).padStart(8)
    );
});

console.log('');
console.log('=== VALORES ESPERADOS DEL PROFESOR ===');
console.log('Nper | Saldo     | Amortización | Interés  | Cuota');
console.log('-----|-----------|--------------|----------|----------');
console.log('   0 | S/ 25.00  |              |          |');
console.log('   1 | S/ 20.08  | S/ 4.92      | S/ 0.20  | S/ 5.12');
console.log('   2 | S/ 15.12  | S/ 4.96      | S/ 0.16  | S/ 5.12');
console.log('   3 | S/ 10.12  | S/ 5.00      | S/ 0.12  | S/ 5.12');
console.log('   4 | S/  5.08  | S/ 5.04      | S/ 0.08  | S/ 5.12');
console.log('   5 | S/  0.00  | S/ 5.08      | S/ 0.04  | S/ 5.12');

// Calculate TEA and TCEA
const tem = testLoan.interes / 12.5; // Monthly rate from annual
const tea = calculateTEA(testLoan.interes); // Pass annual rate
console.log('');
console.log('TEA:', tea.toFixed(2) + '%');

const totalPaid = table.slice(1).reduce((sum, row) => sum + row.cuota, 0);
const temEfectivo = Math.pow(totalPaid / testLoan.monto, 1 / testLoan.plazo) - 1;
const tcea = (Math.pow(1 + temEfectivo, 12) - 1) * 100;
console.log('TCEA:', tcea.toFixed(2) + '%');
console.log('Total Pagado:', totalPaid.toFixed(2));
