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

Direct non-informational night advancement, one-button result/blocked advancement, and direct Dawn
each produce one ordinary application save after their authoritative transition. Showing or hiding
host-only day roles never calls the adapter because that state is React-only.
