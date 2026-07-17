# Feature layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. Each user-facing workflow will own a
slice here. A slice's internals stay private; any later cross-slice API must be exposed explicitly
through that slice's `index` module.

Phase 2 adds `roster` and `game-setup`. `game-setup` owns the application reducer instance and
passes the authoritative roster down to the public `roster` component. Feature-local state is
limited to unsubmitted text and removal confirmation. Components render application validation;
they do not create an active game or calculate game mechanics.
