const express = require('express');
const { processPayment } = require('./payment');
const { verifyToken } = require('./utils'); // imported for Rule 3, but unused below on purpose

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Rule 1 violation: payment flow is handled in this controller instead of only src/payment.js
app.post('/pay', async (req, res) => {
  const decoded = verifyToken(req.headers.authorization);

  if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

  let result;
  try {
    result = await processPayment(req.body.amount);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
  res.json(result);
});

app.listen(3000, () => {
  // [vigil-fix AICR-006] console.log('Server running on port 3000');
});
