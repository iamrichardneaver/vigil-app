const express = require('express');
const axios   = require('axios');
const { processPayment } = require('./payment');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Rule 1 violation: payment flow is handled in this controller instead of only src/payment.js
// Rule 2 violation: axios is called directly instead of through a service module
app.post('/pay', async (req, res) => {
  const token = req.headers.authorization;
  // Rule 3 violation: weak token check (length guard) instead of the auth helper
  if (!token || token.length < 10) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Rule 2 violation: direct external HTTP call inside controller
  const rate = await axios.get('https://api.exchangerate.host/latest');
  const result = processPayment(req.body.amount, rate.data.rates.USD);
  res.json(result);
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
