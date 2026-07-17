# Infrastructure layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. This directory contains narrow
browser-specific adapters for application/domain contracts and is composed only at `App.tsx`.

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

The identity adapter requires browser Web Crypto with `randomUUID()`. It fails explicitly during
composition when that API is unavailable or returns an empty token; no UUID package or retry loop
is used.
