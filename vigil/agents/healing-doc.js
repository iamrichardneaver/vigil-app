/**
 * vigil/agents/healing-doc.js
 *
 * Healing & Documentation Agent
 * ──────────────────────────────
 * Reads the findings already produced by all prior agents (via
 * context.priorReports) and generates:
 *   (a) Concrete, minimal fix recommendations for every FAIL/WARN finding.
 *   (b) Documentation gap notices when ARCHITECTURE.md or docs/ are missing
 *       coverage for the detected problems.
 *
 * This agent must be registered last so that context.priorReports is fully
 * populated when it runs.
 *
 * Fix recommendations are keyed by ruleId — each known rule maps to a precise,
 * actionable suggestion with the smallest safe code change.
 *
 * @module healing-doc
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { worstStatus, passFinding } = require('./types');

// ---------------------------------------------------------------------------
// Fix catalogue
// Keys must match the ruleIds emitted by the other agents exactly.
// Each entry:
//   title    – short name for the finding
//   fix      – smallest safe change described in imperative present tense
//   codeHint – optional minimal code diff / pseudocode
// ---------------------------------------------------------------------------
const FIX_CATALOGUE = {
  'ARCH-001': {
    title: 'Payment logic isolation',
    fix:
      'Move the payment orchestration out of the route handler in src/index.js. ' +
      'The route handler should only call a single function from src/payment.js ' +
      'and return its result. All rate-fetching, token-validation, and amount ' +
      'conversion must be delegated to the appropriate module.',
    codeHint:
      '// src/index.js — after fix\n' +
      'app.post(\'/pay\', async (req, res) => {\n' +
      '  const decoded = verifyToken(req.headers.authorization);\n' +
      '  if (!decoded) return res.status(401).json({ error: \'Unauthorized\' });\n' +
      '  const result = await processPayment(req.body.amount);\n' +
      '  res.json(result);\n' +
      '});\n' +
      '// src/payment.js — fetch the rate inside processPayment\n' +
      'const exchangeRateService = require(\'./services/exchangeRateService\');\n' +
      'async function processPayment(amount) {\n' +
      '  const rate = await exchangeRateService.getUsdRate();\n' +
      '  return { original: amount, converted: amount * rate, status: \'processed\' };\n' +
      '}',
  },

  'ARCH-002': {
    title: 'No direct HTTP calls in controllers',
    fix:
      'Create src/services/exchangeRateService.js with a single exported async ' +
      'function getUsdRate(). Move the axios.get() call into that function. ' +
      'In src/index.js, require the service and call it instead of calling axios directly.',
    codeHint:
      '// src/services/exchangeRateService.js\n' +
      'const axios = require(\'axios\');\n' +
      'async function getUsdRate() {\n' +
      '  const res = await axios.get(\'https://api.exchangerate.host/latest\');\n' +
      '  return res.data.rates.USD;\n' +
      '}\n' +
      'module.exports = { getUsdRate };',
  },

  'ARCH-003': {
    title: 'Central auth helper',
    fix:
      'In src/index.js, replace the inline token length check with a call to ' +
      'verifyToken() (already imported from ./utils). If verifyToken returns ' +
      'null the token is invalid — return 401. Remove the manual length check.',
    codeHint:
      '// src/index.js — after fix\n' +
      'const decoded = verifyToken(req.headers.authorization);\n' +
      'if (!decoded) return res.status(401).json({ error: \'Unauthorized\' });',
  },

  'ARCH-004': {
    title: 'Lodash usage policy',
    fix:
      'Replace lodash array-operation calls with native Array methods ' +
      '(map, filter, find, reduce, forEach). Only _.merge() and _.cloneDeep() ' +
      'are permitted per policy.',
    codeHint: null,
  },

  'DRIFT-001': {
    title: 'Watch-list dependency',
    fix:
      'Review the linked CVEs for each flagged package. Pin the dependency to the ' +
      'exact patched version in package.json and regenerate package-lock.json. ' +
      'Add a comment explaining the chosen version and when it should be reviewed next.',
    codeHint: null,
  },

  'DRIFT-002': {
    title: 'Unpinned version range',
    fix:
      'Replace ^ and ~ prefixes with the exact resolved version from package-lock.json. ' +
      'Treat the lock file as the authoritative version record and keep it committed.',
    codeHint:
      '// Before:  "axios": "^1.6.0"\n' +
      '// After:   "axios": "1.20.0"   ← exact resolved version from lock file',
  },

  'DRIFT-003': {
    title: 'Version drift',
    fix:
      'Tighten the declared range to reflect the tested version. Review the ' +
      'package changelog for the skipped minor versions to confirm no breaking ' +
      'or security changes were introduced.',
    codeHint: null,
  },

  'DRIFT-004': {
    title: 'Missing lock file',
    fix:
      'Run "npm install" to generate package-lock.json, then commit it. ' +
      'Add a CI step that fails if the lock file is out of sync (npm ci --dry-run).',
    codeHint: null,
  },

  'DRIFT-005': {
    title: 'devDependency in production source',
    fix:
      'Move the package from devDependencies to dependencies in package.json, ' +
      'or remove the import if it is only used in tests.',
    codeHint: null,
  },

  'AICR-001': {
    title: 'Hardcoded secret',
    fix:
      'Replace the string literal with process.env.<SECRET_NAME>. ' +
      'Add the variable to a .env.example file (no real value) and document ' +
      'it in the README. Add .env to .gitignore.',
    codeHint:
      '// Before:\n' +
      'jwt.verify(token, \'secret-key\')\n' +
      '// After:\n' +
      'jwt.verify(token, process.env.JWT_SECRET)',
  },

  'AICR-002': {
    title: 'Inline authentication',
    fix:
      'Remove the manual token guard and call utils.verifyToken() instead. ' +
      'verifyToken is already imported in src/index.js — just use it.',
    codeHint:
      '// Before:\n' +
      'if (!token || token.length < 10) { return res.status(401)... }\n' +
      '// After:\n' +
      'const decoded = verifyToken(token);\n' +
      'if (!decoded) return res.status(401).json({ error: \'Unauthorized\' });',
  },

  'AICR-003': {
    title: 'HTTP call mixed with business logic',
    fix:
      'Extract the axios call into a dedicated service module (see ARCH-002 fix). ' +
      'The route handler should receive a plain value from the service, not a raw ' +
      'axios response object.',
    codeHint: null,
  },

  'AICR-004': {
    title: 'Unguarded async call',
    fix:
      'Wrap the await call in a try/catch block. On catch, log the error and ' +
      'return an appropriate HTTP error response (e.g. 502 Bad Gateway for ' +
      'upstream service failures).',
    codeHint:
      'try {\n' +
      '  const rate = await exchangeRateService.getUsdRate();\n' +
      '} catch (err) {\n' +
      '  return res.status(502).json({ error: \'Exchange rate unavailable\' });\n' +
      '}',
  },

  'AICR-005': {
    title: 'Placeholder comment',
    fix:
      'Resolve the TODO/FIXME before merging. If the work cannot be done now, ' +
      'create a tracked issue and reference it in the comment instead of leaving ' +
      'an unlinked placeholder.',
    codeHint: null,
  },

  'AICR-006': {
    title: 'console.log in production',
    fix:
      'Replace console.log calls with a structured logger (e.g. pino or winston). ' +
      'If the statement is only for debugging, remove it entirely.',
    codeHint: null,
  },
};

// ---------------------------------------------------------------------------
// Documentation gap checks
// ---------------------------------------------------------------------------

/**
 * HEAL-DOC-001  ARCHITECTURE.md exists and covers all active rule prefixes
 *
 * @param {string} rootDir
 * @param {string[]} activeRuleIds  - All ruleIds with FAIL/WARN findings
 * @returns {import('./types').Finding[]}
 */
function checkDocGaps(rootDir, activeRuleIds) {
  const findings = [];
  const archPath = path.join(rootDir, 'ARCHITECTURE.md');

  if (!fs.existsSync(archPath)) {
    findings.push({
      ruleId:  'HEAL-DOC-001',
      status:  'FAIL',
      title:   'ARCHITECTURE.md is missing',
      detail:  'The project has no ARCHITECTURE.md. Create one to document the ' +
               'architectural rules that Vigil enforces so that developers understand ' +
               'the constraints before writing code.',
      file:    'ARCHITECTURE.md',
      line:    null,
      snippet: null,
    });
    return findings;
  }

  const archText = fs.readFileSync(archPath, 'utf8').toLowerCase();

  // Check that ARCH rules are represented — very lightweight check: we look
  // for the rule number or a key concept word.
  const ARCH_COVERAGE_PROBES = [
    { ruleId: 'ARCH-001', probe: /payment/,     label: 'payment isolation (ARCH-001)' },
    { ruleId: 'ARCH-002', probe: /axios|http|external/,  label: 'no direct HTTP from controllers (ARCH-002)' },
    { ruleId: 'ARCH-003', probe: /jwt|auth|verifytoken/, label: 'central auth helper (ARCH-003)' },
    { ruleId: 'ARCH-004', probe: /lodash/,       label: 'lodash usage policy (ARCH-004)' },
  ];

  for (const { ruleId, probe, label } of ARCH_COVERAGE_PROBES) {
    if (activeRuleIds.includes(ruleId) && !probe.test(archText)) {
      findings.push({
        ruleId:  'HEAL-DOC-001',
        status:  'WARN',
        title:   `ARCHITECTURE.md does not document: ${label}`,
        detail:  `Active violations for ${ruleId} exist but no matching section was ` +
                 `found in ARCHITECTURE.md. Add a section that describes this rule so ` +
                 `developers know the constraint.`,
        file:    'ARCHITECTURE.md',
        line:    null,
        snippet: null,
      });
    }
  }

  if (findings.length === 0) {
    findings.push(passFinding('HEAL-DOC-001', 'ARCHITECTURE.md covers all active violation areas'));
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Fix-proposal builder
// ---------------------------------------------------------------------------

/**
 * For each unique ruleId with a FAIL or WARN finding, emit one HEAL finding
 * with a concrete fix recommendation.
 *
 * @param {import('./types').Finding[]} allFindings  - Aggregated from priorReports
 * @returns {import('./types').Finding[]}
 */
function buildFixProposals(allFindings) {
  const seen   = new Set();
  const result = [];

  for (const f of allFindings) {
    if (f.status !== 'FAIL' && f.status !== 'WARN') continue;
    if (seen.has(f.ruleId)) continue;
    seen.add(f.ruleId);

    const catalogue = FIX_CATALOGUE[f.ruleId];
    if (!catalogue) continue;  // No fix defined for this rule yet

    const snippet = catalogue.codeHint
      ? `Suggested change:\n${catalogue.codeHint}`
      : null;

    result.push({
      ruleId:  `HEAL-${f.ruleId}`,
      status:  'WARN',   // Proposals are always WARN — they are advisory, not new failures
      title:   `Fix proposal for ${f.ruleId}: ${catalogue.title}`,
      detail:  catalogue.fix,
      file:    f.file,
      line:    f.line,
      snippet,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Agent class
// ---------------------------------------------------------------------------

class HealingDoc {
  get agentId()   { return 'healing-doc'; }
  get agentName() { return 'Healing & Documentation'; }

  /**
   * @param {import('./supervisor').RunContext} context
   * @returns {Promise<import('./types').AgentReport>}
   */
  async run(context) {
    const { rootDir, priorReports } = context;
    const errors   = [];
    let   findings = [];

    // -----------------------------------------------------------------------
    // 1. Collect all findings from prior agents
    // -----------------------------------------------------------------------
    const allPriorFindings = (priorReports || []).flatMap(r => r.findings);

    if (allPriorFindings.length === 0) {
      // Either no agents ran before us or they all passed with no findings.
      findings.push(passFinding('HEAL-000', 'No prior findings to process — nothing to heal'));
    } else {

      // -----------------------------------------------------------------------
      // 2. Generate fix proposals for every distinct FAIL/WARN ruleId
      // -----------------------------------------------------------------------
      const proposals = buildFixProposals(allPriorFindings);
      if (proposals.length === 0) {
        findings.push(passFinding('HEAL-FIX', 'All prior checks passed — no fix proposals needed'));
      } else {
        findings = findings.concat(proposals);
      }

      // -----------------------------------------------------------------------
      // 3. Check documentation gaps
      // -----------------------------------------------------------------------
      const activeRuleIds = allPriorFindings
        .filter(f => f.status === 'FAIL' || f.status === 'WARN')
        .map(f => f.ruleId);

      try {
        findings = findings.concat(checkDocGaps(rootDir, activeRuleIds));
      } catch (err) {
        errors.push(`HEAL-DOC-001 check failed: ${err.message}`);
      }
    }

    // -----------------------------------------------------------------------
    // 4. Summary finding: count of FAILs and WARNs across all prior reports
    // -----------------------------------------------------------------------
    const failCount = allPriorFindings.filter(f => f.status === 'FAIL').length;
    const warnCount = allPriorFindings.filter(f => f.status === 'WARN').length;
    const passCount = allPriorFindings.filter(f => f.status === 'PASS').length;

    findings.push({
      ruleId:  'HEAL-SUMMARY',
      status:  failCount > 0 ? 'FAIL' : warnCount > 0 ? 'WARN' : 'PASS',
      title:   `Health summary: ${failCount} FAIL  ${warnCount} WARN  ${passCount} PASS across all agents`,
      detail:  `Total findings from prior agents — ` +
               `FAIL: ${failCount}, WARN: ${warnCount}, PASS: ${passCount}. ` +
               (failCount > 0
                 ? 'Address all FAIL findings before merging.'
                 : warnCount > 0
                   ? 'Review WARN findings and decide which to address.'
                   : 'All checks passed.'),
      file:    null,
      line:    null,
      snippet: null,
    });

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

module.exports = { HealingDoc };
