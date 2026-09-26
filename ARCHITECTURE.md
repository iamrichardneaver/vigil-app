# Architecture Rules for Vigil App

These are the official architectural invariants of this project.

## Critical Rules (must never be broken)

1. **Payment logic isolation**  
   All payment-related business logic must live only inside `src/payment.js`.  
   No payment logic is allowed in `src/index.js` or `src/utils.js`.

2. **No direct external HTTP calls from controllers**  
   Any external API call (using axios or similar) must go through a dedicated service layer.  
   Controllers should only call internal modules.

3. **Authentication must use the central auth helper**  
   All JWT verification must use the function exported from `src/utils.js`.  
   Inline JWT verification is forbidden.

4. **Lodash usage policy**  
   Lodash may only be used for deep cloning and object merging.  
   Using lodash for simple array operations is discouraged.
