# Mafia Host

Mafia Host is a host-operated web application for running in-person Mafia games. It is intended to
replace the host's pen-and-paper bookkeeping while players remain together in the same room and use
physical role and result cards.

## Current status

Phase 7B — Day discussion and host-confirmed Mayor reveal — is implemented on top of the Phase
7A.1 sequential-night workflow. After the public first Dawn, the host explicitly selects **Begin
day discussion**. The transition atomically increments the established day counter from Day 0 to
Day 1, drops Dawn/night workflow authority, persists one `day-discussion` session, and stops there.

The public day screen separates living and dead players, shows only authoritative public role
reveals, and never receives hidden assignments, factions, Executioner targets, or night data.
Duplicate player names use stable labels such as `Alex (Player 1)`. Trials, nominations, verdict
votes, and majority counting remain verbal and are not recorded by the app.

A private host-only dialog lists only living, unrevealed Mayor players. A deliberate confirmation
sets the existing `publiclyRevealedRoleId` authority to Mayor; there is no second Mayor-reveal
authority. Multiple Mayor copies reveal independently. Every living revealed Mayor has a persistent
public reminder that the player counts as three votes, while the host remains responsible for all
vote counting.

The first night is now one sealed canonical sequence: Mafia overview, Consorts, Framers,
Godfathers, Serial Killers, Doctors, Sheriffs, Investigators, Consiglieres, and Detectives. Duplicate
copies use role-instance ordinal and roster order. Disabled first-night killers have no step.
Consorts establish blocks before later actors wake; blocked actors still wake but receive an
explicit **BLOCKED** screen and create no action, visit, result, or Doctor target history.

Confirming a target atomically records the action and produces only that actor’s immediate outcome.
Sheriff, Investigator, Consigliere, and Detective information is shown while the actor is awake,
acknowledged, removed from the DOM, and sealed before the next actor. Detective investigations do
not enter the trackable visit ledger, so Detectives tracking one another see “visited nobody.” The
obsolete end-of-night investigative replay has been removed.

After the final acknowledgement, the application validates the sequential record, constructs the
canonical action batch, calculates ordinary attacks, protections, and provisional deaths, and
enters `night-resolution`. Deaths remain unapplied and hidden until the deliberate **Prepare Dawn
Announcement** boundary. Dawn applies deaths once, records only unblocked Doctors’ confirmed
targets, honors `revealRoleOnDeath`, and exposes only public-safe announcement data.

After final physical-card confirmation, every Executioner now receives one randomly selected
participating Town target from the final assignments. The injected random source is called once per
Executioner against the full canonical Town list, so duplicate Executioners remain independent and
may share a target. The target relationship records the game, Executioner player, Executioner role
instance, and target player. The host then sees one private briefing at a time and must acknowledge
every briefing before the application creates the Night 1 action workflow. Games without an
Executioner skip the briefing.

One authoritative application session spans setup, role distribution, Executioner briefing,
sequential night, final night resolution, public Dawn, and first-day discussion. Each successful
authoritative transition and Mayor reveal is saved under `mafia-host:active-session:v2`.
Restoration rebuilds or validates the exact stage, rejects forged order, actions, outcomes, public
reveals, stale night data, extra fields, and stage/phase/counter combinations. Day recovery shows
only generic Day 1 metadata until the host chooses **Continue saved game**.

When first-night killing is disabled, living Godfathers and Serial Killers are omitted entirely, so
they do not wake or create an action, outcome, visit, or attack. Consorts remain immune to Consort
blocks but still visit and act. Confirmed temporary frames feed the shared Sheriff and permanent
Investigator/Consigliere mechanics immediately and at final resolution. One unblocked Doctor
protection prevents every ordinary Godfather and Serial Killer attack against its target that
night.

R-008 target eligibility, assignment, and private briefing are implemented. A setup with an
Executioner requires at least one selected participating Town role. Targets do not exist before
final distribution confirmation, are never stored on `GamePlayer`, and survive refresh without
rerandomization. Defensive validation still rejects any later-phase game with a missing, duplicate,
cross-game, unknown, or non-Town target.

R-006 through R-012 finalize daytime, neutral-role, death-resolution, and victory rules. Phase 7B
implements only entry to public day discussion and voluntary Mayor reveal. Final execution
selection, day execution, end-day flow, Executioner personal-win awarding and conversion, Jester
personal wins and revenge, faction victory calculation, game-over presentation, and the
subsequent-night loop remain planned work. The whole Executioner role is not complete.

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

V2 is a deliberate semantic break from the former collect-all/replay workflow. Narrow V1 migration
is supported for setup, distributing or confirmed role distribution, Executioner briefing, and a
valid first-Dawn save. An old in-progress night-action or private-result-presentation save is
rejected with a clear incompatible-save message because safely restoring it would require guessing
which information players already saw. Such a V1 save is not silently deleted. On safe migration,
V2 is written before the legacy key is removed; a failed V2 write preserves V1.

V2 recovery remains intentionally limited to the first Dawn and its resulting Day 1 discussion.
The Day 1 session persists only the authoritative game and participating display roster; public
rows and Mayor reminders are derived. Before later days and nights can be persisted, the session
contract must distinguish deaths newly announced at the current Dawn from earlier deaths, pending
Jester revenge obligations, permanent personal wins, Executioner conversions, and current versus
historical announcements.

The current first-Dawn representation must not be reused unchanged for later Dawns because it could
announce earlier deaths again. Phase 7E must update the contract deliberately. There is no generic
migration framework.

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

The layer-specific README files point back to the architecture authority. Phase 4 introduced
immutable domain action values and structural validation. Phase 7A.1 now coordinates those actions
sequentially and seals each actor after immediate acknowledgement. Phase 5 adds permanent
investigation data and pure, separately testable resolution stages in the domain; the application
uses those same mechanics for immediate outcomes and final resolution.
Phase 6 adds pure death/history/reveal application and a public-safe Dawn model in the domain.
Phase 6.5 moves cross-phase ownership into one discriminated application session and gives
infrastructure only JSON/localStorage transport.

Phase 7A adds an explicit domain-owned Executioner-target model and invariant module. A focused
application briefing workflow owns deterministic tuple IDs, canonical ordering, acknowledgement
evidence, navigation, and completion. The application session transition atomically finalizes
distribution, assigns targets, and selects either briefing or Night 1; briefing completion
atomically creates the night-action workflow. The dedicated feature renders only the current
sanitized briefing and never owns target authority.

Phase 7A.1 replaces collect-all/replay coordination with one application-owned sequential workflow.
It records immutable actor steps, narrow immediate outcomes, explicit acknowledgements, and a
bounded canonical position while deriving blocks, frames, visits, and investigation data through
shared domain mechanics. `night-completion` owns the final resolution and deliberate Dawn boundary.
Session persistence owns schema V2, narrow V1 migration, and canonical reconstruction. React owns
only temporary unconfirmed target selection, focus, errors, dialogs, and repeated-operation guards.

Phase 7B adds one pure domain transition from the matching first Dawn into Day 1 and one narrow
voluntary-Mayor reveal operation. `application/day-discussion` owns the sanitized public roster and
the separate private candidate selector. The day feature never receives `GameState`; React owns
only the private dialog, temporary candidate selection, focus, and operation guards. V2 is extended
compatibly with an exact `day-discussion` stage. New saves omit the obsolete `mayorRevealed`
property; restoration narrowly accepts its former generated `false` value so earlier V2 saves
remain compatible. It is never domain authority.

## Project authorities

- [Contributor and architecture instructions](AGENTS.md)
- [Game rules and product specification](docs/GAME_RULES_AND_PRODUCT_SPEC.md)
- [Phased implementation plan](docs/IMPLEMENTATION_PLAN.md)
