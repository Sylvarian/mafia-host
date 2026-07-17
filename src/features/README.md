# Feature layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. Each user-facing workflow will own a
slice here. A slice's internals stay private; any later cross-slice API must be exposed explicitly
through that slice's `index` module.

Phase 2 adds `roster` and `game-setup`. `game-setup` owns the application reducer instance and
passes the authoritative roster down to the public `roster` component.

Phase 3 adds `role-distribution`, a private host screen for assignment details, faction and role
descriptions, physical delivery controls, progress, reassignment, abandonment, and final
readiness. Feature-local state is limited to unsubmitted text and confirmation dialogs. Components
render application results; they do not shuffle roles, create identities, calculate ordinals,
construct `GameState`, assign Executioner targets, or enter a night phase.

Phase 4 adds `night-runner`. It renders the application-owned opening, Mafia overview, actor,
Mafia-closing, review, and completion states; translates structured errors; provides semantic
target and navigation controls; and moves focus to each new step. The coordinating feature guards
rapid repeated operations. React does not construct actions, validate target rules, maintain a
second action list, dispatch `ADVANCE_PHASE`, resolve effects, or transition to `night-resolution`.
First-night killing-role omissions and Consort target availability are rendered from application
selectors backed by domain collection rules; the feature does not duplicate either rule.
