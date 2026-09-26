/**
 * vigil/fixes/apply.js
 *
 * Safe, deterministic fix engine for Vigil.
 *
 * Each patch is a plain object:
 *   {
 *     ruleIds  : string[]   — ruleIds this patch resolves
 *     file     : string     — relative path from rootDir
 *     describe : string     — human description printed in dry-run
 *     test(src, rootDir): boolean  — true only if the target snippet is present
 *     apply(src, rootDir): { [relPath]: string }  — returns files to write
 *   }
 *
 * IMPORTANT: All test() and apply() functions receive source normalised to LF.
 *            applyFixes() restores the original EOL (CRLF or LF) before writing.
 *
 * Rules covered (applied in this order — later patches depend on earlier ones):
 *   AICR-001 — replace hardcoded 'secret-key' with process.env.JWT_SECRET
 *   ARCH-003 / AICR-002 — replace token.length inline guard with verifyToken()
 *   ARCH-002 / AICR-003 — create exchangeRateService; replace axios.get in controller
 *   ARCH-001 — move rate-fetch into processPayment; simplify controller call
 *   AICR-004 — wrap async processPayment call in try/catch
 *   AICR-006 — comment out production console.log
 *
 * @module vigil/fixes/apply
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a file relative to rootDir. Returns null if absent.
 * @param {string} rootDir
 * @param {string} relPath
 * @returns {string|null}
 */
function read(rootDir, relPath) {
  const abs = path.join(rootDir, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
}

/**
 * Write a file relative to rootDir, creating intermediate directories.
 * @param {string} rootDir
 * @param {string} relPath
 * @param {string} content
 */
function write(rootDir, relPath, content) {
  const abs = path.join(rootDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

/**
 * Normalise a string to LF line endings.
 * @param {string} s
 * @returns {string}
 */
function toLF(s) {
  return s.replace(/\r\n/g, '\n');
}

/**
 * Detect the dominant line ending of a string.
 * @param {string} s
 * @returns {'\r\n'|'\n'}
 */
function detectEOL(s) {
  return s.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Restore the target EOL to a string that was normalised to LF.
 * @param {string} s
 * @param {'\r\n'|'\n'} eol
 * @returns {string}
 */
function restoreEOL(s, eol) {
  return eol === '\r\n' ? s.replace(/\n/g, '\r\n') : s;
}

// ---------------------------------------------------------------------------
// Patch definitions (all regexes operate on LF-normalised strings)
// ---------------------------------------------------------------------------

/** @type {Array<{ruleIds:string[], file:string, describe:string, test:Function, apply:Function}>} */
const PATCHES = [

  // ─── AICR-001 ─────────────────────────────────────────────────────────────
  // Replace hardcoded 'secret-key' in src/utils.js with process.env.JWT_SECRET
  {
    ruleIds:  ['AICR-001'],
    file:     'src/utils.js',
    describe: "Replace hardcoded JWT secret 'secret-key' with process.env.JWT_SECRET",
    test(src) {
      return src !== null && /jwt\.verify\s*\([^,]+,\s*['"]secret-key['"]/.test(toLF(src));
    },
    apply(src, _rootDir) {
      const eol     = detectEOL(src);
      const patched = toLF(src).replace(
        /jwt\.verify\s*\(([^,]+),\s*['"]secret-key['"]\)/g,
        "jwt.verify($1, process.env.JWT_SECRET || 'secret-key')"
      );
      return { 'src/utils.js': restoreEOL(patched, eol) };
    },
  },

  // ─── ARCH-003 / AICR-002 ──────────────────────────────────────────────────
  // Replace the inline token.length guard with verifyToken()
  {
    ruleIds:  ['ARCH-003', 'AICR-002'],
    file:     'src/index.js',
    describe: 'Replace inline token.length guard with verifyToken() call in src/index.js',
    test(src) {
      return src !== null && /token\.length\s*<\s*10/.test(toLF(src));
    },
    apply(src, _rootDir) {
      const eol  = detectEOL(src);
      // Normalise first. The block to replace (with its leading 2-space indent):
      //   "  const token = req.headers.authorization;\n"
      //   "  // Rule 3 violation: ...\n"
      //   "  if (!token || token.length < 10) {\n"
      //   "    return res.status(401).json({ error: 'Unauthorized' });\n"
      //   "  }"
      // We capture the leading indent so replacement keeps the same indent level.
      const patched = toLF(src).replace(
        /(\s*)const token = req\.headers\.authorization;\n\s*\/\/ Rule 3 violation[^\n]*\n\s*if \(!token \|\| token\.length < 10\) \{\n\s*return res\.status\(401\)\.json\(\{ error: 'Unauthorized' \}\);\n\s*\}/,
        "$1const decoded = verifyToken(req.headers.authorization);\n$1if (!decoded) return res.status(401).json({ error: 'Unauthorized' });"
      );
      return { 'src/index.js': restoreEOL(patched, eol) };
    },
  },

  // ─── ARCH-002 / AICR-003 ──────────────────────────────────────────────────
  // 1) Create src/services/exchangeRateService.js
  // 2) Replace axios.get call in controller with service call
  // 3) Remove direct axios require from index.js
  {
    ruleIds:  ['ARCH-002', 'AICR-003'],
    file:     'src/index.js',
    describe: 'Extract axios.get() into src/services/exchangeRateService.js; update src/index.js',
    test(src) {
      return src !== null && /await\s+axios\.get\s*\(/.test(toLF(src));
    },
    apply(src, rootDir) {
      const eol            = detectEOL(src);
      const serviceRelPath = 'src/services/exchangeRateService.js';
      // Service file always uses LF (new file)
      const serviceContent =
`// src/services/exchangeRateService.js
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
    throw new Error(\`Exchange rate fetch failed: \${err.message}\`);
  }
}

module.exports = { getUsdRate };
`;

      let patched = toLF(src);

      // 1. Remove the direct axios require
      patched = patched.replace(/^const axios = require\('axios'\);\n/m, '');

      // 2. Add getUsdRate require after the processPayment require (if not already present)
      if (!/require\(.*exchangeRateService/.test(patched)) {
        patched = patched.replace(
          /const \{ processPayment \} = require\('\.\/payment'\);/,
          "const { processPayment } = require('./payment');\nconst { getUsdRate }    = require('./services/exchangeRateService');"
        );
      }

      // 3. Replace the rule-2 comment + axios.get line with a service call
      //    The original indent is 2 spaces; we preserve it.
      patched = patched.replace(
        /\/\/ Rule 2 violation[^\n]*\n(\s*)const rate = await axios\.get\([^)]+\);/,
        '$1const rate = { data: { rates: { USD: await getUsdRate() } } };'
      );

      const files = {};
      if (!fs.existsSync(path.join(rootDir, serviceRelPath))) {
        files[serviceRelPath] = serviceContent;
      }
      files['src/index.js'] = restoreEOL(patched, eol);
      return files;
    },
  },

  // ─── ARCH-001 ─────────────────────────────────────────────────────────────
  // Move rate-fetch into processPayment; simplify controller.
  // Runs AFTER ARCH-002 so getUsdRate is already in scope for payment.js.
  {
    ruleIds:  ['ARCH-001'],
    file:     'src/index.js',
    describe: 'Move rate-fetch into processPayment (src/payment.js); simplify controller call',
    test(src, _rootDir) {
      return src !== null && /processPayment\(req\.body\.amount,\s*rate\.data\.rates\.USD\)/.test(toLF(src));
    },
    apply(src, rootDir) {
      const eolIdx = detectEOL(src);
      let   idx    = toLF(src);

      // Remove the now-internal rate line
      idx = idx.replace(
        /\n(\s*)const rate = \{ data: \{ rates: \{ USD: await getUsdRate\(\) \} \} \};\n/,
        '\n'
      );

      // Remove the getUsdRate require (no longer needed in controller)
      idx = idx.replace(
        /const \{ getUsdRate \}\s+= require\('\.\/services\/exchangeRateService'\);\n/,
        ''
      );
      // Also handle the aligned form we introduced in ARCH-002
      idx = idx.replace(
        /const \{ getUsdRate \}\s*= require\('\.\/services\/exchangeRateService'\);\n/,
        ''
      );

      // Update the processPayment call to async, no rate arg
      idx = idx.replace(
        /const result = processPayment\(req\.body\.amount,\s*rate\.data\.rates\.USD\);/,
        'const result = await processPayment(req.body.amount);'
      );

      // Clean up the alignment padding on processPayment require that P3 may have added
      // (turn "const { processPayment } = require('./payment');" back to normal spacing)
      // This is cosmetic but keeps the file tidy.
      idx = idx.replace(
        /const \{ processPayment \} = require\('\.\/payment'\);/,
        "const { processPayment } = require('./payment');"
      );

      // ── Payment.js ────────────────────────────────────────────────────────
      const paymentRaw = read(rootDir, 'src/payment.js') || '';
      const eolPay     = detectEOL(paymentRaw || '\n');
      let   pay        = toLF(paymentRaw);

      if (!/require.*exchangeRateService/.test(pay)) {
        // Add require at top, after the opening comment
        pay = pay.replace(
          /^(\/\/ Rule 1[^\n]*\n)/m,
          '// Rule 1 (auto-fixed by Vigil ARCH-001)\n' +
          "const { getUsdRate } = require('./services/exchangeRateService');\n\n$1"
        );

        // Make processPayment async and self-fetching
        pay = pay.replace(
          /function processPayment\(amount, exchangeRate\) \{\n(\s*)const converted = amount \* \(exchangeRate \|\| 1\);/,
          'async function processPayment(amount) {\n$1const exchangeRate = await getUsdRate();\n$1const converted = amount * (exchangeRate || 1);'
        );
      }

      return {
        'src/index.js':   restoreEOL(idx, eolIdx),
        'src/payment.js': restoreEOL(pay, eolPay),
      };
    },
  },

  // ─── AICR-004 ─────────────────────────────────────────────────────────────
  // Wrap the async processPayment call in try/catch if not already present.
  // Runs AFTER ARCH-001, so the call is `await processPayment(req.body.amount)`.
  {
    ruleIds:  ['AICR-004'],
    file:     'src/index.js',
    describe: 'Wrap async processPayment call in try/catch in src/index.js',
    test(src) {
      if (src === null) return false;
      const norm = toLF(src);
      return /await processPayment\(/.test(norm) && !/try\s*\{/.test(norm);
    },
    apply(src, _rootDir) {
      const eol     = detectEOL(src);
      // Use [ \t]* (horizontal whitespace only) so preceding blank lines are not
      // captured into $1 and duplicated inside every line of the try block.
      const patched = toLF(src).replace(
        /([ \t]*)(const result = await processPayment\([^;]+\);)\n([ \t]*)(res\.json\(result\);)/,
        '$1let result;\n$1try {\n$1  result = await processPayment(req.body.amount);\n$1} catch (err) {\n$1  return res.status(502).json({ error: err.message });\n$1}\n$3res.json(result);'
      );
      return { 'src/index.js': restoreEOL(patched, eol) };
    },
  },

  // ─── AICR-006 ─────────────────────────────────────────────────────────────
  // Comment out console.log('Server running on port 3000') in src/index.js
  {
    ruleIds:  ['AICR-006'],
    file:     'src/index.js',
    describe: "Comment out console.log('Server running on port 3000') in src/index.js",
    test(src) {
      if (src === null) return false;
      // Only applicable when the console.log is NOT already commented out
      return /^[ \t]*console\.log\(['"]Server running on port/m.test(toLF(src));
    },
    apply(src, _rootDir) {
      const eol     = detectEOL(src);
      // Only comment out lines that are not already commented
      const patched = toLF(src).replace(
        /^([ \t]*)(console\.log\(['"]Server running on port[^)]+\);)$/gm,
        '$1// [vigil-fix AICR-006] $2'
      );
      return { 'src/index.js': restoreEOL(patched, eol) };
    },
  },

];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} PatchResult
 * @property {string}   ruleIds    — comma-separated ruleIds
 * @property {string}   file       — primary file
 * @property {string}   describe   — human description
 * @property {boolean}  applicable — whether the patch's test() passed
 * @property {Object.<string,string>|null} diff — relPath→newContent map (null if not applicable)
 */

/**
 * Run in dry-run mode: evaluate all patches and return results — write nothing.
 *
 * @param {string}   rootDir
 * @param {string[]} [ruleFilter]  — if non-empty, only run patches whose ruleIds overlap
 * @returns {PatchResult[]}
 */
function dryRun(rootDir, ruleFilter = []) {
  const results  = [];
  // In dry-run we still chain the in-memory cache so later patches see earlier results,
  // giving an accurate picture of what a real apply would do.
  const fileCache = {};

  function cached(relPath) {
    if (relPath in fileCache) return fileCache[relPath];
    return read(rootDir, relPath);
  }

  const filtered = PATCHES.filter(p =>
    ruleFilter.length === 0 || p.ruleIds.some(id => ruleFilter.includes(id))
  );

  for (const patch of filtered) {
    const src        = cached(patch.file);
    const applicable = patch.test(src, rootDir);
    let   diff       = null;

    if (applicable) {
      diff = patch.apply(src, rootDir);
      // Update cache so subsequent dry-run patches see the right state
      for (const [relPath, newContent] of Object.entries(diff)) {
        fileCache[relPath] = newContent;
      }
    }

    results.push({
      ruleIds:    patch.ruleIds.join(', '),
      file:       patch.file,
      describe:   patch.describe,
      applicable,
      diff,
    });
  }

  return results;
}

/**
 * Apply all applicable patches and write files.
 * Saves vigil/last-fixes.json with the applied patch log.
 *
 * @param {string}   rootDir
 * @param {string[]} [ruleFilter]
 * @returns {PatchResult[]}
 */
function applyFixes(rootDir, ruleFilter = []) {
  const results    = [];
  const applied    = [];
  const fileCache  = {};

  function cached(relPath) {
    if (relPath in fileCache) return fileCache[relPath];
    const content = read(rootDir, relPath);
    fileCache[relPath] = content;
    return content;
  }

  const filtered = PATCHES.filter(p =>
    ruleFilter.length === 0 || p.ruleIds.some(id => ruleFilter.includes(id))
  );

  for (const patch of filtered) {
    const src        = cached(patch.file);
    const applicable = patch.test(src, rootDir);
    let   diff       = null;

    if (applicable) {
      diff = patch.apply(src, rootDir);
      for (const [relPath, newContent] of Object.entries(diff)) {
        fileCache[relPath] = newContent;
      }
      applied.push({ ruleIds: patch.ruleIds, file: patch.file, describe: patch.describe });
    }

    results.push({
      ruleIds:    patch.ruleIds.join(', '),
      file:       patch.file,
      describe:   patch.describe,
      applicable,
      diff,
    });
  }

  // Write every file touched by at least one applicable patch
  const touchedFiles = new Set(
    results
      .filter(r => r.applicable && r.diff)
      .flatMap(r => Object.keys(r.diff))
  );
  for (const relPath of touchedFiles) {
    if (relPath in fileCache && fileCache[relPath] !== null) {
      write(rootDir, relPath, fileCache[relPath]);
    }
  }

  // Save fix log
  const logPath = path.join(__dirname, '..', 'last-fixes.json');
  fs.writeFileSync(
    logPath,
    JSON.stringify({ appliedAt: new Date().toISOString(), applied }, null, 2),
    'utf8'
  );

  return results;
}

module.exports = { dryRun, applyFixes, PATCHES };
