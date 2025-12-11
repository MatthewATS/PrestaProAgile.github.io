// Business constants
const TASA_MORA_MENSUAL = parseFloat(process.env.TASA_MORA_MENSUAL) || 1;
const VALOR_UIT = parseFloat(process.env.VALOR_UIT) || 5150;

// Flow Payment Gateway Configuration
const FLOW_CONFIG = {
    API_KEY: process.env.FLOW_API_KEY,
    SECRET_KEY: process.env.FLOW_SECRET_KEY,
    API_URL: process.env.FLOW_API_URL || 'https://www.flow.cl/api',
    SANDBOX_URL: 'https://sandbox.flow.cl/api'
};

// Server Configuration
const SERVER_CONFIG = {
    PORT: process.env.PORT || 3000,
    BACKEND_URL: process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`,
    NODE_ENV: process.env.NODE_ENV || 'development'
};

// DNI/RUC API Configuration
const DNI_API_CONFIG = {
    TOKEN: process.env.DNI_API_TOKEN,
    BASE_URL: 'https://dniruc.apisperu.com/api/v1'
};

module.exports = {
    TASA_MORA_MENSUAL,
    VALOR_UIT,
    FLOW_CONFIG,
    SERVER_CONFIG,
    DNI_API_CONFIG
};
