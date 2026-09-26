/**
 * vigil/agents/drift-scanner.js
 *
 * Drift Scanner Agent
 * ───────────────────
 * Reads package.json and (when present) package-lock.json to produce
 * findings about dependency health, version drift, and known-risky packages.
 *
 * Checks:
 *
 *   DRIFT-001  Watch-list packages
 *              Packages flagged for active attention (security history,
 *              known drift risk, or policy). Reports at WARN level with
 *              the declared range and resolved version.
 *
 *   DRIFT-002  Unpinned version ranges (^, ~, *)
 *              Any direct dependency declared with ^ or ~ (or *) has a
 *              moving target resolved version. Reports at WARN level.
 *
 *   DRIFT-003  Resolved version ahead of declared lower bound by ≥ 1 minor
 *              When the installed version is more than one minor version
 *              ahead of the range floor, the lock file may be stale or
 *              the range is too loose.
 *
 *   DRIFT-004  Missing package-lock.json
 *              Without a lock file the build is not reproducible. FAIL.
 *
 *   DRIFT-005  devDependencies present in production
 *              If a package listed in devDependencies is also imported by
 *              a non-test source file, it will break in production installs.
 *
 * @module drift-scanner
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { worstStatus, passFinding } = require('./types');

// ---------------------------------------------------------------------------
// Watch-list: packages that always deserve a comment in the report.
// Format: { name, reason, level: 'WARN' | 'FAIL' }
// ---------------------------------------------------------------------------
const WATCH_LIST = [
  {
    name:   'lodash',
    reason: 'Large utility library with a history of prototype-pollution CVEs ' +
            '(CVE-2019-10744, CVE-2020-8203). Only deep-merge / deep-clone use ' +
            'is permitted per ARCH-004. Prefer native alternatives for new code.',
    level:  'WARN',
  },
  {
    name:   'axios',
    reason: 'HTTP client with a history of SSRF and redirect-related CVEs ' +
            '(follow-redirects transitive dep). Ensure no direct controller usage ' +
            'per ARCH-002 and that the installed version is pinned to a patched release.',
    level:  'WARN',
  },
  {
    name:   'follow-redirects',
    reason: 'Transitive dep of axios. CVE-2023-26159 (open redirect / credential leak). ' +
            'Ensure axios is pinned to a version that pulls in follow-redirects ≥ 1.15.4.',
    level:  'WARN',
  },
  {
    name:   'path-to-regexp',
    reason: 'Transitive dep of express (0.x line). The 0.x branch is end-of-life and ' +
            'contains ReDoS vulnerabilities. Express 4.x bundles it at 0.1.x.',
    level:  'WARN',
  },
  {
    name:   'jsonwebtoken',
    reason: 'JWT library. CVE-2022-23529 / CVE-2022-23540 / CVE-2022-23541 fixed in ' +
            '9.0.0. Confirm resolved version is ≥ 9.0.0.',
    level:  'WARN',
  },
];

// ---------------------------------------------------------------------------
// Semver helpers (no third-party semver dep — only what we need)
// ---------------------------------------------------------------------------

/**
 * Parse "major.minor.patch" into [major, minor, patch] integers.
 * Returns null if the string is not a clean x.y.z version.
 *
 * @param {string} v
 * @returns {[number, number, number] | null}
 */
function parseVer(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v || '');
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

/**
 * Strip a semver range operator prefix (^, ~, >=, >, =) from a range string
 * and return the floor version string.
 *
 * @param {string} range
 * @returns {string}
 */
function floorVersion(range) {
  return range.replace(/^[\^~>=<]+/, '').trim().split(' ')[0];
}

/**
 * Return true when resolvedVersion is more than `minorThreshold` minor versions
 * ahead of the floor extracted from declaredRange, within the same major.
 *
 * @param {string} declaredRange
 * @param {string} resolvedVersion
 * @param {number} [minorThreshold=1]
 * @returns {boolean}
 */
function hasDriftedMinor(declaredRange, resolvedVersion, minorThreshold = 1) {
  const floor    = parseVer(floorVersion(declaredRange));
  const resolved = parseVer(resolvedVersion);
  if (!floor || !resolved) return false;
  if (resolved[0] !== floor[0]) return false;           // major changed — different check
  return (resolved[1] - floor[1]) > minorThreshold;
}

// ---------------------------------------------------------------------------
// Lock-file resolver
// ---------------------------------------------------------------------------

/**
 * Try to read the resolved version of a package from package-lock.json.
 * Returns null if the lock file is absent or the package is not listed.
 *
 * @param {string} rootDir
 * @param {string} pkgName
 * @returns {string | null}
 */
function resolvedVersionFromLock(rootDir, pkgName) {
  const lockPath = path.join(rootDir, 'package-lock.json');
  if (!fs.existsSync(lockPath)) return null;
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    // npm v2/v3 lock format
    const entry = (lock.packages || {})[`node_modules/${pkgName}`];
    if (entry && entry.version) return entry.version;
    // npm v1 lock format
    const dep = (lock.dependencies || {})[pkgName];
    if (dep && dep.version) return dep.version;
  } catch { /* malformed lock — handled by DRIFT-004 */ }
  return null;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/**
 * DRIFT-001  Watch-list packages
 *
 * @param {string} rootDir
 * @param {Object} pkg
 * @returns {import('./types').Finding[]}
 */
function checkDrift001(rootDir, pkg) {
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  return WATCH_LIST
    .filter(w => w.name in allDeps)
    .map(w => {
      const declaredRange   = allDeps[w.name];
      const resolvedVersion = resolvedVersionFromLock(rootDir, w.name) ?? '(lock unavailable)';
      return {
        ruleId:  'DRIFT-001',
        status:  w.level,
        title:   `Watch-list package: ${w.name}`,
        detail:  `Declared: "${declaredRange}"  Resolved: ${resolvedVersion}\n${w.reason}`,
        file:    'package.json',
        line:    null,
        snippet: `"${w.name}": "${declaredRange}"`,
      };
    });
}

/**
 * DRIFT-002  Unpinned version ranges
 *
 * @param {Object} pkg
 * @returns {import('./types').Finding[]}
 */
function checkDrift002(pkg) {
  const findings = [];
  const deps = pkg.dependencies || {};

  for (const [name, range] of Object.entries(deps)) {
    if (/^[\^~]/.test(range) || range === '*') {
      findings.push({
        ruleId:  'DRIFT-002',
        status:  'WARN',
        title:   `Unpinned range for "${name}"`,
        detail:  `Declared as "${range}". Using ^ or ~ allows npm to resolve a newer ` +
                 `patch/minor version than was tested. Pin to an exact version or use a ` +
                 `lock file and treat it as the source of truth.`,
        file:    'package.json',
        line:    null,
        snippet: `"${name}": "${range}"`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push(passFinding('DRIFT-002', 'All direct dependencies are pinned to exact versions'));
  }
  return findings;
}

/**
 * DRIFT-003  Resolved version ahead of declared floor by > 1 minor
 *
 * @param {string} rootDir
 * @param {Object} pkg
 * @returns {import('./types').Finding[]}
 */
function checkDrift003(rootDir, pkg) {
  const findings = [];
  const deps = pkg.dependencies || {};

  for (const [name, range] of Object.entries(deps)) {
    const resolved = resolvedVersionFromLock(rootDir, name);
    if (!resolved) continue;
    if (hasDriftedMinor(range, resolved)) {
      findings.push({
        ruleId:  'DRIFT-003',
        status:  'WARN',
        title:   `Version drift for "${name}"`,
        detail:  `Declared floor: "${floorVersion(range)}"  Resolved: "${resolved}". ` +
                 `The installed version is more than one minor version ahead of the ` +
                 `declared lower bound. Review the changelog and tighten the range.`,
        file:    'package.json',
        line:    null,
        snippet: `"${name}": "${range}"  →  installed: ${resolved}`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push(passFinding('DRIFT-003', 'No significant minor-version drift detected'));
  }
  return findings;
}

/**
 * DRIFT-004  Missing package-lock.json
 *
 * @param {string} rootDir
 * @returns {import('./types').Finding[]}
 */
function checkDrift004(rootDir) {
  const lockPath = path.join(rootDir, 'package-lock.json');
  if (!fs.existsSync(lockPath)) {
    return [{
      ruleId:  'DRIFT-004',
      status:  'FAIL',
      title:   'package-lock.json is missing',
      detail:  'Without a lock file the dependency resolution is non-deterministic. ' +
               'Run "npm install" to generate one and commit it to version control.',
      file:    'package-lock.json',
      line:    null,
      snippet: null,
    }];
  }
  return [passFinding('DRIFT-004', 'package-lock.json is present')];
}

/**
 * DRIFT-005  devDependency imported by a production source file
 *
 * Scans src/*.js for require() calls that resolve to a devDependency name.
 *
 * @param {string} rootDir
 * @param {Object} pkg
 * @returns {import('./types').Finding[]}
 */
function checkDrift005(rootDir, pkg) {
  const devDeps   = Object.keys(pkg.devDependencies || {});
  if (devDeps.length === 0) return [passFinding('DRIFT-005', 'No devDependencies declared')];

  const srcDir = path.join(rootDir, 'src');
  if (!fs.existsSync(srcDir)) return [passFinding('DRIFT-005', 'No src/ directory found')];

  const findings = [];

  const srcFiles = fs.readdirSync(srcDir)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join('src', f));

  for (const relPath of srcFiles) {
    const abs  = path.join(rootDir, relPath);
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match: require('pkgname') or require("pkgname")
      const m = /require\s*\(\s*['"]([^./'"]+)['"]\s*\)/.exec(line);
      if (!m) continue;
      const imported = m[1];
      if (devDeps.includes(imported)) {
        findings.push({
          ruleId:  'DRIFT-005',
          status:  'FAIL',
          title:   `devDependency "${imported}" imported in production source`,
          detail:  `"${relPath}" requires "${imported}", which is declared only in ` +
                   `devDependencies. It will be absent in a production "npm install --omit=dev". ` +
                   `Move it to dependencies or remove the import.`,
          file:    relPath,
          line:    i + 1,
          snippet: line.trim(),
        });
      }
    }
  }

  if (findings.length === 0) {
    findings.push(passFinding('DRIFT-005', 'No devDependencies imported in production source files'));
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Agent class
// ---------------------------------------------------------------------------

class DriftScanner {
  get agentId()   { return 'drift-scanner'; }
  get agentName() { return 'Drift Scanner'; }

  /**
   * @param {import('./supervisor').RunContext} context
   * @returns {Promise<import('./types').AgentReport>}
   */
  async run(context) {
    const { rootDir, pkg } = context;
    const errors   = [];
    let   findings = [];

    if (!pkg || Object.keys(pkg).length === 0) {
      errors.push('package.json could not be read — dependency checks skipped.');
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
      { id: 'DRIFT-001', fn: () => checkDrift001(rootDir, pkg) },
      { id: 'DRIFT-002', fn: () => checkDrift002(pkg) },
      { id: 'DRIFT-003', fn: () => checkDrift003(rootDir, pkg) },
      { id: 'DRIFT-004', fn: () => checkDrift004(rootDir) },
      { id: 'DRIFT-005', fn: () => checkDrift005(rootDir, pkg) },
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

module.exports = { DriftScanner };
