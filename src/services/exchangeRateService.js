// src/services/exchangeRateService.js
// Fetches the latest USD exchange rate from an external API.
// Extracted by Vigil auto-fix (ARCH-002 / AICR-003).
'use strict';

const axios = require('axios');

/**
 * Fetch the current USD rate.
 * @returns {Promise<number>}
 */
async function getUsdRate() {
  try {
    const res = await axios.get('https://api.exchangerate.host/latest');
    return res.data.rates.USD;
  } catch (err) {
    throw new Error(`Exchange rate fetch failed: ${err.message}`);
  }
}

module.exports = { getUsdRate };
