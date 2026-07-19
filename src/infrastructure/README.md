# Infrastructure layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. This directory contains narrow
browser-specific adapters for application/domain contracts and is composed only at `main.tsx`.

The Web Crypto `RandomSource` and role-assignment identity source remain the only production
randomness/identity adapters. Random values satisfy the domain `[0, 1)` contract. Game and
role-instance IDs combine a browser session UUID with monotonic sequences. Phase 7A reuses the
injected random source exactly once per Executioner target; Phase 7A.1 bulk delivery, target
selection, sequential outcomes, restoration, and migration consume no randomness.

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
sub-version `3` can represent later-night collection/resolution, private selected-revenge Dawn
resolution, current public Dawn, later days, and later game over without changing localStorage
transport. The adapter never selects or rerolls a revenge victim, derives a conversion, evaluates
victory, or interprets history. Save failure/retry transports the same selected-victim session, so
ordinary deaths, revenge death, conversions, and counters cannot be applied twice.

Phase 7F keeps the active-session key and transport while the application writes neutral-state
sub-version `4` for Godfather promotions and the private unacknowledged briefing. The adapter never
chooses a successor, builds wake order, acknowledges the briefing, or interprets promotion
history; it only transports the already-canonical payload.

`BrowserRememberedPlayerNamesRepository` owns the separate
`mafia-host:remembered-player-names:v1` key. It reads untrusted JSON and transports only string
arrays through the application contract. It never shares or clears the active-session keys.
Unavailable/read/write/clear failures are structured, and no error is logged to the console.
Remembered names are browser/profile-local convenience data with no cloud or multi-tab behavior.
