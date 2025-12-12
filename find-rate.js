// Find the exact monthly rate that produces Cuota = 5.12
const monto = 25;
const plazo = 5;
const expectedCuota = 5.12;

// Binary search for the rate
let low = 0.007;
let high = 0.009;
let bestRate = 0;
let bestCuota = 0;

for (let i = 0; i < 100; i++) {
    const r = (low + high) / 2;
    const pmt = (monto * r) / (1 - Math.pow(1 + r, -plazo));

    if (Math.abs(pmt - expectedCuota) < 0.001) {
        bestRate = r;
        bestCuota = pmt;
        break;
    }

    if (pmt < expectedCuota) {
        low = r;
    } else {
        high = r;
    }
}

console.log('Found rate:', (bestRate * 100).toFixed(6) + '%');
console.log('Produces Cuota:', bestCuota.toFixed(4));
console.log('');

// Test with this rate
console.log('=== AMORTIZATION WITH FOUND RATE ===');
const pmt = (monto * bestRate) / (1 - Math.pow(1 + bestRate, -plazo));
console.log('Cuota:', pmt.toFixed(2));

let bal = monto;
for (let i = 1; i <= plazo; i++) {
    const int = bal * bestRate;
    const prin = pmt - int;
    bal -= prin;
    console.log(`P${i}: Amort=${prin.toFixed(2)} Int=${int.toFixed(2)} Saldo=${bal.toFixed(2)}`);
}

console.log('');
console.log('=== PROFESSOR EXPECTS ===');
console.log('Cuota: 5.12');
console.log('P1: Amort=4.92 Int=0.20 Saldo=20.08');

// Check what annual rate this corresponds to
const annualRate = bestRate * 12 * 100;
console.log('');
console.log('If this is monthly rate, annual rate would be:', annualRate.toFixed(4) + '%');
console.log('If this is from 10% annual, divisor would be:', (10 / (bestRate * 100)).toFixed(4));
