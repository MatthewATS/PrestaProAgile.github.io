// Simple test to compare current vs expected calculations
const monto = 25;
const interes = 10; // This is what the user inputs
const plazo = 5;

console.log('=== TEST WITH CURRENT FORMULA (interes as monthly %) ===');
const r1 = interes / 100; // Treating input as monthly rate
const pmt1 = (monto * r1) / (1 - Math.pow(1 + r1, -plazo));
console.log('Monthly Rate:', (r1 * 100).toFixed(4) + '%');
console.log('Cuota:', pmt1.toFixed(2));

let bal1 = monto;
for (let i = 1; i <= plazo; i++) {
    const int = bal1 * r1;
    const prin = pmt1 - int;
    bal1 -= prin;
    console.log(`P${i}: Amort=${prin.toFixed(2)} Int=${int.toFixed(2)} Saldo=${bal1.toFixed(2)}`);
}

console.log('\n=== TEST WITH ANNUAL RATE / 12 ===');
const r2 = (interes / 12) / 100; // Treating input as annual rate, divide by 12
const pmt2 = (monto * r2) / (1 - Math.pow(1 + r2, -plazo));
console.log('Monthly Rate:', (r2 * 100).toFixed(4) + '%');
console.log('Cuota:', pmt2.toFixed(2));

let bal2 = monto;
for (let i = 1; i <= plazo; i++) {
    const int = bal2 * r2;
    const prin = pmt2 - int;
    bal2 -= prin;
    console.log(`P${i}: Amort=${prin.toFixed(2)} Int=${int.toFixed(2)} Saldo=${bal2.toFixed(2)}`);
}

console.log('\n=== PROFESSOR EXPECTS ===');
console.log('Cuota: 5.12');
console.log('P1: Amort=4.92 Int=0.20 Saldo=20.08');
console.log('P2: Amort=4.96 Int=0.16 Saldo=15.12');
console.log('P3: Amort=5.00 Int=0.12 Saldo=10.12');
console.log('P4: Amort=5.04 Int=0.08 Saldo=5.08');
console.log('P5: Amort=5.08 Int=0.04 Saldo=0.00');
