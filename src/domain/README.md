# Domain layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. This directory owns the
framework-independent game model and rules.

Phase 1 introduces identifiers, players, roles, game settings and state, the explicit phase
machine, invariant validation, a small command/event reducer, and injected randomness. Phase 2
adds the authoritative registry of named roles with setup metadata only.

Phase 3 adds immutable player-role assignment values, the participating-roster ordinal rule, the
central role-instance display name, and active-game validation for single and duplicate ordinals.
Single-copy roles use `ordinal: null`; duplicate copies use sequential ordinals in game-player
roster order.

Phase 4 adds immutable night-action kinds, submitted action identity, per-role-instance structural
target validation, complete-batch validation, and frozen collected batches. The role registry now
contains immutable collection metadata and explicit physical order, but no executable callbacks or
effect logic. Doctor self/repeat rules are validated centrally. Disabled first-night Godfather and
Serial Killer actors are excluded from collection requirements. Mutual Godfather/Serial targets and
Consort-on-Consort targets remain structurally valid on nights when those actors act.

Phase 5 adds immutable, setup-independent investigation Groups A through D plus an explicit
canonical role-to-group mapping. It also adds pure stages for canonical action ordering, Consort
block attempts and immunity, effective actions, visits, frames, Doctor protections, attacks,
provisional deaths, Sheriff suspicion, shared Investigator/Consigliere results, and Detective
tracking. The orchestration function revalidates Phase 4 input and returns a deeply frozen
`NightResolution`. It never mutates `GameState`, applies a provisional death, advances the phase,
uses randomness, generates Dawn output, converts a role, triggers a Jester effect, or evaluates a
winner.

Phase 6 adds one canonical `DoctorPreviousTarget` array to `GameState`, with runtime validation,
per-role-instance uniqueness, participating-player ordering, and immutable canonical copies. The
night-application boundary explicitly enters `night-resolution`, revalidates the resolution against
the completed action batch, applies provisional deaths and configured public role reveals once,
records every Doctor's submitted target even if the Doctor or target is killed, builds a public-safe Dawn
model, and enters `dawn-announcement`. It preserves assignments, counters, Mayor state, and
Executioner targets. Phase 7C extends this same final-death boundary with explicit night-death
records and qualifying Executioner conversions, but still performs no personal-win or faction
outcome calculation.

Phase 7A adds an explicit immutable `ExecutionerTarget` relationship keyed by game, Executioner
player, Executioner role instance, and target player. Final distribution uses the injected
`RandomSource` once per Executioner against the full participating Town list in canonical roster
order. Runtime invariants reject pre-finalization targets, missing or duplicate owners, mismatched
role instances, cross-game records, unknown identities, non-Town targets, non-canonical ordering,
and later phases whose briefing status is incomplete. Target selection and briefing completion
preserve role assignments, settings, counters, and target identities. No personal win, role
conversion, Jester revenge, victory, or later-night behavior exists in this phase.

Phase 7A.1 makes sequential blocking explicit without moving workflow state into the domain.
Canonical Consort actions determine blocked role-instance identities before later actors act, and
complete action batches accept no action for a blocked non-Consort while rejecting a fabricated
one. Shared frame, Sheriff, investigation-group, visit, and Detective functions serve both
immediate application outcomes and final resolution. Detective actions are deliberately excluded
from the trackable visit ledger; blocked actors and first-night-skipped killers likewise have no
visit. Dawn history records an unblocked Doctor's confirmed target even if the Doctor or target
dies, but records nothing for a blocked Doctor.

Phase 7B adds two narrow pure operations under `day/`. The Dawn-to-day boundary validates the
active game, public Dawn announcement, and numbered Night N/Day N relationship before
atomically entering `day-discussion`. It changes no death, assignment, reveal, Executioner target,
Doctor-history, neutral, or winner state.

Voluntary Mayor reveal is valid only for a living participating Mayor during day discussion. It
sets `publiclyRevealedRoleId` to the canonical Mayor role and changes nothing else. An already
revealed Mayor returns a structured error. `GamePlayer` has no second Mayor-reveal authority, so
ordinary death reveal can expose a dead Mayor without being confused with a voluntary living
action, and a prior public reveal remains intact when death reveal is disabled.

Phase 7C adds narrow explicit authority rather than a generic event or effect engine:
`DeathRecord` distinguishes night death, day execution, and the future Jester-revenge cause;
`DayOutcome` records exactly one executed player or no execution; personal-win records cover only
executed Jesters and Executioners whose target was executed; pending revenge identifies only the
executed Jester and remains victim-free; and an `ExecutionerToJesterConversion` retains stable
owner, role-instance, and historical target identity.

The day-execution and no-execution operations validate the complete game, apply every consequence
immutably, revalidate the result, and enter `execution-resolution` atomically. Execution preserves
prior Mayor reveal, applies `revealRoleOnDeath`, awards all shared-target Executioners regardless
of owner alive/dead state, and creates one Jester win/revenge where applicable. Proven
non-execution deaths convert all affected Executioners exactly once. Selectors derive active
Jester behavior without changing the immutable original Executioner assignment. Revenge
resolution, faction victory, game over, and the next night remain outside the Phase 7C domain
boundary.

Phase 7C.1 changes host workflow only and adds no domain state or game rule. Non-informational
night actions remain ordinary authoritative submitted actions, blocked actors still produce no
action or visit, and Dawn still uses the same one-time night-application boundary. The application
host-role selector reuses the canonical active-role derivation, so a converted Executioner is
displayed as active Jester while the original Executioner assignment remains immutable. Host-role
visibility is not represented in `GameState`.

Corrected Phase 7D adds the narrow `win-conditions/faction-victory` module. Its gate requires the
canonical `execution-resolution` post-day outcome, matching positive day/night counters, valid
invariants, and no pending Jester revenge before any predicate is derived. The application’s
evaluate-and-finalize operation derives the predicates once at that boundary. Town follows R-011;
Mafia follows R-012 using living Mafia versus
living Town while active Jesters block it; Serial Killer follows R-009 and wins only as the sole
survivor. Converted Executioners count as active Jesters. Draws include the documented
no-survivors state and the Phase 7F.2 opposing killing-role final-two branches. Winner IDs are
stable and roster-ordered, and mutually true predicates fail
closed instead of gaining check-order precedence.

Terminal finalization changes only the phase to `game-over`; deaths, conversions, targets,
personal wins, counters, and public reveal authority remain unchanged. Corrected Phase 7D never
selects or clears pending revenge at the post-day boundary; Phase 7E resolves it only at the next
Dawn. No generic winner or effect framework was added.

Phase 7E generalizes the authoritative counters and replaces the singular day outcome with a
canonical numbered history. `execution-resolution` Day N starts Night N+1 exactly once; later
night action requirements rebuild from living active roles, so converted Executioners remain
active Jesters and never wake. Doctor history remains keyed by role instance, while only the
immediately preceding night's confirmed target constrains a new action. Frames, visits,
protections, attacks, blocks, submitted actions, and private results remain current-workflow data
and never enter the next night.

Ordinary night application now enters `dawn-resolution`. It applies ordinary deaths and
conversions before the focused Jester-revenge module chooses one living post-ordinary survivor
with the injected `RandomSource`. The selection is canonical and durable; application records a
linked revenge resolution and explicit `jester-revenge` death, applies reveal policy, converts
every matching Executioner once, and clears the obligation. With no survivors it records an
explicit no-survivor resolution without drawing randomness. Victory is evaluated only after the
due obligation is cleared, then the game enters current `dawn-announcement` or `game-over`.
Multiple simultaneous obligations are rejected because their ordering is not defined by the
one-execution-per-day rules. No generic effect queue or role-mutation framework was added.

Phase 7F adds `mafia/godfather-promotion-model` and the focused succession rule. On a validated
transition into Night 2 or later, one injected random sample selects from canonical living active
Mafia candidates only when no living active Godfather exists. The immutable promotion record keeps
game, player, original role-instance, and night identity; it stores no name or display metadata.
Active-role derivation now composes Executioner-to-Jester conversion with Mafia-to-Godfather
promotion and rejects contradictory transformations. Original assignment never mutates.

Promotion invariants validate exact record shape, game/player/role ownership, Mafia eligibility,
alive-at-start timing, Night 2+ timing, absence of a prior living Godfather, unique owner/night,
canonical history order, and complete succession history from the game's explicit enforcement
start night. New games use Night 2; upgraded saves may use a later cutover chosen by the
application compatibility boundary. Wake order and every night mechanic use active roles, so
promoted Framers and Consorts lose those abilities immediately and act only as Godfather. Sheriff
and permanent investigation groups likewise inspect active Godfather authority. Death reveal and
faction-victory disclosure remain governed by their existing original/public rules.

Phase 7F.1 adds no domain game state or rule. The reusable full-roster/participation setup template
is application-owned setup data, bulk role-card delivery is an application workflow boundary, and
alignment colors are feature CSS. No template, delivery flag, or color enters `GameState`.

Phase 7F.2 adds `win-conditions/final-two-killing-role-outcome`. At a validated post-day or
post-Dawn boundary it recognizes exactly two living current active ordinary killers, with the
current registry deliberately supporting only Godfather versus Serial Killer. It reuses the
ordinary attack-outcome function: mutual immunity yields a terminal stalemate with both alive,
while mutual lethality applies two immutable, cross-linked `final-killing-role-showdown` deaths at
one terminal boundary. This check precedes ordinary faction predicates. Same-faction killers and
unsupported/non-killing pairs remain non-applicable.

A narrow post-promotion boundary handles the case where succession first creates the pair at the
start of a later Night. It requires the canonical current-Night promotion and completed prior Day,
then finalizes before any wake step or target can become authoritative.

Showdown application preserves personal wins and original assignments, applies ordinary public
death-reveal and non-execution conversion rules, and never mutates the input. Stored terminal
states must prove the exact draw reason, setting branch, active-role pairing, survivor state, and
linked evidence. No generic combat simulator, role scripting system, or additional playable night
was introduced.
