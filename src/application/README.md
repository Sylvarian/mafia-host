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
validated action plus a narrow immediate outcome, or an explicit blocked outcome with no action.
Immediate outcomes are limited to blocked, action recorded, Sheriff, permanent investigation group,
and Detective. Acknowledgement removes the current private outcome; explicit continuation seals the
step. Earlier actors cannot be edited. Final continuation constructs one domain-validated
`CollectedNightActions` batch.

The same shared domain functions resolve frames, Sheriff policy, investigation groups, blocks,
visits, and Detective tracking for immediate and final results. Detective actions never enter the
trackable visit ledger. Selectors provide sanitized actor, target, and immediate-outcome views;
target rows contain only the display label, role, faction, alive/availability state, and structured
disabled reason needed by the host UI.

`night-resolution` remains the narrow deterministic operation over a complete workflow.
`night-completion` replaces the removed end-of-night private-result presentation slice. It enters
`night-resolution` with deaths still provisional, then owns the deliberate prepare-Dawn operation.
Dawn applies the retained batch and resolution exactly once and drops all private
action/resolution material. It never advances to day discussion or evaluates a winner.

`session-persistence` owns the cross-phase `ActiveAppSession`. Exactly one setup, distribution,
Executioner-briefing, sequential-night, night-resolution, Dawn, day-discussion, or day-outcome
stage is authoritative.
Completing the sequential workflow atomically creates final night resolution; preparing Dawn
atomically creates the public-only Dawn session.

Phase 7B adds `day-discussion` and an explicit `DayDiscussionAppSession`. Entering day atomically
replaces the Dawn session with only one authoritative game plus the participating display roster.
No Dawn workflow, night workflow, resolution, immediate outcome, private queue, or copied
assignment map survives as day-session authority.

`day-discussion` constructs two separate views. The public view contains Day 1, stable player
labels, alive/dead status, legitimate public role labels, and revealed-Mayor reminder booleans. It
contains no hidden role IDs, factions, Executioner targets, or night data. The private candidate
selector contains only player IDs and stable labels for living unrevealed Mayors, ordered by
role-instance ordinal then roster position. It is consumed only inside the deliberate host privacy
boundary.

Phase 7C adds `day-outcome`. Its living execution-candidate selector exposes only stable player IDs
and duplicate-safe labels. Its public selector exposes only Day number, executed-player label, and
an authorized role reveal, or no execution. The execute/no-execution use cases call one pure domain
operation and replace editable Day authority atomically; no Dawn/night authority, temporary
dialog state, winner, revenge victim, or next-night workflow survives or is created.

The slice defines schema V2, envelope validation, stage-specific restoration, canonical
reconstruction, deep freezing, public-safe summaries, and narrow V1 migration. V2 persists
canonical sequential records, current immediate outcome and acknowledgement state, and the final
night-resolution boundary. It does not persist sequence arrays, derived labels/descriptions,
display prose, colors, focus, dialogs, unconfirmed targets, operation guards, or an old
private-result queue.

Restoration replays deterministic pure transitions, rebuilds registry and sequence data,
cross-checks stored outcomes against canonical mechanics, rejects extra fields, and consumes no
randomness. Safe V1 setup, distribution, Executioner briefing, and valid first-Dawn saves migrate
to V2. Old in-progress night-action and private-result-replay saves fail closed because revealed
information cannot be reconstructed without guessing. No generic migration framework exists.

The `GameSessionStore` and `SessionClock` contracts contain no browser implementation. Phase 7C
extends V2 with neutral-state sub-version `2` and an exact post-day stage. It persists death causes,
personal wins, conversions, pending revenge, and the day outcome together while deriving all
candidate and summary views. Prior neutral-state saves receive empty defaults only where
unambiguous; Dawn announcements can prove their deaths, while a prior Day save with an unexplained
dead player returns an explicit compatibility failure. New saves omit
the obsolete `mayorRevealed` value; restoration narrowly accepts its former generated `false`
value for earlier V2 compatibility. It is never domain authority. Recovery remains limited through
the final Day 1 outcome. Phase 7E must deliberately distinguish current from historical
announcements before later nights are added.
