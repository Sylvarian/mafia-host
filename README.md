# Mafia Host

Mafia Host is a host-operated web application for running in-person Mafia games. It is intended to
replace the host's pen-and-paper bookkeeping while players remain together in the same room and use
physical role and result cards.

## Current status

Phase 7C.1 streamlines the implemented Phase 7C host workflow without changing its game rules.
After verbal nominations, trials, and voting, the host records
exactly one final result with **Execute a player** or **End day without execution**. Both operations
atomically replace the editable `day-discussion` session with a persisted `day-outcome` session in
the existing `execution-resolution` phase.

The public day screen separates living and dead players, shows only authoritative public role
reveals, and never receives hidden assignments, factions, Executioner targets, or night data.
Duplicate player names use stable labels such as `Alex (Player 1)`. Trials, nominations, verdict
votes, and majority counting remain verbal and are not recorded by the app.

Day discussion also has a temporary **Show host-only roles** control. Roles are absent from the
public day model and DOM until requested, and visibility is React-only, hidden by default, never
autosaved, and hidden again after refresh, recovery, or entry into a new day. The separate
sanitized host view shows active role labels and alive/dead state. A converted Executioner appears
as Jester with Executioner as the immutable original assignment; Executioner targets, personal
wins, and pending revenge are never included.

A private host-only execution dialog lists only living participants with duplicate-safe names and
does not disclose assignments, targets, wins, conversions, or revenge. A separate irreversible
confirmation ends the day without execution. The public post-day summary reports only who was
executed and a role when `revealRoleOnDeath` authorizes it, or that nobody was executed. It offers
no winner, revenge, game-over, or next-night control.

A private host-only Mayor dialog lists only living, unrevealed Mayor players. A deliberate confirmation
sets the existing `publiclyRevealedRoleId` authority to Mayor; there is no second Mayor-reveal
authority. Multiple Mayor copies reveal independently. Every living revealed Mayor has a persistent
public reminder that the player counts as three votes, while the host remains responsible for all
vote counting.

The first night is now one sealed canonical sequence: Mafia overview, Consorts, Framers,
Godfathers, Serial Killers, Doctors, Sheriffs, Investigators, Consiglieres, and Detectives. Duplicate
copies use role-instance ordinal and roster order. Disabled first-night killers have no step.
Consorts establish blocks before later actors wake; blocked actors still wake but receive an
explicit **BLOCKED** screen and create no action, visit, result, or Doctor target history.

Consort, Framer, Godfather, Serial Killer, and Doctor confirmation atomically seals the action and
advances directly; they receive no fabricated `Action recorded` result. Sheriff, Investigator,
Consigliere, and Detective receive exactly one private result screen, while blocked actors receive
exactly one **BLOCKED** screen. In both cases **Continue to next actor** seals the private screen
and advances atomically. There is no separate `Outcome acknowledged` state or screen. Detective
investigations do not enter the trackable visit ledger, so Detectives tracking one another see
“visited nobody.” The obsolete end-of-night investigative replay remains removed.

After the final actor, the application validates the sequential record, constructs the
canonical action batch, calculates ordinary attacks, protections, and provisional deaths, and
enters `night-resolution`. Deaths remain unapplied and hidden until the deliberate direct **Show
Dawn announcement** boundary. The inline reminder tells the host to ensure every player’s eyes are
open; no second confirmation dialog is used. Dawn applies deaths once, records only unblocked Doctors’ confirmed
targets, honors `revealRoleOnDeath`, and exposes only public-safe announcement data.

After final physical-card confirmation, every Executioner now receives one randomly selected
participating Town target from the final assignments. The injected random source is called once per
Executioner against the full canonical Town list, so duplicate Executioners remain independent and
may share a target. The target relationship records the game, Executioner player, Executioner role
instance, and target player. The host then sees one private briefing at a time and must acknowledge
every briefing before the application creates the Night 1 action workflow. Games without an
Executioner skip the briefing.

One authoritative application session spans setup, role distribution, Executioner briefing,
sequential night, final night resolution, public Dawn, first-day discussion, and the final Day 1
outcome. Each successful authoritative transition, Mayor reveal, and day completion is saved under
`mafia-host:active-session:v2`.
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

R-006 through R-012 finalize daytime, neutral-role, death-resolution, and victory rules. Phase 7C
now records explicit night/day death causes, permanent Jester and Executioner personal wins,
victim-free pending Jester revenge, and permanent Executioner-to-Jester conversions after proven
non-execution target deaths. Original assignment and target relationships remain historical
authority while selectors derive converted Jester behavior. Jester revenge victim selection and
death, faction victory, game-over presentation, and the subsequent-night loop remain planned work.

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

V2 recovery remains intentionally limited to the first Dawn, Day 1 discussion, and the final Day 1
outcome. A neutral-state subversion of `2` requires explicit death records, personal wins,
conversions, pending revenge, and the singular day outcome together. Earlier neutral-state V2
saves receive canonical empty defaults only where unambiguous. A prior Dawn announcement can prove
its night deaths and conversions during restoration. A prior Day save with any dead player but no
cause evidence fails with an explicit compatibility error rather than inferring from `alive:
false`. Dialogs, temporary selections, focus, guards, labels, and summary prose are never
persisted.

Phase 7C.1 new V2 saves persist no non-informational private outcome and no acknowledged-screen
state. Earlier V2 `Action recorded` states are replayed through validation and canonicalized to the
next exact actor; an earlier acknowledged result advances only when its persisted evidence proves
the boundary unambiguously. Ambiguous advancement fails closed with a compatibility message.
Host-role visibility and derived host-role display objects are rejected if injected into a day
save and are never emitted by current persistence.

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
immutable domain action values and structural validation. Phase 7C.1 coordinates non-informational
actions through direct confirmation/advancement and informational or blocked screens through one
atomic continue. Phase 5 adds permanent
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

Phase 7A.1 replaced collect-all/replay coordination with one application-owned sequential workflow;
Phase 7C.1 removes its obsolete acknowledged intermediate screen. The workflow records immutable
actor steps, informational or blocked immediate outcomes only, and a bounded canonical position
while deriving blocks, frames, visits, and investigation data through
shared domain mechanics. `night-completion` owns the final resolution and deliberate Dawn boundary.
Session persistence owns schema V2, narrow V1 migration, and canonical reconstruction. React owns
only temporary unconfirmed target selection, focus, errors, dialogs, and repeated-operation guards.

Phase 7B adds one pure domain transition from the matching first Dawn into Day 1 and one narrow
voluntary-Mayor reveal operation. `application/day-discussion` owns the sanitized public roster and
separate private candidate selector. Phase 7C.1 adds a third, sanitized host-role selector that is
constructed only while its React-only toggle is visible. The day feature never receives `GameState`; React owns
only the private dialog, temporary candidate selection, focus, and operation guards. V2 is extended
compatibly with an exact `day-discussion` stage. New saves omit the obsolete `mayorRevealed`
property; restoration narrowly accepts its former generated `false` value so earlier V2 saves
remain compatible. It is never domain authority.

Phase 7C adds a singular `DayOutcome`, explicit `DeathRecord` causes, permanent neutral personal
wins, victim-free pending revenge, and explicit Executioner-to-Jester conversion records. Night
application is the authoritative boundary for conversions caused by newly final night deaths;
day execution never converts its target's Executioners. `application/day-outcome` owns sanitized
living candidates and the public summary. The day feature owns only temporary dialog state and
deliberate confirmation, while the domain applies death, reveal, neutral effects, and the phase
transition in one validated immutable operation.

## Project authorities

- [Contributor and architecture instructions](AGENTS.md)
- [Game rules and product specification](docs/GAME_RULES_AND_PRODUCT_SPEC.md)
- [Phased implementation plan](docs/IMPLEMENTATION_PLAN.md)
