const jwt = require('jsonwebtoken');
const _ = require('lodash');

// Rule 3: official JWT helper — all verification must use this function
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
  } catch (err) {
    return null;
  }
}

// Rule 4: lodash is allowed here for object merging, not simple array operations
function deepMerge(target, source) {
  return _.merge({}, target, source);
}

module.exports = { verifyToken, deepMerge };
