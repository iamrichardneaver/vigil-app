/**
 * vigil/server.js
 *
 * Express API + static UI server for the Vigil system.
 *
 * Routes:
 *   GET  /api/vigil/health  → liveness check
 *   GET  /api/vigil/report  → runs all agents, returns VigilReport as JSON
 *   POST /api/vigil/fix     → body: { ruleId?, dryRun? } — runs fix engine
 *   GET  /                  → serves vigil/public/index.html
 *
 * Usage:
 *   node vigil/server.js [--port <n>] [--root <path>]
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const express = require('express');

const { Supervisor }        = require('./agents/supervisor');
const { InvariantGuardian } = require('./agents/invariant-guardian');
const { DriftScanner }      = require('./agents/drift-scanner');
const { AiCodeRisk }        = require('./agents/ai-code-risk');
const { HealingDoc }        = require('./agents/healing-doc');
const { dryRun, applyFixes } = require('./fixes/apply');

// ---------------------------------------------------------------------------
// Config (CLI flags or env vars)
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

const portIdx     = args.indexOf('--port');
const _parsedPort = portIdx !== -1 && args[portIdx + 1]
  ? parseInt(args[portIdx + 1], 10)
  : parseInt(process.env.PORT || '3000', 10);
const PORT = Number.isFinite(_parsedPort) && _parsedPort > 0 ? _parsedPort : 3000;

const rootIdx = args.indexOf('--root');
const ROOT_DIR = rootIdx !== -1 && args[rootIdx + 1]
  ? path.resolve(args[rootIdx + 1])
  : path.resolve(__dirname, '..');   // repo root

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// Serve the admin UI from vigil/public/
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSupervisor() {
  const supervisor = new Supervisor({ rootDir: ROOT_DIR, verbose: false, silent: true });
  supervisor.register(new InvariantGuardian());
  supervisor.register(new DriftScanner());
  supervisor.register(new AiCodeRisk());
  supervisor.register(new HealingDoc());
  return supervisor;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/vigil/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/vigil/report', async (_req, res) => {
  try {
    const report = await buildSupervisor().run();

    // Persist latest report for the status command
    const reportPath = path.join(__dirname, 'last-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    res.json(report);
  } catch (err) {
    console.error('[Vigil] Report generation failed:', err);
    res.status(500).json({ error: 'Report generation failed', message: err.message });
  }
});

/**
 * POST /api/vigil/fix
 * Body (optional): { ruleId: string, dryRun: boolean }
 *
 * Response:
 *   { results: PatchResult[], report?: VigilReport }
 */
app.post('/api/vigil/fix', async (req, res) => {
  try {
    const isDryRun   = Boolean(req.body && req.body.dryRun);
    const ruleFilter = req.body && req.body.ruleId
      ? [String(req.body.ruleId)]
      : [];

    let results;
    if (isDryRun) {
      results = dryRun(ROOT_DIR, ruleFilter);
    } else {
      results = applyFixes(ROOT_DIR, ruleFilter);
    }

    // After a real apply, re-run scan so the UI can show the new status immediately
    let report = null;
    if (!isDryRun) {
      report = await buildSupervisor().run();
      const reportPath = path.join(__dirname, 'last-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    }

    // Sanitise diff values out of the response (they can be large)
    const sanitised = results.map(r => ({
      ruleIds:    r.ruleIds,
      file:       r.file,
      describe:   r.describe,
      applicable: r.applicable,
      files:      r.diff ? Object.keys(r.diff) : [],
    }));

    res.json({ dryRun: isDryRun, results: sanitised, report });
  } catch (err) {
    console.error('[Vigil] Fix failed:', err);
    res.status(500).json({ error: 'Fix failed', message: err.message });
  }
});

// Return JSON 404 for unmatched /api/* routes (prevents silent fall-through to static)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[Vigil] Server listening on http://localhost:${PORT}`);
  console.log(`[Vigil] Admin UI → http://localhost:${PORT}/`);
  console.log(`[Vigil] Report   → http://localhost:${PORT}/api/vigil/report`);
  console.log(`[Vigil] Health   → http://localhost:${PORT}/api/vigil/health`);
  console.log(`[Vigil] Fix API  → POST http://localhost:${PORT}/api/vigil/fix`);
});
