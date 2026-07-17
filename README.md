# Mafia Host

Mafia Host is a host-operated web application for running in-person Mafia games. It is intended to
replace the host's pen-and-paper bookkeeping while players remain together in the same room and use
physical role and result cards.

## Current status

Phase 6.5 — Versioned local session persistence and refresh recovery — is implemented on top of the
completed Phase 6 private-results and Dawn boundary. Phase 4 guides the host through the physical
wake sequence, allows corrections, and finalises one immutable `CollectedNightActions` batch.
Phase 5 deterministically resolves that batch into one canonical `NightResolution` without applying
it. Phase 6 then enters `night-resolution`, presents only Sheriff, Investigator, Consigliere, and
Detective player-facing results in physical action order, and requires each result to be
acknowledged before the host can cross the explicit public-Dawn privacy gate.

At that boundary, the domain revalidates the canonical resolution against the completed action
batch, applies provisional deaths once, preserves each acting Doctor's submitted target as minimal
per-role-instance history, and applies the configured `revealRoleOnDeath` setting. It builds a
public-safe Dawn model containing only the night number, dead player identities, and legitimately
public role reveals. The active game ends Phase 6 in `dawn-announcement`; there is no Day button,
victory evaluation, neutral conversion, or Jester effect.

One authoritative application session now spans setup, role distribution, night-action collection,
private-result presentation, and public Dawn. Each successful authoritative transition is saved
under the versioned browser key `mafia-host:active-session:v1`. On a later visit, the app validates
and canonicalises that untrusted data, shows a public-safe summary, and waits for the host to choose
**Continue saved game** before displaying private information. Invalid or incompatible saves never
become authoritative and are not deleted automatically. Dawn saves deliberately discard collected
actions, the full resolution, the private-result queue, and acknowledgement evidence.

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

## Local save and privacy

The active session is stored with browser `localStorage` on this device. It is crash/refresh
recovery, not a backup:

- The save is local to one browser profile and device. Other browsers and devices do not receive it.
- The save is not encrypted. It contains role assignments, night targets, private results,
  alive/dead state, and public reveal state. Anyone who can inspect this browser profile or its
  developer tools can read it.
- Clearing browser site data or deleting the save in Mafia Host removes it.
- Private/incognito sessions may discard it when the private browsing session closes.
- A compatible deployment normally preserves it. An unsupported schema version must be deleted
  until a migration is deliberately implemented.
- Use one host tab. Tabs are not synchronised, merged, or locked.
- There is no account, backend, database, cloud sync, export/import, or remote API.

V1 stops at the first Dawn and deliberately requires that Dawn announcement to account for every
currently dead player. That validation must be revised before later-night persistence is added;
reusing it after Phase 7 would be unsafe because it could announce deaths from earlier nights again.

The production Vite base remains `/mafia-host/` for GitHub Pages. The application has no nested
client-side routes or refresh-fallback dependency: every workflow stage renders from that project
root, and the storage key is independent of the page URL.

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
- `src/infrastructure` owns browser-specific randomness, identity, time, and local-session storage
  adapters. They are composed at the root and cannot be imported by application or feature
  internals.
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
Phase 6 adds pure death/history/reveal application and a public-safe Dawn model in the domain. The
application owns the private-result queue, acknowledgements, navigation, phase coordination, and
single-application guard. Phase 6.5 moves cross-phase ownership into one discriminated application
session, owns the V1 serialisable schema and runtime restoration, and gives infrastructure only the
JSON/localStorage transport boundary. React renders stage-specific application models and keeps
only errors, interaction guards, dialog state, save status, and focus state locally.

## Project authorities

- [Contributor and architecture instructions](AGENTS.md)
- [Game rules and product specification](docs/GAME_RULES_AND_PRODUCT_SPEC.md)
- [Phased implementation plan](docs/IMPLEMENTATION_PLAN.md)
