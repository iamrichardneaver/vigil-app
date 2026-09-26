# Architectural Invariants

- Payment logic → only in `src/payment.js`
- No direct axios calls from `src/index.js`
- JWT verification must go through `utils.verifyToken`
- Prefer native JS over lodash for simple operations
