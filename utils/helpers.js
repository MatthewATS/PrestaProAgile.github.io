const crypto = require('crypto');

/**
 * Get next correlativo (receipt number)
 * @param {Object} connection - Database connection
 * @returns {Number} - Next correlativo number
 */
async function getNextCorrelativo(connection) {
    const [rows] = await connection.query(
        "SELECT MAX(correlativo_boleta) AS max_correlativo FROM payments"
    );
    const maxCorrelativo = rows[0].max_correlativo || 0;
    return maxCorrelativo + 1;
}

/**
 * Generate transaction ID
 * @returns {String} - Transaction ID
 */
function generateTransactionId() {
    return `TRX-${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Generate HMAC signature for Flow
 * @param {Object} params - Parameters to sign
 * @param {String} secretKey - Flow secret key
 * @returns {String} - HMAC signature
 */
function generateFlowSignature(params, secretKey) {
    // Sort parameters alphabetically
    const sortedKeys = Object.keys(params).sort();
    const signatureString = sortedKeys.map(key => `${key}${params[key]}`).join('');

    return crypto
        .createHmac('sha256', secretKey)
        .update(signatureString)
        .digest('hex');
}

/**
 * Verify Flow signature
 * @param {Object} params - Parameters received
 * @param {String} signature - Signature to verify
 * @param {String} secretKey - Flow secret key
 * @returns {Boolean} - True if signature is valid
 */
function verifyFlowSignature(params, signature, secretKey) {
    const calculatedSignature = generateFlowSignature(params, secretKey);
    return calculatedSignature === signature;
}

module.exports = {
    getNextCorrelativo,
    generateTransactionId,
    generateFlowSignature,
    verifyFlowSignature
};
