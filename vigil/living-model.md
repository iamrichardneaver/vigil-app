# Vigil Living Model — vigil-app

> **Auto-generated architectural health snapshot.**  
> Sources: `package.json`, `ARCHITECTURE.md`, `docs/invariants.md`, `src/`.  
> Regenerate whenever the codebase changes.

---

## 1. Project Identity

| Field | Value |
|---|---|
| Name | `vigil-app` |
| Version | `1.0.0` |
| Entry point | `src/index.js` |
| Runtime | Node.js / CommonJS |
| Purpose | Sample app for the Vigil – Living Architectural Immune System (IBM Bob 2.0 Hackathon). Intentionally contains dependency drift, AI-code risks, and architectural invariant violations. |

---

## 2. Dependency Tree

### 2.1 Direct Dependencies

| Package | Declared Range | Resolved Version | Role |
|---|---|---|---|
| `express` | `^4.18.2` | `4.22.3` | HTTP server / router |
| `lodash` | `^4.17.21` | `4.18.1` | Utility — deep clone / object merge (see Rule 4) |
| `axios` | `^1.6.0` | `1.20.0` | HTTP client for external API calls |
| `jsonwebtoken` | `^9.0.0` | `9.0.3` | JWT sign / verify |

### 2.2 Direct Dev Dependencies

| Package | Declared Range | Resolved Version | Role |
|---|---|---|---|
| `nodemon` | `^3.0.1` | `3.1.14` | Dev file watcher / auto-restart |

### 2.3 Full Transitive Tree

```
vigil-app@1.0.0
├── axios@1.20.0
│   ├── follow-redirects@1.16.0
│   ├── form-data@4.0.6
│   │   ├── asynckit@0.4.0
│   │   ├── combined-stream@1.0.8
│   │   │   └── delayed-stream@1.0.0
│   │   ├── es-set-tostringtag@2.1.0
│   │   │   ├── es-errors@1.3.0
│   │   │   ├── get-intrinsic@1.3.0
│   │   │   │   ├── call-bind-apply-helpers@1.0.2
│   │   │   │   ├── es-define-property@1.0.1
│   │   │   │   ├── es-errors@1.3.0 (deduped)
│   │   │   │   ├── es-object-atoms@1.1.2
│   │   │   │   ├── function-bind@1.1.2
│   │   │   │   ├── get-proto@1.0.1
│   │   │   │   │   ├── dunder-proto@1.0.1
│   │   │   │   │   └── es-object-atoms@1.1.2 (deduped)
│   │   │   │   ├── gopd@1.2.0
│   │   │   │   ├── has-symbols@1.1.0
│   │   │   │   ├── hasown@2.0.4
│   │   │   │   └── math-intrinsics@1.1.0
│   │   │   ├── has-tostringtag@1.0.2
│   │   │   └── hasown@2.0.4
│   │   ├── hasown@2.0.4
│   │   │   └── function-bind@1.1.2
│   │   └── mime-types@2.1.35
│   │       └── mime-db@1.52.0
│   ├── https-proxy-agent@5.0.1
│   │   ├── agent-base@6.0.2
│   │   │   └── debug@4.4.3
│   │   │       └── ms@2.1.3
│   │   └── debug@4.4.3 (deduped)
│   └── proxy-from-env@2.1.0
├── express@4.22.3
│   ├── accepts@1.3.8
│   │   ├── mime-types@2.1.35 (deduped)
│   │   └── negotiator@0.6.3
│   ├── array-flatten@1.1.1
│   ├── body-parser@1.20.8
│   │   ├── bytes@3.1.2
│   │   ├── content-type@1.0.5 (deduped)
│   │   ├── debug@2.6.9
│   │   ├── depd@2.0.0 (deduped)
│   │   ├── destroy@1.2.0
│   │   ├── http-errors@2.0.1 (deduped)
│   │   ├── iconv-lite@0.4.24
│   │   │   └── safer-buffer@2.1.2
│   │   ├── on-finished@2.4.1 (deduped)
│   │   ├── qs@6.16.0 (deduped)
│   │   ├── raw-body@2.5.3
│   │   └── unpipe@1.0.0
│   ├── content-disposition@0.5.4
│   ├── content-type@1.0.5
│   ├── cookie-signature@1.0.7
│   ├── cookie@0.7.2
│   ├── debug@2.6.9
│   │   └── ms@2.0.0
│   ├── depd@2.0.0
│   ├── encodeurl@2.0.0
│   ├── escape-html@1.0.3
│   ├── etag@1.8.1
│   ├── finalhandler@1.3.2
│   ├── fresh@0.5.2
│   ├── http-errors@2.0.1
│   │   ├── depd@2.0.0 (deduped)
│   │   ├── inherits@2.0.4
│   │   ├── setprototypeof@1.2.0
│   │   ├── statuses@2.0.2 (deduped)
│   │   └── toidentifier@1.0.1
│   ├── merge-descriptors@1.0.3
│   ├── methods@1.1.2
│   ├── on-finished@2.4.1
│   │   └── ee-first@1.1.1
│   ├── parseurl@1.3.3
│   ├── path-to-regexp@0.1.13
│   ├── proxy-addr@2.0.8
│   │   ├── forwarded@0.2.0
│   │   └── ipaddr.js@1.9.1
│   ├── qs@6.16.0
│   │   ├── es-define-property@1.0.1
│   │   └── side-channel@1.1.1
│   │       ├── object-inspect@1.13.4
│   │       ├── side-channel-list@1.0.1
│   │       ├── side-channel-map@1.0.1
│   │       └── side-channel-weakmap@1.0.2
│   ├── range-parser@1.2.1
│   ├── safe-buffer@5.2.1
│   ├── send@0.19.2
│   │   └── mime@1.6.0
│   ├── serve-static@1.16.3
│   ├── setprototypeof@1.2.0
│   ├── statuses@2.0.2
│   ├── type-is@1.6.18
│   │   └── media-typer@0.3.0
│   ├── utils-merge@1.0.1
│   └── vary@1.1.2
├── jsonwebtoken@9.0.3
│   ├── jws@4.0.1
│   │   ├── jwa@2.0.1
│   │   │   ├── buffer-equal-constant-time@1.0.1
│   │   │   ├── ecdsa-sig-formatter@1.0.11
│   │   │   └── safe-buffer@5.2.1 (deduped)
│   │   └── safe-buffer@5.2.1 (deduped)
│   ├── lodash.includes@4.3.0
│   ├── lodash.isboolean@3.0.3
│   ├── lodash.isinteger@4.0.4
│   ├── lodash.isnumber@3.0.3
│   ├── lodash.isplainobject@4.0.6
│   ├── lodash.isstring@4.0.1
│   ├── lodash.once@4.1.1
│   ├── ms@2.1.3
│   └── semver@7.8.5
├── lodash@4.18.1
└── nodemon@3.1.14 (devDependency)
    ├── chokidar@3.6.0
    │   ├── anymatch@3.1.3
    │   ├── braces@3.0.3
    │   ├── glob-parent@5.1.2
    │   ├── is-binary-path@2.1.0
    │   ├── is-glob@4.0.3
    │   ├── normalize-path@3.0.0
    │   └── readdirp@3.6.0
    ├── debug@4.4.3
    ├── ignore-by-default@1.0.1
    ├── minimatch@10.2.6
    │   └── brace-expansion@5.0.12
    │       └── balanced-match@4.0.4
    ├── pstree.remy@1.1.8
    ├── semver@7.8.5 (deduped)
    ├── simple-update-notifier@2.0.0
    ├── supports-color@5.5.0
    │   └── has-flag@3.0.0
    ├── touch@3.1.1
    └── undefsafe@2.0.5
```

**Total installed packages (prod + dev, deduped):** ~60

---

## 3. Source Modules and Responsibilities

### `src/index.js` — Application Entry Point / Controller Layer
- Initialises the Express server on port `3000`.
- Registers routes: `GET /health` and `POST /pay`.
- Imports `processPayment` from `./payment` and `verifyToken` from `./utils`.
- **Current state:** Contains **three active architectural violations** (see Section 5).

### `src/payment.js` — Payment Business Logic
- Sole authorised location for payment calculations (Rule 1).
- Exports: `processPayment(amount, exchangeRate)` — converts an amount using an exchange rate and returns `{ original, converted, status }`.
- Has **no external dependencies** and no side effects.

### `src/utils.js` — Shared Utility / Auth Helper
- Exports: `verifyToken(token)` — wraps `jwt.verify()` with the shared secret; returns the decoded payload or `null` on failure.
- Exports: `deepMerge(target, source)` — thin wrapper over `_.merge()` (lodash Rule 4 compliant usage).
- Is the **single authorised** JWT verification point per Rule 3.

---

## 4. Critical Paths

### 4.1 Payment Flow (`POST /pay`)

```
Client
  │  POST /pay  { amount }
  │  Authorization: <token>
  ▼
src/index.js — route handler
  ├─ [SHOULD] verifyToken(token)  →  src/utils.js  →  jsonwebtoken.verify()
  ├─ [SHOULD] delegate HTTP call  →  dedicated service layer  →  axios
  │            (e.g. ExchangeRateService)
  ├─ processPayment(amount, rate)  →  src/payment.js  (pure computation)
  └─ res.json(result)
```

**Authorised dependency chain (as-designed):**

```
index.js  →  utils.js  →  jsonwebtoken
index.js  →  [ExchangeRateService]  →  axios
index.js  →  payment.js  (no deps)
```

### 4.2 Health Check (`GET /health`)

```
Client  →  src/index.js  →  res.json({ status: 'ok' })
```

No auth, no external calls, no side effects.

---

## 5. Architectural Rules and Invariants

Source: `ARCHITECTURE.md` + `docs/invariants.md` (identical semantics, different granularity).

### Rule 1 — Payment Logic Isolation ⚠️ CURRENTLY VIOLATED

> All payment-related business logic must live **only** inside `src/payment.js`.  
> Payment logic is **forbidden** in `src/index.js` or `src/utils.js`.

**Violation in `src/index.js` line 14–25:**  
The `/pay` route handler directly orchestrates token validation, external rate fetching, and calls `processPayment` — mixing controller and payment concerns in the same function.

---

### Rule 2 — No Direct External HTTP Calls from Controllers ⚠️ CURRENTLY VIOLATED

> Any external API call (using `axios` or similar) must go through a **dedicated service layer**.  
> Controllers must only call internal modules.

**Violation in `src/index.js` line 22:**  
```js
const rate = await axios.get('https://api.exchangerate.host/latest');
```
`axios` is called directly inside the Express route handler without an intermediary service module.

---

### Rule 3 — Authentication Must Use Central Auth Helper ⚠️ CURRENTLY VIOLATED

> All JWT verification must use `verifyToken` exported from `src/utils.js`.  
> Inline JWT verification is **forbidden**.

**Violation in `src/index.js` lines 16–19:**  
```js
const token = req.headers.authorization;
if (!token || token.length < 10) { ... }
```
This is a hand-rolled length-check substituting for `verifyToken()`. The imported `verifyToken` is not called.

---

### Rule 4 — Lodash Usage Policy ✅ COMPLIANT

> Lodash may only be used for **deep cloning and object merging**.  
> Using lodash for simple array operations is discouraged.

**Status:** `src/utils.js` uses `_.merge()` for `deepMerge()`. No other lodash usage found in source. Compliant.

---

## 6. Violation Summary

| Rule | Status | Location | Description |
|---|---|---|---|
| Rule 1 — Payment isolation | 🔴 VIOLATED | `src/index.js:14–25` | Payment orchestration logic lives in the controller |
| Rule 2 — No direct HTTP from controllers | 🔴 VIOLATED | `src/index.js:22` | `axios.get()` called directly in route handler |
| Rule 3 — Central auth helper | 🔴 VIOLATED | `src/index.js:16–19` | Inline token length-check instead of `verifyToken()` |
| Rule 4 — Lodash policy | ✅ COMPLIANT | `src/utils.js:14` | `_.merge()` used for `deepMerge()` — within policy |

---

## 7. Known Risk Areas

| Risk | Details |
|---|---|
| Hardcoded JWT secret | `src/utils.js:7` — `jwt.verify(token, 'secret-key')`. Secret is a plaintext string literal, not an environment variable. |
| Unauthenticated `/pay` route | Due to the Rule 3 violation, the auth check is a weak length test — not a real JWT validation. |
| External service SSRF surface | `axios.get()` in the controller makes a call to an external URL taken from hardcoded source but without any timeout, retry policy, or error boundary. |
| `follow-redirects` transitive dep | `axios@1.20.0` depends on `follow-redirects@1.16.0`. This package has had SSRF-related CVEs in earlier versions; pin to latest if security scanning is active. |
| `path-to-regexp@0.1.13` | Inherited via `express@4.22.3`. The `0.x` line of `path-to-regexp` is end-of-life and has known ReDoS vulnerabilities in some versions. |

---

## 8. Module Dependency Graph

```
┌──────────────────────────────────────────────┐
│                  src/index.js                │
│  (Express app, routes, controller)           │
└────┬──────────────┬────────────┬─────────────┘
     │              │            │
     ▼              ▼            ▼
src/utils.js   src/payment.js  [axios — DIRECT ⚠️]
(verifyToken,  (processPayment) (should be in service layer)
 deepMerge)
     │
     ▼
jsonwebtoken          lodash
```

---

## 9. Health Score

| Category | Score | Notes |
|---|---|---|
| Architecture compliance | 1 / 4 rules | 3 of 4 rules violated |
| Dependency freshness | ~Moderate | Installed versions resolved to latest-in-range; no `npm audit` critical CVEs found |
| Test coverage | 0% | No tests exist (`"test": "echo \"No tests yet\""`) |
| Security posture | Low | Hardcoded secret, weak inline auth, no timeout on external calls |

---

*Last updated by Vigil model generator. Re-run analysis whenever `package.json`, `src/`, `ARCHITECTURE.md`, or `docs/` change.*
