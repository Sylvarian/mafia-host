# Infrastructure layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. This directory contains narrow
browser-specific adapters for application/domain contracts and is composed only at `main.tsx`.

The Web Crypto `RandomSource` and role-assignment identity source remain the only production
randomness/identity adapters. Random values satisfy the domain `[0, 1)` contract. Game and
role-instance IDs combine a browser session UUID with monotonic sequences. Phase 7A reuses the
injected random source exactly once per Executioner target; Phase 7A.1 bulk delivery, target
selection, sequential outcomes, restoration, and migration consume no randomness.

`BrowserGameSessionStore` and the browser clock implement the Phase 6.5 transport contracts.
`mafia-host:active-session:v2` remains the only current authority; Phase 7B adds a compatible
first-day stage without changing the transport or key. The V1 key remains solely for narrow
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
