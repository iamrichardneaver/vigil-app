/**
 * vigil/agents/index.js
 *
 * Vigil entry point.
 *
 * Usage:
 *   node vigil/agents/index.js [--verbose] [--root <path>]
 *
 * Options:
 *   --verbose     Print per-finding detail and code snippets.
 *   --root <path> Absolute or relative path to the project root to analyse.
 *                 Defaults to the repository root (two directories above this file).
 *
 * Exit codes:
 *   0  All checks passed (PASS / WARN only).
 *   1  One or more FAIL or ERROR findings detected.
 */

'use strict';

const path = require('path');

const { Supervisor }        = require('./supervisor');
const { InvariantGuardian } = require('./invariant-guardian');
const { DriftScanner }      = require('./drift-scanner');
const { AiCodeRisk }        = require('./ai-code-risk');
const { HealingDoc }        = require('./healing-doc');

// ---------------------------------------------------------------------------
// CLI argument parsing (no third-party deps)
// ---------------------------------------------------------------------------

const args    = process.argv.slice(2);
const verbose = args.includes('--verbose');

let rootDir = path.resolve(__dirname, '..', '..');  // default: repo root
const rootIdx = args.indexOf('--root');
if (rootIdx !== -1 && args[rootIdx + 1]) {
  rootDir = path.resolve(args[rootIdx + 1]);
}

// ---------------------------------------------------------------------------
// Assemble and run
// ---------------------------------------------------------------------------

const supervisor = new Supervisor({ rootDir, verbose });

supervisor.register(new InvariantGuardian());
supervisor.register(new DriftScanner());
supervisor.register(new AiCodeRisk());
supervisor.register(new HealingDoc());

supervisor.run().then(report => {
  const failed = report.overallStatus === 'FAIL' || report.overallStatus === 'ERROR';
  process.exit(failed ? 1 : 0);
}).catch(err => {
  console.error('[Vigil] Fatal error:', err);
  process.exit(2);
});
