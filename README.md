# Vigil

Code-health system for the `vigil-app` project. Runs four static-analysis agents
against the source tree and reports architectural violations, dependency drift,
AI-code risks, and fix proposals.

---

## Quick start

```bash
npm start          # API server + admin UI  →  http://localhost:3000
npm run scan       # one-shot CLI scan (verbose)
npm run fix:dry    # preview all auto-fixes (no files written)
npm run fix        # apply all safe auto-fixes
```

---

## CLI — `vigil/cli.js`

The CLI is also registered as the package `bin` entry, so after `npm link` (or
`npm install -g`) the `vigil` binary is available globally.

```
node vigil/cli.js <command> [flags]
```

### Commands

| Command | Flags | Description |
|---|---|---|
| `scan` | `--verbose` `--json` `--root <path>` | Run all agents and print the report. Exits `1` on FAIL/ERROR. |
| `report` | `--out <file>` | Run agents silently, save JSON to file (default: `vigil/last-report.json`). |
| `fix` | `--dry-run` `--rule <id>` `--root <path>` | Apply (or preview) safe auto-fixes. |
| `status` | — | Print a summary of the last cached report without re-running agents. |
| `serve` | `--port <n>` `--root <path>` | Start the API + admin UI server. |

#### Examples

```bash
# Scan and exit with code 1 if issues found
node vigil/cli.js scan --verbose

# Save JSON report to a custom path
node vigil/cli.js report --out /tmp/vigil-report.json

# Preview what would change (no writes)
node vigil/cli.js fix --dry-run

# Apply only a specific rule's fix
node vigil/cli.js fix --rule AICR-001

# Apply all fixes
node vigil/cli.js fix

# Show status of last scan without re-running
node vigil/cli.js status

# Start the server on a custom port
node vigil/cli.js serve --port 8080
```

The original entry point continues to work unchanged:

```bash
node vigil/agents/index.js --verbose
```

---

## REST API — `vigil/server.js`

Start: `npm start` or `node vigil/server.js [--port <n>] [--root <path>]`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/vigil/health` | Liveness check — returns `{ status: "ok", timestamp }` |
| `GET` | `/api/vigil/report` | Runs all agents; returns full `VigilReport` JSON |
| `POST` | `/api/vigil/fix` | Runs fix engine. Body: `{ ruleId?: string, dryRun?: boolean }` |
| `GET` | `/` | Serves the admin UI |

### POST /api/vigil/fix — body & response

```jsonc
// Request body (all fields optional)
{ "ruleId": "AICR-001", "dryRun": true }

// Response
{
  "dryRun": true,
  "results": [
    { "ruleIds": "AICR-001", "file": "src/utils.js", "describe": "...",
      "applicable": true, "files": ["src/utils.js"] }
  ],
  "report": null   // populated after a real (non-dry) apply
}
```

---

## Auto-fix engine — `vigil/fixes/apply.js`

Deterministic patches for six rules. Each patch:

1. **Tests** whether its target snippet is still present before touching anything.
2. If present, **applies** the smallest safe change.
3. Patches run in dependency order so later patches see the state left by earlier ones.
4. A `vigil/last-fixes.json` log is written after every real apply.

| Rule(s) | What changes |
|---|---|
| `AICR-001` | Replaces `'secret-key'` literal in `src/utils.js` with `process.env.JWT_SECRET` |
| `ARCH-003`, `AICR-002` | Replaces `token.length < 10` guard in `src/index.js` with `verifyToken()` |
| `ARCH-002`, `AICR-003` | Creates `src/services/exchangeRateService.js`; removes `axios.get` from controller |
| `ARCH-001` | Moves rate-fetch into `processPayment` in `src/payment.js`; simplifies controller |
| `AICR-004` | Wraps remaining `await processPayment` in `try/catch` |
| `AICR-006` | Comments out `console.log('Server running …')` |

**Dry-run** prints the plan and writes nothing. **Apply** writes files and re-runs
the scan to show the updated status.

---

## Agents (unchanged)

| Agent | ID | What it checks |
|---|---|---|
| Invariant Guardian | `invariant-guardian` | Architectural rules (ARCH-001–004) |
| Drift Scanner | `drift-scanner` | Dependency health (DRIFT-001–005) |
| AI-Code Risk | `ai-code-risk` | AI-generated code patterns (AICR-001–006) |
| Healing & Documentation | `healing-doc` | Fix proposals + doc gaps |

---

## File layout

```
vigil/
  cli.js                  ← installable CLI (this file)
  server.js               ← Express API + static file server
  fixes/
    apply.js              ← auto-fix engine
  agents/
    supervisor.js         ← orchestrator
    invariant-guardian.js
    drift-scanner.js
    ai-code-risk.js
    healing-doc.js
    types.js
    index.js              ← original CLI entry (unchanged)
  public/
    index.html            ← admin UI
  last-report.json        ← written by `vigil report` / `vigil fix` / API
  last-fixes.json         ← written by `vigil fix` (real apply)
```
