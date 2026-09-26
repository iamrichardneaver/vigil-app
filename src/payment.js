// Rule 1: the only allowed module for payment business logic
function processPayment(amount, exchangeRate) {
  const converted = amount * (exchangeRate || 1);
  return {
    original: amount,
    converted,
    status: 'processed'
  };
}

module.exports = { processPayment };
