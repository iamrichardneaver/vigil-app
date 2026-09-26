/**
 * vigil/agents/ai-code-risk.js
 *
 * AI-Code Risk Agent
 * ──────────────────
 * Scans source files for patterns commonly introduced by AI code-generation
 * tools that represent security, reliability, or quality risks.
 *
 * Checks:
 *
 *   AICR-001  Hardcoded secrets / weak credentials
 *             String literals that look like secrets, passwords, or tokens
 *             passed directly to auth/crypto functions.
 *
 *   AICR-002  Inline authentication instead of a helper
 *             Token/auth logic written by hand inside a route or controller,
 *             bypassing the central auth helper.
 *
 *   AICR-003  Direct external HTTP call mixed with business logic
 *             An axios/fetch call inside a route handler that also processes
 *             the response directly — conflating I/O and computation.
 *
 *   AICR-004  Missing error handling on async calls
 *             An awaited call with no surrounding try/catch and no .catch()
 *             chain — a common AI-generation omission.
 *
 *   AICR-005  TODO / FIXME / HACK comments
 *             Placeholder comments left by AI generators that signal
 *             incomplete or unreviewed logic.
 *
 *   AICR-006  console.log in production source files
 *             Debug statements left in non-test code — common in AI output.
 *
 * @module ai-code-risk
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { worstStatus, passFinding } = require('./types');

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/** Hardcoded secret patterns: string literal passed directly to a security call */
const HARDCODED_SECRET_PATTERNS = [
  // jwt.sign / jwt.verify with a string literal as the second argument
  { re: /jwt\.(sign|verify)\s*\([^,]+,\s*['"][^'"]{3,}['"]/, label: 'JWT secret as string literal' },
  // require('crypto').createHmac(..., 'literal')
  { re: /createHmac\s*\([^,]+,\s*['"][^'"]{3,}['"]/, label: 'HMAC key as string literal' },
  // bcrypt.hash(password, 'literal') — unlikely but possible
  { re: /password\s*[:=]\s*['"][^'"]{3,}['"]/, label: 'Password assigned as string literal' },
  // Generic: variable named secret/key/password/token assigned a string
  { re: /(?:secret|apiKey|api_key|password|passwd|token)\s*[=:]\s*['"][^'"]{4,}['"]/, label: 'Credential variable assigned a string literal' },
];

/** Inline auth: manual token checks that bypass a central helper */
const INLINE_AUTH_PATTERNS = [
  { re: /req\.headers\.authorization\s*&&\s*req\.headers\.authorization\.length/, label: 'Authorization header length check' },
  { re: /token\s*&&\s*token\.length\s*[<>]=?\s*\d+/, label: 'Token length guard instead of verification' },
  { re: /typeof\s+token\s*[!=]==\s*['"]string['"]/, label: 'typeof token check instead of verification' },
  { re: /headers\[['"]authorization['"]\]\s*&&/, label: 'Raw authorization header guard' },
];

/** Direct HTTP call + response processing in the same function */
const DIRECT_HTTP_MIXED = [
  // await axios.get(...) whose result is immediately destructured or used
  { re: /await\s+axios\.\w+\s*\(.*\)\s*;?\s*\n[^\n]*(?:\.data|\.status|result|rate|resp)/, label: 'axios call result processed inline' },
  // Single-line: const x = await axios.get(...)
  { re: /const\s+\w+\s*=\s*await\s+axios\.\w+\s*\(/, label: 'axios response assigned directly in handler' },
];

/** Unawaited / unhandled async calls */
const MISSING_ERROR_HANDLING = [
  // await inside an async function with no visible try keyword on nearby lines
  // We flag this per-function by scanning blocks: simplified heuristic below.
  { re: /^\s*(?:const|let|var)\s+\w+\s*=\s*await\s+axios\./, label: 'await axios without try/catch wrapper' },
  { re: /axios\.\w+\s*\([^)]*\)\s*(?![\s\S]{0,80}\.catch)/, label: 'axios call with no .catch() chain' },
];

/** Placeholder comments left by AI generators */
const PLACEHOLDER_COMMENT_PATTERN = /\/\/\s*(?:TODO|FIXME|HACK|XXX|NOTE:|TEMP)\b/i;

/** console.log in production code */
const CONSOLE_LOG_PATTERN = /console\.(log|warn|error|debug|info)\s*\(/;

// ---------------------------------------------------------------------------
// Source file loader
// ---------------------------------------------------------------------------

/**
 * Return list of relative paths for all .js files under src/.
 *
 * @param {string} rootDir
 * @returns {string[]}
 */
function srcFiles(rootDir) {
  const srcDir = path.join(rootDir, 'src');
  if (!fs.existsSync(srcDir)) return [];
  return fs.readdirSync(srcDir)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join('src', f));
}

/**
 * @param {string} rootDir
 * @param {string} relPath
 * @returns {{ lines: string[], raw: string }}
 */
function readSource(rootDir, relPath) {
  const abs  = path.join(rootDir, relPath);
  const raw  = fs.readFileSync(abs, 'utf8');
  return { lines: raw.split('\n'), raw };
}

// ---------------------------------------------------------------------------
// Context helper: is line i inside a try block?
// ---------------------------------------------------------------------------

/**
 * Very conservative heuristic: scan back from lineIndex for a `try {` within
 * the same function block (up to 30 lines back).
 *
 * @param {string[]} lines
 * @param {number}   lineIndex  0-based
 * @returns {boolean}
 */
function isInsideTryCatch(lines, lineIndex) {
  const lookback = Math.max(0, lineIndex - 30);
  for (let i = lineIndex; i >= lookback; i--) {
    if (/\btry\s*\{/.test(lines[i])) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/**
 * AICR-001  Hardcoded secrets
 *
 * @param {string}   rootDir
 * @param {string[]} files
 * @returns {import('./types').Finding[]}
 */
function checkAicr001(rootDir, files) {
  const findings = [];

  for (const relPath of files) {
    const { lines } = readSource(rootDir, relPath);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      for (const { re, label } of HARDCODED_SECRET_PATTERNS) {
        if (re.test(text)) {
          findings.push({
            ruleId:  'AICR-001',
            status:  'FAIL',
            title:   `Hardcoded secret — ${label}`,
            detail:  `"${relPath}" contains a hardcoded credential. Secrets must be read ` +
                     `from environment variables (process.env.SECRET_NAME). Never commit ` +
                     `credentials to source control.`,
            file:    relPath,
            line:    i + 1,
            snippet: text.trim(),
          });
          break; // one finding per line
        }
      }
    }
  }

  if (findings.length === 0) {
    findings.push(passFinding('AICR-001', 'No hardcoded secrets detected'));
  }
  return findings;
}

/**
 * AICR-002  Inline authentication instead of a central helper
 *
 * @param {string}   rootDir
 * @param {string[]} files
 * @returns {import('./types').Finding[]}
 */
function checkAicr002(rootDir, files) {
  const findings = [];

  // Only flag in controller/route files (not utils.js, which is the helper itself)
  const controllerFiles = files.filter(f => !f.endsWith('utils.js'));

  for (const relPath of controllerFiles) {
    const { lines, raw } = readSource(rootDir, relPath);

    // If the file already uses verifyToken, inline guards are still a violation
    // but we downgrade to WARN since there is partial compliance.
    const usesVerifyToken = /verifyToken\s*\(/.test(raw);

    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      for (const { re, label } of INLINE_AUTH_PATTERNS) {
        if (re.test(text)) {
          findings.push({
            ruleId:  'AICR-002',
            status:  usesVerifyToken ? 'WARN' : 'FAIL',
            title:   `Inline auth check — ${label}`,
            detail:  `"${relPath}" performs manual authentication logic instead of delegating ` +
                     `to the central auth helper (utils.verifyToken). Inline checks are ` +
                     `error-prone and bypass the single point of control.`,
            file:    relPath,
            line:    i + 1,
            snippet: text.trim(),
          });
          break;
        }
      }
    }
  }

  if (findings.length === 0) {
    findings.push(passFinding('AICR-002', 'No inline authentication patterns detected'));
  }
  return findings;
}

/**
 * AICR-003  Direct external HTTP call mixed with business logic
 *
 * @param {string}   rootDir
 * @param {string[]} files
 * @returns {import('./types').Finding[]}
 */
function checkAicr003(rootDir, files) {
  const findings = [];

  for (const relPath of files) {
    const { lines } = readSource(rootDir, relPath);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      for (const { re, label } of DIRECT_HTTP_MIXED) {
        if (re.test(text)) {
          findings.push({
            ruleId:  'AICR-003',
            status:  'FAIL',
            title:   `HTTP call mixed with business logic — ${label}`,
            detail:  `"${relPath}" makes an external HTTP call and processes the result ` +
                     `in the same scope. Extract the HTTP call into a dedicated service ` +
                     `module to separate I/O from computation (see ARCH-002).`,
            file:    relPath,
            line:    i + 1,
            snippet: text.trim(),
          });
          break;
        }
      }
    }
  }

  if (findings.length === 0) {
    findings.push(passFinding('AICR-003', 'No mixed HTTP-call-and-processing patterns found'));
  }
  return findings;
}

/**
 * AICR-004  Missing error handling on async calls
 *
 * Flags await axios.* calls that are not enclosed in a try/catch block.
 *
 * @param {string}   rootDir
 * @param {string[]} files
 * @returns {import('./types').Finding[]}
 */
function checkAicr004(rootDir, files) {
  const findings = [];

  for (const relPath of files) {
    const { lines } = readSource(rootDir, relPath);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      if (MISSING_ERROR_HANDLING[0].re.test(text) && !isInsideTryCatch(lines, i)) {
        findings.push({
          ruleId:  'AICR-004',
          status:  'WARN',
          title:   'Unguarded async call — no surrounding try/catch',
          detail:  `"${relPath}" awaits an axios call without a try/catch block. ` +
                   `A network failure or non-2xx response will throw an unhandled ` +
                   `rejection, crashing the request or the process. Wrap in try/catch ` +
                   `or add a .catch() handler.`,
          file:    relPath,
          line:    i + 1,
          snippet: text.trim(),
        });
      }
    }
  }

  if (findings.length === 0) {
    findings.push(passFinding('AICR-004', 'No unguarded async calls detected'));
  }
  return findings;
}

/**
 * AICR-005  TODO / FIXME / HACK comments
 *
 * @param {string}   rootDir
 * @param {string[]} files
 * @returns {import('./types').Finding[]}
 */
function checkAicr005(rootDir, files) {
  const findings = [];

  for (const relPath of files) {
    const { lines } = readSource(rootDir, relPath);
    for (let i = 0; i < lines.length; i++) {
      if (PLACEHOLDER_COMMENT_PATTERN.test(lines[i])) {
        findings.push({
          ruleId:  'AICR-005',
          status:  'WARN',
          title:   'Placeholder comment (TODO/FIXME/HACK)',
          detail:  `"${relPath}" contains a placeholder comment. These are commonly left ` +
                   `by AI generators to signal unfinished or unreviewed logic.`,
          file:    relPath,
          line:    i + 1,
          snippet: lines[i].trim(),
        });
      }
    }
  }

  if (findings.length === 0) {
    findings.push(passFinding('AICR-005', 'No TODO/FIXME/HACK comments found'));
  }
  return findings;
}

/**
 * AICR-006  console.log in production source
 *
 * @param {string}   rootDir
 * @param {string[]} files
 * @returns {import('./types').Finding[]}
 */
function checkAicr006(rootDir, files) {
  const findings = [];

  for (const relPath of files) {
    const { lines } = readSource(rootDir, relPath);
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();
      // Skip lines that are already commented out or carry a vigil-fix suppression
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') ||
          lines[i].includes('[vigil-fix AICR-006]')) continue;
      if (CONSOLE_LOG_PATTERN.test(lines[i])) {
        findings.push({
          ruleId:  'AICR-006',
          status:  'WARN',
          title:   'console.log in production source',
          detail:  `"${relPath}" contains a console statement. Debug output in production ` +
                   `may leak internal state or sensitive values. Use a structured logger.`,
          file:    relPath,
          line:    i + 1,
          snippet: lines[i].trim(),
        });
      }
    }
  }

  if (findings.length === 0) {
    findings.push(passFinding('AICR-006', 'No console.log calls found in source files'));
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Agent class
// ---------------------------------------------------------------------------

class AiCodeRisk {
  get agentId()   { return 'ai-code-risk'; }
  get agentName() { return 'AI-Code Risk'; }

  /**
   * @param {import('./supervisor').RunContext} context
   * @returns {Promise<import('./types').AgentReport>}
   */
  async run(context) {
    const { rootDir } = context;
    const errors  = [];
    let   findings = [];

    const files = srcFiles(rootDir);
    if (files.length === 0) {
      errors.push('No .js files found under src/ — AI-code risk checks skipped.');
      return {
        agentId:       this.agentId,
        agentName:     this.agentName,
        ranAt:         new Date().toISOString(),
        overallStatus: 'ERROR',
        findings:      [],
        errors,
      };
    }

    const checks = [
      { id: 'AICR-001', fn: () => checkAicr001(rootDir, files) },
      { id: 'AICR-002', fn: () => checkAicr002(rootDir, files) },
      { id: 'AICR-003', fn: () => checkAicr003(rootDir, files) },
      { id: 'AICR-004', fn: () => checkAicr004(rootDir, files) },
      { id: 'AICR-005', fn: () => checkAicr005(rootDir, files) },
      { id: 'AICR-006', fn: () => checkAicr006(rootDir, files) },
    ];

    for (const check of checks) {
      try {
        findings = findings.concat(check.fn());
      } catch (err) {
        errors.push(`${check.id} check failed: ${err.message}`);
      }
    }

    return {
      agentId:       this.agentId,
      agentName:     this.agentName,
      ranAt:         new Date().toISOString(),
      overallStatus: worstStatus([
        ...findings.map(f => f.status),
        ...(errors.length > 0 ? ['ERROR'] : []),
      ]),
      findings,
      errors,
    };
  }
}

module.exports = { AiCodeRisk };
