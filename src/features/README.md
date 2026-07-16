# Feature layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. Each user-facing workflow will own a
slice here. A slice's internals stay private; any later cross-slice API must be exposed explicitly
through that slice's `index` module.

Phase 0 intentionally contains no Mafia game features.
