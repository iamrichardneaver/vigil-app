# Vigil – Living Architectural Immune System

A continuous multi-agent system built with **IBM Bob 2.0** that monitors a repository for three kinds of decay:

- dependency drift
- AI-generated code risk
- architectural invariant violations

Vigil scans the project, explains the blast radius, proposes the smallest safe fix, and can apply known patches from the CLI or a simple dashboard.

This project was built for the IBM Bob 2.0 Hackathon theme: **Build with purpose using IBM Bob 2.0**, focused on the **application maintenance** workflow.

## Problem

Developer teams still lose time on maintenance work that existing tools handle poorly:

- Dependency updates and CVEs arrive without codebase-specific impact analysis
- AI-assisted coding introduces hidden coupling, weak auth checks, and hardcoded secrets
- Architectural rules written in docs are silently broken in source files

The result is slow review, rework, and preventable production risk.

## Solution

Vigil keeps a living model of the repository and runs four specialized agents under a Supervisor:

1. **Drift Scanner** — declared vs resolved dependencies, unpinned ranges, watch-list packages
2. **AI-Code Risk Agent** — hardcoded secrets, inline auth, mixed I/O, unguarded async, leftover console output
3. **Invariant Guardian** — enforces rules from `ARCHITECTURE.md` and `docs/invariants.md`
4. **Healing & Documentation Agent** — turns findings into concrete fix proposals and checks whether architecture docs still cover active rules

A deterministic fix engine can apply known safe patches. The same report is available from:

- CLI
- REST API
- Admin UI

## How IBM Bob 2.0 was used

IBM Bob IDE was the core development partner for this project.

- Full repository context was used to read `package.json`, source files, and architecture documents
- Agent mode, parallel tasks, and subagents were used to design and implement the Supervisor plus the four Vigil agents
- Document understanding was used to extract architectural invariants from `ARCHITECTURE.md` and `docs/invariants.md`
- Bob task session summaries are included in `bob_sessions/` as required submission evidence

Bob was used to build and refine the system, not only to autocomplete snippets.

## Repository layout

```text
vigil-sample-app/
├── ARCHITECTURE.md
├── docs/invariants.md
├── src/                         # sample application under watch
├── vigil/
│   ├── living-model.md
│   ├── agents/                  # Supervisor + 4 agents
│   ├── fixes/apply.js           # deterministic patch engine
│   ├── cli.js                   # vigil scan | report | fix | status | serve
│   ├── server.js                # API + dashboard
│   └── public/index.html
├── bob_sessions/                # required Bob task summaries
└── README.md
