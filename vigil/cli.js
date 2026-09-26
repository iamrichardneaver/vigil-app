#!/usr/bin/env node
/**
 * vigil/cli.js
 *
 * Vigil installable CLI.
 *
 * Usage:
 *   vigil scan   [--verbose] [--json] [--root <path>]
 *   vigil report [--out <file>]
 *   vigil fix    [--dry-run] [--rule <ruleId>] [--root <path>]
 *   vigil status
 *   vigil serve  [--port <n>]   [--root <path>]
 *
 * Exit codes:
 *   0  All checks passed (PASS / WARN only).
 *   1  One or more FAIL or ERROR findings detected.
 *   2  Fatal / usage error.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const { Supervisor }        = require('./agents/supervisor');
const { InvariantGuardian } = require('./agents/invariant-guardian');
const { DriftScanner }      = require('./agents/drift-scanner');
const { AiCodeRisk }        = require('./agents/ai-code-risk');
const { HealingDoc }        = require('./agents/healing-doc');
const { dryRun, applyFixes, PATCHES } = require('./fixes/apply');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VIGIL_DIR = __dirname;          // vigil/
const REPO_ROOT = path.resolve(VIGIL_DIR, '..');

/**
 * Build and run a Supervisor with all four agents.
 * @param {{ rootDir: string, verbose: boolean, silent: boolean }} opts
 * @returns {Promise<import('./agents/types').VigilReport>}
 */
async function runSupervisor({ rootDir, verbose, silent }) {
  const supervisor = new Supervisor({ rootDir, verbose, silent });
  supervisor.register(new InvariantGuardian());
  supervisor.register(new DriftScanner());
  supervisor.register(new AiCodeRisk());
  supervisor.register(new HealingDoc());
  return supervisor.run();
}

/** Parse a simple key=value or --flag argv list. */
function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

/** Resolve --root flag or fall back to repo root. */
function resolveRoot(flags) {
  return flags.root ? path.resolve(String(flags.root)) : REPO_ROOT;
}

function fatal(msg) {
  process.stderr.write(`[vigil] error: ${msg}\n`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * vigil scan [--verbose] [--json] [--root <path>]
 */
async function cmdScan(flags) {
  const rootDir = resolveRoot(flags);
  const verbose = Boolean(flags.verbose);
  const json    = Boolean(flags.json);

  // When printing JSON we suppress the formatted summary; otherwise show it.
  const report = await runSupervisor({ rootDir, verbose, silent: json });

  // Always persist the latest report so `vigil status` reflects the last scan.
  const reportPath = path.join(VIGIL_DIR, 'last-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }

  const failed = report.overallStatus === 'FAIL' || report.overallStatus === 'ERROR';
  process.exit(failed ? 1 : 0);
}

/**
 * vigil report [--out <file>]
 *
 * Runs scan silently, saves JSON to a file (default: vigil/last-report.json)
 * and prints a one-line summary.
 */
async function cmdReport(flags) {
  const rootDir = resolveRoot(flags);
  const outFile = flags.out
    ? path.resolve(String(flags.out))
    : path.join(VIGIL_DIR, 'last-report.json');

  const report = await runSupervisor({ rootDir, verbose: false, silent: true });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');

  const counts = { FAIL: 0, WARN: 0, PASS: 0, ERROR: 0 };
  for (const agent of report.agents) {
    for (const f of agent.findings) counts[f.status] = (counts[f.status] || 0) + 1;
    counts.ERROR += agent.errors.length;
  }
  console.log(`[vigil] Report saved → ${outFile}`);
  console.log(`[vigil] Overall: ${report.overallStatus}  |  FAIL:${counts.FAIL}  WARN:${counts.WARN}  PASS:${counts.PASS}`);
  process.exit(0);
}

/**
 * vigil fix [--dry-run] [--rule <ruleId>] [--root <path>]
 */
async function cmdFix(flags) {
  const rootDir  = resolveRoot(flags);
  const isDryRun = Boolean(flags['dry-run']);
  const ruleFilter = flags.rule
    ? String(flags.rule).split(',').map(s => s.trim())
    : [];

  const ICONS = { applicable: '✔', skipped: '–', dryrun: '◌' };
  const LINE  = '─'.repeat(60);

  console.log(`\n${LINE}`);
  console.log(` VIGIL FIX ENGINE${isDryRun ? '  [DRY RUN — no files written]' : ''}`);
  if (ruleFilter.length) console.log(` Filter: ${ruleFilter.join(', ')}`);
  console.log(`${LINE}\n`);

  let results;
  if (isDryRun) {
    results = dryRun(rootDir, ruleFilter);
  } else {
    results = applyFixes(rootDir, ruleFilter);
  }

  let appliedCount = 0;
  let skippedCount = 0;

  for (const r of results) {
    const icon = !r.applicable ? ICONS.skipped : isDryRun ? ICONS.dryrun : ICONS.applicable;
    const label = !r.applicable ? 'not applicable' : isDryRun ? 'would patch' : 'patched';
    console.log(` ${icon}  [${r.ruleIds}]  ${r.describe}`);

    if (r.applicable && r.diff) {
      for (const relPath of Object.keys(r.diff)) {
        console.log(`       → ${relPath}`);
      }
    }
    if (!r.applicable) {
      console.log(`       (snippet not found — already fixed or rule does not apply)`);
      skippedCount++;
    } else {
      appliedCount++;
    }
    console.log();
  }

  console.log(`${LINE}`);
  if (isDryRun) {
    console.log(` Dry run complete.  ${appliedCount} patch(es) would be applied,  ${skippedCount} already clean.`);
    console.log(` Run without --dry-run to write files.`);
  } else {
    console.log(` Fix complete.  ${appliedCount} patch(es) applied,  ${skippedCount} already clean.`);
    if (appliedCount > 0) {
      console.log(` Log saved → ${path.join(VIGIL_DIR, 'last-fixes.json')}`);
      // Re-run scan and save report
      console.log(`\n Running post-fix scan…`);
      const report = await runSupervisor({ rootDir, verbose: false, silent: true });
      const reportPath = path.join(VIGIL_DIR, 'last-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
      console.log(` Post-fix status: ${report.overallStatus}  (report saved → ${reportPath})`);
    }
  }
  console.log(`${LINE}\n`);

  process.exit(0);
}

/**
 * vigil status
 *
 * Reads vigil/last-report.json if present and prints a one-liner.
 * Does NOT re-run agents — use `vigil scan` for a fresh run.
 */
function cmdStatus() {
  const reportPath = path.join(VIGIL_DIR, 'last-report.json');
  if (!fs.existsSync(reportPath)) {
    console.log('[vigil] No cached report found. Run `vigil scan` first.');
    process.exit(0);
  }

  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {
    fatal('last-report.json is corrupt. Run `vigil scan` to regenerate.');
  }

  const counts = { FAIL: 0, WARN: 0, PASS: 0, ERROR: 0 };
  for (const agent of report.agents) {
    for (const f of agent.findings) counts[f.status] = (counts[f.status] || 0) + 1;
    counts.ERROR += agent.errors.length;
  }

  console.log(`[vigil] Last scan: ${report.ranAt}`);
  console.log(`[vigil] Overall:   ${report.overallStatus}`);
  console.log(`[vigil] Findings:  FAIL:${counts.FAIL}  WARN:${counts.WARN}  PASS:${counts.PASS}  ERROR:${counts.ERROR}`);
  process.exit(0);
}

/**
 * vigil serve [--port <n>] [--root <path>]
 *
 * Starts the Express API + UI server by spawning vigil/server.js in-process.
 * We import server.js logic rather than spawning a child process so that
 * --port and --root are passed cleanly.
 */
function cmdServe(flags) {
  // Inject the flags so vigil/server.js can read them from process.argv
  const portArg = flags.port ? ['--port', String(flags.port)] : [];
  const rootArg = flags.root ? ['--root', String(flags.root)] : [];
  // Splice them into process.argv so server.js config parsing sees them
  process.argv = ['node', 'vigil/server.js', ...portArg, ...rootArg];
  require('./server');
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

const [,, command, ...rest] = process.argv;
const flags = parseArgs(rest);

const HELP = `
Usage:
  vigil scan   [--verbose] [--json] [--root <path>]
  vigil report [--out <file>]
  vigil fix    [--dry-run] [--rule <ruleId>] [--root <path>]
  vigil status
  vigil serve  [--port <n>] [--root <path>]
`;

switch (command) {
  case 'scan':
    cmdScan(flags).catch(err => { console.error(err); process.exit(2); });
    break;
  case 'report':
    cmdReport(flags).catch(err => { console.error(err); process.exit(2); });
    break;
  case 'fix':
    cmdFix(flags).catch(err => { console.error(err); process.exit(2); });
    break;
  case 'status':
    cmdStatus();
    break;
  case 'serve':
    cmdServe(flags);
    break;
  default:
    process.stdout.write(HELP + '\n');
    process.exit(command ? 2 : 0);
}
