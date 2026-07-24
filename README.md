# Mafia Host

Mafia Host is a host-operated web application for running in-person Mafia games. It is intended to
replace the host's pen-and-paper bookkeeping while players remain together in the same room and use
physical role and result cards.

## Current status

Phase 7F.6 adds the canonical `doctorCannotProtectRevealedMayor` setting, enabled by default for
new games. When enabled, the existing voluntary Mayor announcement authority makes that living
Mayor unavailable to every Doctor on later nights and prevents any protection or Doctor-save
event. Disabling the setting preserves normal Doctor targeting and protection. Day Discussion now
shows exact host roles immediately on every entry; its Show/Hide state remains React-only and is
never persisted.

Phase 7F.5 makes the product authority explicit: every application screen is operated by the host,
and players never view or operate the screen. Host views may therefore show exact names, current
and original roles, alignments, targets, causes, transformations, and neutral outcomes. Game-rule
communication remains separate: sections labelled **Announce to players** contain only what the
host may say aloud, while **Host results** and **Host notes** may contain complete authority.
`revealRoleOnDeath` changes the announcement, not the host-visible role. There is no separate
role-free player display mode.

Phase 7F.4 adds target intelligence, a stable randomized physical-card delivery order, Mafia-first
wake order, and unified alignment-grouped Day and execution views. Legal target cards now show the
duplicate-safe player label, canonical active role, changed original assignment, and alive/dead
state in three simultaneous Mafia/Town/Neutral columns. Phase 7F.3 adds the finalized first-night
wake rule and role-first host runner; Phase 7F.2 adds the opposing killing-role final-two draw.
Phase 7F.1 adds a complete reusable
next-game setup, one-click role-card delivery, and full
alignment-coloured host cards to Phase 7F's trial guidance and deterministic Godfather
succession. Phase 7C.1
still supplies the streamlined host workflow and
corrected Phase 7D remains the post-day victory gate.
After verbal nominations, trials, and voting, the host records
exactly one final result with **Execute a player** or **End day without execution**. Both operations
atomically replace the editable `day-discussion` session with a persisted `day-outcome` session in
the existing `execution-resolution` phase.

The Day host display separates living and dead players and derives current/original roles and
alignment from canonical game authority. **Show roles** is a convenience toggle, not a security
boundary. Duplicate player names use stable labels such as `Alex (Player 1)`. The host display shows the
strict majority needed to put someone on trial as
`floor(living participating players / 2) + 1`. Execution does not use that fixed threshold:
guilty votes must exceed innocent votes, and a tie is innocent. Trials, nominations, voters,
abstentions, guilty/innocent votes, and trial history remain verbal and are not recorded.

Day discussion has one unified host card area in fixed Mafia, Town, and Neutral columns. Living
and dead players are visibly distinct, and the temporary **Show roles** control changes role text
in place without moving cards. Role visibility is React-only, shown by default, never autosaved,
and shown again after refresh, recovery, or entry into a new day. The canonical host
view places cards by current active alignment. Every player card uses a full light red, light
green, or light grey background; repeated `Alignment:` lines are intentionally omitted. A
converted Executioner appears as Jester with
Executioner as the immutable original assignment; a promoted Mafia member appears as Godfather
with the original assignment retained.

A full-width host execution dialog groups living participants under Mafia, Town, and Neutral
while showing duplicate-safe names, current active roles, and an original assignment only when
changed. It does not repeat alignment inside each card and does not
disclose targets, wins, or revenge. A separate irreversible
confirmation ends the day without execution. The post-day screen separates the rule-compliant
announcement from exact host results. A
non-terminal summary offers the explicit next numbered night.

After each final day outcome, one pure gate checks for pending Jester revenge before any faction
predicate runs. Pending revenge remains victim-free and unchanged in the waiting stage;
the announcement uses the same “The game continues” copy whether revenge is pending or no faction
has won. With no pending
revenge, the app evaluates the finalized R-009, R-011, and R-012 predicates once. A non-terminal
state stops in post-day waiting. **Begin Night N** rebuilds the canonical sequence from
living active roles, increments the night counter once, and retains multi-day deaths, day outcomes,
Doctor target history, targets, conversions, wins, and pending revenge. Town, Mafia, Serial Killer,
the no-survivors draw, and both opposing-killer final-two draw branches enter an immutable
`game-over` session.

When the only two living players are an active Godfather and Serial Killer, the draw rule takes
precedence over Mafia parity and Serial Killer victory. If the configured mutual attack rule makes
both attacks nonlethal, the game ends immediately with both finalists alive and no extra night. If
both attacks are lethal, one atomic terminal showdown records linked simultaneous deaths for both
players and then ends in a draw. Promoted Godfathers use their active role; two same-faction Mafia
killers and multiple Serial Killers do not use this special rule. Existing personal wins remain
authoritative for the host and are announced only when the existing communication rules allow it.

If succession creates the pair while a later Night is starting, the application resolves that
terminal state immediately. Otherwise the existing Mafia overview shows **MAFIA OPEN YOUR EYES**,
the promoted player, current Godfather role, and original Mafia role, and its existing Continue
action advances directly to the first actionable Mafia role. There is no separate promotion
briefing or acknowledgement.

Game Over shows the prominent faction winner or draw and the complete final host state: exact
current/original roles, alignment, alive/dead status, death causes, Executioner targets,
promotions, conversions, personal wins, and revenge results. Raw persistence IDs are not displayed.

A host Mayor dialog lists only living, unrevealed Mayor players. A deliberate confirmation
sets the existing `publiclyRevealedRoleId` authority to Mayor; there is no second Mayor-reveal
authority. Multiple Mayor copies reveal independently. Every living revealed Mayor has a persistent
public reminder that the player counts as three votes, while the host remains responsible for all
vote counting. Mayor weight never changes the displayed living-player trial threshold. With the
default `doctorCannotProtectRevealedMayor` setting enabled, that same voluntary reveal makes the
Mayor unavailable to every Doctor starting on the following night. Death reveal, host role
visibility, and any other role display do not activate the restriction.

At the start of Night 2 or later, if no living active Godfather remains, the domain selects exactly
one living participating active Mafia member through the injected random source. The promotion is
persisted before actions, preserves the original assignment and role instance, rebuilds wake order,
and makes that player act only as Godfather for the same night. The existing Mafia overview reports
the promotion before actions. Save retry and refresh preserve the same selection without rerolling;
a later replacement may be chosen after a promoted Godfather dies.

The most recently started valid setup is also stored as a separate browser-local next-game
template. It contains the full ordered roster with each name and Playing/Not playing choice,
selected role quantities, and all game settings. It contains no game/player/role-instance IDs,
assignments, targets, counters, phases,
deaths, outcomes, private results, or other match progress. A fresh launch, completed-game
**Start next game**, or confirmed abandon opens an editable setup from that template while active
recovery always takes precedence. Setup-row identities are local to the editable draft; successful
assignment creates a fresh game identity, fresh match-player identities derived from it, fresh
role-instance identities, and a fresh randomized assignment. **Clear saved setup** affects only
future prefill and leaves the visible form and active-game save unchanged. Names-only Phase 7F data
is migrated with canonical zero-role/default-setting values and is not synchronized to the cloud.

Role-card distribution now shows every private card in one stable randomized recipient order and one
**Confirm all role cards delivered** action. The host remains responsible for privately handing
out every physical card in the displayed sequence before pressing it. The order is created through
the injected random source independently of role assignment, persisted as exact player IDs, and
restored without rerandomizing; compatible older saves use deterministic roster order. That one guarded action immediately assigns any
Executioner targets and enters the Executioner briefing, or enters Night 1 when no briefing is
required. New saves contain no per-player delivery flags; exact older all-delivered lists restore
as complete, while zero or partial lists restore as one pending bulk boundary.

The night is one sealed canonical sequence: Mafia overview, Consorts, Framers,
Godfathers, Consiglieres, Serial Killers, Doctors, Sheriffs, Investigators, and Detectives. Duplicate
copies use role-instance ordinal and roster order. With first-night kills disabled, Night 1 omits
Doctor, Godfather, and Serial Killer steps entirely; Night 2+ is unchanged.
Consorts establish blocks before later actors wake; blocked actors still wake but receive an
explicit **BLOCKED** screen and create no action, visit, result, or Doctor target history.

Consort, Framer, Godfather, Serial Killer, and Doctor confirmation atomically seals the action and
advances directly; they receive no fabricated `Action recorded` result. Sheriff, Investigator,
Consigliere, and Detective receive exactly one private result screen, while blocked actors receive
exactly one **BLOCKED** screen. In both cases **Continue** seals the private screen
and advances atomically. There is no separate `Outcome acknowledged` state or screen. Detective
investigations do not enter the trackable visit ledger, so Detectives tracking one another see
“visited nobody.” The obsolete end-of-night investigative replay remains removed.

Every actor target screen uses three fixed Mafia/Town/Neutral columns at the same time. Cards retain
the existing domain legality result while adding canonical active role, changed original
assignment, and alive/dead state; promoted Godfathers and converted Jesters therefore appear in
their current alignment. This is host-authorized presentation only and adds no targeting or
resolution rule.

After the final actor, the application validates the sequential record, constructs the
canonical action batch, calculates ordinary attacks, protections, and provisional deaths, and
enters `night-resolution`. Deaths remain unapplied and hidden until the deliberate direct
**Finalize Dawn** boundary. Dawn applies ordinary deaths once, records only
unblocked Doctors’ confirmed targets, then resolves any due Jester revenge against the
post-ordinary survivor set. It evaluates faction victory only after revenge, honors
`revealRoleOnDeath`, and exposes one current-night announcement plus exact host death and important-event details.
The domain captures a bounded, validated current-night evidence bundle before the resolved night is applied.
It records confirmed blocks, frames, and ordinary attack outcomes, including the exact unblocked
Doctors responsible for each otherwise-lethal protected attack. Dawn derives exact attackers,
protected targets, current roles, changed original roles, and one-way or combined reciprocal
Godfather/Serial Killer immunity events from that evidence. Older Dawn saves without this evidence
remain honest: deaths restore, while unavailable attacker/event detail is labelled unavailable
rather than reconstructed from final alive/dead state.

After final physical-card confirmation, every Executioner now receives one randomly selected
participating Town target from the final assignments. The injected random source is called once per
Executioner against the full canonical Town list, so duplicate Executioners remain independent and
may share a target. The target relationship records the game, Executioner player, Executioner role
instance, and target player. The host then sees one private briefing at a time. Delivering the
final target immediately creates the Night 1 action workflow—there is no ready screen or second
confirmation. Games without an Executioner enter Night 1 directly.

One authoritative application session spans setup, role distribution, Executioner briefing,
sequential night, final night resolution, Dawn resolution, host Dawn, repeated day
discussion/outcomes, waiting, and game over. Each successful authoritative transition, Mayor
reveal, revenge application, and day completion is saved under
`mafia-host:active-session:v2`.
Restoration rebuilds or validates the exact stage, rejects forged order, actions, outcomes, public
reveals, stale night data, extra fields, and stage/phase/counter combinations. Host-only recovery
shows duplicate-safe player names, the numbered stage, and the next exact host action before the
host chooses **Continue saved game**. It never reruns randomness or replays a completed result.

When first-night killing is disabled, living Doctors, Godfathers, and Serial Killers are omitted
entirely on Night 1, so they do not wake or create an action, outcome, visit, protection, or attack.
All three act normally when enabled and on Night 2+. Consorts remain immune to Consort
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
authority while selectors derive converted Jester behavior. Corrected Phase 7D evaluates faction
victory only when pending revenge is absent and adds safe waiting and game-over presentation.
Phase 7E resolves ordinary deaths before one due random Jester revenge, converts shared-target
Executioners after the revenge death, and reevaluates victory before host Dawn or game over.
Phase 7F derives active Godfather succession before later-night wake order is created. Phase 7F.2
uses that same active-role and ordinary-attack authority to settle the final two without creating a
generic combat engine or an additional playable night, including when succession first creates the
eligible pair.

Still not implemented: automated trials/votes, vote entry or trial history, undo/history correction,
cloud name synchronization, backend/cloud synchronization, online multiplayer, or multi-tab
synchronization.

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

V2 recovery supports later nights, selected mid-revenge Dawn resolution, later Dawns/days,
multi-day outcomes, waiting, and game over. Phase 7F neutral-state sub-version `4` adds exact
Godfather promotions and their enforcement start night. The removed promotion-briefing stage is
accepted only as deterministic migration input and is rewritten to the Mafia overview or exact
terminal result. An exact sub-version `3` save begins succession enforcement on its next future night, so
restoration never invents a historical random promotion; once written as sub-version `4`, the
promotion history must be complete from that cutover. Sub-version `3` requires explicit death
records, personal wins, conversions, pending/reconciled revenge authority, and canonical day
outcome history together. Earlier neutral-state V2
saves receive canonical empty defaults only where unambiguous. A prior Dawn announcement can prove
its night deaths and conversions during restoration. A prior Day save with any dead player but no
cause evidence fails with an explicit compatibility error rather than inferring from `alive:
false`. Dialogs, temporary selections, focus, guards, labels, and summary prose are never
persisted. A selected revenge victim is durable mid-workflow so refresh and save retry never
reroll it; the recovery summary exposes the host player roster, `Dawn resolution` stage, and exact
next host action without serializing display prose as authority.

Phase 7F.3 retains schema V2 and neutral-state sub-version `4`. Restoration deterministically
canonicalizes pre-7F.3 disabled-first-night Doctor progress and ready-for-Dawn batches by removing
the retired Doctor turn, and migrates the obsolete fully acknowledged Executioner `ready` stage
directly into Night 1 without rerolling targets or replaying a briefing. Phase 7F.2's existing terminal-result union
now stores the exact `opposing-killers-stalemate` or
`opposing-killers-mutual-elimination` reason. Mutual elimination also stores exactly two linked
`final-killing-role-showdown` deaths at one post-day or post-Dawn boundary. Restoration validates
the branch from the saved setting, active roles, survivor state, and death evidence; it never
reruns attacks or reapplies deaths. Exact earlier V2 saves remain compatible. Pre-7F.2
neutral-state sub-version `2`, `3`, and `4` saves that stopped at the exact eligible post-day or
post-Dawn final two are upgraded to the deterministic terminal draw. The narrow migration derives
the branch from saved settings and active roles, then writes the canonical game-over envelope back
before recovery succeeds. If that write fails, the original save remains available for retry.

Phase 7F.4 also retains schema V2 and neutral-state sub-version `4`. Role-distribution envelopes
add the exact randomized `roleCardDistributionPlayerIds` sequence; earlier distribution payloads
receive deterministic roster order and canonical write-back. Sequential-night restoration
recognizes the former Consigliere-after-Investigator wake order only when the stored actor evidence
can be replayed exactly into the new Mafia-first sequence. Ambiguous or unsafe progress fails
closed, and compatibility restoration consumes no randomness or replays a private result.

Phase 7F.6 retains the same active-session key, schema V2, and neutral-state sub-version `4`.
Current saves write `doctorCannotProtectRevealedMayor` explicitly. A compatible active-session
payload created before the setting existed receives `false` and is canonically written back, so an
already-running game keeps its original protection rules. A legacy next-game setup template
instead receives `true`, the new-game default, and is written back under the existing template
key. Explicit malformed values fail closed. Neither migration reruns actions, resolution, or
randomness, and Day role visibility remains absent from persistence.

The setup template uses `mafia-host:next-game-setup-template:v1`, not the active-session key or
schema. Its exact payload contains only setup-only `roster` entries (`name` and `playing`),
`roleCounts`, and `settings`. The legacy
`mafia-host:remembered-player-names:v1` key is read only for deterministic migration. Malformed
template or legacy data safely produces canonical fresh setup. Loading, saving, migrating, or
clearing the template can fail without invalidating setup or a successfully assigned game.

Phase 7C.1 new V2 saves persist no non-informational private outcome and no acknowledged-screen
state. Earlier V2 `Action recorded` states are replayed through validation and canonicalized to the
next exact actor; an earlier acknowledged result advances only when its persisted evidence proves
the boundary unambiguously. Ambiguous advancement fails closed with a compatibility message.
Host-role visibility and derived host-role display objects are rejected if injected into a day
save and are never emitted by current persistence.

Corrected Phase 7D keeps schema V2 and neutral-state subversion `2`. New exact session variants
persist ordinary post-day waiting, pending-revenge waiting, or game over with one canonical
faction/draw result. Restoration revalidates the result against alive state and active roles,
rejects forged or partial winners and waiting/result mismatches, and never resolves revenge,
advances counters, or consumes randomness. Recovery shows host-useful Day-complete or Game Over
metadata while keeping raw identities and persisted state fields out of the DOM.

Phase 7E derives the Dawn announcement only from death records whose cause belongs to the current night, so
earlier deaths cannot be reannounced. There is no generic migration framework.

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
Phase 6 adds pure death/history/reveal application and a rule-compliant Dawn announcement model in the domain.
Phase 6.5 moves cross-phase ownership into one discriminated application session and gives
infrastructure only JSON/localStorage transport.

Phase 7A adds an explicit domain-owned Executioner-target model and invariant module. A focused
application briefing workflow owns deterministic tuple IDs, canonical ordering, acknowledgement
evidence, navigation, and completion. The application session transition atomically finalizes
distribution, assigns targets, and selects either briefing or Night 1; briefing completion
atomically creates the night-action workflow. The dedicated feature renders the current briefing
and never owns target authority.

Phase 7A.1 replaced collect-all/replay coordination with one application-owned sequential workflow;
Phase 7C.1 removes its obsolete acknowledged intermediate screen. The workflow records immutable
actor steps, informational or blocked immediate outcomes only, and a bounded canonical position
while deriving blocks, frames, visits, and investigation data through
shared domain mechanics. `night-completion` owns the final resolution and deliberate Dawn boundary.
Session persistence owns schema V2, narrow V1 migration, and canonical reconstruction. React owns
only temporary unconfirmed target selection, focus, errors, dialogs, and repeated-operation guards.

Phase 7B introduced one pure domain transition from matching Dawn into its numbered day and one narrow
voluntary-Mayor reveal operation. `application/day-discussion` now owns one exact host view plus
narrow command-candidate selectors. Phase 7F.4 centralizes active-role/alignment derivation with
Night target and execution views.
The selector now supplies the unified card positions regardless of React-only role visibility. The day feature never receives `GameState`; React owns
only the host dialog, temporary candidate selection, focus, and operation guards. V2 is extended
compatibly with an exact `day-discussion` stage. New saves omit the obsolete `mayorRevealed`
property; restoration narrowly accepts its former generated `false` value so earlier V2 saves
remain compatible. It is never domain authority.

Phase 7C introduced `DayOutcome`; Phase 7E stores those outcomes as canonical numbered history.
Explicit `DeathRecord` causes, permanent neutral personal
wins, victim-free pending revenge, and explicit Executioner-to-Jester conversion records. Night
application is the authoritative boundary for conversions caused by newly final night deaths;
day execution never converts its target's Executioners. `application/day-outcome` owns exact
living candidates plus separate announcement and host-result models. The day feature owns only temporary dialog state and
deliberate confirmation, while the domain applies death, reveal, neutral effects, and the phase
transition in one validated immutable operation.

Corrected Phase 7D adds a narrow `win-conditions` domain module, then application-owned pending
waiting, ordinary waiting, and game-over sessions. Faction results use stable IDs and canonical
roster ordering while application selectors construct exact host display models.
The result is stored once in the terminal session; no generic winner framework, revenge workflow,
later-night state, backend, or networking layer is introduced.

Phase 7F.2 adds one focused final-two evaluator ahead of the ordinary faction predicates. It
classifies only the current active ordinary killing roles, reuses the existing attack outcome
authority, and applies linked terminal deaths through one immutable domain operation when required.
The application and feature layers coordinate the resulting terminal session and host draw
explanation without receiving a generic combat or role-scripting abstraction.

Phase 7F.1 keeps setup preferences outside the application session and active-session envelope.
`application/game-setup` owns exact template validation and conversion to a fresh editable draft;
the browser adapter alone owns the new and legacy preference keys. Role distribution now owns only
pending or complete bulk delivery authority. The one live confirmation atomically creates the
correct first-night session, while restoration narrowly canonicalizes legacy per-player evidence
without rerunning assignment or randomness. Alignment colours remain feature CSS derived from the
application selector's canonical active alignment and are never persisted.

## Project authorities

- [Contributor and architecture instructions](AGENTS.md)
- [Game rules and product specification](docs/GAME_RULES_AND_PRODUCT_SPEC.md)
- [Phased implementation plan](docs/IMPLEMENTATION_PLAN.md)
