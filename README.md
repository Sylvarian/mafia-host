# Mafia Host

Mafia Host is a host-operated web application for running in-person Mafia games. It is intended to
replace the host's pen-and-paper bookkeeping while players remain together in the same room and use
physical role and result cards.

## Current status

Phase 5 — Core night resolution — is implemented as a framework-independent domain pipeline and a
narrow application operation. Phase 4 still guides the host through the physical wake sequence,
allows corrections, and finalises one immutable `CollectedNightActions` batch. Phase 5 revalidates
that completed batch and deterministically calculates Consort block attempts and immunity, blocked
actors, final visits, temporary frames, Doctor protections, Godfather and Serial Killer attack
outcomes, provisional deaths, Sheriff results, permanent Investigator/Consigliere groups, and
Detective tracking results.

Resolution returns one immutable `NightResolution`; it does not mutate or replace the authoritative
`GameState`. In particular, players remain alive in the active game and the phase remains
`night-action-collection`. The result contains no Dawn prose, public role reveal, Executioner
conversion, Jester effect, personal or faction victory, or next phase. Applying provisional deaths
and communicating private/public results remain Phase 6 work. No Phase 5 UI was added.

When first-night killing is disabled, living Godfathers and Serial Killers remain omitted from the
Phase 4 batch, so Phase 5 creates no visit or attack for them. Consorts are immune to Consort blocks
but still visit and perform their submitted action. Temporary frames affect Sheriff and the shared
permanent Investigator/Consigliere group resolver without changing the target's actual role. One
unblocked Doctor protection prevents every ordinary Godfather and Serial Killer attack against its
target for that night.

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
begin-night use case, draft collection, correction, review, and final batch coordination. Phase 5
adds permanent investigation data and pure, separately testable resolution stages in the domain;
the application only accepts a completed Phase 4 workflow and returns the structured domain result.
React renders application selectors and keeps only interaction guards and focus state locally.

## Project authorities

- [Contributor and architecture instructions](AGENTS.md)
- [Game rules and product specification](docs/GAME_RULES_AND_PRODUCT_SPEC.md)
- [Phased implementation plan](docs/IMPLEMENTATION_PLAN.md)
