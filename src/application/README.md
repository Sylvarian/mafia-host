# Application layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. This directory coordinates domain
operations through focused use cases and external-adapter contracts.

`game-setup` owns the single Phase 2 pre-game draft, immutable roster and role-count operations,
derived counts, structured validation, and the editing/ready workflow. A validated setup contains
participating players, role counts, and settings only.

`role-assignment` consumes that exact validated value. It expands and shuffles role instances,
assigns them in participating-player order, invokes the domain ordinal rule and active-game
invariants, and owns the unassigned/distributing/confirmed card workflow. Reassignment creates
fresh identities and clears delivery marks without mutating the previous game. Expected failures
remain structured until the feature boundary.

All five settings begin as `false` only as provisional form defaults. The specification does not
yet designate authoritative defaults, and these initial values do not resolve any open rule.

Executioner targets remain `null` because R-008 is unresolved. Confirming physical distribution
does not invoke a phase transition or enter night-action collection.

`night-actions` owns the explicit `beginFirstNight` use case, deterministic living-role wake
sequence, per-role-instance previous-target context, one authoritative submitted-action list,
bounded navigation, correction, review, and finalisation. It uses the generic Phase 1 reducer only
inside the begin-night use case; features never dispatch `ADVANCE_PHASE`. Participant names are an
immutable presentation snapshot from confirmed setup, while `GameState` remains authoritative for
phase, assignments, alive state, settings, and counters. Finalisation produces a domain-validated
batch and deliberately leaves the game in `night-action-collection`.
