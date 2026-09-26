/**
 * vigil/agents/supervisor.js
 *
 * Supervisor Agent — orchestrates all Vigil sub-agents.
 *
 * Responsibilities:
 *   - Accept a registry of agent instances.
 *   - Run each agent in sequence (safe for agents with file I/O).
 *   - Collect AgentReports and assemble the final VigilReport.
 *   - Print a structured summary to stdout.
 *   - Return a non-zero exit code when any FAIL or ERROR is found.
 *
 * Contract:
 *   Each registered agent must expose:
 *     async run(context: RunContext): Promise<AgentReport>
 *
 * @module supervisor
 */

'use strict';

const path  = require('path');
const { worstStatus } = require('./types');

/**
 * @typedef {Object} RunContext
 * @property {string}                        rootDir      - Absolute path to the project root being analysed
 * @property {Object}                        pkg          - Parsed package.json
 * @property {boolean}                       verbose      - Whether agents should emit debug output
 * @property {import('./types').AgentReport[]} priorReports - Reports from agents that have already run
 *                                                           (populated incrementally; empty for the first agent)
 */

class Supervisor {
  /**
   * @param {Object}  options
   * @param {string}  options.rootDir  - Project root to analyse (defaults to cwd)
   * @param {boolean} [options.verbose]
   */
  constructor({ rootDir, verbose = false, silent = false } = {}) {
    this.rootDir = rootDir || process.cwd();
    this.verbose = verbose;
    /** @type {boolean} When true, _printSummary is suppressed (used by the API server). */
    this.silent  = silent;
    /** @type {Array<{ id: string, instance: { run: Function } }>} */
    this._agents = [];
  }

  /**
   * Register an agent.
   *
   * @param {{ run: Function }} agentInstance
   */
  register(agentInstance) {
    if (typeof agentInstance.run !== 'function') {
      throw new Error(`Agent "${agentInstance.constructor?.name}" must expose a run() method.`);
    }
    this._agents.push(agentInstance);
  }

  /**
   * Run all registered agents and return the consolidated VigilReport.
   *
   * @returns {Promise<import('./types').VigilReport>}
   */
  async run() {
    let pkg = {};
    try {
      pkg = require(path.join(this.rootDir, 'package.json'));
    } catch {
      // Non-fatal — agents that need pkg will handle absence themselves.
    }

    /** @type {RunContext} */
    const context = { rootDir: this.rootDir, pkg, verbose: this.verbose, priorReports: [] };

    const agentReports = [];

    for (const agent of this._agents) {
      const label = agent.constructor?.name ?? 'UnknownAgent';
      if (this.verbose) process.stdout.write(`[Supervisor] Running ${label}...\n`);
      try {
        const report = await agent.run(context);
        agentReports.push(report);
        // Give every subsequent agent visibility into already-completed reports.
        context.priorReports = agentReports.slice();
      } catch (err) {
        // An uncaught error in an agent must not crash the supervisor.
        // Prefer the agent's own agentId/agentName if accessible; fall back
        // to the constructor name so the error record is always identifiable.
        agentReports.push({
          agentId:       agent.agentId  ?? label.toLowerCase().replace(/\s+/g, '-'),
          agentName:     agent.agentName ?? label,
          ranAt:         new Date().toISOString(),
          overallStatus: 'ERROR',
          findings:      [],
          errors:        [`Unhandled error: ${err.message}`],
        });
        context.priorReports = agentReports.slice();
      }
    }

    const overallStatus = worstStatus(agentReports.map(r => r.overallStatus));

    /** @type {import('./types').VigilReport} */
    const report = {
      version:       '1.0',
      project:       pkg.name ?? 'unknown',
      ranAt:         new Date().toISOString(),
      overallStatus,
      agents:        agentReports,
    };

    if (!this.silent) this._printSummary(report);
    return report;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _printSummary(report) {
    const ICONS = { PASS: '✅', FAIL: '❌', WARN: '⚠️ ', ERROR: '💥' };
    const line  = '─'.repeat(60);

    console.log(`\n${line}`);
    console.log(` VIGIL REPORT  •  ${report.project}  •  ${report.ranAt}`);
    console.log(`${line}`);
    console.log(` Overall: ${ICONS[report.overallStatus]} ${report.overallStatus}\n`);

    for (const agent of report.agents) {
      console.log(` ${ICONS[agent.overallStatus]} [${agent.agentId}]  ${agent.agentName}`);
      for (const f of agent.findings) {
        const icon = ICONS[f.status];
        const loc  = f.file ? `  ${f.file}${f.line != null ? `:${f.line}` : ''}` : '';
        console.log(`    ${icon} ${f.ruleId}  ${f.title}${loc}`);
        if (this.verbose && f.detail) {
          console.log(`         ${f.detail}`);
        }
        if (this.verbose && f.snippet) {
          console.log(`         > ${f.snippet.replace(/\n/g, '\n           ')}`);
        }
      }
      if (agent.errors.length > 0) {
        for (const e of agent.errors) {
          console.log(`    ${ICONS.ERROR} RUNTIME ERROR: ${e}`);
        }
      }
    }

    console.log(`${line}\n`);
  }
}

module.exports = { Supervisor };
