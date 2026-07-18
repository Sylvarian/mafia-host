# Infrastructure layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. This directory contains narrow
browser-specific adapters for application/domain contracts and is composed only at `main.tsx`.

Phase 3 provides a Web Crypto `RandomSource` and a role-assignment identity source. Random values
come from unsigned 32-bit Web Crypto values and satisfy the domain's `[0, 1)` contract. Game and
role-instance IDs combine one browser-created session UUID with independent monotonic sequences,
making them collision-safe within the source's browser session. The branded ID types provide
compile-time separation only; they do not perform runtime string validation.

The application deliberately retains the `RandomSource.next(): number` contract for deterministic
tests and simple Fisher–Yates orchestration. Because the browser adapter has exactly `2 ** 32`
possible outputs, `Math.floor(randomValue * maxExclusive)` gives some buckets one additional source
integer whenever `maxExclusive` does not divide `2 ** 32`. That finite-source bias is negligible
for an in-person roster but is not described as mathematically unbiased.

Phase 7A reuses this same adapter for post-distribution Executioner target selection. The domain
validates every returned value as finite and within `[0, 1)` and requests exactly one value per
Executioner. Infrastructure does not know the eligible players, assignments, targets, or briefing
workflow.

The identity adapter requires browser Web Crypto with `randomUUID()`. It fails explicitly during
composition when that API is unavailable or returns an empty token; no UUID package or retry loop
is used.

Phase 6.5 adds a narrow `BrowserGameSessionStore` and browser clock. The Phase 7A compatible V1
extension changes only the application-owned serialized value; the store still reads, writes, or
removes only `mafia-host:active-session:v1`, and only when its corresponding method is called. It
owns localStorage access, JSON text transport, unavailable/read/write/quota/clear failures, and no
console logging. The composition root injects the application restorer, so parsed JSON crosses that
narrow contract as untrusted input without an infrastructure-to-application-implementation import.
The adapter does not validate game rules or import feature code. The clock supplies canonical
timestamps without putting wall-clock time into domain mechanics.
