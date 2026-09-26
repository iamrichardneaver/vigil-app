/**
 * vigil/agents/invariant-guardian.js
 *
 * Invariant Guardian Agent
 * ────────────────────────
 * Checks that every architectural rule defined in ARCHITECTURE.md and
 * docs/invariants.md is satisfied in the actual source files.
 *
 * Rules enforced (from ARCHITECTURE.md):
 *
 *   ARCH-001  Payment logic isolation
 *             All payment-related logic must live only in src/payment.js.
 *             No payment logic allowed in src/index.js or src/utils.js.
 *
 *   ARCH-002  No direct external HTTP calls from controllers
 *             axios (or equivalent) must not be called inside src/index.js.
 *             It must be delegated to a service-layer module.
 *
 *   ARCH-003  Authentication must use the central auth helper
 *             All JWT verification must use utils.verifyToken().
 *             Inline jwt.verify() calls outside src/utils.js are forbidden.
 *             Token checks that bypass verifyToken (e.g. length checks) are
 *             flagged as a WARN.
 *
 *   ARCH-004  Lodash usage policy
 *             lodash may only be used for deep cloning / object merging.
 *             Lodash array-operation calls (_.map, _.filter, _.find, _.reduce,
 *             _.forEach, _.every, _.some, _.flat*) outside src/utils.js are
 *             flagged as a WARN.
 *
 * Detection strategy:
 *   - Files are read as plain text; checks are regex-based (no AST).
 *   - Regex patterns are conservative: they prefer false-negatives over
 *     false-positives (i.e. they match clear textual evidence of a violation).
 *   - Each check returns a Finding with precise file + line evidence.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { worstStatus, passFinding } = require('./types');

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate payment logic.
 * Matched against files that are NOT allowed to contain payment logic.
 */
const PAYMENT_KEYWORDS = [
  /chargeCard\s*\(/,
  /createCharge\s*\(/,
  /refundPayment\s*\(/,
  /paymentGateway/,
  /stripe\s*\.\s*charges/,
  /paypal\s*\.\s*payment/,
];

/**
 * Patterns that indicate payment *orchestration* inside a controller:
 * rate fetching, token conversion, or direct charge logic alongside axios.
 * A plain `processPayment()` delegation call is NOT in this list — it is
 * the correct thin-controller pattern.
 */
const PAYMENT_ORCHESTRATION_KEYWORDS = [
  /axios\s*\.\s*\w+\s*\(.*exchange.*rate/i,
  /exchangeRate\s*\(/,
  /fetchRate\s*\(/,
  /convertCurrency\s*\(/,
  /stripe\s*\.\s*charges/,
  /paypal\s*\.\s*payment/,
];

/**
 * Patterns indicating a direct external HTTP call via axios.
 * Applied to files in the controller layer (src/index.js).
 */
const AXIOS_DIRECT_CALL = [
  /axios\s*\.\s*get\s*\(/,
  /axios\s*\.\s*post\s*\(/,
  /axios\s*\.\s*put\s*\(/,
  /axios\s*\.\s*patch\s*\(/,
  /axios\s*\.\s*delete\s*\(/,
  /axios\s*\.\s*request\s*\(/,
];

/**
 * Inline JWT verification patterns — forbidden outside src/utils.js.
 */
const INLINE_JWT_VERIFY = [
  /jwt\s*\.\s*verify\s*\(/,
  /jsonwebtoken\s*\.\s*verify\s*\(/,
];

/**
 * Weak inline token guard patterns (not jwt.verify, but suspicious manual checks).
 * Flagged as WARN rather than FAIL — they are potential bypasses, not confirmed.
 */
const WEAK_TOKEN_GUARD = [
  /token\s*\.\s*length\s*[<>]=?\s*\d+/,
  /typeof\s+token\s*===?\s*['"]string['"]/,
  /token\s*&&\s*token\s*\.\s*length/,
];

/**
 * Lodash array-operation methods that should not be used (per Rule 4).
 */
const LODASH_ARRAY_OPS = [
  /[_$]\s*\.\s*map\s*\(/,
  /[_$]\s*\.\s*filter\s*\(/,
  /[_$]\s*\.\s*find\s*\(/,
  /[_$]\s*\.\s*reduce\s*\(/,
  /[_$]\s*\.\s*forEach\s*\(/,
  /[_$]\s*\.\s*every\s*\(/,
  /[_$]\s*\.\s*some\s*\(/,
  /[_$]\s*\.\s*flatMap\s*\(/,
  /[_$]\s*\.\s*flatten\s*\(/,
];

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Read a source file relative to rootDir.
 * Returns { lines: string[], raw: string } or null if the file does not exist.
 *
 * @param {string} rootDir
 * @param {string} relPath
 * @returns {{ lines: string[], raw: string } | null}
 */
function readSource(rootDir, relPath) {
  const abs = path.join(rootDir, relPath);
  if (!fs.existsSync(abs)) return null;
  const raw   = fs.readFileSync(abs, 'utf8');
  const lines = raw.split('\n');
  return { lines, raw };
}

/**
 * Scan every line of a file for any pattern in the list.
 * Returns an array of { lineNumber (1-based), lineText, pattern }.
 *
 * @param {string[]}  lines
 * @param {RegExp[]}  patterns
 * @returns {Array<{ lineNumber: number, lineText: string, pattern: RegExp }>}
 */
function scanLines(lines, patterns) {
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    for (const re of patterns) {
      if (re.test(text)) {
        hits.push({ lineNumber: i + 1, lineText: text.trim(), pattern: re });
        break; // one hit per line is enough
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Individual rule checkers
// ---------------------------------------------------------------------------

/**
 * ARCH-001  Payment logic isolation
 *
 * src/index.js and src/utils.js must not contain payment logic.
 * src/payment.js must exist and must export at least one payment function.
 *
 * @param {string} rootDir
 * @returns {import('./types').Finding[]}
 */
function checkArch001(rootDir) {
  const findings = [];

  // 1a. Forbidden files must not contain payment logic
  const forbiddenFiles = ['src/index.js', 'src/utils.js'];
  for (const relPath of forbiddenFiles) {
    const src = readSource(rootDir, relPath);
    if (!src) continue;

    const hits = scanLines(src.lines, PAYMENT_KEYWORDS);
    if (hits.length > 0) {
      for (const hit of hits) {
        findings.push({
          ruleId:  'ARCH-001',
          status:  'FAIL',
          title:   `Payment logic found outside src/payment.js`,
          detail:  `"${relPath}" contains payment-related code. All payment logic must be confined to src/payment.js. ` +
                   `Found: "${hit.lineText}"`,
          file:    relPath,
          line:    hit.lineNumber,
          snippet: hit.lineText,
        });
      }
    }
  }

  // 1b. src/payment.js must exist
  const paymentSrc = readSource(rootDir, 'src/payment.js');
  if (!paymentSrc) {
    findings.push({
      ruleId:  'ARCH-001',
      status:  'FAIL',
      title:   'src/payment.js does not exist',
      detail:  'The canonical payment module is missing. All payment logic must live in src/payment.js.',
      file:    'src/payment.js',
      line:    null,
      snippet: null,
    });
  }

  // 1c. Check: index.js contains payment orchestration logic.
  //     A thin delegation like `await processPayment(...)` is ALLOWED.
  //     FAIL only when orchestration keywords (rate-fetch, currency conversion,
  //     direct charge calls mixed with axios) are present.
  const indexSrc = readSource(rootDir, 'src/index.js');
  if (indexSrc) {
    const orchHits = scanLines(indexSrc.lines, PAYMENT_ORCHESTRATION_KEYWORDS);
    for (const hit of orchHits) {
      findings.push({
        ruleId:  'ARCH-001',
        status:  'FAIL',
        title:   'Payment orchestration logic in controller (src/index.js)',
        detail:  'src/index.js contains payment orchestration code (rate fetching, currency ' +
                 'conversion, or direct charge calls). This logic must be fully encapsulated ' +
                 'in src/payment.js. The controller should only call processPayment().',
        file:    'src/index.js',
        line:    hit.lineNumber,
        snippet: hit.lineText,
      });
    }
  }

  if (findings.length === 0) {
    findings.push(passFinding('ARCH-001', 'Payment logic is correctly isolated in src/payment.js'));
  }

  return findings;
}

/**
 * ARCH-002  No direct external HTTP calls from controllers
 *
 * src/index.js must not contain direct axios calls.
 *
 * @param {string} rootDir
 * @returns {import('./types').Finding[]}
 */
function checkArch002(rootDir) {
  const findings = [];
  const src = readSource(rootDir, 'src/index.js');

  if (!src) {
    findings.push({
      ruleId:  'ARCH-002',
      status:  'WARN',
      title:   'src/index.js not found — ARCH-002 could not be checked',
      detail:  'The controller file is missing.',
      file:    'src/index.js',
      line:    null,
      snippet: null,
    });
    return findings;
  }

  const hits = scanLines(src.lines, AXIOS_DIRECT_CALL);
  if (hits.length > 0) {
    for (const hit of hits) {
      findings.push({
        ruleId:  'ARCH-002',
        status:  'FAIL',
        title:   'Direct axios call in controller',
        detail:  'src/index.js calls axios directly inside a route handler. ' +
                 'External HTTP calls must go through a dedicated service module ' +
                 '(e.g. src/services/exchangeRateService.js).',
        file:    'src/index.js',
        line:    hit.lineNumber,
        snippet: hit.lineText,
      });
    }
  } else {
    findings.push(passFinding('ARCH-002', 'No direct axios calls found in controller'));
  }

  return findings;
}

/**
 * ARCH-003  Authentication must use the central auth helper
 *
 * jwt.verify() must not appear outside src/utils.js (FAIL).
 * Weak manual token guards in src/index.js are flagged as WARN.
 * src/utils.js must export verifyToken.
 *
 * @param {string} rootDir
 * @returns {import('./types').Finding[]}
 */
function checkArch003(rootDir) {
  const findings = [];

  // 3a. Scan every src/*.js file except utils.js for inline jwt.verify
  const srcFiles = ['src/index.js', 'src/payment.js'];
  for (const relPath of srcFiles) {
    const src = readSource(rootDir, relPath);
    if (!src) continue;

    const hits = scanLines(src.lines, INLINE_JWT_VERIFY);
    for (const hit of hits) {
      findings.push({
        ruleId:  'ARCH-003',
        status:  'FAIL',
        title:   'Inline jwt.verify() call outside src/utils.js',
        detail:  `"${relPath}" calls jwt.verify() directly. All JWT verification must ` +
                 'go through utils.verifyToken(). Remove this call and use the central helper.',
        file:    relPath,
        line:    hit.lineNumber,
        snippet: hit.lineText,
      });
    }
  }

  // 3b. Weak token guards in index.js (WARN)
  const indexSrc = readSource(rootDir, 'src/index.js');
  if (indexSrc) {
    // Only flag as weak guard if verifyToken is NOT called
    const callsVerifyToken = /verifyToken\s*\(/.test(indexSrc.raw);

    if (!callsVerifyToken) {
      const weakHits = scanLines(indexSrc.lines, WEAK_TOKEN_GUARD);
      for (const hit of weakHits) {
        findings.push({
          ruleId:  'ARCH-003',
          status:  'WARN',
          title:   'Weak inline token guard — verifyToken() not called',
          detail:  'src/index.js performs a manual token check (e.g. length test) instead of ' +
                   'calling utils.verifyToken(). This bypasses proper JWT signature verification.',
          file:    'src/index.js',
          line:    hit.lineNumber,
          snippet: hit.lineText,
        });
      }
    }
  }

  // 3c. utils.js must export verifyToken
  const utilsSrc = readSource(rootDir, 'src/utils.js');
  if (!utilsSrc) {
    findings.push({
      ruleId:  'ARCH-003',
      status:  'FAIL',
      title:   'src/utils.js does not exist — central auth helper missing',
      detail:  'The module that must export verifyToken() is absent.',
      file:    'src/utils.js',
      line:    null,
      snippet: null,
    });
  } else {
    const exportsVerifyToken = /module\.exports\s*=.*verifyToken/.test(utilsSrc.raw) ||
                               /exports\.verifyToken\s*=/.test(utilsSrc.raw);
    if (!exportsVerifyToken) {
      findings.push({
        ruleId:  'ARCH-003',
        status:  'FAIL',
        title:   'src/utils.js does not export verifyToken()',
        detail:  'The central auth helper must export a function named verifyToken.',
        file:    'src/utils.js',
        line:    null,
        snippet: null,
      });
    }
  }

  if (findings.length === 0) {
    findings.push(passFinding('ARCH-003', 'All JWT verification goes through utils.verifyToken()'));
  }

  return findings;
}

/**
 * ARCH-004  Lodash usage policy
 *
 * Lodash array-operation calls outside src/utils.js are flagged as WARN.
 *
 * @param {string} rootDir
 * @returns {import('./types').Finding[]}
 */
function checkArch004(rootDir) {
  const findings = [];

  const filesToScan = ['src/index.js', 'src/payment.js'];
  for (const relPath of filesToScan) {
    const src = readSource(rootDir, relPath);
    if (!src) continue;

    const hits = scanLines(src.lines, LODASH_ARRAY_OPS);
    for (const hit of hits) {
      findings.push({
        ruleId:  'ARCH-004',
        status:  'WARN',
        title:   'Lodash array-operation usage outside src/utils.js',
        detail:  `"${relPath}" uses a lodash array method. Per policy, lodash may only be used ` +
                 'for deep cloning and object merging. Use native Array methods instead.',
        file:    relPath,
        line:    hit.lineNumber,
        snippet: hit.lineText,
      });
    }
  }

  if (findings.length === 0) {
    findings.push(passFinding('ARCH-004', 'No disallowed lodash array-operation usage found'));
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Agent class
// ---------------------------------------------------------------------------

class InvariantGuardian {
  get agentId()   { return 'invariant-guardian'; }
  get agentName() { return 'Invariant Guardian'; }

  /**
   * Run all four architectural rule checks.
   *
   * @param {import('./supervisor').RunContext} context
   * @returns {Promise<import('./types').AgentReport>}
   */
  async run(context) {
    const { rootDir } = context;
    const errors      = [];
    let   findings    = [];

    const checks = [
      { id: 'ARCH-001', fn: checkArch001 },
      { id: 'ARCH-002', fn: checkArch002 },
      { id: 'ARCH-003', fn: checkArch003 },
      { id: 'ARCH-004', fn: checkArch004 },
    ];

    for (const check of checks) {
      try {
        const results = check.fn(rootDir);
        findings = findings.concat(results);
      } catch (err) {
        errors.push(`${check.id} check failed with error: ${err.message}`);
      }
    }

    const overallStatus = worstStatus([
      ...findings.map(f => f.status),
      ...(errors.length > 0 ? ['ERROR'] : []),
    ]);

    return {
      agentId:       this.agentId,
      agentName:     this.agentName,
      ranAt:         new Date().toISOString(),
      overallStatus,
      findings,
      errors,
    };
  }
}

module.exports = { InvariantGuardian };
