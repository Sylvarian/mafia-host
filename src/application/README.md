# Application layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. This directory coordinates domain
operations through focused use cases and external-adapter contracts.

`game-setup` owns the immutable roster, role counts, settings, structured validation, and
editing/ready workflow. `role-assignment` expands and shuffles role instances, assigns stable
ordinals, and owns unassigned/distributing/confirmed card delivery. Reassignment creates fresh
identities. Phase 7A.1 adds one pure, idempotent bulk-delivery operation that marks only
participating cards, retains individual undo, consumes no randomness, and does not finalize
distribution.

`executioner-briefing` owns the Phase 7A private workflow. It rebuilds minimal briefing records from
canonical Executioner target relationships, orders duplicate Executioners by ordinal and roster
order, and owns bounded navigation and acknowledgement. Names and duplicate labels are selector
output; target roles and display prose are not authority.

`night-actions` owns the Phase 7A.1 sequential-night authority. Its canonical order is Mafia
overview, Consorts, Framers, Godfathers, Serial Killers, Doctors, Sheriffs, Investigators,
Consiglieres, and Detectives. Duplicate copies use role-instance ordinal and roster order.
First-night-disabled killers have no step.

Confirmed Consort actions determine later blocked steps. Every immutable actor record is either one
validated action with an optional informational outcome, or an explicit blocked outcome with no
action. Immediate outcomes are limited to blocked, Sheriff, permanent investigation group, and
Detective. Consort, Framer, Godfather, Serial Killer, and Doctor confirmation seals the action and
advances immediately. Informational and blocked outcomes remain current until one atomic
continue-and-advance operation. There is no acknowledged intermediate workflow state. Earlier
actors cannot be edited. Final advancement constructs one domain-validated
`CollectedNightActions` batch.

The same shared domain functions resolve frames, Sheriff policy, investigation groups, blocks,
visits, and Detective tracking for immediate and final results. Detective actions never enter the
trackable visit ledger. Selectors provide sanitized actor, target, and immediate-outcome views;
target rows contain only the display label, role, faction, alive/availability state, and structured
disabled reason needed by the host UI.

`night-resolution` remains the narrow deterministic operation over a complete workflow.
`night-completion` replaces the removed end-of-night private-result presentation slice. It enters
`night-resolution` with deaths still provisional, then owns the deliberate direct prepare-Dawn operation.
Dawn applies the retained batch and resolution exactly once and drops all private
action/resolution material. It never advances to day discussion or evaluates a winner.

`session-persistence` owns the cross-phase `ActiveAppSession`. Exactly one setup, distribution,
Executioner-briefing, sequential-night, night-resolution, Dawn, day-discussion, legacy day-outcome,
post-day waiting, pending-revenge waiting, or game-over stage is authoritative.
Completing the sequential workflow atomically creates final night resolution; preparing Dawn
atomically creates the public-only Dawn session.

Phase 7B adds `day-discussion` and an explicit `DayDiscussionAppSession`. Entering day atomically
replaces the Dawn session with only one authoritative game plus the participating display roster.
No Dawn workflow, night workflow, resolution, immediate outcome, private queue, or copied
assignment map survives as day-session authority.

`day-discussion` constructs separate views. The public view contains Day 1, stable player
labels, alive/dead status, legitimate public role labels, and revealed-Mayor reminder booleans. It
contains no hidden role IDs, factions, Executioner targets, or night data. The private candidate
selector contains only player IDs and stable labels for living unrevealed Mayors, ordered by
role-instance ordinal then roster position. It is consumed only inside the deliberate host privacy
boundary. A distinct host-role selector is constructed only when the React feature requests it.
It returns duplicate-safe labels, alive/dead status, active role labels, immutable original-role
labels when different, and separate legitimate public-role status. It reuses canonical active-role
derivation so converted Executioners show Jester plus original Executioner. It cannot return
targets, personal wins, pending revenge, raw IDs, or full game state.

Phase 7C adds `day-outcome`. Its living execution-candidate selector exposes only stable player IDs
and duplicate-safe labels. Its public selector exposes only Day number, executed-player label, and
an authorized role reveal, or no execution. The execute/no-execution use cases call one pure domain
operation and replace editable Day authority atomically; no Dawn/night authority, temporary
dialog state, winner, revenge victim, or next-night workflow survives or is created.

The slice defines schema V2, envelope validation, stage-specific restoration, canonical
reconstruction, deep freezing, public-safe summaries, and narrow V1 migration. V2 persists
canonical sequential records, a current informational or blocked outcome where applicable, and the
final night-resolution boundary. It does not persist a fabricated non-informational outcome, an
acknowledged-screen state, sequence arrays, derived labels/descriptions,
display prose, colors, focus, dialogs, unconfirmed targets, operation guards, or an old
private-result queue.

Restoration replays deterministic pure transitions, rebuilds registry and sequence data,
cross-checks stored outcomes against canonical mechanics, rejects extra fields, and consumes no
randomness. Safe V1 setup, distribution, Executioner briefing, and valid first-Dawn saves migrate
to V2. Old in-progress night-action and private-result-replay saves fail closed because revealed
information cannot be reconstructed without guessing. No generic migration framework exists.

Phase 7C.1 deliberately accepts earlier V2 sequential shapes only through exact evidence. An old
non-informational `Action recorded` record is validated through the canonical action operation and
advanced once. An old acknowledged informational/blocked state advances once only when its record,
acknowledgement flag, outcome absence, and position agree; ambiguity returns a structured
compatibility failure. Current non-informational records carrying fabricated results and
inconsistent actor positions are rejected. Restoration does not recompute randomness, recommit an
action, redisplay an acknowledged result, or advance twice.

The `GameSessionStore` and `SessionClock` contracts contain no browser implementation. Phase 7C
extends V2 with neutral-state sub-version `2` and an exact post-day stage. It persists death causes,
personal wins, conversions, pending revenge, and the day outcome together while deriving all
candidate and summary views. Prior neutral-state saves receive empty defaults only where
unambiguous; Dawn announcements can prove their deaths, while a prior Day save with an unexplained
dead player returns an explicit compatibility failure. New saves omit
the obsolete `mayorRevealed` value; restoration narrowly accepts its former generated `false`
value for earlier V2 compatibility. It is never domain authority. Corrected Phase 7D extends
recovery through Day 1 waiting and game over. Phase 7E must deliberately distinguish current from
historical announcements before later nights are added.

Day host-role visibility remains React-only and is absent from `ActiveAppSession`. Persistence
never emits it or derived host-role display objects, and restoration rejects attempted
`showHostRoles`, `hostOnlyRoles`, `hostRoleView`, or `hostRoleVisibility` fields.

Corrected Phase 7D settles a completed `day-outcome` through one application operation. It invokes
the domain pending-revenge gate before evaluation, maps pending revenge to its own unchanged waiting
session, maps `none` to ordinary post-day waiting, and maps a terminal result to one immutable
game-over session. The live path derives faction predicates exactly once, then uses an internal
same-operation constructor for the returned canonical game/result pair. Persisted terminal data
instead crosses the untrusted validator once, while public selection and save retry do not
reevaluate victory. New day completions settle before a single save. Restored Phase 7C day outcomes
settle only after Continue and then save once; no randomness, counter advancement, revenge action,
or next-night workflow occurs.

`application/game-over` validates the authoritative game/result pair and builds the sole public
game-over view. It exposes duplicate-safe names, alive/dead state, and existing public role reveals
only. It excludes stable IDs, hidden assignments, targets, conversions, pending revenge, and
personal wins. Schema V2 adds exact waiting and terminal session variants while retaining existing
V1 migration and existing Phase 7C/7C.1 V2 compatibility.
