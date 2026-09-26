/**
 * vigil/agents/types.js
 *
 * Shared data contracts for all Vigil agents.
 * Every agent produces an AgentReport. The Supervisor aggregates them
 * into a VigilReport.
 */

'use strict';

/**
 * @typedef {'PASS' | 'FAIL' | 'WARN' | 'ERROR'} ResultStatus
 */

/**
 * @typedef {Object} Finding
 * @property {string}        ruleId       - Machine-stable identifier (e.g. "ARCH-001")
 * @property {ResultStatus}  status       - Outcome of this individual check
 * @property {string}        title        - Short human-readable description
 * @property {string}        detail       - Full explanation including evidence
 * @property {string|null}   file         - Relative path of the offending file, or null
 * @property {number|null}   line         - Line number of the offending code, or null
 * @property {string|null}   snippet      - Relevant code excerpt, or null
 */

/**
 * @typedef {Object} AgentReport
 * @property {string}        agentId      - Stable agent identifier (e.g. "invariant-guardian")
 * @property {string}        agentName    - Human name (e.g. "Invariant Guardian")
 * @property {string}        ranAt        - ISO-8601 timestamp
 * @property {ResultStatus}  overallStatus - Worst status across all findings
 * @property {Finding[]}     findings     - All individual check results
 * @property {string[]}      errors       - Any runtime errors that prevented checks from running
 */

/**
 * @typedef {Object} VigilReport
 * @property {string}        version      - Report schema version
 * @property {string}        project      - Project name from package.json
 * @property {string}        ranAt        - ISO-8601 timestamp
 * @property {ResultStatus}  overallStatus
 * @property {AgentReport[]} agents       - One entry per agent that ran
 */

/**
 * Derive the worst status across an array of statuses.
 * Precedence: ERROR > FAIL > WARN > PASS
 *
 * @param {ResultStatus[]} statuses
 * @returns {ResultStatus}
 */
function worstStatus(statuses) {
  if (statuses.includes('ERROR')) return 'ERROR';
  if (statuses.includes('FAIL'))  return 'FAIL';
  if (statuses.includes('WARN'))  return 'WARN';
  return 'PASS';
}

/**
 * Build a minimal PASS finding for a rule that passed.
 *
 * @param {string} ruleId
 * @param {string} title
 * @returns {Finding}
 */
function passFinding(ruleId, title) {
  return { ruleId, status: 'PASS', title, detail: 'Rule satisfied.', file: null, line: null, snippet: null };
}

module.exports = { worstStatus, passFinding };
