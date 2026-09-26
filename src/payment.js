// Rule 1 (auto-fixed by Vigil ARCH-001)
const { getUsdRate } = require('./services/exchangeRateService');

// Rule 1: the only allowed module for payment business logic
async function processPayment(amount) {
  const exchangeRate = await getUsdRate();
  const converted = amount * (exchangeRate || 1);
  return {
    original: amount,
    converted,
    status: 'processed'
  };
}

module.exports = { processPayment };
