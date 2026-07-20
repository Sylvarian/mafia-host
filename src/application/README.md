# Application layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. This directory coordinates domain
operations through focused use cases and external-adapter contracts.

`game-setup` owns the immutable roster, role counts, settings, structured validation, and
editing/ready workflow. `role-assignment` expands and shuffles role instances, assigns stable
ordinals, and owns unassigned/distributing/confirmed card delivery. Reassignment creates fresh
identities. Phase 7F.1 removes per-player delivery authority. One pure bulk confirmation validates
that every private card is available, marks the complete physical-delivery boundary, and
immediately enters Executioner briefing or Night 1 through the active-session coordinator.

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
`night-resolution` with deaths still provisional, then owns the deliberate direct prepare-Dawn
operation. Dawn applies the retained batch and resolution exactly once, resolves due revenge, and
drops all private action/resolution material before public Dawn or terminal Game Over.

`session-persistence` owns the cross-phase `ActiveAppSession`. Exactly one setup, distribution,
Executioner-briefing, sequential-night, night-resolution, revenge-resolution, Dawn,
day-discussion, legacy day-outcome, post-day waiting, pending-revenge waiting, or game-over stage
is authoritative.
Completing the sequential workflow atomically creates final night resolution; preparing Dawn
atomically creates the public-only Dawn session.

Phase 7B adds `day-discussion` and an explicit `DayDiscussionAppSession`. Entering day atomically
replaces the Dawn session with only one authoritative game plus the participating display roster.
No Dawn workflow, night workflow, resolution, immediate outcome, private queue, or copied
assignment map survives as day-session authority.

`day-discussion` constructs separate views. The public view contains the numbered day, stable player
labels, alive/dead status, legitimate public role labels, revealed-Mayor reminder booleans, and the
derived strict-majority trial threshold. Execution remains separate guilty-greater-than-innocent
guidance and has no fixed displayed threshold. It
contains no hidden role IDs, factions, Executioner targets, or night data. The private candidate
selector contains only player IDs and stable labels for living unrevealed Mayors, ordered by
role-instance ordinal then roster position. It is consumed only inside the deliberate host privacy
boundary. A distinct host-role selector is constructed only when the React feature requests it.
It returns canonical Mafia/Town/Neutral groups, duplicate-safe labels, alive/dead status, active
role/alignment labels, immutable original-role labels when different, and separate legitimate
public-role status. It reuses canonical active-role derivation so converted Executioners show
Jester/original Executioner and promoted Mafia show Godfather/original assignment. It cannot return
targets, personal wins, pending revenge, raw IDs, or full game state.

Phase 7C adds `day-outcome`. Phase 7F extends its private living execution-candidate selector with
current active role/alignment and optional original assignment while excluding neutral targets,
wins, revenge, and night data. Its public selector exposes only Day number, executed-player label, and
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
introduced neutral-state sub-version `2`; Phase 7E writes sub-version `3` and exact multi-cycle
stages. It persists death causes, personal wins, conversions, pending/resolved revenge, and day
outcome history together while deriving all
candidate and summary views. Prior neutral-state saves receive empty defaults only where
unambiguous; Dawn announcements can prove their deaths, while a prior Day save with an unexplained
dead player returns an explicit compatibility failure. New saves omit
the obsolete `mayorRevealed` value; restoration narrowly accepts its former generated `false`
value for earlier V2 compatibility. It is never domain authority. Corrected Phase 7D extends
recovery through waiting and game over; Phase 7E derives each Dawn announcement only from deaths
whose cause belongs to the current night.

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
only. Phase 7F.2 adds a short public-safe explanation for each exact draw reason. It excludes
stable IDs, hidden assignments, targets, conversions, pending revenge, and
personal wins. Schema V2 adds exact waiting and terminal session variants while retaining existing
V1 migration and existing Phase 7C/7C.1 V2 compatibility.

Phase 7E adds the explicit begin-next-night use case and the private `revenge-resolution` app
session. Next-night creation accepts only non-terminal post-day waiting, advances counters once,
reuses the sequential collector, and preserves every durable game record while starting with no
completed steps or current result. `night-completion` applies ordinary deaths first, persists one
already-selected revenge victim before death application, then evaluates/finalizes faction
victory. Non-terminal results build a current-night-only Dawn announcement; terminal results skip
day discussion.

Schema V2 remains the transport envelope and uses neutral-state sub-version `3` for canonical
multi-day outcomes, linked revenge resolutions/deaths, and selected mid-revenge recovery. The
restorer accepts unambiguous neutral-state sub-version 2 saves, upgrades their singular day
outcome and victim-free obligation, rejects partial/forged cross-cycle authority, and never reruns
mechanics or randomness. Recovery summarizes the private revenge stage only as `Dawn resolution`.

Phase 7F keeps schema V2 and writes neutral-state sub-version `4`, adding exact canonical
Godfather-promotion history, its enforcement start night, and an unacknowledged private briefing
stage. Restoration reconstructs the already-promoted wake order without consuming randomness,
rejects partial/forged version-4 histories, and summarizes the briefing only as generic Night
actions. Exact Phase 7E sub-version 3 saves receive empty promotion history with enforcement
starting on their next future night, so migration never fabricates a past random choice.

Phase 7F.1 `game-setup/next-game-setup-template` is a separate application contract and use-case
boundary. It strictly accepts an exact object containing an ordered setup-only `roster` with
nonblank string names and boolean participation choices, one canonical `roleCounts` entry per
supported role, and exact boolean `settings`. Roster entries contain no player IDs. Unknown fields,
invalid distributions, invalid settings, and match authority fail closed. The last successfully
assigned setup is saved separately; failed or incomplete setup never replaces it.

The same boundary deterministically migrates the former names-only value with canonical zero-role
counts and default settings. Templates never enter `ActiveAppSession`, schema V2, or recovery
metadata. Fresh setup receives one only when no active save is recovered; game-over and abandon
flows create a new editable setup from it without reusing assignments or match IDs. Successful
assignment derives fresh match-player IDs from the fresh game ID before creating the authoritative
game, so setup-row IDs also never become cross-game authority.

Role-distribution persistence stays at schema V2 and emits only `roleCardsDeliveryStatus:
"pending" | "complete"` at that stage. Restoration narrowly accepts legacy per-player evidence:
all canonical participants means complete, zero/partial means pending, and duplicate/unknown/mixed
authority is rejected. Restore consumes no randomness and never rerolls assignments or targets.

Phase 7F.2 keeps schema V2 and neutral-state sub-version `4`. The terminal result stores either
opposing-killer draw reason, and mutual elimination stores exactly two linked showdown death
records. Live post-day and post-Dawn coordination receives the domain's already-resolved canonical
game/result pair, enters game over, and creates no next-night workflow. Persistence restoration
validates the exact branch from saved authority and returns a structured incompatibility for
partial, malformed, same-faction, or result-conflicting showdown data; it never reruns attacks or
reapplies deaths. Save retry transports the same frozen game-over session. Exact pre-7F.2
neutral-state sub-version `2`, `3`, and `4` saves at an eligible post-day or post-Dawn final two
receive a narrow upgrade to that terminal session. Restoration returns the canonical envelope for
browser write-back; recovery succeeds only after that write, while a failed write preserves the
original save for retry.

When a private succession briefing creates the eligible final two, acknowledgement runs the
narrow post-promotion terminal evaluator before returning a sequential-Night session. A save
failure retains that exact evaluated session for retry, so linked deaths are neither reapplied nor
reevaluated.
