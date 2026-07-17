# Mafia Host

Mafia Host is a host-operated web application for running in-person Mafia games. It is intended to
replace the host's pen-and-paper bookkeeping while players remain together in the same room and use
physical role and result cards.

## Current status

Phase 4 — Night action collection — is implemented. After the Phase 3 physical distribution is
confirmed, the host deliberately begins the first night, gives close-eyes instructions, privately
reviews the living Mafia, and collects one target from every living acting role instance in an
explicit physical wake order. When first-night killing is disabled, living Godfathers and Serial
Killers are omitted from action collection while the Godfather remains in the Mafia overview.
Duplicate copies act separately. The host can move backward, replace a target, review every action,
edit from review, and finalise one immutable collected-action batch.

Phase 4 records intent only. Finalisation leaves the authoritative `GameState` in
`night-action-collection`; it does not enter `night-resolution`, apply role blocks, frames,
protections, attacks, deaths, visits, investigation results, conversions, or victory checks. The
`godfatherAndSerialCanKillEachOther` never rejects mutual target collection on nights when the
roles act; its lethal effect remains Phase 5 work. The
`godfatherAppearsSuspiciousToSheriff` setting is stored through setup and active-game creation but
does not produce a Sheriff result before Phase 5. Consort-on-Consort targets remain valid intent;
Consort immunity is also deferred to Phase 5.

Executioner role instances may still be distributed, but their target remains unset because target
eligibility is unresolved under R-008. Any living Executioner with a null target blocks first-night
entry with an explicit host message. Phase 4 does not assign a target, enter or skip the private
briefing, or claim Executioner support is complete.

## Requirements

- Node.js 24.x (LTS)
- npm 11.x or another npm version supplied with Node.js 24

The required Node major is recorded in `.nvmrc` and the `package.json` `engines` field.

## Local setup

```bash
npm ci
npm run dev
```

Vite prints the local development URL. Before submitting a change, run the same checks used by CI:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

## npm commands

| Command                | Purpose                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run dev`          | Start the Vite development server.                                   |
| `npm run build`        | Type-check all TypeScript projects and create the production bundle. |
| `npm run typecheck`    | Run strict TypeScript project checks without emitting files.         |
| `npm run lint`         | Run ESLint and all Dependency Cruiser architecture rules.            |
| `npm run boundaries`   | Run only the dependency-boundary checks.                             |
| `npm run format`       | Format supported repository files with Prettier.                     |
| `npm run format:check` | Verify formatting without changing files.                            |
| `npm test`             | Run Vitest once in non-watch mode.                                   |
| `npm run test:watch`   | Run Vitest in watch mode for local development.                      |
| `npm run preview`      | Serve the production bundle locally after a build.                   |

## Architecture

The required dependency direction is shown below. [AGENTS.md](AGENTS.md) remains the architecture
authority; this is only an orientation summary.

```text
features/UI
    ↓
application
    ↓
domain

infrastructure adapters
    ↓
application/domain contracts
```

- `src/domain` owns framework-independent game rules and may depend only on domain code.
- `src/application` coordinates domain behavior and may depend on domain code.
- `src/features` owns host workflows and calls application APIs. Slice internals stay private;
  cross-slice access must use an explicit public `index` module.
- `src/infrastructure` owns browser-specific randomness and identity adapters. They are composed
  at `App.tsx` and cannot be imported by application or feature internals.
- `src/shared/ui` is reserved for presentational components reused by at least two independent
  features.

Imports use the `@/*` alias for `src/*`, configured consistently in TypeScript and Vite.

Dependency Cruiser was selected for automated boundary enforcement because it analyses the actual
TypeScript import graph, resolves TypeScript path aliases, provides declarative rules, and directly
supports peer-folder isolation. `.dependency-cruiser.cjs` prevents upward layer imports, direct
UI-to-domain imports, cross-feature internal imports, React/CSS/routing imports in domain or
application code, imports from production code into tests, unresolved imports, and circular
dependencies. The boundary check runs as part of `npm run lint`. Its architecture test proves
relative and alias-based forbidden imports fail, permits explicit feature public APIs, and confirms
its deliberately invalid fixtures are excluded from normal production analysis.
ESLint separately rejects browser globals and global randomness in domain/application modules
because those dependencies do not appear in an import graph.

The layer-specific README files point back to the architecture authority. Phase 4 adds immutable
domain action values and structural validation, while application code owns the physical sequence,
begin-night use case, draft collection, correction, review, and final batch coordination. React
renders application selectors and keeps only interaction guards and focus state locally.

## Project authorities

- [Contributor and architecture instructions](AGENTS.md)
- [Game rules and product specification](docs/GAME_RULES_AND_PRODUCT_SPEC.md)
- [Phased implementation plan](docs/IMPLEMENTATION_PLAN.md)
