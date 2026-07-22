# Infrastructure layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. This directory contains narrow
browser-specific adapters for application/domain contracts and is composed only at `main.tsx`.

The Web Crypto `RandomSource` and role-assignment identity source remain the only production
randomness/identity adapters. Random values satisfy the domain `[0, 1)` contract. Game and
role-instance IDs combine a browser session UUID with monotonic sequences; new match-player IDs
derive from the fresh game ID and roster position. Phase 7A reuses the
injected random source exactly once per Executioner target; Phase 7F.4 additionally consumes the
same injected source for the independent physical-card recipient shuffle. Target selection,
sequential outcomes, restoration, and migration consume no randomness.

`BrowserGameSessionStore` and the browser clock implement the Phase 6.5 transport contracts.
`mafia-host:active-session:v2` remains the only current authority; Phase 7C adds explicit
neutral-state and post-day fields without changing the transport or key. Phase 7C.1 keeps that key
and schema version: application restoration canonicalizes provable old `Action recorded` or
acknowledged night positions and rejects ambiguous positions. New payloads contain neither those
obsolete screen states nor day host-role visibility/display objects. The V1 key remains solely for narrow
application-owned migration. The adapter reads V2 first. If absent, it passes untrusted V1 JSON to
the injected migrator, validates the returned V2 through the injected restorer, writes V2, and only
then removes V1. A failed migration or V2 write leaves V1 untouched. A failed legacy-key removal
fails the load and attempts to remove the just-written V2 so the keys cannot compete. Explicit
clear removes both keys.

Infrastructure owns only localStorage access, JSON transport, migration write ordering,
unavailable/read/write/quota/clear failures, browser time, and no console logging. It does not
validate game rules, rebuild workflows, import application implementations, or import feature
code. Parsed JSON crosses a narrow contract as untrusted input; canonical validation and migration
semantics remain in the application layer.

Execution/no-execution completion produces one ordinary application save. Dialog state, temporary
selection, derived summaries, focus, and operation guards never reach the adapter. A save failure
retains the exact completed in-memory session, and retry transports that same canonical payload
without reapplying domain consequences.

Corrected Phase 7D retains the V2 key and transport. The application envelope may now contain
ordinary post-day waiting, pending-revenge waiting, or game over with one canonical faction/draw
result. The browser adapter does not evaluate victories, inspect winner IDs, resolve revenge, or
advance counters. New day completion and restored legacy day-outcome settlement each produce one
atomic stable save; a failed write leaves the exact settled in-memory session available for an
identical retry.

Direct non-informational night advancement, one-button result/blocked advancement, and direct Dawn
each produce one ordinary application save after their authoritative transition. Showing or hiding
host-only day roles never calls the adapter because that state is React-only.

Phase 7E keeps the same V2 key and browser adapter. The application payload's neutral-state
sub-version `3` can represent later-night collection/resolution, selected-revenge Dawn
resolution, current host Dawn, later days, and later game over without changing localStorage
transport. The adapter never selects or rerolls a revenge victim, derives a conversion, evaluates
victory, or interprets history. Save failure/retry transports the same selected-victim session, so
ordinary deaths, revenge death, conversions, and counters cannot be applied twice.

Phase 7F keeps the active-session key and transport while the application writes neutral-state
sub-version `4` for Godfather promotions. Phase 7F.5 removes the separate live briefing stage; the
adapter never chooses a successor, builds wake order, or interprets promotion history and only
transports the already-canonical payload. Dawn/revenge payloads may include the bounded pre-night
mutable-state snapshot and confirmed actions used by application/domain restoration to prove
complete important-night evidence against the restored game; the adapter treats them as opaque
data and never replays them itself.

`BrowserNextGameSetupTemplateRepository` owns the separate
`mafia-host:next-game-setup-template:v1` key and the narrow compatibility read/removal of
`mafia-host:remembered-player-names:v1`. The new key always takes precedence. It transports
untrusted JSON to exact application validation, writes only the validated template, removes the
legacy key after a successful write, and clears both preference keys without touching active
session V1/V2 keys.

The transported setup-only payload contains an ordered roster of names and participation booleans,
canonical role counts, and settings. Roster entries deliberately omit setup-row and match-player
IDs.

Unavailable/read/write/migration/clear failures are structured and never logged. The template is
browser/profile-local convenience data with no cloud or multi-tab behavior. It contains no match
progress and is never included in active recovery metadata.

Phase 7F.1 kept the active V2 transport key unchanged. Its role-distribution envelopes introduced
stage-local pending/complete bulk delivery status. Legacy per-player delivery arrays are
interpreted and canonicalized by the application restorer; the adapter does not inspect players,
rerun assignment, select targets, or consume randomness.

Phase 7F.4 keeps that key and schema. The adapter transports the exact stage-local physical-card
recipient ID sequence but does not generate, validate, reorder, or reroll it. The application owns
deterministic roster fallback for compatible earlier distribution saves and exact former-wake-order
recovery; successful canonicalization uses the existing write-back path.

Phase 7F.5 keeps the same V2 key, schema, and neutral-state sub-version. Dawn and selected-revenge
payloads now transport bounded current-night important-event evidence; the adapter does not build,
validate, format, or infer it. Exact older Dawn payloads are upgraded by the application with an
explicit unavailable-evidence marker. Recovery display may contain host names and workflow action
labels, but the adapter never places any authority in URL parameters, document title, console
output, or browser history state.
